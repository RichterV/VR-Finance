import calendar
from datetime import date


def add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def last_day_of_month(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])
