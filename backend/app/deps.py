from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_allow_password_change(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Usuário do token, mesmo com troca de senha pendente -- só pros endpoints que a tela de troca
    obrigatória precisa (GET /auth/me e PUT /auth/me/password). Todo o resto usa get_current_user."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        username = decode_access_token(token)
    except PyJWTError:
        raise credentials_error

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_error
    return user


def get_current_user(user: models.User = Depends(get_current_user_allow_password_change)) -> models.User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Troca de senha obrigatória antes de continuar",
        )
    return user


def require_master(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "master":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente o usuário master pode fazer isso",
        )
    return user


def require_module(module_key: str):
    """Dependência que barra (403) quem não tem o módulo opcional habilitado -- usada no
    APIRouter(dependencies=[...]) de cada router de módulo, cobrindo todos os endpoints dele."""

    def _check(user: models.User = Depends(get_current_user)) -> models.User:
        if module_key not in user.modules:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Módulo não habilitado para este usuário",
            )
        return user

    return _check
