"""Cria (ou reseta) o usuário 'teste', com uma base de dados mocada, isolada da conta principal
(admin), pra rodar testes manuais sem arriscar os dados reais. Idempotente: se o usuário já
existir, apaga os dados antigos dele e recria os mocados, sem duplicar.

Uso: python -m app.seed_test_user
"""

from datetime import date

from app import models
from app.database import Base, SessionLocal, engine
from app.security import hash_password
from app.utils import add_months

TEST_USERNAME = "teste"
TEST_PASSWORD = "Teste@VRFINANCE"

ITENS = [
    ("essencial", "Casa"),
    ("essencial", "Alimentação"),
    ("essencial", "Transporte"),
    ("nao_essencial", "Lazer"),
    ("nao_essencial", "Lanche"),
]

# (meses atrás, prioridade, item, valor, descrição)
GASTOS = [
    (5, "essencial", "Casa", 1200.0, "Aluguel"),
    (5, "essencial", "Alimentação", 450.0, "Supermercado"),
    (5, "essencial", "Transporte", 180.0, "Combustível"),
    (5, "nao_essencial", "Lazer", 90.0, "Cinema"),
    (4, "essencial", "Casa", 1200.0, "Aluguel"),
    (4, "essencial", "Alimentação", 520.0, "Supermercado"),
    (4, "nao_essencial", "Lanche", 60.0, "Fim de semana"),
    (3, "essencial", "Casa", 1200.0, "Aluguel"),
    (3, "essencial", "Alimentação", 480.0, "Supermercado"),
    (3, "essencial", "Transporte", 210.0, "Combustível"),
    (3, "nao_essencial", "Lazer", 150.0, "Show"),
    (2, "essencial", "Casa", 1200.0, "Aluguel"),
    (2, "essencial", "Alimentação", 500.0, "Supermercado"),
    (2, "nao_essencial", "Lanche", 40.0, "Delivery"),
    (1, "essencial", "Casa", 1200.0, "Aluguel"),
    (1, "essencial", "Alimentação", 470.0, "Supermercado"),
    (1, "essencial", "Transporte", 195.0, "Combustível"),
    (1, "nao_essencial", "Lazer", 110.0, "Streaming"),
    (0, "essencial", "Casa", 1200.0, "Aluguel"),
    (0, "essencial", "Alimentação", 460.0, "Supermercado"),
    (0, "nao_essencial", "Lanche", 55.0, "Delivery"),
]

# (meses atrás, valor, percentual caixa, descrição)
RECEITAS = [
    (5, 3500.0, 20, "Salário"),
    (4, 3500.0, 20, "Salário"),
    (3, 3500.0, 25, "Salário"),
    (3, 400.0, 0, "Freelance"),
    (2, 3500.0, 20, "Salário"),
    (1, 3500.0, 20, "Salário"),
    (1, 300.0, 0, "Freelance"),
    (0, 3700.0, 20, "Salário"),
]


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.username == TEST_USERNAME).first()
        if existing:
            print(f"Usuário '{TEST_USERNAME}' já existe — apagando os dados antigos antes de recriar.")
            db.query(models.VehicleService).filter(models.VehicleService.user_id == existing.id).delete()
            db.query(models.Vehicle).filter(models.Vehicle.user_id == existing.id).delete()
            db.query(models.Gasto).filter(models.Gasto.user_id == existing.id).delete()
            db.query(models.Receita).filter(models.Receita.user_id == existing.id).delete()
            db.query(models.DropdownOption).filter(models.DropdownOption.user_id == existing.id).delete()
            db.commit()
            user = existing
        else:
            user = models.User(
                username=TEST_USERNAME,
                password_hash=hash_password(TEST_PASSWORD),
                role="user",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Usuário '{TEST_USERNAME}' criado.")

        item_by_name = {}
        for priority, name in ITENS:
            item = models.DropdownOption(user_id=user.id, priority=priority, name=name)
            db.add(item)
            db.flush()
            item_by_name[name] = item

        today = date.today()

        for meses_atras, priority, item_name, valor, descricao in GASTOS:
            gasto_date = add_months(date(today.year, today.month, 1), -meses_atras)
            gasto_date = gasto_date.replace(day=min(today.day, 28))
            db.add(
                models.Gasto(
                    user_id=user.id,
                    priority=priority,
                    item_id=item_by_name[item_name].id,
                    value=valor,
                    description=descricao,
                    is_installment=False,
                    date=gasto_date,
                )
            )

        for meses_atras, valor, percentual, descricao in RECEITAS:
            receita_date = add_months(date(today.year, today.month, 1), -meses_atras)
            receita_date = receita_date.replace(day=min(today.day, 28))
            db.add(
                models.Receita(
                    user_id=user.id,
                    value=valor,
                    cash_percentage=percentual,
                    cash_value=valor * percentual / 100,
                    description=descricao,
                    date=receita_date,
                )
            )

        db.commit()
        print(f"Base mocada criada: {len(ITENS)} categorias, {len(GASTOS)} gastos, {len(RECEITAS)} receitas.")
        print(f"Login: usuario='{TEST_USERNAME}' senha='{TEST_PASSWORD}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
