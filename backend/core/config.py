from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Army Personnel Recognition"
    environment: str = "development"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = ""
    mysql_password: str = ""
    mysql_database: str = "face_recognition"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    # Increased to 24 hours — prevents constant session expiry
    access_token_expire_minutes: int = 1440

    admin_username: str = "admin"
    admin_password: str = ""

    def validate_runtime(self) -> None:
        missing = [
            name
            for name, value in {
                "MYSQL_USER": self.mysql_user,
                "MYSQL_PASSWORD": self.mysql_password,
                "JWT_SECRET_KEY": self.jwt_secret_key,
                "ADMIN_PASSWORD": self.admin_password,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    # ── Recognition accuracy settings ──────────────────────────────────────────
    # Lowered threshold: accepts weaker matches (helps with tilted/far faces).
    # The tradeoff is slightly more false positives — raise back to 0.45 if needed.
    recognition_threshold: float = 0.35

    # Unknown threshold: similarity above this means "same unknown person, skip".
    unknown_threshold: float = 0.65

    # How long to suppress the same unknown person's popup (5 minutes).
    duplicate_window_seconds: int = 300

    # If a known person hasn't been seen for 5 minutes, mark EXIT.
    exit_absence_seconds: int = 300

    camera_sources: str = "webcam=0"
    storage_dir: str = "storage"
    create_tables_on_startup: bool = False

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )

    @computed_field
    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_dir)
        path.mkdir(parents=True, exist_ok=True)
        (path / "unknown").mkdir(parents=True, exist_ok=True)
        (path / "profiles").mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()