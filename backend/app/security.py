from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(subject: str, impersonated: bool = False) -> str:
    """`impersonated`: token gerado pelo "Mudar pra conta teste" -- o uso dele não conta como
    atividade da conta (ver deps.get_current_user_allow_password_change)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    if impersonated:
        payload["imp"] = True
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Payload do token (`sub` = username, `imp` = impersonação, se houver)."""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
