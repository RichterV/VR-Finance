from app import models
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.security import hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.username == settings.master_username).first()
        if existing:
            print(f"Usuário master '{settings.master_username}' já existe, nada a fazer.")
            return

        master = models.User(
            username=settings.master_username,
            password_hash=hash_password(settings.master_password),
            role="master",
        )
        db.add(master)
        db.commit()
        print(f"Usuário master '{settings.master_username}' criado com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
