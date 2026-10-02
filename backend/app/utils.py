import calendar
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import extract

# O servidor roda em UTC; "hoje" do app é sempre o dia no Brasil (senão, depois das 21h, o
# backend já está no dia seguinte e rejeita a data de hoje enviada pelo frontend).
APP_TIMEZONE = ZoneInfo("America/Sao_Paulo")


def today_local() -> date:
    """Data de hoje no fuso do app (America/Sao_Paulo), independente do fuso do servidor."""
    return datetime.now(APP_TIMEZONE).date()


def add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def last_day_of_month(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])


def max_launch_date(today: date) -> date:
    """Data mais distante aceita num lançamento novo de gasto/receita: fim do mês seguinte."""
    next_month = add_months(date(today.year, today.month, 1), 1)
    return last_day_of_month(next_month.year, next_month.month)


def resolve_launch_date(requested: date | None) -> date:
    """Data de um gasto/receita novo: hoje por padrão, ou uma data de hoje até o fim do mês seguinte."""
    today = today_local()
    if requested is None:
        return today
    if requested < today or requested > max_launch_date(today):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data deve estar entre hoje e o fim do mês seguinte",
        )
    return requested


def month_range(ano: int, mes: int) -> tuple[date, date]:
    """(primeiro dia do mês, primeiro dia do mês seguinte) -- filtro por faixa usa o índice
    (user_id, date), ao contrário de extract("month")."""
    inicio = date(ano, mes, 1)
    return inicio, add_months(inicio, 1)


def year_range(ano: int) -> tuple[date, date]:
    return date(ano, 1, 1), date(ano + 1, 1, 1)


def period_filters(column, ano: int | None, mes: int | None) -> list:
    """Condições de filtro por ano e/ou mês sobre uma coluna de data. Ano (com ou sem mês) vira
    faixa de datas; só o mês ("esse mês em qualquer ano") não tem faixa e continua com extract."""
    if ano is not None and mes is not None:
        inicio, fim = month_range(ano, mes)
        return [column >= inicio, column < fim]
    if ano is not None:
        inicio, fim = year_range(ano)
        return [column >= inicio, column < fim]
    if mes is not None:
        return [extract("month", column) == mes]
    return []


def like_contains(term: str) -> str:
    """Padrão de ILIKE "contém", com os curingas do usuário escapados -- usar com escape="\\"."""
    escaped = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
