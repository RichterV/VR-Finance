from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./vrfinance.db"
    secret_key: str
    access_token_expire_minutes: int = 60 * 24 * 7
    master_username: str = "admin"
    master_password: str
    upload_dir: str = "uploads"
    backup_marker_file: str = "last_backup.txt"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
