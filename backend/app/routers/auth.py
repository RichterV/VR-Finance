from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db, require_master
from app.routers.attachments import delete_all_attachments_for_user
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if user is None or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha inválidos",
        )
    token = create_access_token(subject=user.username)
    return schemas.Token(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/switch-to-teste", response_model=schemas.Token)
def switch_to_teste(_master: models.User = Depends(require_master), db: Session = Depends(get_db)):
    teste_user = db.query(models.User).filter(models.User.username == "teste").first()
    if teste_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário 'teste' não encontrado")
    token = create_access_token(subject=teste_user.username)
    return schemas.Token(access_token=token)


@router.put("/me/password")
def change_password(
    payload: schemas.PasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"detail": "Senha atualizada"}


@router.post("/users", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _master: models.User = Depends(require_master),
):
    exists = db.query(models.User).filter(models.User.username == payload.username).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário já existe")
    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="user",
    )
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
    _master: models.User = Depends(require_master),
):
    user = _get_editable_user(db, user_id)

    exists = (
        db.query(models.User)
        .filter(models.User.username == payload.username, models.User.id != user_id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário já existe")

    user.username = payload.username
    if payload.password:
        user.password_hash = hash_password(payload.password)
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
    db.query(models.DropdownOption).filter(models.DropdownOption.user_id == user_id).delete(synchronize_session=False)
    delete_all_attachments_for_user(db, user_id)
    db.delete(user)
    db.commit()
