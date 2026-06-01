from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from backend.core.config import settings
from backend.core.security import create_access_token, get_current_user
from backend.schemas.auth import TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()]) -> TokenResponse:
    settings.validate_runtime()
    if form.username != settings.admin_username or form.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        access_token=create_access_token(form.username, "admin"),
        role="admin",
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> TokenResponse:
    """
    Exchange a valid token for a fresh one with a full new expiry window.
    Called automatically by the frontend ~5 min before expiry to keep session alive.
    """
    new_token = create_access_token(current_user["username"], current_user["role"])
    return TokenResponse(access_token=new_token, role=current_user["role"])


@router.get("/me")
def whoami(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    return current_user


@router.get("/validate")
def validate_token(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Lightweight check — returns 200 if token valid, 401 if expired."""
    return {"valid": True, **current_user}