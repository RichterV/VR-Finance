"""Cria (ou reseta) o usuário 'teste', com uma base de dados mocada grande, isolada da conta
principal (admin), pra rodar testes manuais sem arriscar os dados reais. Idempotente: se o
usuário já existir, apaga todos os dados dele (inclusive anexos) e recria, sem duplicar.

A base cobre ~4 anos (de janeiro de 4 anos atrás até o mês atual) em todos os módulos: categorias
(com cesta de inflação e uma categoria inativa), gastos recorrentes/variáveis/parcelados (alguns
com parcelas no futuro), receitas com reajuste anual e 13º, veículos com serviços de km crescente,
operações na bolsa (R$, US$ e câmbio), devedores (com parcelas atrasadas pra acender o badge) e
alguns anexos PDF. Os valores sobem com uma inflação de ~5% ao ano e têm sazonalidade (luz no
verão, presentes em dezembro, material escolar em fevereiro...), pra os gráficos terem forma.
Aleatoriedade com semente fixa: rodar de novo no mesmo dia gera exatamente a mesma base.

Uso: python -m app.seed_test_user
"""

import random
import uuid
from datetime import date
from pathlib import Path

from app import models
from app.config import settings
from app.database import SessionLocal
from app.modules import OPTIONAL_MODULES
from app.routers.attachments import delete_all_attachments_for_user
from app.security import hash_password
from app.utils import add_months, last_day_of_month, today_local

TEST_USERNAME = "teste"
TEST_PASSWORD = "SenhaDeTeste@123"
YEARS_OF_HISTORY = 4
ANNUAL_INFLATION = 0.05
RANDOM_SEED = 20260926

# (prioridade, nome, entra na cesta de inflação)
ITENS = [
    ("essencial", "Aluguel", True),
    ("essencial", "Condomínio", False),
    ("essencial", "Supermercado", True),
    ("essencial", "Luz", True),
    ("essencial", "Água", True),
    ("essencial", "Gás", True),
    ("essencial", "Internet", False),
    ("essencial", "Celular", False),
    ("essencial", "Gasolina", True),
    ("essencial", "Farmácia", True),
    ("essencial", "Saúde", False),
    ("essencial", "Educação", False),
    ("essencial", "Manutenção carro", False),
    ("nao_essencial", "Lanche", False),
    ("nao_essencial", "Restaurante", False),
    ("nao_essencial", "Lazer", False),
    ("nao_essencial", "Streaming", False),
    ("nao_essencial", "Roupas", False),
    ("nao_essencial", "Eletrônicos", False),
    ("nao_essencial", "Viagem", False),
    ("nao_essencial", "Presentes", False),
]
# Categoria que existiu e foi "excluída" (soft delete) -- gastos antigos continuam apontando pra ela
INACTIVE_ITEM = ("nao_essencial", "Academia")
INACTIVE_ITEM_UNTIL_MONTHS_AGO = 18

# Compras parceladas: (mês do ano, prioridade, categoria, valor da parcela, parcelas, descrição)
INSTALLMENT_PURCHASES = [
    (3, "nao_essencial", "Eletrônicos", 289.90, 10, "Celular novo"),
    (6, "essencial", "Educação", 450.00, 6, "Curso de inglês"),
    (8, "nao_essencial", "Roupas", 129.90, 3, "Roupas de inverno"),
    (11, "nao_essencial", "Eletrônicos", 399.00, 12, "Notebook"),
    (12, "nao_essencial", "Viagem", 520.00, 5, "Viagem de fim de ano"),
]


def _month_start(offset_from_current: int, today: date) -> date:
    return add_months(date(today.year, today.month, 1), offset_from_current)


def _day_in_month(month: date, rng: random.Random, today: date) -> date:
    """Dia aleatório do mês -- no mês atual, nunca depois de hoje (lançamento avulso não tem data futura)."""
    last = last_day_of_month(month.year, month.month).day
    if (month.year, month.month) == (today.year, today.month):
        last = today.day
    return month.replace(day=rng.randint(1, last))


def _price(base: float, months_from_start: int, rng: random.Random, spread: float = 0.12) -> float:
    inflated = base * (1 + ANNUAL_INFLATION) ** (months_from_start / 12)
    return round(inflated * rng.uniform(1 - spread, 1 + spread), 2)


def _mock_pdf(title: str) -> bytes:
    """PDF mínimo válido (1 página, 1 linha de texto) -- só pra ter anexo de verdade pra baixar/visualizar."""
    text = title.replace("(", "[").replace(")", "]")
    stream = f"BT /F1 18 Tf 72 720 Td ({text}) Tj ET".encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def _add_attachment(db, user_id: int, entity_type: str, entity_id: str, title: str) -> None:
    stored_filename = f"{uuid.uuid4().hex}.pdf"
    entity_dir = Path(settings.upload_dir, entity_type)
    entity_dir.mkdir(parents=True, exist_ok=True)
    data = _mock_pdf(title)
    (entity_dir / stored_filename).write_bytes(data)
    db.add(
        models.Attachment(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            original_filename=f"{title.lower().replace(' ', '-')}.pdf",
            stored_filename=stored_filename,
            content_type="application/pdf",
            size_bytes=len(data),
        )
    )


def _reset_user_data(db, user: models.User) -> None:
    delete_all_attachments_for_user(db, user.id)
    db.query(models.VehicleService).filter(models.VehicleService.user_id == user.id).delete()
    db.query(models.Vehicle).filter(models.Vehicle.user_id == user.id).delete()
    db.query(models.Gasto).filter(models.Gasto.user_id == user.id).delete()
    db.query(models.Receita).filter(models.Receita.user_id == user.id).delete()
    db.query(models.Recorrencia).filter(models.Recorrencia.user_id == user.id).delete()
    db.query(models.DropdownOption).filter(models.DropdownOption.user_id == user.id).delete()
    # Resumos mensais antigos refletiam a base anterior -- o próximo é gerado de novo sob demanda.
    db.query(models.Notificacao).filter(models.Notificacao.user_id == user.id).delete()


def _seed_categorias(db, user: models.User) -> dict[str, models.DropdownOption]:
    item_by_name = {}
    for priority, name, in_basket in ITENS:
        item = models.DropdownOption(user_id=user.id, priority=priority, name=name, include_in_inflation=in_basket)
        db.add(item)
        item_by_name[name] = item
    priority, name = INACTIVE_ITEM
    inactive = models.DropdownOption(user_id=user.id, priority=priority, name=name, active=False)
    db.add(inactive)
    item_by_name[name] = inactive
    db.flush()
    return item_by_name


def _seed_gastos(db, user, items, months: list[date], today: date, rng: random.Random) -> list[models.Gasto]:
    gastos: list[models.Gasto] = []

    def add(priority: str, item: str, value: float, description: str | None, when: date) -> None:
        gasto = models.Gasto(
            user_id=user.id,
            priority=priority,
            item_id=items[item].id,
            value=value,
            description=description,
            is_installment=False,
            date=when,
        )
        db.add(gasto)
        gastos.append(gasto)

    for idx, month in enumerate(months):
        m = month.month
        months_ago = len(months) - 1 - idx
        # Fixos do mês
        add("essencial", "Aluguel", round(1300 * (1 + ANNUAL_INFLATION) ** (idx // 12), 2), "Aluguel", month.replace(day=5) if month.replace(day=5) <= today else month)
        add("essencial", "Condomínio", _price(420, idx, rng, 0.03), None, _day_in_month(month, rng, today))
        add("essencial", "Internet", 99.90 if idx < 24 else 109.90, "Fibra 500MB", _day_in_month(month, rng, today))
        add("essencial", "Celular", 59.99, "Plano controle", _day_in_month(month, rng, today))
        luz_base = 230 if m in (12, 1, 2, 3) else 160  # ar-condicionado no verão
        add("essencial", "Luz", _price(luz_base, idx, rng, 0.18), None, _day_in_month(month, rng, today))
        add("essencial", "Água", _price(85, idx, rng, 0.15), None, _day_in_month(month, rng, today))
        if rng.random() < 0.6:
            add("essencial", "Gás", _price(110, idx, rng, 0.05), "Botijão", _day_in_month(month, rng, today))

        # Variáveis
        for _ in range(rng.randint(3, 5)):
            add("essencial", "Supermercado", _price(260, idx, rng, 0.35), rng.choice(["Mercado do mês", "Feira", "Reposição", None]), _day_in_month(month, rng, today))
        for _ in range(rng.randint(2, 4)):
            add("essencial", "Gasolina", _price(190, idx, rng, 0.2), "Abastecimento", _day_in_month(month, rng, today))
        if rng.random() < 0.5:
            add("essencial", "Farmácia", _price(75, idx, rng, 0.5), rng.choice(["Remédios", "Vitaminas", None]), _day_in_month(month, rng, today))
        if rng.random() < 0.25:
            add("essencial", "Saúde", _price(280, idx, rng, 0.3), rng.choice(["Consulta", "Exames", "Dentista"]), _day_in_month(month, rng, today))
        if m == 2:
            add("essencial", "Educação", _price(380, idx, rng, 0.15), "Material escolar", _day_in_month(month, rng, today))
        if rng.random() < 0.15:
            add("essencial", "Manutenção carro", _price(350, idx, rng, 0.5), rng.choice(["Pneu", "Alinhamento", "Revisão"]), _day_in_month(month, rng, today))

        # Não essenciais
        for _ in range(rng.randint(2, 6)):
            add("nao_essencial", "Lanche", _price(38, idx, rng, 0.5), rng.choice(["Delivery", "Padaria", "Café", None]), _day_in_month(month, rng, today))
        for _ in range(rng.randint(0, 3)):
            add("nao_essencial", "Restaurante", _price(120, idx, rng, 0.4), rng.choice(["Jantar", "Almoço fim de semana", "Rodízio"]), _day_in_month(month, rng, today))
        add("nao_essencial", "Streaming", round(55.9 + (idx // 12) * 5, 2), "Netflix + Spotify", _day_in_month(month, rng, today))
        if rng.random() < 0.45:
            add("nao_essencial", "Lazer", _price(140, idx, rng, 0.5), rng.choice(["Cinema", "Show", "Parque", "Barzinho"]), _day_in_month(month, rng, today))
        if rng.random() < 0.3 or m in (5, 11):
            add("nao_essencial", "Roupas", _price(180, idx, rng, 0.5), rng.choice(["Tênis", "Camisetas", "Calça", None]), _day_in_month(month, rng, today))
        if m == 12:
            add("nao_essencial", "Presentes", _price(650, idx, rng, 0.25), "Presentes de Natal", _day_in_month(month, rng, today))
        elif rng.random() < 0.15:
            add("nao_essencial", "Presentes", _price(120, idx, rng, 0.4), "Aniversário", _day_in_month(month, rng, today))
        if m in (1, 7) and rng.random() < 0.7:
            add("nao_essencial", "Viagem", _price(900, idx, rng, 0.4), "Férias", _day_in_month(month, rng, today))
        if months_ago >= INACTIVE_ITEM_UNTIL_MONTHS_AGO:
            add("nao_essencial", INACTIVE_ITEM[1], 99.90, "Mensalidade", _day_in_month(month, rng, today))

        # Parcelados: uma compra por (ano, mês) configurado -- as parcelas podem cair no futuro
        for purchase_month, priority, item, value, count, description in INSTALLMENT_PURCHASES:
            if m != purchase_month:
                continue
            first = _day_in_month(month, rng, today)
            group_id = str(uuid.uuid4())
            for n in range(1, count + 1):
                gasto = models.Gasto(
                    user_id=user.id,
                    priority=priority,
                    item_id=items[item].id,
                    value=value,
                    description=description,
                    is_installment=True,
                    installment_count=count,
                    installment_number=n,
                    installment_group_id=group_id,
                    date=add_months(first, n - 1),
                )
                db.add(gasto)
                gastos.append(gasto)
    return gastos


def _seed_receitas(db, user, months: list[date], today: date, rng: random.Random) -> list[models.Receita]:
    receitas: list[models.Receita] = []

    def add(value: float, pct: float, description: str, when: date) -> None:
        receita = models.Receita(
            user_id=user.id,
            value=value,
            cash_percentage=pct,
            cash_value=round(value * pct / 100, 2),
            description=description,
            date=when,
        )
        db.add(receita)
        receitas.append(receita)

    for idx, month in enumerate(months):
        salary = round(5200 * (1.07 ** (idx // 12)), 2)  # reajuste anual acima da inflação
        pay_day = month.replace(day=5)
        add(salary, rng.choice([15, 20, 20, 25, 30]), "Salário", pay_day if pay_day <= today else month)
        if month.month == 12:
            add(salary, 50, "13º salário", _day_in_month(month, rng, today))
        if month.month == 3:
            add(round(salary * 0.6, 2), 40, "PLR", _day_in_month(month, rng, today))
        if rng.random() < 0.35:
            add(_price(800, idx, rng, 0.5), rng.choice([0, 10, 50]), "Freelance", _day_in_month(month, rng, today))
        if rng.random() < 0.1:
            add(_price(250, idx, rng, 0.5), 0, "Venda usado", _day_in_month(month, rng, today))
    return receitas


def _seed_recorrencias(db, user, gastos, receitas, today: date) -> int:
    """Fixos do mês atual viram recorrências (o lançamento deste mês é o 1º; a próxima sai no mês que
    vem). Streaming fica pausada, pra testar a retomada."""
    atual = date(today.year, today.month, 1)
    proximo = add_months(atual, 1)
    alvos = [  # (descrição do lançamento deste mês, dia, pausada)
        ("Aluguel", 5, False),
        ("Fibra 500MB", 10, False),
        ("Netflix + Spotify", 15, True),
    ]
    criadas = 0
    for descricao, dia, pausada in alvos:
        gasto = next((g for g in gastos if g.description == descricao and g.date >= atual and not g.is_installment), None)
        if gasto is None:
            continue
        rec = models.Recorrencia(
            user_id=user.id, tipo="gasto", priority=gasto.priority, item_id=gasto.item_id, value=gasto.value,
            description=gasto.description, dia=dia, proximo_mes=proximo, pausada=pausada,
        )
        db.add(rec)
        db.flush()
        gasto.recorrencia_id = rec.id
        criadas += 1
    salario = next((r for r in receitas if r.description == "Salário" and r.date >= atual), None)
    if salario is not None:
        rec = models.Recorrencia(
            user_id=user.id, tipo="receita", value=salario.value, cash_percentage=salario.cash_percentage,
            description="Salário", dia=5, proximo_mes=proximo,
        )
        db.add(rec)
        db.flush()
        salario.recorrencia_id = rec.id
        criadas += 1
    return criadas


def _seed_veiculos(db, user, months: list[date], today: date, rng: random.Random) -> list[models.VehicleService]:
    services: list[models.VehicleService] = []
    carro = models.Vehicle(user_id=user.id, name="Onix LT 1.0", year=2019)
    moto = models.Vehicle(user_id=user.id, name="CG 160 Fan", year=2017)
    antigo = models.Vehicle(user_id=user.id, name="Gol G5 1.0", year=2010, active=False)
    db.add_all([carro, moto, antigo])
    db.flush()

    plans = [
        # (veículo, km inicial, km por mês, prob. de serviço no mês, serviços possíveis, até quantos meses atrás)
        (carro, 42000, 1100, 0.35, [
            ("Troca de óleo e filtro", 260, "peca_mao_de_obra"),
            ("Alinhamento e balanceamento", 150, "peca_mao_de_obra"),
            ("Pastilhas de freio", 320, "peca_mao_de_obra"),
            ("Troca de 4 pneus", 1900, "peca_mao_de_obra"),
            ("Palhetas do limpador", 90, "peca_mao_de_obra_propria"),
            ("Revisão dos 60 mil", 980, "peca_mao_de_obra"),
        ], 0),
        (moto, 18000, 700, 0.4, [
            ("Troca de óleo", 75, "peca_mao_de_obra_propria"),
            ("Kit relação", 280, "peca_mao_de_obra"),
            ("Pneu traseiro", 260, "peca_mao_de_obra"),
            ("Lâmpada do farol", 35, "peca"),
            ("Regulagem de freio", 0, "peca_mao_de_obra_propria"),
        ], 0),
        (antigo, 150000, 900, 0.45, [
            ("Troca de óleo", 180, "peca_mao_de_obra"),
            ("Embreagem", 1200, "peca_mao_de_obra"),
            ("Bateria", 450, "peca"),
        ], 30),  # vendido há 30 meses (soft delete) -- só tem histórico antigo
    ]
    for vehicle, km, km_per_month, prob, catalog, stop_months_ago in plans:
        for idx, month in enumerate(months):
            months_ago = len(months) - 1 - idx
            km += int(km_per_month * rng.uniform(0.6, 1.4))
            if months_ago < stop_months_ago or rng.random() > prob:
                continue
            description, base, service_type = rng.choice(catalog)
            service = models.VehicleService(
                user_id=user.id,
                vehicle_id=vehicle.id,
                description=description,
                notes=rng.choice([None, None, "Oficina do bairro", "Peça original", "Mobil 10W-40", "Pirelli"]),
                value=_price(base, idx, rng, 0.15) if base else 0.0,
                service_type=service_type,
                mileage=km,
                date=_day_in_month(month, rng, today),
            )
            db.add(service)
            services.append(service)
    return services


def main() -> None:
    # Importar app.main roda o create_all + as migrações de schema (_migrate_schema) -- sem isso, num
    # banco ainda não migrado (backend não reiniciado depois de um deploy), o create_all sozinho
    # criaria user_modules sem o backfill dos módulos e a query de users falharia por coluna faltando.
    import app.main  # noqa: F401
    db = SessionLocal()
    rng = random.Random(RANDOM_SEED)
    try:
        user = db.query(models.User).filter(models.User.username == TEST_USERNAME).first()
        if user:
            print(f"Usuário '{TEST_USERNAME}' já existe — apagando os dados antigos antes de recriar.")
            _reset_user_data(db, user)
            user.first_name = "Teste"
            user.last_name = "Teste"
            user.must_change_password = False
            user.set_modules(list(OPTIONAL_MODULES))
            db.commit()
        else:
            user = models.User(
                username=TEST_USERNAME,
                password_hash=hash_password(TEST_PASSWORD),
                role="user",
                first_name="Teste",
                last_name="Teste",
            )
            user.set_modules(list(OPTIONAL_MODULES))
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Usuário '{TEST_USERNAME}' criado.")

        today = today_local()
        start = date(today.year - YEARS_OF_HISTORY, 1, 1)
        months = []
        month = start
        while month <= _month_start(0, today):
            months.append(month)
            month = add_months(month, 1)

        items = _seed_categorias(db, user)
        gastos = _seed_gastos(db, user, items, months, today, rng)
        receitas = _seed_receitas(db, user, months, today, rng)
        services = _seed_veiculos(db, user, months, today, rng)
        db.flush()
        recorrencias = _seed_recorrencias(db, user, gastos, receitas, today)

        # Alguns comprovantes de verdade (PDF mínimo) pra testar ícone de anexo/download/preview
        anexos = 0
        for gasto in rng.sample([g for g in gastos if not g.is_installment and g.value > 300], 12):
            _add_attachment(db, user.id, "gasto", str(gasto.id), f"Comprovante {gasto.description or 'gasto'}")
            anexos += 1
        for group_id in {g.installment_group_id for g in gastos if g.is_installment}:
            if rng.random() < 0.4:
                _add_attachment(db, user.id, "gasto", group_id, "Nota fiscal compra parcelada")
                anexos += 1
        for receita in rng.sample(receitas, 6):
            _add_attachment(db, user.id, "receita", str(receita.id), f"Holerite {receita.description}")
            anexos += 1
        for service in rng.sample(services, min(10, len(services))):
            _add_attachment(db, user.id, "servico_veiculo", str(service.id), f"Nota {service.description}")
            anexos += 1
        extra_resumo = ""

        db.commit()
        print(
            f"Base mocada criada ({months[0]:%m/%Y} a {months[-1]:%m/%Y}): {len(items)} categorias, "
            f"{len(gastos)} gastos, {len(receitas)} receitas, {recorrencias} recorrências, "
            f"{len(services)} serviços de veículo"
            f"{extra_resumo}, {anexos} anexos."
        )
        print(f"Login: usuario='{TEST_USERNAME}' senha='{TEST_PASSWORD}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
