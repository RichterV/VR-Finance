"""Foto de perfil: valida, normaliza e grava a imagem enviada.

A foto entra como veio do aparelho e sai sempre igual: JPEG quadrado de AVATAR_SIZE px, recortado no
centro, já girado conforme o EXIF e **sem nenhum metadado** -- foto de celular carrega a localização
(GPS) e o modelo do aparelho, e nada disso tem por que ficar guardado. O nome em disco é um uuid4 novo
a cada troca (nunca o nome enviado), em <upload_dir>/avatars/.
"""

import io
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

AVATAR_DIR_NAME = "avatars"
AVATAR_SIZE = 512
JPEG_QUALITY = 85
# O app já reduz a foto antes de enviar; o limite segura um envio direto pela API.
MAX_AVATAR_BYTES = 10 * 1024 * 1024
# Teto de pixels (anti "bomba de descompressão"): uma foto de celular de 50MP passa, um PNG forjado
# de 30000x30000 não.
MAX_PIXELS = 60_000_000
# Pillow aqui não lê HEIC (exigiria pillow-heif); o app converte pra JPEG antes de enviar.
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# Fundo de quem tem transparência (PNG/WebP): a superfície do tema padrão, em vez de preto.
FLATTEN_BACKGROUND = (27, 32, 30)


class AvatarError(ValueError):
    """Imagem recusada -- a mensagem vai pro usuário (400)."""


def avatar_dir() -> Path:
    return Path(settings.upload_dir, AVATAR_DIR_NAME)


def avatar_path(filename: str) -> Path:
    # O nome vem sempre do banco (uuid4.hex + .jpg), mas não custa garantir que não sai da pasta.
    return avatar_dir() / Path(filename).name


def normalize_avatar(data: bytes) -> bytes:
    """Bytes de JPEG/PNG/WebP -> JPEG quadrado AVATAR_SIZE x AVATAR_SIZE, sem metadados."""
    if not data:
        raise AvatarError("Arquivo vazio")
    if len(data) > MAX_AVATAR_BYTES:
        raise AvatarError("A foto passa de 10MB")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            width, height = probe.size
        if fmt not in ALLOWED_FORMATS:
            raise AvatarError("Formato não suportado: envie uma foto JPEG, PNG ou WebP")
        if width * height > MAX_PIXELS:
            raise AvatarError("Imagem grande demais")
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                rgba = img.convert("RGBA")
                base = Image.new("RGB", rgba.size, FLATTEN_BACKGROUND)
                base.paste(rgba, mask=rgba.getchannel("A"))
                img = base
            else:
                img = img.convert("RGB")
            img = ImageOps.fit(img, (AVATAR_SIZE, AVATAR_SIZE), method=Image.Resampling.LANCZOS)
            out = io.BytesIO()
            # Sem exif=/icc_profile=: o JPEG sai sem metadados.
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue()
    except AvatarError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise AvatarError("Não foi possível ler a imagem") from exc


def save_avatar_file(jpeg: bytes) -> str:
    """Grava o JPEG já normalizado com um nome novo e devolve o nome."""
    folder = avatar_dir()
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.jpg"
    (folder / filename).write_bytes(jpeg)
    return filename
