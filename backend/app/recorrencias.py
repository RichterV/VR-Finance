"""Gastos e receitas recorrentes.

Cada recorrência guarda o próximo mês a gerar (`proximo_mes`). Na primeira requisição autenticada
de um mês novo, `ensure_recurrences` cria um lançamento comum (gasto ou receita) pra cada mês que
ainda falta até o mês atual -- inclusive meses em que ninguém abriu o app -- com a data no dia
escolhido. Sem cron, mesmo padrão do resumo mensal (app/resumo_mensal.py).

Dia que não existe no mês (31 em abril, 29-31 em fevereiro) cai no último dia do mês, a mesma regra
das parcelas (`add_months`): 31 -> 30/04, 28/02 ou 29/02 em ano bissexto.
"""

import time
from datetime import date
from typing import Union

from sqlalchemy import update
from sqlalchemy.orm import Session

from app import models
from app.utils import add_months, last_day_of_month, today_local

# Checagem no máximo 1x por minuto por usuário (a Home dispara várias requisições em paralelo); a
# virada do mês sempre força uma checagem nova.
CHECK_INTERVAL_SECONDS = 60
_last_check: dict[int, tuple[date, float]] = {}


def reset_check_cache() -> None:
    _last_check.clear()


def month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def occurrence_date(month: date, dia: int) -> date:
    return date(month.year, month.month, min(dia, last_day_of_month(month.year, month.month).day))


def status_of(rec: models.Recorrencia) -> str:
    if rec.fim_mes is not None and rec.proximo_mes > rec.fim_mes:
        return "encerrada"
    return "pausada" if rec.pausada else "ativa"


def next_date_of(rec: models.Recorrencia) -> date | None:
    return occurrence_date(rec.proximo_mes, rec.dia) if status_of(rec) == "ativa" else None


def _build_launch(rec: models.Recorrencia, d: date) -> Union[models.Gasto, models.Receita]:
    if rec.tipo == "gasto":
        return models.Gasto(
            user_id=rec.user_id,
            priority=rec.priority,
            item_id=rec.item_id,
            value=rec.value,
            description=rec.description,
            is_installment=False,
            recorrencia_id=rec.id,
            date=d,
        )
    return models.Receita(
        user_id=rec.user_id,
        value=rec.value,
        cash_percentage=rec.cash_percentage,
        cash_value=round(rec.value * rec.cash_percentage / 100, 2),
        description=rec.description,
        recorrencia_id=rec.id,
        date=d,
    )


def create_from_launch(
    db: Session, launch: Union[models.Gasto, models.Receita], dia: int | None
) -> models.Recorrencia:
    """Recorrência a partir do lançamento recém-cadastrado: ele é o 1º, a regra gera do mês seguinte
    em diante. Dia omitido = o dia da data do lançamento. Não faz commit."""
    is_gasto = isinstance(launch, models.Gasto)
    rec = models.Recorrencia(
        user_id=launch.user_id,
        tipo="gasto" if is_gasto else "receita",
        priority=launch.priority if is_gasto else None,
        item_id=launch.item_id if is_gasto else None,
        value=launch.value,
        cash_percentage=None if is_gasto else launch.cash_percentage,
        description=launch.description,
        dia=dia or launch.date.day,
        proximo_mes=add_months(month_start(launch.date), 1),
    )
    db.add(rec)
    db.flush()
    launch.recorrencia_id = rec.id
    return rec


def ensure_recurrences(db: Session, user_id: int, force: bool = False) -> int:
    """Gera os lançamentos que faltam até o mês atual. Devolve quantos criou."""
    atual = month_start(today_local())
    if not force:
        last = _last_check.get(user_id)
        if last and last[0] == atual and time.monotonic() - last[1] < CHECK_INTERVAL_SECONDS:
            return 0
    _last_check[user_id] = (atual, time.monotonic())

    pendentes = (
        db.query(models.Recorrencia)
        .filter(
            models.Recorrencia.user_id == user_id,
            models.Recorrencia.pausada.is_(False),
            models.Recorrencia.proximo_mes <= atual,
        )
        .all()
    )
    criados = 0
    for rec in pendentes:
        ultimo = atual if rec.fim_mes is None else min(atual, rec.fim_mes)
        meses: list[date] = []
        mes = rec.proximo_mes
        while mes <= ultimo:
            meses.append(mes)
            mes = add_months(mes, 1)
        if not meses:  # encerrada
            continue
        # Só quem consegue avançar o proximo_mes gera: duas requisições simultâneas não duplicam (o
        # SQLite serializa a escrita, e a segunda já não acha o valor antigo).
        result = db.execute(
            update(models.Recorrencia)
            .where(models.Recorrencia.id == rec.id, models.Recorrencia.proximo_mes == rec.proximo_mes)
            .values(proximo_mes=add_months(ultimo, 1))
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            continue
        db.add_all(_build_launch(rec, occurrence_date(m, rec.dia)) for m in meses)
        criados += len(meses)
    if pendentes:
        db.commit()
    return criados
