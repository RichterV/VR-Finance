import calendar
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status

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
