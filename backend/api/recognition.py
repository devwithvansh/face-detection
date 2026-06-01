from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.core.security import get_current_user, require_admin
from backend.database.session import get_db
from backend.models.personnel import Personnel
from backend.recognition.embeddings import embedding_service
from backend.schemas.recognition import RecognitionResult
from backend.services.attendance import mark_registered_inside
from backend.services.events import event_hub
from backend.services.recognizer import recognition_pipeline
from backend.services.vector_index import vector_index
from backend.utils.images import read_uploaded_image, save_image

router = APIRouter(tags=["recognition"])


@router.post("/recognize", response_model=list[RecognitionResult])
async def recognize(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
    image: UploadFile = File(...),
    camera_id: str = "manual",
) -> list[RecognitionResult]:
    frame = read_uploaded_image(await image.read())
    _, results, events = recognition_pipeline.process_frame(db, frame, camera_id)
    for event in events:
        await event_hub.broadcast(event)
    return results


@router.post("/register")
async def register(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(get_current_user)],
    army_id: str = Form(...),
    full_name: str = Form(...),
    rank: str = Form(...),
    battalion: str = Form(...),
    unit: str = Form(...),
    camera_id: str = Form(default="registration"),
    images: list[UploadFile] = File(...),
) -> dict[str, int]:
    if db.query(Personnel).filter(Personnel.army_id == army_id).first():
        raise HTTPException(status_code=409, detail="Army ID already exists")

    person = Personnel(
        army_id=army_id, full_name=full_name, rank=rank,
        battalion=battalion, unit=unit,
    )
    db.add(person)
    db.flush()

    embeddings_added = 0
    cached_embedding = None

    for index, upload in enumerate(images):
        image = read_uploaded_image(await upload.read())
        if index == 0:
            person.profile_photo = save_image(image, "profiles", army_id)

        # Use augmented embedding at registration for more robust matching
        emb = embedding_service.embed_face_with_augmentation(image)
        vector_index.add(db, person.id, emb)
        embeddings_added += 1

        # Also add the raw embedding for the first image (gives more variants)
        if index == 0:
            raw_emb = embedding_service.embed_face(image)
            vector_index.add(db, person.id, raw_emb)
            embeddings_added += 1
            cached_embedding = raw_emb

    mark_registered_inside(db, person.id, camera_id)
    db.commit()
    vector_index.rebuild()

    if cached_embedding is not None:
        recognition_pipeline.remember_registered(person.id, cached_embedding)

    return {"personnel_id": person.id, "embeddings_added": embeddings_added}