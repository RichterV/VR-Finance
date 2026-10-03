from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.recorrencias import ensure_recurrences
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# users.last_activity_at só é regravado se o valor salvo tiver mais que isso -- evita um UPDATE no
# SQLite a cada requisição (a Home sozinha dispara várias em paralelo).
ACTIVITY_WRITE_INTERVAL = timedelta(minutes=1)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _record_activity(db: Session, user: models.User) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if user.last_activity_at is None or now - user.last_activity_at >= ACTIVITY_WRITE_INTERVAL:
        user.last_activity_at = now
        db.commit()


def get_current_user_allow_password_change(
    request: Request,
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
        payload = decode_access_token(token)
    except PyJWTError:
        raise credentials_error

    # Busca por uid e confere username e versão: o SQLite pode reaproveitar o id de um usuário
    # excluído, e a versão muda a cada troca/reset de senha (revoga os tokens antigos). Token sem
    # uid/tv (emitido antes dessa regra) não vale mais -- um login a mais, uma vez só.
    user_id, token_version = payload.get("uid"), payload.get("tv")
    if not isinstance(user_id, int) or not isinstance(token_version, int):
        raise credentials_error
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None or user.username != payload.get("sub") or (user.token_version or 0) != token_version:
        raise credentials_error
    issued_at = payload.get("iat")
    if user.created_at is not None and (
        not isinstance(issued_at, (int, float))
        or issued_at < user.created_at.replace(tzinfo=timezone.utc).timestamp()
    ):
        raise credentials_error

    # Uso via "Mudar pra conta teste" é do master, não da conta -- não conta como atividade dela.
    impersonated = bool(payload.get("imp"))
    request.state.impersonated = impersonated
    if not impersonated:
        _record_activity(db, user)
    return user


def get_current_user(
    user: models.User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db),
) -> models.User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Troca de senha obrigatória antes de continuar",
        )
    # Virada do mês: lançamentos recorrentes que faltam são criados antes de qualquer leitura.
    ensure_recurrences(db, user.id)
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
