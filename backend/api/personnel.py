from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.core.security import get_current_user, require_admin
from backend.database.session import get_db
from backend.models.attendance import ActivePresence, AttendanceLog
from backend.models.personnel import Personnel, FaceEmbedding
from backend.models.unknown import UnknownFace
from backend.recognition.embeddings import embedding_service
from backend.schemas.personnel import PersonnelOut, PersonnelUpdate
from backend.services.vector_index import vector_index
from backend.utils.images import read_uploaded_image, save_image

router = APIRouter(prefix="/personnel", tags=["personnel"])


@router.get("", response_model=list[PersonnelOut])
def list_personnel(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(get_current_user)],
) -> list[Personnel]:
    return db.query(Personnel).order_by(Personnel.created_at.desc()).all()


@router.patch("/{personnel_id}", response_model=PersonnelOut)
def update_personnel(
    personnel_id: int,
    payload: PersonnelUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
) -> Personnel:
    person = db.get(Personnel, personnel_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Personnel not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{personnel_id}")
def delete_personnel(
    personnel_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
) -> dict[str, str]:
    person = db.get(Personnel, personnel_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Personnel not found")

    # Delete all related records first to satisfy foreign key constraints
    db.query(ActivePresence).filter(ActivePresence.personnel_id == personnel_id).delete()
    db.query(AttendanceLog).filter(AttendanceLog.personnel_id == personnel_id).delete()
    db.query(FaceEmbedding).filter(FaceEmbedding.personnel_id == personnel_id).delete()
    # Clear any unknown faces that were linked to this person
    db.query(UnknownFace).filter(UnknownFace.registered_personnel_id == personnel_id).update(
        {"registered_personnel_id": None, "reviewed": False}
    )

    db.delete(person)
    db.commit()
    vector_index.rebuild()
    return {"status": "deleted"}


@router.post("/{personnel_id}/retrain")
async def retrain_personnel(
    personnel_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
    images: list[UploadFile] = File(...),
) -> dict[str, int]:
    person = db.get(Personnel, personnel_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Personnel not found")
    count = 0
    for upload in images:
        image = read_uploaded_image(await upload.read())
        vector_index.add(db, person.id, embedding_service.embed_face(image))
        count += 1
    db.commit()
    vector_index.rebuild()
    return {"embeddings_added": count}