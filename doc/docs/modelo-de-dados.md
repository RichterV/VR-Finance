# Modelo de dados

Banco SQLite (um único arquivo, `vrfinance.db`), **12 tabelas**:

| tabela | papel |
|---|---|
| [`users`](#users) | contas de acesso (master + usuários comuns) |
| [`user_modules`](#user_modules) | módulos opcionais habilitados por usuário |
| [`dropdown_options`](#dropdown_options) | categorias de gasto ("Categorias" na UI) |
| [`gastos`](#gastos) | gastos, um por linha (parcelado = N linhas) |
| [`receitas`](#receitas) | receitas |
| [`recorrencias`](#recorrencias) | regras de gasto/receita que se repetem todo mês |
| [`vehicles`](#vehicles) | veículos (Manutenção Veículos) |
| [`vehicle_services`](#vehicle_services) | serviços de manutenção de cada veículo |
| [`operacoes_bolsa`](#operacoes_bolsa) | operações na bolsa / câmbio |
| [`devedores`](#devedores) | dívidas de terceiros com o usuário (sempre parceladas) |
| [`attachments`](#attachments) | metadados de anexos (comprovantes) |
| [`notificacoes`](#notificacoes) | central de notificações (resumo da virada do mês) |

Todas as tabelas de dados têm `user_id`: cada usuário só vê e altera os próprios registros. Valores
monetários são `REAL` em R$, sempre arredondados a centavos na entrada (ver
[Integridade e migrações](#integridade-e-migracoes)).

## `users`

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE | também vai no `sub` do JWT — trocar o username exige um token novo (ver [Autenticação](autenticacao.md)) |
| password_hash | TEXT | hash bcrypt, nunca texto puro |
| role | TEXT | `master` \| `user` — só existe um master, criado no bootstrap |
| first_name | TEXT | nome, obrigatório em toda criação/edição — usado na saudação "Olá, {nome}" da Home |
| last_name | TEXT | sobrenome, mesma obrigatoriedade |
| must_change_password | BOOLEAN | default `false`; `true` quando a senha foi definida pelo master (criação ou reset) — bloqueia o app até o usuário trocar |
| default_cash_percentage | REAL | default 50; % de caixa pré-selecionado no slider de Adicionar Receita ("Usar como padrão") |
| last_login_at | DATETIME nullable | último login bem-sucedido (UTC). `null` = nunca logou desde que a coluna existe |
| last_activity_at | DATETIME nullable | última requisição autenticada ou login (UTC), regravada no máximo 1x por minuto. Uso via "Mudar pra conta teste" não conta. Exibida no painel de Administração |
| token_version | INTEGER | default 0; incrementado a cada troca/reset de senha — revoga todos os tokens emitidos antes |
| created_at | DATETIME | também usado na validação do token (ver [Autenticação](autenticacao.md#jwt-e-revogacao)) |

`last_activity_at` é gravado com um intervalo mínimo de propósito: a Home sozinha dispara várias
requisições em paralelo, e um `UPDATE` no SQLite a cada uma delas seria escrita à toa.

## `user_modules`

Módulos opcionais habilitados por usuário — uma linha por módulo habilitado. O master **não tem
linhas**: o `User.modules` (propriedade do model) devolve sempre todos os módulos pra ele. Apagada
junto com o usuário (cascade da relationship).

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| module_key | TEXT | `veiculos` \| `operacoes_bolsa` \| `devedores` \| `ferramentas` \| `exportar_dados` \| `analise_inflacionaria`; `UNIQUE(user_id, module_key)` |

O registro de chaves válidas fica em `backend/app/modules.py` (`OPTIONAL_MODULES`), espelhado no
frontend em `core/modules.ts`. Início (resumos, Gastos, Receitas, Categorias) não é módulo — está
sempre habilitado.

## `dropdown_options`

Categorias que aparecem no select de cada prioridade (ex: Casa, Carro, Lanche...). Cadastradas pelo
próprio usuário no modal "Categorias" (o nome interno continua "itens"/`dropdown_options`).

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | categorias são por usuário |
| priority | TEXT | `essencial` \| `nao_essencial` |
| name | TEXT | nome da categoria (não pode ser vazio) |
| active | BOOLEAN | soft delete — categoria excluída fica `active=false` mas continua referenciada por gastos antigos |
| include_in_inflation | BOOLEAN | default `false`; marca a categoria (essencial) como parte da cesta da Análise inflacionária ([Analítico](analitico.md)) |
| created_at | DATETIME | |

## `gastos`

Uma compra parcelada em N vezes gera **N linhas**, uma por mês, ligadas pelo mesmo
`installment_group_id`.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| priority | TEXT | `essencial` \| `nao_essencial` |
| item_id | INTEGER FK → dropdown_options.id | |
| value | REAL | valor de **cada parcela** (não é o total dividido) |
| description | TEXT nullable | |
| is_installment | BOOLEAN | |
| installment_count | INTEGER nullable | total de parcelas (n, de 2 a 120) |
| installment_number | INTEGER nullable | número desta parcela (1..n) |
| installment_group_id | TEXT (UUID) nullable | agrupa as n linhas da mesma compra |
| recorrencia_id | INTEGER FK → recorrencias.id nullable | lançamento gerado por (ou que deu origem a) uma recorrência; `null` nos avulsos e depois que a recorrência é excluída |
| date | DATE | data desta linha. Parcela 1 = data escolhida no cadastro, parcela 2 = um mês depois, etc. |
| created_at | DATETIME | igual para todas as parcelas do grupo |

**Dia inexistente no mês**: parcelas (e recorrências) mantêm o mesmo dia; se o mês não tiver esse
dia, usam o **último dia do mês** (31/01 → 28/02 ou 29/02 em ano bissexto → 31/03). Helper
`add_months` em `app/utils.py`.

**Data no cadastro**: hoje por padrão, ou qualquer dia de hoje até o fim do mês seguinte (nunca
passado). "Hoje" é sempre calculado no fuso de Brasília (`today_local()`), não no fuso do servidor.
Depois de criado, a data não é editável — exceto pela ação de **antecipar parcela** (ver
[API](api.md#gastos)), que traz uma parcela futura pro mês atual e marca a descrição com o sufixo
" - Parcela Antecipada".

Não é uma coluna da tabela, mas o schema de resposta `GastoOut` também inclui `item_name`, resolvido
via uma `@property` no model (`self.item.name`). Isso permite mostrar o nome da categoria em `/dados`
mesmo quando ela já foi removida por soft delete — a FK continua válida, só some da lista de
categorias ativas.

## `receitas`

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| value | REAL | valor total da receita |
| cash_percentage | REAL | percentual definido no slider (0–100) |
| cash_value | REAL | calculado: `round(value * cash_percentage / 100, 2)` |
| description | TEXT nullable | |
| recorrencia_id | INTEGER FK → recorrencias.id nullable | mesma regra de `gastos.recorrencia_id` |
| date | DATE | escolhida no cadastro: hoje por padrão, ou até o fim do mês seguinte (não editável depois) |
| created_at | DATETIME | |

## `recorrencias`

Gasto ou receita que se repete todo mês ("Repetir todo mês" em Adicionar gasto/receita). O
lançamento salvo no cadastro é o 1º; a regra gera os próximos a partir do mês seguinte. **Cada mês
vira uma linha comum** em `gastos`/`receitas` (com `recorrencia_id` preenchido) — editar a regra só
vale dos próximos lançamentos em diante, e editar um lançamento gerado muda só ele.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| tipo | TEXT | `gasto` \| `receita` |
| priority | TEXT nullable | só gasto |
| item_id | INTEGER FK → dropdown_options.id nullable | só gasto (categoria excluída continua gerando) |
| value | REAL | |
| cash_percentage | REAL nullable | só receita |
| description | TEXT nullable | |
| dia | INTEGER | 1–31; mês sem esse dia usa o último dia do mês |
| proximo_mes | DATE | dia 1 do próximo mês a gerar |
| fim_mes | DATE nullable | dia 1 do último mês que gera (inclusive); `null` = sem fim. `proximo_mes > fim_mes` = encerrada |
| pausada | BOOLEAN | |
| created_at | DATETIME | |

Geração **sem cron**: `ensure_recurrences` (`app/recorrencias.py`) roda dentro da dependência de
autenticação, no máximo uma vez por minuto por usuário (cache em memória, forçado na virada do mês).
Se ninguém abriu o app por alguns meses, todos os meses que faltam são criados ao voltar. A
duplicata é evitada com um `UPDATE ... WHERE proximo_mes = <valor antigo>` — só a requisição que de
fato avança `proximo_mes` gera o lançamento. Retomar uma recorrência pausada **não** cria os meses
parados: recomeça no mês atual. Excluir a regra mantém os lançamentos já criados (viram avulsos,
`recorrencia_id = null`).

Parcelado e recorrente não combinam: o backend recusa (400) um gasto com os dois.

## `vehicles`

Veículos cadastrados pelo usuário, usados na seção "Manutenção Veículos" (`/veiculos`).

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| name | TEXT | nome do veículo (ex: "Voyage Confortline 1.6"), não pode ser vazio |
| year | INTEGER | ano do veículo (1900–2100) |
| active | BOOLEAN | soft delete, mesma lógica de `dropdown_options` — preserva o histórico de serviços |
| created_at | DATETIME | |

## `vehicle_services`

Serviços de manutenção lançados para um veículo.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| vehicle_id | INTEGER FK → vehicles.id | |
| description | TEXT | o que foi feito (não pode ser vazio) |
| notes | TEXT nullable | observação livre (ex: marca da peça) |
| value | REAL | custo do serviço (aceita 0, para serviço próprio sem custo de peça) |
| service_type | TEXT nullable | `peca` \| `peca_mao_de_obra` \| `peca_mao_de_obra_propria` |
| mileage | INTEGER nullable | quilometragem no momento do serviço — **obrigatória** em toda criação/edição pela API; nullable só por causa de histórico importado antes da regra |
| date | DATE | automática (data atual no cadastro), não editável |
| created_at | DATETIME | |

**Quilometragem sempre crescente, por veículo**: o backend rejeita (400) um km menor que o do serviço
anterior daquele veículo ou maior que o do próximo. Como a data nunca muda, a posição do serviço na
linha do tempo é fixa — editar só move o km dentro da faixa entre os vizinhos (por `date`, com `id`
como desempate). Igual ao vizinho é permitido (dois serviços na mesma visita). Ao criar, compara só
com o maior km já registrado (não existe "próximo" com data futura). Vizinhos sem km (histórico) são
ignorados. Se a edição trocar o veículo, valem os vizinhos do veículo novo.

Assim como `GastoOut.item_name`, o schema de resposta inclui `vehicle_name` (`@property` no model, via
`self.vehicle.name`) para mostrar o nome do veículo mesmo que ele já tenha sido removido por soft delete.

## `operacoes_bolsa`

Operações na bolsa de valores. Sem relação (FK) com nenhuma outra tabela de dados — mesmo banco
físico do resto do app, mas seção logicamente isolada.

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

Dívidas de terceiros com o usuário. Sem relação (FK) com nenhuma outra tabela de dados — mesma lógica
de isolamento de `operacoes_bolsa`. Toda dívida é sempre parcelada (mínimo 1x): um cadastro gera **N
linhas** (uma por mês), ligadas pelo mesmo `installment_group_id`, mesma convenção de `gastos`.

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| devedor | TEXT | nome de quem deve (ex: "Fulano"), não pode ser vazio |
| description | TEXT nullable | do que se trata a dívida |
| value | REAL | valor de **cada parcela** (mesma convenção de `gastos.value`) |
| status | TEXT | `pago` \| `nao_pago`, default `nao_pago` — por linha (parcela), não por grupo |
| installment_count | INTEGER | total de parcelas (n) — sempre preenchido, de 1 a 120 |
| installment_number | INTEGER | número desta parcela (1..n) |
| installment_group_id | TEXT (UUID) | agrupa as n linhas do mesmo cadastro |
| date | DATE | mês de referência desta parcela (parcela 1 = mês atual, parcela 2 = mês atual + 1...) |
| created_at | DATETIME | |

Editar devedor/descrição/valor de uma parcela replica em todas as parcelas do grupo; o `status`
continua por parcela (cada mês é pago separado).

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
| original_filename | TEXT | nome enviado pelo usuário (sanitizado), usado só pro `Content-Disposition` no download |
| stored_filename | TEXT UNIQUE | nome real em disco: `uuid4().hex` + extensão (nunca o nome original, evita path traversal/colisão) |
| content_type | TEXT | MIME type **detectado pela assinatura do arquivo** (não o informado pelo cliente), dentro da whitelist `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf` |
| size_bytes | INTEGER | limite de 10MB por arquivo, validado no backend |
| created_at | DATETIME | |

Índice em `(entity_type, entity_id)` — é por essa chave que as telas consultam "quais linhas têm
anexo".

Excluir uma linha não-parcelada (receita, operação bolsa, serviço) apaga direto seus anexos. Para
gasto/devedor (agrupáveis), excluir uma parcela individual preserva o anexo do grupo enquanto
sobrar qualquer outra parcela do mesmo `installment_group_id` — só apaga quando a última parcela do
grupo é excluída. Excluir um usuário inteiro apaga todos os anexos dele, sem checar referências. O
arquivo em disco só é removido **depois** do commit (evento `after_commit` da sessão), pra um
rollback nunca deixar um metadado apontando pra um arquivo já apagado; e um upload cujo commit falha
apaga o arquivo que tinha acabado de gravar.

!!! note "Arquivos em texto puro"
    Os arquivos em `backend/uploads/` não são criptografados. Isso foi avaliado e adiado de
    propósito (o modelo de ameaça considerado é o roubo físico do disco do servidor), não é um
    esquecimento.

## `notificacoes`

Central de notificações — hoje só o resumo da virada do mês (`tipo = resumo_mensal`), gerado sob
demanda por `app/resumo_mensal.py` quando o app consulta `GET /notificacoes` (sem cron).

| campo | tipo | descrição |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| tipo | TEXT | `resumo_mensal` |
| ano, mes | INTEGER | mês de referência; `UNIQUE(user_id, tipo, ano, mes)` |
| titulo | TEXT | ex: "Resumo de setembro/2026" |
| payload | TEXT (JSON) | conteúdo calculado na geração (`ResumoMensalPayload` em `schemas.py`) |
| lida_em | DATETIME nullable | `null` = não lida |
| created_at | DATETIME | |

O payload é uma **foto** do momento da geração: lançamentos editados depois não mudam um resumo já
gerado. Só o resumo do mês anterior é criado (nunca meses mais antigos, pra quem ficou meses sem
abrir o app não receber uma enxurrada), e nada é criado se o mês não teve lançamento. No máximo 12
resumos ficam guardados: os de mês de referência fora da janela dos últimos 12 meses são apagados
na mesma chamada. A restrição `UNIQUE` + `IntegrityError` ignorado evitam duplicata quando duas
requisições simultâneas tentam gerar o mesmo resumo.

## Integridade e migrações

**Pragmas por conexão** (`app/database.py`): toda conexão SQLite — inclusive a do banco em memória
dos testes — liga `PRAGMA foreign_keys=ON` (sem isso as `ForeignKey` dos models seriam só
decorativas no SQLite) e `PRAGMA busy_timeout=5000` (uma escrita concorrente espera até 5s em vez
de falhar com "database is locked").

!!! note "Sem WAL, de propósito"
    O modo WAL não foi ativado. O backup do servidor faz `tar` da pasta do backend com ele rodando,
    e com WAL as escritas recentes ficariam no arquivo `-wal` separado — a cópia do `.db` sozinha
    poderia sair inconsistente.

**Índices**: `(user_id, date)` em `gastos`, `receitas`, `devedores`, `vehicle_services` e
`operacoes_bolsa` — praticamente toda consulta filtra por usuário e período. Os filtros de ano/mês
viram faixas de datas (`date >= início AND date <= fim`) pra aproveitar esse índice; só "mês sem
ano" continua usando `extract`.

**Migrações sem Alembic** (`_migrate_schema()` em `app/main.py`, roda a cada startup):

- `Base.metadata.create_all` cria tabelas novas, mas nunca altera tabelas existentes. Colunas novas
  em tabelas antigas entram por `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` **só se a coluna
  ainda não existir** — idempotente, seguro rodar a cada subida. Foi assim com
  `include_in_inflation`, as colunas novas de `users` e `recorrencia_id`. Índices usam
  `CREATE INDEX IF NOT EXISTS`.
- Migrações **de dado** que só podem rodar uma vez (não dá pra detectá-las olhando o schema) usam
  `PRAGMA user_version` como marcador:
    - **v1** — Análise inflacionária virou módulo opcional: todo usuário não-master existente recebe
      `analise_inflacionaria` em `user_modules` (sem o marcador, desabilitar o módulo no admin e
      reiniciar o backend o reabilitaria).
    - **v2** — arredondamento a centavos dos valores já gravados (`value`, `cash_value`,
      `value_brl`, `value_usd`).
    - Próximas migrações desse tipo seguem o padrão (v3, v4...).
- Um caso especial: quando a tabela `user_modules` acabou de nascer (checado antes do
  `create_all`), todos os usuários não-master que já existiam recebem todos os módulos, pra não
  perder nada que já usavam. Usuários criados depois começam sem nenhum.

**Moeda e texto nos schemas** (`app/schemas.py`):

- `Money` arredonda o valor a 2 casas **antes** da validação `gt=0` — assim `0,004` vira `0,00` e é
  rejeitado, em vez de passar e ser gravado como zero. Sem isso o banco acumulava valores como
  `411.10848`.
- `NonBlank` (strip + mínimo 1 caractere) em nomes de categoria, veículo, devedor e descrição de
  serviço — só espaços dá 422.
