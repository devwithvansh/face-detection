from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PersonnelBase(BaseModel):
    army_id: str
    full_name: str
    rank: str
    battalion: str
    unit: str


class PersonnelCreate(PersonnelBase):
    pass


class PersonnelUpdate(BaseModel):
    full_name: str | None = None
    rank: str | None = None
    battalion: str | None = None
    unit: str | None = None


class PersonnelOut(PersonnelBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_photo: str | None
    created_at: datetime
