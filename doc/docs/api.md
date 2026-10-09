# API

Base URL em desenvolvimento: `http://localhost:8000`. Documentação interativa automática do FastAPI
disponível em `/docs` (Swagger) e `/redoc`. Em produção a API fica atrás do nginx, no prefixo `/api`
(ver [Deploy: Ubuntu Server + Tailscale](deploy-ubuntu-tailscale.md)).

Todos os endpoints abaixo, exceto `/auth/login` e `/health`, exigem o header
`Authorization: Bearer <token>`, e operam sobre os dados do usuário do token (`user_id`) — nenhum
endpoint aceita `user_id` vindo do cliente.

## Convenções gerais

| situação | resposta |
|---|---|
| token ausente, expirado ou revogado | `401` |
| troca obrigatória de senha pendente | `403` com `detail: "Troca de senha obrigatória antes de continuar"` em todo endpoint, exceto `GET /auth/me` e `PUT /auth/me/password` |
| endpoint restrito ao master chamado por outro usuário | `403` |
| módulo opcional não habilitado pro usuário | `403` com `detail: "Módulo não habilitado para este usuário"` |
| registro de outro usuário (ou inexistente) | `404` — nunca revela que o registro existe |
| validação de schema (valor ≤ 0, texto vazio, faixa inválida) | `422` |
| regra de negócio violada (data fora da faixa, km fora de ordem, parcelado + recorrente...) | `400` com `detail` legível — o frontend mostra esse texto direto |

**Listagens paginadas** respondem `{items, total}` e aceitam `limit` (default 25, máx. 200) e
`offset`. **Busca textual** (`busca`, `devedor`, `ticker`) é por substring, case-insensitive, com
`%`/`_` escapados (digitar `50%` procura literalmente "50%"). **Filtros de período** `ano`/`mes` são
opcionais e combináveis (só ano = ano inteiro; só mês = esse mês em qualquer ano). Valores em R$ são
arredondados a centavos na entrada. Toda resposta leva `X-Content-Type-Options: nosniff`.

### Módulos opcionais

Alguns domínios só respondem se o usuário tiver o módulo habilitado (o master sempre tem todos) —
a checagem é feita pela dependência `require_module(...)` no próprio `APIRouter`, então cobre todos
os endpoints do router de uma vez. Vale na hora: o usuário é relido do banco a cada requisição.

| módulo | endpoints bloqueados sem ele |
|---|---|
| `veiculos` | `/veiculos/*`, `/servicos-veiculos/*`, anexos com `entity_type=servico_veiculo` |
| `operacoes_bolsa` | `/operacoes-bolsa/*`, anexos com `entity_type=operacao_bolsa` |
| `devedores` | `/devedores/*`, anexos com `entity_type=devedor` |
| `exportar_dados` | `/export/*` (e cada módulo exportado também exige o próprio módulo) |
| `analise_inflacionaria` | `GET /resumo/inflacao`; `PUT /dropdown-options/{id}` com `include_in_inflation` |
| `ferramentas` | — (só frontend, não tem backend) |

## Saúde

| método | rota | descrição |
|---|---|---|
| GET | `/health` | `{status: "ok"}` — sem autenticação. Usado pelo app Android pra descobrir se o servidor está acessível pela rede local antes de cair no endereço remoto |

## Autenticação

Detalhes do fluxo, do token e das regras em [Autenticação](autenticacao.md).

| método | rota | descrição |
|---|---|---|
| POST | `/auth/login` | login (form-encoded `username` + `password`) → `{access_token, token_type}`. `401` se inválido; `429` (com `Retry-After`) depois de 5 falhas do mesmo username em 15 min ou de 30 falhas no total em 1 min |
| GET | `/auth/me` | dados do usuário logado (`UserOut`: id, username, role, first_name, last_name, `modules`, `must_change_password`, `default_cash_percentage`, `last_login_at`, `last_activity_at`). Aceito mesmo com troca de senha pendente |
| PUT | `/auth/me` | edita o próprio `username`, `first_name`, `last_name` (400 se o username já existir) → `{access_token, token_type, user}`. Devolve um token novo porque o JWT carrega o username |
| PUT | `/auth/me/default-cash-percentage` | `{default_cash_percentage}` (0–100, 422 fora disso) → salva o % de caixa padrão de Adicionar Receita; retorna o `UserOut` |
| PUT | `/auth/me/password` | `{current_password, new_password}` (mín. 6 caracteres). 400 se a atual estiver errada ou se a nova for igual à atual. Zera `must_change_password`, incrementa `token_version` (derruba os outros aparelhos) e devolve `{detail, access_token}` com o token novo deste aparelho. Aceito mesmo com troca de senha pendente |
| POST | `/auth/users` | cria usuário (`username`, `password`, `first_name`, `last_name` obrigatórios, `modules` opcional, default `[]`) — **restrito ao master**. A conta nasce com `must_change_password = true` |
| GET | `/auth/users` | lista todos os usuários (`UserOut`, com `modules` e `last_activity_at`) — restrito ao master |
| PUT | `/auth/users/{id}` | edita `username`, `first_name`, `last_name` (obrigatórios); `password` opcional reseta a senha (força a troca no próximo login, exceto quando o master reseta a própria, e revoga os tokens da conta); `modules` opcional substitui os módulos (omitido = mantém; ignorado pro master) — restrito ao master |
| DELETE | `/auth/users/{id}` | exclui um usuário e todos os dados dele (gastos, receitas, recorrências, categorias, veículos e serviços, operações, devedores, notificações, anexos e módulos) — restrito ao master; 400 se o alvo tiver `role == master` |
| POST | `/auth/switch-to-teste` | gera um token para o usuário `teste` sem precisar da senha dele (token marcado com `imp`) — restrito ao master, 404 se a conta não existir. Usado pelo botão "Mudar pra conta teste" do painel de Administração |

## Categorias (`dropdown-options`)

| método | rota | descrição |
|---|---|---|
| GET | `/dropdown-options?priority=essencial\|nao_essencial` | lista as categorias ativas do usuário logado, por nome |
| POST | `/dropdown-options` | cria categoria (`priority`, `name`) |
| PUT | `/dropdown-options/{id}` | edita o `name` e, opcionalmente, `include_in_inflation` (marca/desmarca a categoria na cesta da Análise inflacionária). Mandar `include_in_inflation` sem o módulo `analise_inflacionaria` dá 403; renomear continua liberado |
| DELETE | `/dropdown-options/{id}` | soft delete (`active=false`) |

## Gastos

| método | rota | descrição |
|---|---|---|
| POST | `/gastos` | cria gasto (`priority`, `item_id`, `value`, `description`, `is_installment`, `installment_count` 2–120, `date`, `recorrente`, `recorrencia_dia`, `recorrencia_fim`). Parcelado cria N linhas (uma por mês) e retorna a lista completa. `date` opcional: hoje por padrão, de hoje até o fim do mês seguinte (senão 400) — no parcelado é a data da parcela 1. `recorrente=true` cria também uma [recorrência](#recorrencias) (`recorrencia_dia` 1–31, omitido = dia da data; `recorrencia_fim` = qualquer dia do último mês que gera, omitido = sem fim, precisa ser depois do mês do lançamento senão 400); parcelado + recorrente = 400 |
| GET | `/gastos?ano=&mes=&busca=&limit=&offset=` | lista paginada de gastos do usuário, por data decrescente. `busca` procura na descrição e no nome da categoria |
| PUT | `/gastos/{id}` | edita `priority`, `item_id`, `value`, `description`. Categoria excluída continua aceita se não for trocada (trocar exige uma ativa). **Gasto parcelado: a edição replica em todas as parcelas do grupo** — exceto que uma parcela antecipada mantém o próprio valor e o sufixo " - Parcela Antecipada", recebendo só a descrição-base |
| POST | `/gastos/{id}/antecipar` | traz uma parcela de mês futuro pro mês atual (mesmo dia, limitado ao último dia do mês), com `value` opcional no corpo (ex: valor com desconto) e acrescenta " - Parcela Antecipada" à descrição. 400 se o gasto não for de mês futuro |
| DELETE | `/gastos/{id}` | exclui o gasto (com limpeza de anexos, ver [Modelo de dados](modelo-de-dados.md#attachments)) |
| GET | `/gastos/anomalia?item_id=&value=` | `{anomalo, mediana, multiplo, amostras}` — o valor está muito acima do normal da categoria? Usado por Adicionar/Editar gasto pra pedir confirmação antes de salvar |

Cada item retornado (`GastoOut`) inclui `item_name`, resolvido via `Gasto.item.name` — funciona mesmo
para categorias já removidas por soft delete — e `recorrencia_id` (preenchido nos lançamentos de uma
recorrência).

**Critério de anomalia** (`app/analytics.py`): z-score robusto com mediana/MAD dos gastos **avulsos**
da categoria nos últimos 12 meses; exige pelo menos 6 amostras, z > 3,5 e valor ≥ R$ 50. Com MAD 0
(valores todos iguais), anômalo é ≥ 3× a mediana. Mediana/MAD em vez de média/desvio padrão porque
um único gasto enorme no histórico não deve "acostumar" o critério.

## Receitas

| método | rota | descrição |
|---|---|---|
| POST | `/receitas` | cria receita (`value`, `cash_percentage` 0–100, `description`, `date`, `recorrente`, `recorrencia_dia`, `recorrencia_fim`), calculando `cash_value = round(value × cash_percentage / 100, 2)`. `date` e recorrência seguem a mesma regra de `/gastos` |
| GET | `/receitas?ano=&mes=&busca=&limit=&offset=` | lista paginada de receitas do usuário, por data decrescente. `busca` procura na descrição |
| PUT | `/receitas/{id}` | edita `value`, `cash_percentage`, `description` — recalcula `cash_value` |
| DELETE | `/receitas/{id}` | exclui a receita |

## Recorrências

Gastos/receitas que se repetem todo mês (ver [Modelo de dados](modelo-de-dados.md#recorrencias)).
São criadas pelo `POST /gastos`/`POST /receitas` com `recorrente=true` — não há `POST` próprio.

| método | rota | descrição |
|---|---|---|
| GET | `/recorrencias` | recorrências do usuário com `status` (`ativa` \| `pausada` \| `encerrada`), `proxima_data` e `lancamento_pendente_data` (lançamento deste mês já criado, mas com data futura) |
| PUT | `/recorrencias/{id}` | edita `value`, `dia`, `description`, `fim_mes` (último mês, inclusive; não pode ser anterior ao atual) e, conforme o tipo, `priority`/`item_id` (gasto) ou `cash_percentage` (receita). Vale dos próximos lançamentos em diante. Adiar o fim de uma encerrada recomeça no mês atual, sem criar os meses parados |
| POST | `/recorrencias/{id}/pausar` | para de gerar até ser retomada |
| POST | `/recorrencias/{id}/retomar` | volta a gerar a partir do mês atual — os meses em que ficou pausada **não** são criados |
| DELETE | `/recorrencias/{id}?apagar_pendentes=` | para de gerar e **mantém** os lançamentos já criados (viram avulsos). Com `apagar_pendentes=true`, os lançamentos dela com data futura são apagados junto |

## Resumos e análises

| método | rota | descrição |
|---|---|---|
| GET | `/resumo/anual?ano=2026&meses=12&ate_ano=&ate_mes=` | métricas do ano + dados dos 2 gráficos (ver [Analítico](analitico.md)). `meses` (12, 24 ou 36; default 12) controla só a janela rolante dos gráficos, que termina no mês atual. Com `ate_ano`/`ate_mes` (os dois juntos) as métricas do ano vão só até esse mês inclusive **e** a janela dos gráficos passa a terminar nesse mês |
| GET | `/resumo/mensal?ano=2026&mes=8` | métricas do mês + "Disponível pra gastar" (sem parâmetro de corte — já analisa um único mês) |
| GET | `/resumo/geral?ate_ano=&ate_mes=` | **totais** (não médias) agrupados por ano (`anos: [{ano, total_essenciais, total_nao_essenciais, total_receita, total_caixa_pretendido, total_caixa_real}]`) e por mês do calendário somando todos os anos (`por_mes`, 12 posições, jan–dez, revela sazonalidade), mais os totais gerais. `ate_ano`/`ate_mes` limitam tudo até esse mês inclusive |
| GET | `/resumo/inflacao?meses=12&ate_ano=&ate_mes=` | inflação pessoal da cesta de categorias marcadas (`possui_cesta`, `cesta`, séries `mensal` — mês a mês — e `anual` — ano a ano —, `headline_mom_pct`, `headline_yoy_pct`). Mês sem base de comparação vem com `variacao_pct: null`. **Exige o módulo `analise_inflacionaria`** |
| GET | `/resumo/mensal/detalhes?ano=&mes=` | modal "Ver detalhes": `receita`, `gastos`, `caixa_pretendido`, `caixa_real` e `disponivel` como `{valor, media, variacao_pct}` (média dos 3 meses anteriores com lançamento), `categorias` (total, % do mês, lançamentos, média e variação), `composicao` (recorrentes, parcelas, avulsos essenciais/não essenciais), `ja_lancado`/`programado` (data até hoje × depois de hoje) e `situacao` (`passado`/`atual`/`futuro`) |
| GET | `/resumo/previsao` | projeção do saldo no fim do **mês atual**: receita (ou mediana dos últimos 6 meses, se nada lançado — `receita_estimada`), menos tudo já lançado no mês (`comprometido`), menos o gasto variável que ainda deve sair — mediana, nos últimos 12 meses, do gasto avulso depois do dia de hoje, descontando os avulsos já lançados com data futura (`variavel_restante`), menos o caixa pretendido → `saldo_previsto`, com faixa `saldo_min`/`saldo_max` (percentis 25/75 do mesmo valor; sempre contém o centro). `historico_suficiente=false` com menos de 3 meses de histórico |
| GET | `/resumo/indicadores?ate_ano=&ate_mes=` | indicadores do mês de referência (o corte, ou o mês atual): poupança móvel de 3 meses, comprometimento com parcelas dos próximos 6 meses, custo fixo (recorrências detectadas) e % essencial com tendência |

As agregações mensais são feitas no banco (`GROUP BY strftime('%Y-%m', date)`), em poucas consultas
por endpoint — `/resumo/anual?meses=36` e `/resumo/inflacao` ficam em no máximo ~12 consultas (há
teste contando isso).

## Notificações

Central de notificações — hoje só o resumo da virada do mês (ver
[Modelo de dados](modelo-de-dados.md#notificacoes)).

| método | rota | descrição |
|---|---|---|
| GET | `/notificacoes?limit=` | notificações do usuário, mais nova primeiro (`limit` default 12, máx. 100), com o `payload` do resumo e `lida`. Antes de listar, apaga resumos fora da janela dos últimos 12 meses e gera o do mês anterior se ainda não existir |
| PUT | `/notificacoes/{id}/lida` | marca uma como lida (404 se não for do usuário) |
| PUT | `/notificacoes/lidas` | marca todas como lidas (204) |

## Veículos (Manutenção Veículos)

Exige o módulo `veiculos`.

| método | rota | descrição |
|---|---|---|
| GET | `/veiculos` | lista veículos ativos do usuário |
| POST | `/veiculos` | cria veículo (`name`, `year`) |
| PUT | `/veiculos/{id}` | edita nome/ano |
| DELETE | `/veiculos/{id}` | soft delete (`active=false`) |
| GET | `/veiculos/resumo?meses=12&ano=&mes=` | cards de resumo por veículo (`total_gasto`, `quantidade_servicos`, `ultimo_servico`) + série mensal (últimos N meses, uma linha por veículo) pro gráfico de evolução. `ano`/`mes` (opcionais, combináveis) filtram **só os cards** — a série do gráfico sempre usa a janela rolante de `meses` |

## Serviços de manutenção

Exige o módulo `veiculos`.

| método | rota | descrição |
|---|---|---|
| GET | `/servicos-veiculos?vehicle_id=&busca=&limit=&offset=` | lista paginada de serviços, por data decrescente. `vehicle_id` filtra por veículo; `busca` procura na descrição e na observação |
| POST | `/servicos-veiculos` | cria serviço (`vehicle_id`, `description`, `notes`, `value` ≥ 0, `service_type`, `mileage` **obrigatório**) — data é sempre automática. 400 se o km for menor que o maior já registrado pro veículo |
| PUT | `/servicos-veiculos/{id}` | edita o serviço. 400 se o km sair da faixa entre o serviço anterior e o próximo do veículo (ver [Modelo de dados](modelo-de-dados.md#vehicle_services)) |
| DELETE | `/servicos-veiculos/{id}` | exclui o serviço |

Cada item retornado (`VehicleServiceOut`) inclui `vehicle_name`, resolvido via `VehicleService.vehicle.name`
(mesma lógica do `item_name` de `GastoOut`).

## Operações Bolsa

Exige o módulo `operacoes_bolsa`. Sem relação com `gastos`/`receitas`/`dropdown_options` — seção
logicamente isolada, mesmo banco físico.

| método | rota | descrição |
|---|---|---|
| GET | `/operacoes-bolsa?ticker=&operation=&limit=&offset=` | lista paginada, por data decrescente. `ticker` filtra por substring case-insensitive, `operation` por igualdade |
| POST | `/operacoes-bolsa` | cria operação — valida campos conforme `operation` (ticker/quantidade obrigatórios só em `compra`/`venda`; cotação obrigatória sempre que envolver dólar) e deriva o valor não informado (`value_brl` a partir de `value_usd × cotacao` ou vice-versa) |
| PUT | `/operacoes-bolsa/{id}` | edita uma operação (mesma validação/derivação do create; data não é editável) |
| DELETE | `/operacoes-bolsa/{id}` | exclui a operação |

## Devedores

Exige o módulo `devedores`. Sem relação com `gastos`/`receitas`/`dropdown_options` — seção
logicamente isolada. Toda dívida é sempre parcelada (mínimo 1x); `POST` gera as N linhas de parcela
de uma vez.

| método | rota | descrição |
|---|---|---|
| GET | `/devedores?devedor=&status=&ano=&mes=&limit=&offset=` | lista paginada de parcelas, por data decrescente. `devedor` filtra por substring case-insensitive, demais filtros opcionais |
| GET | `/devedores/pendencias` | `{count}` de parcelas `nao_pago` com data em qualquer mês anterior ao atual (atraso acumulado, não só o mês imediatamente anterior) — alimenta o badge de aviso no menu lateral |
| POST | `/devedores` | cria devedor (`devedor`, `description`, `value` da parcela, `installment_count` 1–120) — gera as N linhas de parcela e retorna todas |
| PUT | `/devedores/{id}` | edita `devedor`/`description`/`value` — **replicados em todas as parcelas do grupo** — e o `status`, que vale só pra parcela editada |
| DELETE | `/devedores/{id}` | exclui uma parcela específica |

## Anexos

Comprovantes (imagem/PDF) opcionais em gastos, receitas, serviços de veículo, operações bolsa e
devedores — ver [Modelo de dados](modelo-de-dados.md#attachments). Router genérico único cobrindo os
5 módulos via `entity_type` + `entity_id`. Anexos de `servico_veiculo`, `operacao_bolsa` e `devedor`
exigem o módulo correspondente (403 sem ele).

| método | rota | descrição |
|---|---|---|
| POST | `/attachments/upload` | cria anexo (multipart: `entity_type`, `entity_id`, `file`). Confere o tipo real pela assinatura do arquivo (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf` — o `Content-Type` enviado pelo cliente não basta) e o tamanho (máx. 10MB), confere posse do registro pai, sanitiza o nome, grava em disco (`backend/uploads/<entity_type>/<uuid>.<ext>`) e insere o metadado |
| GET | `/attachments?entity_type=&entity_id=` | lista anexos de um registro (404 se o registro pai não for do usuário) |
| GET | `/attachments/exists?entity_type=&entity_ids=` | (`entity_ids` repetido na query) `{entity_ids_with_attachments}` em lote — usado pelas telas de listagem pra saber quais linhas mostram o ícone de anexo sem uma requisição por linha |
| GET | `/attachments/{id}/download` | baixa o arquivo (`FileResponse`, 404 se o anexo não for do usuário) |
| DELETE | `/attachments/{id}` | exclui um anexo específico |

Para gasto (quando parcelado) e devedor (sempre parcelado), `entity_id` é o `installment_group_id` do
grupo inteiro, não o `id` de uma parcela — todas as parcelas do mesmo grupo compartilham os mesmos
anexos.

## Exportar dados

Exige o módulo `exportar_dados`.

| método | rota | descrição |
|---|---|---|
| GET | `/export/{modulo}` | `modulo` ∈ `gastos` \| `receitas` \| `veiculos` \| `operacoes_bolsa` \| `devedores` \| `categorias` (422 se inválido). Retorna um `.zip` com o(s) CSV(s) do módulo + pasta `anexos/` com os comprovantes dos registros exportados. `veiculos`, `operacoes_bolsa` e `devedores` exigem também o próprio módulo (403) |

Formato do CSV: delimitador `;`, encoding latin-1 (caractere fora do latin-1 vira `?`), vírgula como
separador decimal — a convenção que o Excel em português abre direto. Registros em ordem
cronológica (mais antigo primeiro), sem paginação. `veiculos` gera dois CSVs (`veiculos.csv` +
`servicos_veiculos.csv`); `categorias` inclui as inativas (é uma cópia de backup). A coluna
`anexos` lista o nome do arquivo dentro do zip (`<entity_type>_<entity_id>_<id do anexo>_<nome
original>`); anexo de grupo parcelado aparece em todas as linhas do grupo, mas só uma cópia física
entra no zip. O zip é montado num arquivo temporário (anexos lidos do disco em blocos) e apagado
depois do envio.

## Backup

| método | rota | descrição |
|---|---|---|
| GET | `/backup-status` | `{last_backup_at}` (ISO 8601 ou `null`) — lido de um arquivo simples no servidor (`last_backup.txt`), gravado pelo script de menu do PC logo após um backup confirmado. Restrito ao master; alimenta o aviso exibido quando fazem 30 dias ou mais desde o último backup |
