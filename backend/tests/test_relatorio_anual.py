from datetime import date

import pytest

from app import models, relatorio_anual
from app.relatorio_anual import montar_relatorio
from app.utils import today_local
from tests.conftest import _create_user, _login_headers


def _categoria(db, user, nome, priority="essencial", cesta=False):
    cat = models.DropdownOption(user_id=user.id, priority=priority, name=nome, include_in_inflation=cesta)
    db.add(cat)
    db.flush()
    return cat


def _gasto(db, user, cat, valor, dia, descricao=None, **extra):
    db.add(
        models.Gasto(
            user_id=user.id, priority=cat.priority, item_id=cat.id, value=valor, date=dia, description=descricao,
            is_installment=extra.pop("is_installment", False), **extra,
        )
    )


def _receita(db, user, valor, dia, pct=20.0, descricao="Salário"):
    db.add(
        models.Receita(
            user_id=user.id, value=valor, cash_percentage=pct, cash_value=round(valor * pct / 100, 2),
            date=dia, description=descricao,
        )
    )


@pytest.fixture()
def base(db_session, user):
    """2025 e um pedaço de 2024 pra comparação."""
    aluguel = _categoria(db_session, user, "Aluguel", cesta=True)
    mercado = _categoria(db_session, user, "Mercado", cesta=True)
    lazer = _categoria(db_session, user, "Lazer", priority="nao_essencial")
    for mes in range(1, 13):
        _gasto(db_session, user, aluguel, 1000.0, date(2025, mes, 5))  # conta fixa lançada à mão
        _receita(db_session, user, 5000.0, date(2025, mes, 1))
    for mes, valor in ((1, 300.0), (1, 450.0), (2, 200.0), (3, 900.0)):  # mercado varia: não é conta fixa
        _gasto(db_session, user, mercado, valor, date(2025, mes, 10), "Compras")
    _gasto(db_session, user, lazer, 2500.0, date(2025, 7, 20), "Viagem")
    # parcelado: 3x de 400 começando em nov/2025 (1 parcela cai em 2026)
    for n, mes in enumerate(((2025, 11), (2025, 12), (2026, 1)), start=1):
        _gasto(
            db_session, user, lazer, 400.0, date(*mes, 15), "TV", is_installment=True,
            installment_count=3, installment_number=n, installment_group_id="grupo-tv",
        )
    # 2024 (base de comparação)
    _gasto(db_session, user, aluguel, 900.0, date(2024, 6, 5))
    _receita(db_session, user, 4000.0, date(2024, 6, 1))
    db_session.commit()
    return {"aluguel": aluguel, "mercado": mercado, "lazer": lazer}


def test_totais_do_ano_encerrado(db_session, user, base):
    rel = montar_relatorio(db_session, user, 2025, date(2026, 3, 1))

    a = rel.atual
    assert rel.em_andamento is False and rel.corte == date(2025, 12, 31)
    assert a.receita == 60000.0
    assert a.gastos == 12000 + 1850 + 2500 + 800
    assert a.essencial == 12000 + 1850
    assert a.pretendido == 12000.0
    assert a.caixa_real == 60000 - 17150
    assert rel.anterior.gastos == 900.0 and rel.anterior.receita == 4000.0
    assert len(rel.por_mes) == 12
    assert rel.por_mes[0][1].gastos == 1000 + 750


def test_categorias_contas_fixas_parcelas_e_pontuais(db_session, user, base):
    rel = montar_relatorio(db_session, user, 2025, date(2026, 3, 1))

    assert [c.nome for c in rel.categorias] == ["Aluguel", "Lazer", "Mercado"]
    aluguel = rel.categorias[0]
    assert aluguel.anterior == 900.0 and round(aluguel.variacao_pct, 1) == round((12000 - 900) / 900 * 100, 1)

    fixas = {c.nome: c for c in rel.contas_fixas}
    assert fixas["Aluguel"].meses == 12 and fixas["Aluguel"].total == 12000.0
    assert "Mercado - Compras" not in fixas  # valores muito diferentes
    assert fixas["Salário"].tipo == "receita"

    assert [g.description for g in rel.maiores][:2] == ["Viagem", "Compras"]  # sem aluguel nem parcelas
    assert rel.parcelas_pagas == 800.0
    assert [(p.nome, p.parcelas, p.total) for p in rel.parcelamentos_novos] == [("Lazer - TV", 3, 1200.0)]
    assert rel.parcelas_futuras == 400.0 and rel.parcelas_futuras_ate == date(2026, 1, 15)


def test_ano_em_andamento_para_hoje_e_mostra_o_programado(db_session, user, base):
    rel = montar_relatorio(db_session, user, 2025, date(2025, 3, 15))

    assert rel.em_andamento is True and rel.corte == date(2025, 3, 15)
    assert len(rel.por_mes) == 3
    assert rel.atual.gastos == 3000 + 1850  # aluguel jan-mar + mercado
    assert rel.programado_gastos == 9000 + 2500 + 800
    assert rel.corte_anterior == date(2024, 3, 15)
    assert rel.anterior.gastos == 0  # o lançamento de 2024 é de junho, fora do mesmo período
    assert any("parcial" in aviso for aviso in rel.avisos)


def test_destaques_e_inflacao(db_session, user, base):
    rel = montar_relatorio(db_session, user, 2025, date(2026, 3, 1))

    assert any("Você guardou" in frase for frase in rel.destaques)
    assert any("Mês mais caro: julho" in frase for frase in rel.destaques)
    assert rel.inflacao is not None and rel.inflacao[0] == ["Aluguel", "Mercado"]
    assert rel.inflacao[1] == 13850.0


def test_relatorio_sem_dados(db_session, user):
    rel = montar_relatorio(db_session, user, 2025, date(2026, 3, 1))
    assert not rel.atual.tem_dados
    assert any("Nenhuma receita ou gasto" in aviso for aviso in rel.avisos)


def test_endpoint_gera_pdf_e_lista_anos(client, auth_headers, base):
    anos = client.get("/relatorios/anual/anos", headers=auth_headers)
    assert anos.status_code == 200
    assert 2025 in anos.json() and 2024 in anos.json()

    response = client.get("/relatorios/anual", headers=auth_headers, params={"ano": 2025})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert 'filename="relatorio-anual-2025.pdf"' in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")

    # sem dados também gera (só com o aviso)
    assert client.get("/relatorios/anual", headers=auth_headers, params={"ano": 2019}).status_code == 200


def test_endpoint_valida_ano_e_modulo(client, auth_headers, db_session):
    assert client.get("/relatorios/anual", headers=auth_headers, params={"ano": today_local().year + 1}).status_code == 400
    _create_user(db_session, "sem_export", "senha", modules=())
    headers = _login_headers(client, "sem_export", "senha")
    assert client.get("/relatorios/anual", headers=headers, params={"ano": 2025}).status_code == 403


# --- Aviso de virada do ano ---

def _avisos(client, headers):
    return [n for n in client.get("/notificacoes", headers=headers).json() if n["tipo"] == "relatorio_anual"]


def test_aviso_de_relatorio_na_virada_do_ano(client, auth_headers, base, monkeypatch, db_session, user):
    _gasto(db_session, user, base["aluguel"], 1000.0, date(2026, 6, 5))
    db_session.commit()
    monkeypatch.setattr(relatorio_anual, "today_local", lambda: date(2027, 1, 2))

    avisos = _avisos(client, auth_headers)
    assert len(avisos) == 1
    aviso = avisos[0]
    assert aviso["ano"] == 2026 and aviso["titulo"] == "Seu relatório de 2026 está pronto"
    assert aviso["payload"] is None and aviso["lida"] is False
    assert len(_avisos(client, auth_headers)) == 1  # não duplica


def test_sem_aviso_antes_do_primeiro_ano_sem_dados_ou_sem_modulo(client, auth_headers, base, monkeypatch, db_session):
    monkeypatch.setattr(relatorio_anual, "today_local", lambda: date(2026, 1, 2))  # 2025 < PRIMEIRO_ANO_AVISO
    assert _avisos(client, auth_headers) == []

    monkeypatch.setattr(relatorio_anual, "today_local", lambda: date(2028, 1, 2))  # 2027 sem lançamentos
    assert _avisos(client, auth_headers) == []

    _create_user(db_session, "sem_export", "senha", modules=())
    headers = _login_headers(client, "sem_export", "senha")
    monkeypatch.setattr(relatorio_anual, "today_local", lambda: date(2027, 1, 2))
    assert _avisos(client, headers) == []
