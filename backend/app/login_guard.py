"""Limite de tentativas de login (em memória -- o uvicorn roda com 1 worker).

Chave principal: o username (minúsculo). Por IP não serve: o tráfego que chega pelo Tailscale
(`tailscale serve`) aparece como 127.0.0.1 pro backend. Um segundo contador global freia tentativas
espalhadas por vários usernames. Reiniciar o backend zera tudo (aceitável).
"""
import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

MAX_FALHAS_POR_USUARIO = 5
JANELA_USUARIO_S = 15 * 60
MAX_FALHAS_GLOBAL = 30
JANELA_GLOBAL_S = 60


class LoginGuard:
    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._por_usuario: dict[str, deque[float]] = defaultdict(deque)
        self._global: deque[float] = deque()

    @staticmethod
    def _key(username: str) -> str:
        return (username or "").strip().lower()

    @staticmethod
    def _prune(falhas: deque[float], agora: float, janela: float) -> None:
        while falhas and agora - falhas[0] >= janela:
            falhas.popleft()

    def check(self, username: str) -> None:
        """429 se esse usuário (ou o total) passou do limite de falhas na janela."""
        agora = self._clock()
        with self._lock:
            falhas = self._por_usuario.get(self._key(username))
            if falhas is not None:
                self._prune(falhas, agora, JANELA_USUARIO_S)
                if len(falhas) >= MAX_FALHAS_POR_USUARIO:
                    self._raise(JANELA_USUARIO_S - (agora - falhas[0]))
            self._prune(self._global, agora, JANELA_GLOBAL_S)
            if len(self._global) >= MAX_FALHAS_GLOBAL:
                self._raise(JANELA_GLOBAL_S - (agora - self._global[0]))

    def register_failure(self, username: str) -> None:
        agora = self._clock()
        with self._lock:
            self._por_usuario[self._key(username)].append(agora)
            self._global.append(agora)

    def register_success(self, username: str) -> None:
        with self._lock:
            self._por_usuario.pop(self._key(username), None)

    def reset(self) -> None:
        with self._lock:
            self._por_usuario.clear()
            self._global.clear()

    @staticmethod
    def _raise(retry_after_s: float) -> None:
        segundos = max(1, math.ceil(retry_after_s))
        minutos = math.ceil(segundos / 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Muitas tentativas de login. Tente de novo em {minutos} min.",
            headers={"Retry-After": str(segundos)},
        )


login_guard = LoginGuard()
