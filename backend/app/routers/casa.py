"""Módulo Manutenção Casa: imóveis e serviços de manutenção (mesmo desenho de Manutenção Veículos,
sem quilometragem e com categoria, prestador e garantia). Separado das finanças pessoais: serviço
da casa não vira gasto."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.compartilhamento import (
    ImovelAcesso,
    accessible_imoveis,
    encerrar_por_exclusao,
    imovel_access,
    servico_access,
    usuario_ref,
)
from app.deps import get_current_user, get_db, require_module
from app.lixeira import trash_record
from app.utils import add_months, like_contains, period_filters, today_local

router = APIRouter(
    prefix="/casa",
    tags=["casa"],
    dependencies=[Depends(require_module("manutencao_casa"))],
)

# Data mais antiga aceita num serviço novo (só pra barrar erro de digitação, ex: ano 0202).
MIN_SERVICE_DATE = date(1950, 1, 1)


def _get_owned_imovel(db: Session, current_user: models.User, imovel_id: int) -> models.Imovel:
    """Renomear/excluir: só o dono (convidado de um imóvel compartilhado recebe 403)."""
    return imovel_access(db, current_user, imovel_id, minimo="dono").imovel


def _imovel_out(acesso: ImovelAcesso, compartilhado_com: int = 0) -> schemas.ImovelOut:
    imovel = acesso.imovel
    if acesso.nivel == "dono":
        return schemas.ImovelOut(
            id=imovel.id, name=imovel.name, active=imovel.active, compartilhado_com=compartilhado_com
        )
    return schemas.ImovelOut(
        id=imovel.id,
        name=imovel.name,
        active=imovel.active,
        dono=usuario_ref(acesso.compartilhamento.dono),
        meu_nivel=acesso.nivel,
        compartilhamento_id=acesso.compartilhamento.id,
    )


def _resolve_service_date(requested: Optional[date]) -> date:
    """Data do serviço novo: hoje por padrão, ou qualquer dia passado (serviço lançado depois de
    feito) -- nunca no futuro."""
    today = today_local()
    if requested is None:
        return today
    if requested > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data do serviço não pode ser no futuro.")
    if requested < MIN_SERVICE_DATE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data do serviço inválida.")
    return requested


def _clean(text: Optional[str]) -> Optional[str]:
    text = (text or "").strip()
    return text or None


def _validate_garantia(garantia_ate: Optional[date], service_date: date) -> None:
    if garantia_ate is not None and garantia_ate < service_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A garantia não pode terminar antes da data do serviço.",
        )


# --- Imóveis ---------------------------------------------------------------------------------------


@router.get("/imoveis", response_model=list[schemas.ImovelOut])
def list_imoveis(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Próprios + compartilhados comigo (aceitos), por nome."""
    acessos = sorted(accessible_imoveis(db, current_user), key=lambda a: (a.imovel.name.casefold(), a.imovel.id))
    own_ids = [a.imovel.id for a in acessos if a.nivel == "dono"]
    contagem = dict(
        db.query(models.Compartilhamento.item_id, func.count(models.Compartilhamento.id))
        .filter(
            models.Compartilhamento.item_tipo == "imovel",
            models.Compartilhamento.item_id.in_(own_ids),
            models.Compartilhamento.status == "aceito",
        )
        .group_by(models.Compartilhamento.item_id)
        .all()
    ) if own_ids else {}
    return [_imovel_out(a, contagem.get(a.imovel.id, 0)) for a in acessos]


@router.post("/imoveis", response_model=schemas.ImovelOut, status_code=status.HTTP_201_CREATED)
def create_imovel(
    payload: schemas.ImovelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    imovel = models.Imovel(user_id=current_user.id, name=payload.name)
    db.add(imovel)
    db.commit()
    db.refresh(imovel)
    return imovel


@router.put("/imoveis/{imovel_id}", response_model=schemas.ImovelOut)
def update_imovel(
    imovel_id: int,
    payload: schemas.ImovelUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    imovel = _get_owned_imovel(db, current_user, imovel_id)
    imovel.name = payload.name
    db.commit()
    db.refresh(imovel)
    return imovel


@router.delete("/imoveis/{imovel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_imovel(
    imovel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    imovel = _get_owned_imovel(db, current_user, imovel_id)
    imovel.active = False  # soft delete: os serviços continuam no histórico
    encerrar_por_exclusao(db, current_user, imovel)  # e avisa quem tinha o imóvel compartilhado
    db.commit()


# --- Resumo ----------------------------------------------------------------------------------------


@router.get("/resumo", response_model=schemas.CasaResumo)
def resumo_casa(
    meses: int = Query(12, ge=1, le=36),
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    mes: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Cards por imóvel e totais por categoria (filtrados por ano/mês, se informados) + série mensal
    por imóvel (sempre a janela rolante de `meses`, sem o filtro -- mesma regra de Veículos)."""
    # Próprios + compartilhados comigo (o filtro por imóvel da tela separa quando preciso).
    imoveis = sorted(
        (a.imovel for a in accessible_imoveis(db, current_user)), key=lambda i: (i.name.casefold(), i.id)
    )
    active_ids = [i.id for i in imoveis]

    today = today_local()
    janela = [
        (ref.year, ref.month)
        for ref in (add_months(date(today.year, today.month, 1), -i) for i in range(meses - 1, -1, -1))
    ]
    meses_labels = [f"{ref_ano:04d}-{ref_mes:02d}" for ref_ano, ref_mes in janela]

    base = db.query(models.ServicoCasa).filter(models.ServicoCasa.imovel_id.in_(active_ids))
    todos = base.all() if active_ids else []
    filtrados = (
        base.filter(*period_filters(models.ServicoCasa.date, ano, mes)).all() if active_ids else []
    )

    por_imovel: dict[int, list[models.ServicoCasa]] = {i.id: [] for i in imoveis}
    for s in filtrados:
        por_imovel[s.imovel_id].append(s)

    valores_mes: dict[int, dict[tuple[int, int], float]] = {i.id: {} for i in imoveis}
    for s in todos:
        key = (s.date.year, s.date.month)
        valores_mes[s.imovel_id][key] = valores_mes[s.imovel_id].get(key, 0) + s.value

    imoveis_resumo = [
        schemas.ImovelResumoItem(
            imovel_id=i.id,
            imovel_name=i.name,
            total_gasto=round(sum(s.value for s in por_imovel[i.id]), 2),
            quantidade_servicos=len(por_imovel[i.id]),
            ultimo_servico=max((s.date for s in por_imovel[i.id]), default=None),
        )
        for i in imoveis
    ]
    series = [
        {
            "imovel_name": i.name,
            "valores": [round(valores_mes[i.id].get(key, 0), 2) for key in janela],
        }
        for i in imoveis
    ]

    por_categoria: dict[str, list[float]] = {}
    for s in filtrados:
        por_categoria.setdefault(s.categoria, []).append(s.value)
    categorias = sorted(
        (
            schemas.CasaCategoriaResumo(categoria=cat, total=round(sum(vals), 2), quantidade=len(vals))
            for cat, vals in por_categoria.items()
        ),
        key=lambda c: (-c.total, c.categoria),
    )

    garantias_vigentes = sum(1 for s in todos if s.garantia_ate is not None and s.garantia_ate >= today)

    return schemas.CasaResumo(
        imoveis=imoveis_resumo,
        categorias=categorias,
        garantias_vigentes=garantias_vigentes,
        meses=meses_labels,
        series=series,
    )


# --- Serviços --------------------------------------------------------------------------------------


@router.get("/servicos", response_model=schemas.ServicoCasaPage)
def list_servicos(
    imovel_id: Optional[int] = Query(None),
    categoria: Optional[schemas.CasaCategoria] = Query(None),
    garantia_vigente: bool = Query(False),
    busca: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Dos meus imóveis (inclusive excluídos, como antes) + dos compartilhados comigo.
    shared_ids = [a.imovel.id for a in accessible_imoveis(db, current_user) if a.nivel != "dono"]
    query = db.query(models.ServicoCasa).filter(
        or_(models.ServicoCasa.user_id == current_user.id, models.ServicoCasa.imovel_id.in_(shared_ids))
    )
    if imovel_id is not None:
        query = query.filter(models.ServicoCasa.imovel_id == imovel_id)
    if categoria is not None:
        query = query.filter(models.ServicoCasa.categoria == categoria)
    if garantia_vigente:
        query = query.filter(models.ServicoCasa.garantia_ate >= today_local())
    if busca:
        termo = like_contains(busca)
        query = query.filter(
            or_(
                models.ServicoCasa.description.ilike(termo, escape="\\"),
                models.ServicoCasa.notes.ilike(termo, escape="\\"),
                models.ServicoCasa.prestador.ilike(termo, escape="\\"),
            )
        )
    total = query.count()
    items = (
        query.options(joinedload(models.ServicoCasa.imovel), joinedload(models.ServicoCasa.criador))
        .order_by(models.ServicoCasa.date.desc(), models.ServicoCasa.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": items, "total": total}


@router.post("/servicos", response_model=schemas.ServicoCasaOut, status_code=status.HTTP_201_CREATED)
def create_servico(
    payload: schemas.ServicoCasaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    imovel = imovel_access(db, current_user, payload.imovel_id, minimo="cadastro").imovel
    if not imovel.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este imóvel foi excluído.")
    service_date = _resolve_service_date(payload.date)
    _validate_garantia(payload.garantia_ate, service_date)
    service = models.ServicoCasa(
        user_id=imovel.user_id,  # sempre do dono, mesmo quando quem cadastra é um convidado
        criado_por=current_user.id,
        imovel_id=payload.imovel_id,
        description=payload.description,
        notes=_clean(payload.notes),
        value=payload.value,
        categoria=payload.categoria,
        service_type=payload.service_type,
        prestador=_clean(payload.prestador),
        garantia_ate=payload.garantia_ate,
        date=service_date,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/servicos/{service_id}", response_model=schemas.ServicoCasaOut)
def update_servico(
    service_id: int,
    payload: schemas.ServicoCasaUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    service, _ = servico_access(db, current_user, service_id, minimo="edicao")
    imovel = imovel_access(db, current_user, payload.imovel_id, minimo="edicao").imovel
    if not imovel.active and imovel.id != service.imovel_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este imóvel foi excluído.")
    if imovel.user_id != service.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O serviço só pode ser movido para outro imóvel do mesmo dono.",
        )
    _validate_garantia(payload.garantia_ate, service.date)  # a data não é editável
    service.imovel_id = payload.imovel_id
    service.description = payload.description
    service.notes = _clean(payload.notes)
    service.value = payload.value
    service.categoria = payload.categoria
    service.service_type = payload.service_type
    service.prestador = _clean(payload.prestador)
    service.garantia_ate = payload.garantia_ate
    db.commit()
    db.refresh(service)
    return service


@router.delete("/servicos/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_servico(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    service, _ = servico_access(db, current_user, service_id, minimo="total")
    # Vai pra lixeira do dono (user_id do serviço), mesmo quando quem exclui é o convidado.
    trash_record(db, "servico_casa", service)  # lixeira (15 dias), com os anexos
    db.commit()
