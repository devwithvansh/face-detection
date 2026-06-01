from typing import Annotated

import cv2
import logging
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.core.security import get_current_user, require_admin
from backend.database.session import get_db
from backend.models.personnel import Personnel
from backend.models.unknown import UnknownFace
from backend.recognition.embeddings import embedding_service
from backend.schemas.unknown import UnknownFaceOut
from backend.services.attendance import mark_registered_inside
from backend.services.recognizer import recognition_pipeline
from backend.services.vector_index import vector_index
from backend.utils.images import read_uploaded_image, save_image

router = APIRouter(prefix="/unknown", tags=["unknown"])
LOGGER = logging.getLogger(__name__)


@router.get("", response_model=list[UnknownFaceOut])
def unknown_queue(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(get_current_user)],
    reviewed: bool | None = False,
) -> list[UnknownFace]:
    query = db.query(UnknownFace)
    if reviewed is not None:
        query = query.filter(UnknownFace.reviewed == reviewed)
    return query.order_by(UnknownFace.detected_time.desc()).limit(200).all()


@router.delete("/clear")
def clear_unknown_queue(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
) -> dict[str, int]:
    rows = db.query(UnknownFace).filter(UnknownFace.reviewed == False).all()  # noqa: E712
    count = len(rows)
    for row in rows:
        db.delete(row)
    db.commit()
    recognition_pipeline.clear_unknown_cache()
    return {"cleared": count}


@router.post("/register")
async def register_unknown(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
    unknown_id: int | None = Form(default=None),
    army_id: str = Form(...),
    full_name: str = Form(...),
    rank: str = Form(...),
    battalion: str = Form(...),
    unit: str = Form(...),
    camera_id: str = Form(default="registration"),
    images: list[UploadFile] | None = File(default=None),
) -> dict[str, int]:
    if db.query(Personnel).filter(Personnel.army_id == army_id).first():
        raise HTTPException(status_code=409, detail="Army ID already exists")
    profile_photo = None
    person = Personnel(army_id=army_id, full_name=full_name, rank=rank, battalion=battalion, unit=unit)
    db.add(person)
    db.flush()
    embeddings = 0
    source_images = []
    cached_embedding = None
    if unknown_id:
        unknown = db.get(UnknownFace, unknown_id)
        if unknown:
            cached_embedding = recognition_pipeline.get_unknown_embedding(unknown.id)
            unknown_image = cv2.imread(unknown.image_path)
            if unknown_image is not None:
                source_images.append(unknown_image)
    for upload in images or []:
        source_images.append(read_uploaded_image(await upload.read()))
    if cached_embedding is None and not source_images:
        raise HTTPException(status_code=422, detail="At least one face image is required")

    if cached_embedding is not None:
        vector_index.add(db, person.id, cached_embedding)
        embeddings += 1
    for index, image in enumerate(source_images):
        if index == 0:
            profile_photo = save_image(image, "profiles", army_id)
            person.profile_photo = profile_photo
        vector_index.add(db, person.id, embedding_service.embed_face(image))
        embeddings += 1
    if unknown_id:
        if unknown:
            unknown.reviewed = True
            unknown.registered_personnel_id = person.id
            recognition_pipeline.remove_unknown_cache(unknown.id)
    mark_registered_inside(db, person.id, camera_id)
    db.commit()
    vector_index.rebuild()

    # NEW: tell the pipeline this person just registered so the next frame
    # recognises them immediately (green box) without waiting for vector index warmup
    embedding_to_cache = cached_embedding
    if embedding_to_cache is None and source_images:
        # re-embed the first source image to get a fresh embedding for the cache
        embedding_to_cache = embedding_service.embed_face(source_images[0])
    if embedding_to_cache is not None:
        recognition_pipeline.remember_registered(person.id, embedding_to_cache)

    LOGGER.info("REGISTRATION COMPLETE -> cache refreshed, person_id=%s added to grace window", person.id)
    return {"personnel_id": person.id, "embeddings_added": embeddings}