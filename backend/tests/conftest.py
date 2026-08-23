import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-bytes-long")
os.environ.setdefault("MASTER_USERNAME", "admin")
os.environ.setdefault("MASTER_PASSWORD", "test-master-password")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app import models
from app.database import Base
from app.deps import get_db
from app.main import app
from app.security import hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def _get_db_override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _get_db_override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _create_user(db_session, username: str, password: str, role: str = "user") -> models.User:
    user = models.User(username=username, password_hash=hash_password(password), role=role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _login_headers(client: TestClient, username: str, password: str) -> dict:
    response = client.post("/auth/login", data={"username": username, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def user_password() -> str:
    return "senha-do-usuario"


@pytest.fixture()
def user(db_session, user_password) -> models.User:
    return _create_user(db_session, "usuario_comum", user_password, role="user")


@pytest.fixture()
def auth_headers(client, user, user_password) -> dict:
    return _login_headers(client, user.username, user_password)


@pytest.fixture()
def master_password() -> str:
    return "senha-do-master"


@pytest.fixture()
def master_user(db_session, master_password) -> models.User:
    return _create_user(db_session, "admin", master_password, role="master")


@pytest.fixture()
def master_headers(client, master_user, master_password) -> dict:
    return _login_headers(client, master_user.username, master_password)
