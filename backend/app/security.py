from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# Hash fixo usado só pra gastar o mesmo tempo de um bcrypt quando o usuário do login não existe.
_DUMMY_HASH = bcrypt.hashpw(b"vrfinance-dummy-password", bcrypt.gensalt())


def verify_password_dummy(password: str) -> None:
    bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH)


def create_access_token(user, impersonated: bool = False) -> str:
    """Token de `user` (precisa de id, username e token_version). `uid` + `tv` permitem revogar:
    trocar/resetar a senha incrementa users.token_version e todo token antigo deixa de valer (ver
    deps.get_current_user_allow_password_change). `impersonated`: token gerado pelo "Mudar pra conta
    teste" -- o uso dele não conta como atividade da conta."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user.username,
        "uid": user.id,
        "tv": user.token_version or 0,
        # Com fração de segundo: um token emitido antes da criação da conta não vale pra ela (o SQLite
        # pode reaproveitar o id e o username de uma conta excluída) -- ver deps.
        "iat": now.timestamp(),
        "exp": expire,
    }
    if impersonated:
        payload["imp"] = True
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Payload do token (`sub` = username, `uid`, `tv` = versão do token, `imp` = impersonação)."""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
