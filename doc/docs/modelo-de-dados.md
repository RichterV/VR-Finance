# Modelo de dados

Banco SQLite, 6 tabelas.

## `users`

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| password_hash | TEXT | hash bcrypt, nunca texto puro |
| role | TEXT | `master` \| `user` |
| created_at | DATETIME | |

## `dropdown_options`

Itens que aparecem no select de cada prioridade (ex: Casa, Carro, Lanche...). Cadastrados/editados
pelo próprio usuário logado, na tela de gerenciamento de itens.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | itens são por usuário |
| priority | TEXT | `essencial` \| `nao_essencial` |
| name | TEXT | nome do item |
| active | BOOLEAN | soft delete — item excluído fica `active=false` mas continua referenciado por gastos antigos |
| created_at | DATETIME | |

## `gastos`

Uma compra parcelada em N vezes gera **N linhas**, uma por mês, ligadas pelo mesmo `installment_group_id`.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| priority | TEXT | `essencial` \| `nao_essencial` |
| item_id | INTEGER FK → dropdown_options.id | |
| value | REAL | valor de **cada parcela** (não é o total dividido) |
| description | TEXT nullable | |
| is_installment | BOOLEAN | |
| installment_count | INTEGER nullable | total de parcelas (n) |
| installment_number | INTEGER nullable | número desta parcela (1..n) |
| installment_group_id | TEXT (UUID) nullable | agrupa as n linhas da mesma compra |
| date | DATE | mês de referência desta parcela (parcela 1 = mês atual, parcela 2 = mês atual + 1...) |
| created_at | DATETIME | |

Não é uma coluna da tabela, mas o schema de resposta `GastoOut` também inclui `item_name`, resolvido
via uma `@property` no model (`self.item.name`, usando a relação já existente com `DropdownOption`).
Isso permite mostrar o nome do item em telas como `/dados` mesmo quando o item já foi removido por
soft delete — a FK continua válida, só some da lista de itens ativos.

## `receitas`

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| value | REAL | valor total da receita |
| cash_percentage | REAL | percentual definido no slider (0–100) |
| cash_value | REAL | calculado: `value * cash_percentage / 100` |
| description | TEXT nullable | |
| date | DATE | data automática (dia do cadastro) |
| created_at | DATETIME | |

## `vehicles`

Veículos cadastrados pelo usuário, usados na seção "Manutenção Veículos" (`/veiculos`).

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| name | TEXT | nome do veículo (ex: "Voyage Confortline 1.6") |
| year | INTEGER | ano do veículo |
| active | BOOLEAN | soft delete, mesma lógica de `dropdown_options` — preserva o histórico de serviços |
| created_at | DATETIME | |

## `vehicle_services`

Serviços de manutenção lançados para um veículo.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| vehicle_id | INTEGER FK → vehicles.id | |
| description | TEXT | o que foi feito |
| notes | TEXT nullable | observação livre (ex: marca da peça) |
| value | REAL | custo do serviço (aceita 0, para serviço próprio sem custo de peça) |
| service_type | TEXT nullable | `peca` \| `peca_mao_de_obra` \| `peca_mao_de_obra_propria` |
| mileage | INTEGER nullable | quilometragem no momento do serviço |
| date | DATE | automática (data atual no cadastro) |
| created_at | DATETIME | |

Assim como `GastoOut.item_name`, o schema de resposta inclui `vehicle_name` (`@property` no model, via
`self.vehicle.name`) para mostrar o nome do veículo mesmo que ele já tenha sido removido por soft delete.
