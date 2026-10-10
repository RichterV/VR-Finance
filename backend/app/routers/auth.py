from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas
from app.avatars import MAX_AVATAR_BYTES, AvatarError, avatar_path, normalize_avatar, save_avatar_file
from app.deps import get_current_user, get_current_user_allow_password_change, get_db, require_master
from app.login_guard import login_guard
from app.routers.attachments import delete_all_attachments_for_user, schedule_unlink_after_commit
from app.security import create_access_token, hash_password, verify_password, verify_password_dummy

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    login_guard.check(form_data.username)
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if user is None:
        # Mesmo custo de um bcrypt de verdade: sem isso a resposta rápida revelaria que o usuário não existe.
        verify_password_dummy(form_data.password)
    if user is None or not verify_password(form_data.password, user.password_hash):
        login_guard.register_failure(form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos",
        )
    login_guard.register_success(form_data.username)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.last_login_at = now
    user.last_activity_at = now
    db.commit()
    token = create_access_token(user)
    return schemas.Token(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user_allow_password_change)):
    return current_user


@router.post("/switch-to-teste", response_model=schemas.Token)
def switch_to_teste(_master: models.User = Depends(require_master), db: Session = Depends(get_db)):
    teste_user = db.query(models.User).filter(models.User.username == "teste").first()
    if teste_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário 'teste' não encontrado")
    token = create_access_token(teste_user, impersonated=True)
    return schemas.Token(access_token=token)


def _ensure_username_available(db: Session, username: str, exclude_user_id: Optional[int] = None) -> None:
    query = db.query(models.User).filter(models.User.username == username)
    if exclude_user_id is not None:
        query = query.filter(models.User.id != exclude_user_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário já existe")


@router.put("/me", response_model=schemas.ProfileUpdateOut)
def update_me(
    request: Request,
    payload: schemas.ProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário não pode ser vazio")
    _ensure_username_available(db, username, exclude_user_id=current_user.id)
    current_user.username = username
    current_user.first_name = payload.first_name.strip()
    current_user.last_name = payload.last_name.strip()
    db.commit()
    db.refresh(current_user)
    return schemas.ProfileUpdateOut(
        # Mantém a marca de impersonação, senão editar o perfil da conta teste pelo switch
        # passaria a contar como atividade dela.
        access_token=create_access_token(current_user, impersonated=getattr(request.state, "impersonated", False)),
        user=schemas.UserOut.model_validate(current_user),
    )


@router.put("/me/default-cash-percentage", response_model=schemas.UserOut)
def update_default_cash_percentage(
    payload: schemas.CashPercentageDefault,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.default_cash_percentage = payload.default_cash_percentage
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/theme", response_model=schemas.UserOut)
def update_theme(
    payload: schemas.ThemeUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.theme = payload.theme
    db.commit()
    db.refresh(current_user)
    return current_user


# --- Foto de perfil -------------------------------------------------------------------------------
# A imagem é normalizada em app/avatars.py (quadrada, 512px, JPEG sem metadados). O arquivo antigo só
# sai do disco depois do commit; se o commit falhar, o novo é apagado.


@router.put("/me/avatar", response_model=schemas.UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = await file.read(MAX_AVATAR_BYTES + 1)
    try:
        jpeg = normalize_avatar(data)
    except AvatarError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    novo = save_avatar_file(jpeg)
    antigo = current_user.avatar_filename
    current_user.avatar_filename = novo
    current_user.avatar_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if antigo:
        schedule_unlink_after_commit(db, avatar_path(antigo))
    try:
        db.commit()
    except Exception:
        db.rollback()
        avatar_path(novo).unlink(missing_ok=True)
        raise
    db.refresh(current_user)
    return current_user


@router.delete("/me/avatar", response_model=schemas.UserOut)
def delete_avatar(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.avatar_filename:
        schedule_unlink_after_commit(db, avatar_path(current_user.avatar_filename))
    current_user.avatar_filename = None
    current_user.avatar_updated_at = None
    db.commit()
    db.refresh(current_user)
    return current_user


def _avatar_response(user: models.User) -> FileResponse:
    path = avatar_path(user.avatar_filename) if user.avatar_filename else None
    if not path or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sem foto de perfil")
    # Privado (só quem está logado); a "versão" na URL do front muda a cada foto nova.
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/me/avatar")
def get_my_avatar(current_user: models.User = Depends(get_current_user_allow_password_change)):
    return _avatar_response(current_user)


@router.get("/users/{user_id}/avatar")
def get_user_avatar(user_id: int, db: Session = Depends(get_db), _master: models.User = Depends(require_master)):
    return _avatar_response(_get_editable_user(db, user_id))


@router.put("/me/password", response_model=schemas.PasswordChangeOut)
def change_password(
    request: Request,
    payload: schemas.PasswordChange,
    current_user: models.User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A nova senha precisa ser diferente da atual")
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()
    db.refresh(current_user)
    return schemas.PasswordChangeOut(
        detail="Senha atualizada",
        access_token=create_access_token(current_user, impersonated=getattr(request.state, "impersonated", False)),
    )


@router.post("/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(require_master),
):
    _ensure_username_available(db, payload.username)
    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="user",
        first_name=payload.first_name,
        last_name=payload.last_name,
        must_change_password=True,
    )
    user.set_modules(payload.modules)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _master: models.User = Depends(require_master),
):
    return db.query(models.User).order_by(models.User.username).all()


def _get_editable_user(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    master: models.User = Depends(require_master),
):
    user = _get_editable_user(db, user_id)

    _ensure_username_available(db, payload.username, exclude_user_id=user_id)

    user.username = payload.username
    user.first_name = payload.first_name
    user.last_name = payload.last_name
    if payload.password:
        user.password_hash = hash_password(payload.password)
        # Reset feito pelo master: o master conhece a senha nova, então o dono troca no próximo
        # login. Não vale pro próprio master resetando a si mesmo (ele já escolheu a senha).
        user.must_change_password = user.id != master.id
        # Derruba as sessões abertas com a senha antiga.
        user.token_version = (user.token_version or 0) + 1
    if payload.modules is not None and user.role != "master":
        user.set_modules(payload.modules)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _master: models.User = Depends(require_master),
):
    user = _get_editable_user(db, user_id)
    if user.role == "master":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O usuário master não pode ser excluído")

    vehicle_ids = [v.id for v in db.query(models.Vehicle).filter(models.Vehicle.user_id == user_id).all()]
    if vehicle_ids:
        db.query(models.VehicleService).filter(models.VehicleService.vehicle_id.in_(vehicle_ids)).delete(
            synchronize_session=False
        )
    db.query(models.Vehicle).filter(models.Vehicle.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Gasto).filter(models.Gasto.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Receita).filter(models.Receita.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Recorrencia).filter(models.Recorrencia.user_id == user_id).delete(synchronize_session=False)
    db.query(models.DropdownOption).filter(models.DropdownOption.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Notificacao).filter(models.Notificacao.user_id == user_id).delete(synchronize_session=False)
    db.query(models.NotaFiscal).filter(models.NotaFiscal.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Empresa).filter(models.Empresa.user_id == user_id).delete(synchronize_session=False)
    delete_all_attachments_for_user(db, user_id)
    if user.avatar_filename:
        schedule_unlink_after_commit(db, avatar_path(user.avatar_filename))
    db.delete(user)
    db.commit()
