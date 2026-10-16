"""Compartilhamento de itens entre usuários -- hoje só imóvel do Manutenção Casa (item_tipo "imovel"),
mas a tabela é genérica (pronta pra veículo depois).

O dono envia um convite (username exato + nível); só vale depois que o convidado aceita. Aí os dois
trabalham sobre os mesmos serviços e anexos do imóvel: o dado continua gravado com o user_id do
dono (inclusive o que o convidado cadastra), então exportação, lixeira, exclusão de conta e backup
não mudam de conceito. Cada transição gera um aviso na central de notificações.

Ciclo: pendente -> aceito -> encerrado (dono revoga / convidado sai / imóvel excluído);
pendente -> recusado | cancelado (remetente) | expirado (30 dias sem resposta, sem cron --
ensure_expired_shares roda ao listar notificações e compartilhamentos).

Níveis acumulados: leitura < cadastro < edicao < total. Renomear/excluir o imóvel, compartilhar,
mudar o nível e restaurar da lixeira são sempre só do dono.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas

NIVEIS = ("leitura", "cadastro", "edicao", "total")
NIVEL_LABELS = {"leitura": "Leitura", "cadastro": "Cadastro", "edicao": "Edição", "total": "Tudo"}
# "dono" fica acima de todos: ações que só o dono faz pedem minimo="dono".
_ORDEM = {nivel: i for i, nivel in enumerate((*NIVEIS, "dono"))}

ATIVOS = ("pendente", "aceito")
EXPIRA_EM = timedelta(days=30)

# item_tipo -> módulo opcional que dono e convidado precisam ter
ITEM_MODULE = {"imovel": "manutencao_casa"}

TIPO_CONVITE = "compartilhamento_convite"
TIPO_RESPOSTA = "compartilhamento_resposta"
TIPO_ENCERRADO = "compartilhamento_encerrado"
TIPO_NIVEL = "compartilhamento_nivel"
TIPOS = (TIPO_CONVITE, TIPO_RESPOSTA, TIPO_ENCERRADO, TIPO_NIVEL)

ENVIO_INVALIDO = "Não foi possível enviar para esse usuário."
SEM_PERMISSAO = "Sua permissão neste imóvel não permite isso."


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def nivel_suficiente(nivel: str, minimo: str) -> bool:
    return _ORDEM[nivel] >= _ORDEM[minimo]


def nome_completo(user: models.User) -> str:
    return f"{user.first_name} {user.last_name}".strip() or user.username


def usuario_ref(user: models.User) -> schemas.UsuarioRef:
    return schemas.UsuarioRef(id=user.id, username=user.username, nome=nome_completo(user))


def _quem(user: models.User) -> str:
    return f"{nome_completo(user)} ({user.username})"


# --- Acesso ao imóvel ------------------------------------------------------------------------------


@dataclass
class ImovelAcesso:
    imovel: models.Imovel
    nivel: str  # "dono" ou um dos NIVEIS
    compartilhamento: Optional[models.Compartilhamento] = None


def shared_imoveis(db: Session, user: models.User) -> list[ImovelAcesso]:
    """Imóveis ativos compartilhados com o usuário (aceitos), cujo dono ainda tem o módulo."""
    if ITEM_MODULE["imovel"] not in user.modules:
        return []
    rows = (
        db.query(models.Compartilhamento, models.Imovel)
        .join(models.Imovel, models.Imovel.id == models.Compartilhamento.item_id)
        .filter(
            models.Compartilhamento.item_tipo == "imovel",
            models.Compartilhamento.convidado_id == user.id,
            models.Compartilhamento.status == "aceito",
            models.Imovel.active.is_(True),
            models.Imovel.user_id == models.Compartilhamento.dono_id,
        )
        .all()
    )
    # Módulo desligado do dono: o compartilhamento continua no banco, só fica inacessível.
    return [
        ImovelAcesso(imovel, share.nivel, share)
        for share, imovel in rows
        if ITEM_MODULE["imovel"] in share.dono.modules
    ]


def accessible_imoveis(db: Session, user: models.User) -> list[ImovelAcesso]:
    """Imóveis ativos que o usuário vê no /casa: os próprios + os compartilhados com ele."""
    own = (
        db.query(models.Imovel)
        .filter(models.Imovel.user_id == user.id, models.Imovel.active.is_(True))
        .all()
    )
    return [ImovelAcesso(i, "dono") for i in own] + shared_imoveis(db, user)


def accessible_imovel_ids(db: Session, user: models.User, minimo: str = "leitura") -> list[int]:
    return [a.imovel.id for a in accessible_imoveis(db, user) if nivel_suficiente(a.nivel, minimo)]


def imovel_access(db: Session, user: models.User, imovel_id: int, minimo: str = "leitura") -> ImovelAcesso:
    """Imóvel do usuário (inclusive excluído, como antes) ou compartilhado com ele (ativo). 404 se
    ele não enxerga o imóvel; 403 se enxerga, mas o nível não basta."""
    imovel = db.get(models.Imovel, imovel_id)
    if imovel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    if imovel.user_id == user.id:
        return ImovelAcesso(imovel, "dono")
    acesso = next((a for a in shared_imoveis(db, user) if a.imovel.id == imovel_id), None)
    if acesso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    if not nivel_suficiente(acesso.nivel, minimo):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SEM_PERMISSAO)
    return acesso


def servico_access(
    db: Session, user: models.User, service_id: int, minimo: str = "leitura"
) -> tuple[models.ServicoCasa, ImovelAcesso]:
    service = db.get(models.ServicoCasa, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado")
    try:
        acesso = imovel_access(db, user, service.imovel_id, minimo)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado") from exc
        raise
    return service, acesso


# --- Notificações ----------------------------------------------------------------------------------


def _notify(
    db: Session,
    destinatario_id: int,
    tipo: str,
    evento: str,
    titulo: str,
    share: models.Compartilhamento,
    ator: models.User,
    item_nome: str,
) -> None:
    payload = {
        "compartilhamento_id": share.id,
        "evento": evento,
        "item_tipo": share.item_tipo,
        "item_id": share.item_id,
        "item_nome": item_nome,
        "ator": usuario_ref(ator).model_dump(),
        "nivel": share.nivel,
    }
    db.add(
        models.Notificacao(
            user_id=destinatario_id,
            tipo=tipo,
            ref_id=share.id,
            titulo=titulo,
            payload=json.dumps(payload, ensure_ascii=False),
        )
    )


def parse_payload(raw: str, share_status: Optional[str]) -> schemas.CompartilhamentoPayload:
    return schemas.CompartilhamentoPayload(**json.loads(raw), status=share_status)


def _remove_convite(db: Session, share: models.Compartilhamento) -> None:
    """O convite não existe mais (cancelado/expirado): some da lista do convidado."""
    db.query(models.Notificacao).filter(
        models.Notificacao.tipo == TIPO_CONVITE, models.Notificacao.ref_id == share.id
    ).delete(synchronize_session=False)


def _mark_convite_read(db: Session, share: models.Compartilhamento) -> None:
    db.query(models.Notificacao).filter(
        models.Notificacao.tipo == TIPO_CONVITE,
        models.Notificacao.ref_id == share.id,
        models.Notificacao.lida_em.is_(None),
    ).update({models.Notificacao.lida_em: _now()}, synchronize_session=False)


# --- Ciclo de vida ---------------------------------------------------------------------------------


def item_nome(db: Session, share: models.Compartilhamento) -> str:
    imovel = db.get(models.Imovel, share.item_id)
    return imovel.name if imovel is not None else "imóvel excluído"


def to_out(db: Session, share: models.Compartilhamento) -> schemas.CompartilhamentoOut:
    return schemas.CompartilhamentoOut(
        id=share.id,
        item_tipo=share.item_tipo,
        item_id=share.item_id,
        item_nome=item_nome(db, share),
        dono=usuario_ref(share.dono),
        convidado=usuario_ref(share.convidado),
        nivel=share.nivel,
        status=share.status,
        created_at=share.created_at,
        respondido_em=share.respondido_em,
        encerrado_em=share.encerrado_em,
        expira_em=share.created_at + EXPIRA_EM if share.status == "pendente" else None,
    )


def ensure_expired_shares(db: Session) -> None:
    """Convite pendente há 30 dias vira "expirado" e some da lista do convidado. Ninguém é avisado."""
    limite = _now() - EXPIRA_EM
    vencidos = (
        db.query(models.Compartilhamento)
        .filter(models.Compartilhamento.status == "pendente", models.Compartilhamento.created_at < limite)
        .all()
    )
    for share in vencidos:
        share.status = "expirado"
        share.encerrado_em = _now()
        _remove_convite(db, share)
    if vencidos:
        db.commit()


def enviar(
    db: Session, dono: models.User, payload: schemas.CompartilhamentoCreate
) -> models.Compartilhamento:
    """Cria o convite (pendente) e avisa o convidado. Não faz commit."""
    imovel = db.get(models.Imovel, payload.item_id)
    if imovel is None or imovel.user_id != dono.id or not imovel.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    convidado = db.query(models.User).filter(models.User.username == payload.username).first()
    # Inexistente, o próprio usuário ou sem o módulo: mesma resposta (não revela quais contas existem).
    if convidado is None or convidado.id == dono.id or ITEM_MODULE[payload.item_tipo] not in convidado.modules:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ENVIO_INVALIDO)
    existente = (
        db.query(models.Compartilhamento.id)
        .filter(
            models.Compartilhamento.item_tipo == payload.item_tipo,
            models.Compartilhamento.item_id == imovel.id,
            models.Compartilhamento.convidado_id == convidado.id,
            models.Compartilhamento.status.in_(ATIVOS),
        )
        .first()
    )
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este imóvel já está compartilhado com esse usuário (ou aguardando resposta).",
        )
    share = models.Compartilhamento(
        item_tipo=payload.item_tipo,
        item_id=imovel.id,
        dono_id=dono.id,
        convidado_id=convidado.id,
        nivel=payload.nivel,
        status="pendente",
        created_at=_now(),
    )
    db.add(share)
    db.flush()
    _notify(
        db,
        convidado.id,
        TIPO_CONVITE,
        "convite",
        f'O usuário {_quem(dono)} deseja compartilhar o imóvel "{imovel.name}" com você '
        f"(permissão: {NIVEL_LABELS[share.nivel]}). Deseja aceitar?",
        share,
        dono,
        imovel.name,
    )
    return share


def _get_share(db: Session, share_id: int) -> models.Compartilhamento:
    share = db.get(models.Compartilhamento, share_id)
    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compartilhamento não encontrado")
    return share


def get_share_as_convidado(db: Session, user: models.User, share_id: int) -> models.Compartilhamento:
    share = _get_share(db, share_id)
    if share.convidado_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compartilhamento não encontrado")
    return share


def get_share_as_participant(db: Session, user: models.User, share_id: int) -> models.Compartilhamento:
    share = _get_share(db, share_id)
    if user.id not in (share.dono_id, share.convidado_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compartilhamento não encontrado")
    return share


def _require_status(share: models.Compartilhamento, *allowed: str) -> None:
    if share.status not in allowed:
        textos = {
            "aceito": "Este compartilhamento já foi aceito.",
            "recusado": "Este convite já foi recusado.",
            "cancelado": "Este convite foi cancelado por quem enviou.",
            "expirado": "Este convite expirou.",
            "encerrado": "Este compartilhamento já foi encerrado.",
            "pendente": "Este convite ainda não foi respondido.",
        }
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=textos[share.status])


def responder(db: Session, convidado: models.User, share: models.Compartilhamento, aceitar: bool) -> None:
    """Aceita ou recusa o convite e avisa o remetente. Não faz commit."""
    _require_status(share, "pendente")
    share.status = "aceito" if aceitar else "recusado"
    share.respondido_em = _now()
    _mark_convite_read(db, share)
    nome = item_nome(db, share)
    verbo = "aceitou" if aceitar else "recusou"
    _notify(
        db,
        share.dono_id,
        TIPO_RESPOSTA,
        "aceito" if aceitar else "recusado",
        f'{_quem(convidado)} {verbo} o compartilhamento do imóvel "{nome}".',
        share,
        convidado,
        nome,
    )


def mudar_nivel(db: Session, dono: models.User, share: models.Compartilhamento, nivel: str) -> None:
    """Só o dono, só aceito. Avisa o convidado se mudou. Não faz commit."""
    if share.dono_id != dono.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só o dono do imóvel pode mudar a permissão.")
    _require_status(share, "aceito")
    if share.nivel == nivel:
        return
    share.nivel = nivel
    nome = item_nome(db, share)
    _notify(
        db,
        share.convidado_id,
        TIPO_NIVEL,
        "nivel",
        f'{_quem(dono)} mudou sua permissão no imóvel "{nome}" para {NIVEL_LABELS[nivel]}.',
        share,
        dono,
        nome,
    )


def encerrar(db: Session, user: models.User, share: models.Compartilhamento) -> None:
    """Dono: cancela o convite (pendente) ou revoga (aceito). Convidado: sai (aceito). Não faz commit."""
    nome = item_nome(db, share)
    if share.dono_id == user.id:
        _require_status(share, *ATIVOS)
        share.encerrado_em = _now()
        if share.status == "pendente":
            share.status = "cancelado"
            _remove_convite(db, share)
            return
        share.status = "encerrado"
        _notify(
            db,
            share.convidado_id,
            TIPO_ENCERRADO,
            "revogado",
            f'{_quem(user)} encerrou o compartilhamento do imóvel "{nome}".',
            share,
            user,
            nome,
        )
        return
    # Convidado: pendente se responde recusando, não saindo.
    _require_status(share, "aceito")
    share.status = "encerrado"
    share.encerrado_em = _now()
    _notify(
        db,
        share.dono_id,
        TIPO_ENCERRADO,
        "saiu",
        f'{_quem(user)} deixou o compartilhamento do imóvel "{nome}".',
        share,
        user,
        nome,
    )


def encerrar_por_exclusao(db: Session, dono: models.User, imovel: models.Imovel) -> None:
    """Imóvel excluído pelo dono: encerra tudo dele e avisa quem já tinha aceitado. Não faz commit."""
    shares = (
        db.query(models.Compartilhamento)
        .filter(
            models.Compartilhamento.item_tipo == "imovel",
            models.Compartilhamento.item_id == imovel.id,
            models.Compartilhamento.status.in_(ATIVOS),
        )
        .all()
    )
    for share in shares:
        share.encerrado_em = _now()
        if share.status == "pendente":
            share.status = "cancelado"
            _remove_convite(db, share)
            continue
        share.status = "encerrado"
        _notify(
            db,
            share.convidado_id,
            TIPO_ENCERRADO,
            "imovel_excluido",
            f'O imóvel "{imovel.name}" foi excluído por {_quem(dono)}; o compartilhamento terminou.',
            share,
            dono,
            imovel.name,
        )


def delete_all_for_user(db: Session, user_id: int) -> None:
    """Exclusão de conta: some com os compartilhamentos em que ela é dona ou convidada (e os convites
    pendentes que ela mandou); os serviços que ela cadastrou em imóvel alheio ficam, sem autor."""
    shares = db.query(models.Compartilhamento).filter(
        (models.Compartilhamento.dono_id == user_id) | (models.Compartilhamento.convidado_id == user_id)
    )
    ids = [s.id for s in shares.all()]
    if ids:
        db.query(models.Notificacao).filter(
            models.Notificacao.tipo == TIPO_CONVITE, models.Notificacao.ref_id.in_(ids)
        ).delete(synchronize_session=False)
    shares.delete(synchronize_session=False)
    db.query(models.ServicoCasa).filter(
        models.ServicoCasa.criado_por == user_id, models.ServicoCasa.user_id != user_id
    ).update({models.ServicoCasa.criado_por: None}, synchronize_session=False)
