# Modelo de dados

Banco SQLite, 9 tabelas.

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

## `operacoes_bolsa`

Operações na bolsa de valores. Sem relação (FK) com nenhuma outra tabela — mesmo banco físico do
resto do app, mas seção logicamente isolada.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| ticker | TEXT nullable | `null` para `compra_dolar`/`venda_dolar` (câmbio puro, sem ativo) |
| operation | TEXT | `compra` \| `venda` \| `compra_dolar` \| `venda_dolar` |
| quantity | REAL nullable | `null` para `compra_dolar`/`venda_dolar`; aceita fração (ex: cotas de ETF) |
| currency | TEXT | `BRL` \| `USD` — moeda em que o valor foi informado no formulário |
| value_brl | REAL nullable | valor em reais (informado direto, ou calculado a partir de `value_usd × cotacao`) |
| value_usd | REAL nullable | valor em dólares (informado direto, ou calculado a partir de `value_brl ÷ cotacao`) |
| cotacao | REAL nullable | cotação do dólar do dia (R$), quando aplicável |
| date | DATE | automática (data atual no cadastro) |
| created_at | DATETIME | |

## `devedores`

Dívidas de terceiros com o usuário. Sem relação (FK) com nenhuma outra tabela — mesma lógica de
isolamento de `operacoes_bolsa`. Toda dívida é sempre parcelada (mínimo 1x): um cadastro gera **N
linhas** (uma por mês), ligadas pelo mesmo `installment_group_id`, mesma convenção de `gastos`.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| devedor | TEXT | nome de quem deve |
| description | TEXT nullable | do que se trata a dívida |
| value | REAL | valor de **cada parcela** (mesma convenção de `gastos.value`) |
| status | TEXT | `pago` \| `nao_pago`, default `nao_pago` — por linha (parcela), não por grupo |
| installment_count | INTEGER | total de parcelas (n) — sempre preenchido, mínimo 1 |
| installment_number | INTEGER | número desta parcela (1..n) |
| installment_group_id | TEXT (UUID) | agrupa as n linhas do mesmo cadastro |
| date | DATE | mês de referência desta parcela (parcela 1 = mês atual, parcela 2 = mês atual + 1...) |
| created_at | DATETIME | |

## `attachments`

Anexos (comprovantes de imagem/PDF) de gastos, receitas, serviços de veículo, operações bolsa e
devedores. Sem FK pras 5 tabelas que referencia — `entity_type` + `entity_id` funcionam como chave
lógica (mesmo padrão de isolamento de `operacoes_bolsa`/`devedores`), o que permite um único router
genérico cobrindo os 5 módulos em vez de 5 implementações separadas. O arquivo em si não fica no
banco — só o metadado; o conteúdo vai pra `backend/uploads/<entity_type>/<stored_filename>` em disco.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | anexos são por usuário, mesmo dono do registro referenciado |
| entity_type | TEXT | `gasto` \| `receita` \| `servico_veiculo` \| `operacao_bolsa` \| `devedor` |
| entity_id | TEXT | `str(id)` da linha, ou `installment_group_id` para gasto parcelado/devedor — sempre vinculado ao grupo inteiro, nunca a uma parcela específica |
| original_filename | TEXT | nome enviado pelo usuário, usado só pro `Content-Disposition` no download |
| stored_filename | TEXT UNIQUE | nome real em disco: `uuid4().hex` + extensão (nunca o nome original, evita path traversal/colisão) |
| content_type | TEXT | MIME type validado contra whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`) |
| size_bytes | INTEGER | limite de 10MB por arquivo, validado no backend |
| created_at | DATETIME | |

Excluir uma linha não-parcelada (receita, operação bolsa, serviço) apaga direto seus anexos. Para
gasto/devedor (sempre agrupáveis), excluir uma parcela individual preserva o anexo do grupo enquanto
sobrar qualquer outra parcela do mesmo `installment_group_id` — só apaga quando a última parcela do
grupo é excluída. Excluir um usuário inteiro apaga todos os anexos dele, sem checar referências.
