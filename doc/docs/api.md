# API

Base URL em desenvolvimento: `http://localhost:8000`. Documentação interativa automática do FastAPI
disponível em `/docs` (Swagger) e `/redoc`.

Todos os endpoints abaixo, exceto `/auth/login`, exigem o header `Authorization: Bearer <token>`, e
operam sobre os dados do usuário do token (`user_id`).

## Autenticação

| método | rota | descrição |
|---|---|---|
| POST | `/auth/login` | login (form-encoded `username` + `password`) → `{access_token, token_type}` |
| GET | `/auth/me` | dados do usuário logado |
| PUT | `/auth/me/password` | troca a própria senha |
| POST | `/auth/users` | cria novo usuário — **restrito ao master**, 403 para os demais |
| GET | `/auth/users` | lista todos os usuários (id, username, role) — restrito ao master |
| PUT | `/auth/users/{id}` | edita username e, opcionalmente, reseta a senha de um usuário — restrito ao master |
| DELETE | `/auth/users/{id}` | exclui um usuário e todos os dados dele em cascata (`gastos`, `receitas`, `dropdown_options`, `vehicles`, `vehicle_services`) — restrito ao master; 400 se o usuário tiver `role == master` |
| POST | `/auth/switch-to-teste` | gera um token para o usuário `teste` sem precisar da senha dele — restrito ao master. Usado pelo botão "Mudar pra conta teste" no Perfil |

## Itens do dropdown

| método | rota | descrição |
|---|---|---|
| GET | `/dropdown-options?priority=essencial\|nao_essencial` | lista itens ativos do usuário logado |
| POST | `/dropdown-options` | cria item |
| PUT | `/dropdown-options/{id}` | edita o nome do item |
| DELETE | `/dropdown-options/{id}` | soft delete (`active=false`) |

## Gastos

| método | rota | descrição |
|---|---|---|
| POST | `/gastos` | cria gasto. Se `is_installment=true`, cria N linhas (uma por mês) e retorna a lista completa |
| GET | `/gastos?ano=&mes=&limit=&offset=` | lista paginada (`{items, total}`) de gastos do usuário, ordenados por data decrescente. `ano`/`mes` opcionais, `limit` default 25 (máx. 200) |
| PUT | `/gastos/{id}` | edita `priority`, `item_id`, `value`, `description` (404 se o gasto não for do usuário logado) |
| DELETE | `/gastos/{id}` | exclui o gasto |

Cada item retornado (`GastoOut`) inclui `item_name`, resolvido via `Gasto.item.name` — funciona mesmo
para itens já removidos por soft delete (`active=false`), já que a relação continua existindo.

## Receitas

| método | rota | descrição |
|---|---|---|
| POST | `/receitas` | cria receita, calculando `cash_value` a partir de `value` e `cash_percentage` |
| GET | `/receitas?ano=&mes=&limit=&offset=` | lista paginada (`{items, total}`) de receitas do usuário, ordenadas por data decrescente. `ano`/`mes` opcionais, `limit` default 25 (máx. 200) |
| PUT | `/receitas/{id}` | edita `value`, `cash_percentage`, `description` — recalcula `cash_value` |
| DELETE | `/receitas/{id}` | exclui a receita |

## Resumos

| método | rota | descrição |
|---|---|---|
| GET | `/resumo/anual?ano=2026&meses=12&ate_ano=&ate_mes=` | métricas do ano + dados dos 2 gráficos (ver [Analítico](analitico.md)). `meses` (12, 24 ou 36; default 12) controla só a janela rolante dos dois gráficos — sempre "últimos N meses a partir de hoje", independente do `ano`. `ate_ano`/`ate_mes` (opcionais, os dois juntos) limitam as métricas agregadas do ano até esse mês/ano, inclusive — não afetam os gráficos de janela rolante |
| GET | `/resumo/mensal?ano=2026&mes=8` | métricas do mês + "Disponível pra gastar" (não tem parâmetro de corte — já analisa um único mês) |
| GET | `/resumo/geral?ate_ano=&ate_mes=` | **totais** (não médias) agrupados por ano (`anos: [{ano, total_essenciais, total_nao_essenciais, total_receita, total_caixa_pretendido, total_caixa_real}]`) e por mês do calendário somando todos os anos (`por_mes: [{mes, total_essenciais, ...}]`, 12 posições, jan–dez, revela sazonalidade). Também retorna os totais gerais (`total_essenciais`, `total_receita` etc., somando todo o histórico). `ate_ano`/`ate_mes` (opcionais, os dois juntos) limitam tudo — anos, por_mes e totais gerais — até esse mês/ano inclusive |

## Veículos (Manutenção Veículos)

| método | rota | descrição |
|---|---|---|
| GET | `/veiculos` | lista veículos ativos do usuário |
| POST | `/veiculos` | cria veículo (`name`, `year`) |
| PUT | `/veiculos/{id}` | edita nome/ano |
| DELETE | `/veiculos/{id}` | soft delete (`active=false`) |
| GET | `/veiculos/resumo?meses=12` | cards de resumo por veículo (`total_gasto`, `quantidade_servicos`, `ultimo_servico`) + série mensal (últimos N meses, uma linha por veículo) pro gráfico de evolução |

## Serviços de manutenção

| método | rota | descrição |
|---|---|---|
| GET | `/servicos-veiculos?vehicle_id=&limit=&offset=` | lista paginada (`{items, total}`) de serviços, `vehicle_id` opcional filtra por veículo, ordenados por data decrescente. `limit` default 25 (máx. 200) |
| POST | `/servicos-veiculos` | cria serviço (`vehicle_id`, `description`, `notes`, `value`, `service_type`, `mileage`) — data é sempre automática |
| PUT | `/servicos-veiculos/{id}` | edita o serviço |
| DELETE | `/servicos-veiculos/{id}` | exclui o serviço |

Cada item retornado (`VehicleServiceOut`) inclui `vehicle_name`, resolvido via `VehicleService.vehicle.name`
(mesma lógica do `item_name` de `GastoOut`).
