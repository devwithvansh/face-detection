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
    person = Personnel(
        army_id=army_id, full_name=full_name, rank=rank,
        battalion=battalion, unit=unit,
    )
    db.add(person)
    db.flush()

    embeddings_added = 0
    source_images = []
    cached_embedding = None

    # Use the captured face image from the unknown queue entry
    if unknown_id:
        unknown = db.get(UnknownFace, unknown_id)
        if unknown:
            cached_embedding = recognition_pipeline.get_unknown_embedding(unknown.id)
            unknown_image = cv2.imread(unknown.image_path)
            if unknown_image is not None:
                source_images.append(unknown_image)

    # Add any extra uploaded images
    for upload in images or []:
        source_images.append(read_uploaded_image(await upload.read()))

    if cached_embedding is None and not source_images:
        raise HTTPException(status_code=422, detail="At least one face image is required")

    # Store cached embedding from recognition pipeline (already normalised)
    if cached_embedding is not None:
        vector_index.add(db, person.id, cached_embedding)
        embeddings_added += 1

    # Store embeddings for all source images, using augmented variants for robustness
    for index, image in enumerate(source_images):
        if index == 0:
            profile_photo = save_image(image, "profiles", army_id)
            person.profile_photo = profile_photo

        # Raw embedding
        raw_emb = embedding_service.embed_face(image)
        vector_index.add(db, person.id, raw_emb)
        embeddings_added += 1

        # Augmented embedding (better generalisation across angles/lighting)
        aug_emb = embedding_service.embed_face_with_augmentation(image)
        vector_index.add(db, person.id, aug_emb)
        embeddings_added += 1

    # Mark unknown as reviewed
    if unknown_id:
        unknown = db.get(UnknownFace, unknown_id)
        if unknown:
            unknown.reviewed = True
            unknown.registered_personnel_id = person.id
            recognition_pipeline.remove_unknown_cache(unknown.id)

    mark_registered_inside(db, person.id, camera_id)
    db.commit()
    vector_index.rebuild()

    # Cache for immediate recognition (60s grace window)
    embedding_to_cache = cached_embedding
    if embedding_to_cache is None and source_images:
        embedding_to_cache = embedding_service.embed_face(source_images[0])
    if embedding_to_cache is not None:
        recognition_pipeline.remember_registered(person.id, embedding_to_cache)

    LOGGER.info("REGISTRATION COMPLETE: %s (person_id=%s, embeddings=%s)", full_name, person.id, embeddings_added)
    return {"personnel_id": person.id, "embeddings_added": embeddings_added}