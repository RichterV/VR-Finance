# Arquitetura

## Visão geral

```
Navegador / APK Android (Ionic + Angular)
        │  HTTPS + JSON, header Authorization: Bearer <JWT>
        ▼
nginx (estático do frontend + proxy /api → 127.0.0.1:8000)
        ▼
FastAPI (uvicorn, supervisionado por systemd)  ──SQLAlchemy──▶  SQLite (vrfinance.db)
        │
        └──▶ backend/uploads/<entity_type>/<uuid>.<ext>   (arquivos de anexo, fora do banco)
```

- O frontend consome a API via HTTP, enviando o JWT em toda requisição autenticada. No build web o
  endereço da API é relativo (`/api`), então funciona em qualquer host atrás do nginx; o APK usa um
  endereço absoluto (ver [App Android](#app-android-nativo-capacitor)).
- O backend expõe rotas REST organizadas por domínio: `/auth`, `/gastos`, `/receitas`,
  `/recorrencias`, `/dropdown-options`, `/resumo`, `/notificacoes`, `/veiculos`,
  `/servicos-veiculos`, `/operacoes-bolsa`, `/devedores`, `/attachments`, `/export`,
  `/backup-status` e `/health` — detalhes em [API](api.md).
- O banco é um único arquivo SQLite, criado pelo SQLAlchemy na primeira execução. Não há Alembic:
  colunas e dados novos entram por uma migração idempotente no startup (`_migrate_schema()` em
  `main.py`, com `PRAGMA table_info` + `ALTER TABLE` e, pra migrações de dados de uso único,
  `PRAGMA user_version` como marcador).
- Anexos não ficam no banco — só o metadado. O arquivo vai pra `backend/uploads/` com um nome UUID
  (nunca o nome enviado pelo cliente), e o tipo é conferido pela assinatura real do arquivo.
- **Sem cron.** Tudo que depende da passagem do tempo (lançamentos recorrentes da virada do mês, o
  resumo mensal) é gerado **sob demanda**, na primeira requisição que precisar — o servidor não
  precisa de agendador nenhum, e meses em que ninguém abriu o app são preenchidos quando alguém volta.

## Backend

```
backend/
├── app/
│   ├── main.py            # cria o app, registra routers, CORS, header nosniff, migrações no startup
│   ├── config.py          # variáveis de ambiente (Settings via pydantic-settings)
│   ├── database.py        # engine + SessionLocal + Base; liga foreign_keys=ON e busy_timeout em toda conexão
│   ├── models.py          # User, UserModule, DropdownOption, Gasto, Receita, Recorrencia, Vehicle,
│   │                      #   VehicleService, OperacaoBolsa, Devedor, Attachment, Notificacao
│   ├── schemas.py         # Pydantic; tipos Money (arredonda a centavos antes de validar) e NonBlank
│   ├── security.py        # bcrypt + JWT (sub, uid, tv, iat; "imp" no token de "Mudar pra conta teste")
│   ├── deps.py            # get_db, get_current_user, require_master, require_module(key)
│   ├── modules.py         # registro dos módulos opcionais (OPTIONAL_MODULES)
│   ├── login_guard.py     # limite de tentativas de login por username (5 falhas / 15 min → 429)
│   ├── recorrencias.py    # ensure_recurrences: cria os lançamentos recorrentes que faltam
│   ├── resumo_mensal.py   # ensure_monthly_digest: gera/poda o resumo da virada do mês
│   ├── analytics.py       # anomalia de gasto, projeção do fim do mês, indicadores
│   ├── utils.py           # datas e filtros compartilhados (ver abaixo)
│   ├── seed_master.py     # cria o usuário master
│   ├── seed_test_user.py  # recria a conta "teste" com ~4 anos de dados mocados (idempotente)
│   └── routers/
│       ├── auth.py               # login, /auth/me, gestão de usuários (master), switch-to-teste
│       ├── dropdown_options.py   # categorias (soft delete, cesta de inflação)
│       ├── gastos.py             # parcelamento, edição replicada no grupo, antecipar parcela
│       ├── receitas.py
│       ├── recorrencias.py       # listar/editar/pausar/retomar/excluir regras
│       ├── resumo.py             # /resumo/mensal, /anual, /geral, /inflacao
│       ├── analytics.py          # /gastos/anomalia, /resumo/previsao, /resumo/indicadores
│       ├── notificacoes.py       # central de notificações (resumo mensal)
│       ├── veiculos.py, servicos_veiculos.py, operacoes_bolsa.py, devedores.py
│       ├── attachments.py        # router genérico de anexos (5 módulos via entity_type/entity_id)
│       ├── export.py             # /export/{modulo} → .zip com CSV + anexos
│       └── backup_status.py      # data do último backup (só master)
├── tests/                 # pytest, SQLite em memória isolado por teste (conftest.py)
├── uploads/               # anexos em disco, gitignored
├── requirements.txt
└── .env / .env.example
```

### Pontos que cruzam vários routers

- **Dependência de usuário (`deps.py`)**: `get_current_user` decodifica o JWT, confere `uid`,
  username e `token_version` (troca/reset de senha revoga os tokens antigos), registra a última
  atividade (no máximo 1 UPDATE por minuto) e barra com 403 quem tem troca de senha pendente. Antes de
  devolver o usuário, chama `ensure_recurrences()` — é aqui que os lançamentos recorrentes da virada
  do mês nascem, antes de qualquer leitura. Pra não pesar, a checagem roda no máximo 1x por minuto
  por usuário (cache em memória, forçado quando o mês vira), e uma duplicata entre requisições
  simultâneas é evitada por um `UPDATE ... WHERE proximo_mes = <antigo>`: só quem consegue avançar o
  `proximo_mes` gera o lançamento.
- **Módulos opcionais**: `require_module(key)` entra no `APIRouter(dependencies=[...])` dos routers de
  veículos/serviços, operações bolsa, devedores e export, respondendo 403 sem o módulo. Anexos de um
  módulo bloqueado e o `/resumo/inflacao` também conferem. O usuário é relido do banco a cada
  requisição, então habilitar/desabilitar vale na hora.
- **Datas (`utils.py`)**: `today_local()` é o "hoje" de todo o backend, sempre no fuso de Brasília —
  o servidor roda em UTC, e usar `date.today()` fazia lançamentos feitos depois das 21h caírem no dia
  seguinte. `add_months`/`last_day_of_month` cuidam de parcelas e recorrências (dia que não existe no
  mês vira o último dia). `period_filters`/`month_range`/`year_range` transformam filtros de ano/mês
  em faixas de data (aproveitam os índices `(user_id, date)`); `resolve_launch_date`/
  `max_launch_date` validam a data escolhida no cadastro; `like_contains` escapa `%`/`_` nas buscas.
- **Agregação no banco**: os resumos agregam por mês com `GROUP BY strftime('%Y-%m', date)`
  (`monthly_totals` em `routers/resumo.py`), em vez de uma consulta por mês — há testes que contam
  as consultas (`test_desempenho.py`).
- **Anexos**: o arquivo só é apagado do disco depois do commit (evento `after_commit` da sessão), e
  um upload cujo commit falha apaga o arquivo já gravado — banco e disco não ficam dessincronizados.

## Frontend

```
frontend/src/app/
├── app.routes.ts          # rotas (lazy), guards
├── core/                  # auth (serviço, guards, interceptor), módulos, bloqueio do app, api-base,
│                          #   modal-launcher, home-refresh
├── layout/                # main-layout: menu lateral, banner de backup, overlay de bloqueio
├── home/                  # Home + home/sections/ (uma seção do dashboard por componente)
├── pages/                 # login, trocar-senha, servidor-indisponivel, dados, veiculos,
│                          #   operacoes-bolsa, devedores, ferramentas, exportar-dados, admin
├── modals/                # adicionar/editar de cada módulo, itens (Categorias), perfil, admin-usuario,
│                          #   notificacoes, resumo-mensal, detalhes-mes, chart-expand, attachment-preview,
│                          #   editar-recorrencia
├── services/              # um serviço HTTP por recurso da API
└── shared/                # componentes, diretivas e funções puras reaproveitadas
```

### Rotas e guards

| Rota | Tela | Guard |
|---|---|---|
| `/login` | Login (com gate de digital no APK) | — |
| `/trocar-senha` | "Defina sua senha" — troca obrigatória | `passwordChangeGuard` |
| `/servidor-indisponivel` | Erro quando o servidor não responde (com "Tentar novamente") | — |
| `/home` | Dashboard | `authGuard` (no layout) |
| `/dados` | Gastos, Receitas e **Recorrências** (3 abas) | `authGuard` |
| `/veiculos` | Manutenção Veículos | `moduleGuard` (`veiculos`) |
| `/operacoes-bolsa` | Operações Bolsa | `moduleGuard` (`operacoes_bolsa`) |
| `/devedores` | Devedores | `moduleGuard` (`devedores`) |
| `/ferramentas` | Calculadoras | `moduleGuard` (`ferramentas`) |
| `/exportar-dados` | Exportar Dados | `moduleGuard` (`exportar_dados`) |
| `/admin` | Administração de usuários | `masterGuard` |

- `authGuard` exige login e manda pra `/trocar-senha` se a senha foi definida pelo master. Se a
  checagem do usuário falhar por timeout/5xx/sem rede (e não por 401/403), o token é mantido e o app
  vai pra `/servidor-indisponivel` em vez de forçar um novo login.
- `moduleGuard` lê `data: { module }` da rota e redireciona pra `/home` sem o módulo. O registro de
  módulos (`core/modules.ts`, espelho de `backend/app/modules.py`) também monta o menu lateral —
  módulo sem `route` (Análise inflacionária) não vira item de menu, só esconde partes de outras telas.
- O bloqueio é duplo de propósito: o frontend esconde e redireciona, o backend responde 403.

### Home em seções independentes

A Home guarda só o estado de tela (período mês/ano, checkbox de corte, olho de esconder valores) e um
`reloadToken`. Cada seção — Mensal, Indicadores, Anual, Geral, Inflação (`home/sections/`) — carrega
os próprios dados com um `SectionLoader` (esqueleto enquanto carrega, erro com "Tentar novamente" por
seção). Antes era um `forkJoin` único: uma falha deixava a Home inteira girando pra sempre.

Recargas são controladas pra não martelar o servidor: o `HomeRefreshService` (disparado ao salvar
um lançamento ou clicar em "Início" no menu) passa por um debounce de 400 ms — lançar vários gastos
seguidos gera uma recarga só — e o `ionViewWillEnter` só recarrega se o dado tiver mais de 30 s. Os
estilos do dashboard ficam em `theme/_dashboard.scss`, escopados em `.dashboard`.

### Modais

Abrem por cima da página atual via `ModalController`; os de uso comum (Adicionar gasto/receita,
Categorias, Perfil) passam pelo `core/modal-launcher.service.ts`, chamado pela Home, pelo menu lateral
e pelo botão "+". No **desktop (≥992px)** todos abrem ancorados à direita, como painel lateral
(`cssClass: 'side-modal'` + animações em `modals/side-modal.animations.ts`, sem slide quando o sistema
pede `prefers-reduced-motion`); no celular/tablet ficam centralizados/fullscreen.

O **Perfil** cuida só da própria conta (username, nome, sobrenome, senha, tempo do bloqueio no APK e
"Sair"). A gestão de outras contas — criar, editar módulos, resetar senha, excluir, "Mudar pra conta
teste" — fica em `/admin`.

### Interceptor de autenticação

`core/auth.interceptor.ts` põe o token em toda requisição e trata as respostas de forma central:
401 com o token ainda guardado → logout (uma vez só, mesmo com várias requisições falhando juntas);
403 de troca de senha pendente → `/trocar-senha`. Mensagens de erro dos modais usam o `detail` do
backend (`shared/http-error.ts`).

### "Desfazer" exclusão

`shared/undo-delete.service.ts`: excluir gasto, receita, parcela de devedor, operação, veículo,
serviço ou categoria tira o item da tela na hora e mostra um toast com "Desfazer"; o `DELETE` só vai
pro servidor depois de 5 s. Sair da página, fechar o modal de Categorias ou mandar o app pro segundo
plano confirma na hora; se o `DELETE` falhar, o item volta. Excluir usuário (cascata) e anexo
continuam com alerta de confirmação — são irreversíveis demais pra depender de um toast.

### Celular (< 768px) vs. desktop

- **Menu lateral**: no desktop é um hover-menu (barra fina, expande ao passar o mouse, com pin pra
  fixar — fixado ele empurra o conteúdo). Abaixo de 992px é o `ion-split-pane` padrão, com
  hambúrguer abaixo de 768px; aí Categorias e Perfil entram no menu (saem do header).
- **Botão flutuante "+"** na Home (Gasto/Receita), só no celular.
- **Tabelas viram cartões**: toda tabela de listagem marcada com `.has-cards` tem uma `.entry-list`
  irmã; os dois estão no DOM e uma media query troca. A ordenação, sem cabeçalho clicável, vira um
  `<app-sort-select>` que lê/escreve o mesmo `SortState` da tabela (`shared/sortable.ts`).
- Utilitários `.desktop-only`/`.mobile-only` em `global.scss`.

### Formulários

- `shared/currency-input.directive.ts` (`[appCurrencyInput]="form.controls.valor"`): máscara de
  centavos que enche da direita pra esquerda ("100" vira "1,00"), com teclado numérico. Recebe o
  `FormControl` em vez de ser um value accessor porque o `ion-input` já tem um — dois dariam conflito.
- `appAutofocus` foca o primeiro campo útil quando o modal termina de abrir.
- `launch-date-field` (data do lançamento), `recurrence-field` ("Repetir todo mês"),
  `attachment-picker` (anexos) e `save-with-attachments.ts` (salva o registro e só então sobe os
  anexos) são compartilhados pelos modais.
- `shared/anomaly-check.ts`: antes de salvar um gasto avulso, consulta `GET /gastos/anomalia` e pede
  confirmação se o valor estiver muito acima do normal da categoria (falha na checagem não impede).

### Anexos

- `attachment-picker.component.ts`: botão "+ Adicionar arquivo" (também aceita arrastar e soltar e
  Ctrl+V) e, no celular, botão de câmera (`<input capture="environment">`); a foto é reduzida pra caber
  no limite de 10 MB (`shared/camera-photo.ts`). Em criação os arquivos esperam o registro pai salvar;
  em edição sobem na hora. O botão Salvar fica bloqueado enquanto um anexo processa/sobe.
- `attachments-popover.component.ts`: lista de download aberta pelo ícone de anexo (sempre o primeiro
  da coluna de ações), mostrado só nas linhas com anexo — calculado em lote por
  `GET /attachments/exists`. Cada anexo tem visualizar, baixar e, no celular, compartilhar.
- `modals/attachment-preview/`: pré-visualização com zoom ancorado no ponto focal (lupa, pinça, roda
  do mouse na web, duplo clique) e arraste pra navegar ampliado.
- `download-file.service.ts`: no navegador baixa via blob; no APK grava em `Directory.Documents`
  (`@capacitor/filesystem`) e, pra exportação e compartilhar, abre a folha nativa (`@capacitor/share`).

### Notificações e avisos

- **Sino** no header da Home com contador de não lidas (abre `modals/notificacoes/`) e, quando há
  resumo novo, um card "Seu resumo de <mês> chegou" no topo da Home. Estado em
  `NotificacoesService` (signals), carregado fora das seções do dashboard — falha aqui não trava nada.
- **Aviso de backup** (`shared/backup-warning-banner.component.ts`): só pro usuário master, quando o
  último backup tem 30 dias ou mais (`GET /backup-status`). Aparece **uma vez por abertura do app**,
  fixo embaixo da tela, sem capturar cliques (`pointer-events: none`), e some sozinho em 5 s — a
  versão antiga ficava presa no topo e cobria os botões do header no celular.
- **Badge de Devedores** no menu lateral: parcelas vencidas não pagas (`GET /devedores/pendencias`),
  consultado só se o módulo estiver habilitado.

### Tema e acessibilidade

Tema escuro **fixo** "Slate Dark" (não segue o tema do sistema — seguir causou mistura de fundo escuro
com cards brancos), com identidade verde: `--ion-color-primary: #22c55e`, shade `#16a34a`, texto sobre
verde `#052e16`; `success` (`#10b981`) fica deliberadamente diferente do primary (marca ≠ "ganho").
Tokens em `theme/variables.scss`; o "cartão de vidro" é o mixin `ds.app-card` em `theme/_mixins.scss`,
e tabelas/botões de ícone têm estilo único em `global.scss`. Todo botão só de ícone tem `aria-label`
(checado por `scripts/check-a11y.mjs` antes do `npm test`), gráficos têm `role="img"` com uma
frase-resumo, e há piso de tamanho de fonte.

### Bundle

O chart.js não entra no bundle inicial: `shared/chart-setup.ts` registra só os controladores usados
(linha, barra, escalas, legenda, tooltip) e é importado pelos componentes de gráfico, que são lazy;
as rotas usam `NoPreloading`. O bundle inicial ficou em ~1,40 MB (≈250 KB gzip), com limite de aviso
em 1,5 MB no `angular.json`. A maior parte do que sobra é do `@ionic/core`, porque o app importa de
`@ionic/angular` (registra todos os componentes) — migrar pra `@ionic/angular/standalone` é o próximo
passo possível.

## App Android nativo (Capacitor)

O mesmo frontend vira um APK via [Capacitor](https://capacitorjs.com/) — ver
[Gerar o app Android](build-app.md). O projeto nativo vive em `frontend/android/` e usa a variante de
ambiente `environment.mobile.ts`:

- `apiUrl`: endereço HTTPS absoluto do servidor no Tailscale (`https://SEU-SERVIDOR.tailXXXX.ts.net/api`).
- `localApiUrl`: endereço HTTP do nginx na rede local. **O APK tenta a rede local primeiro**
  (`core/api-base.ts`): no startup (até 1,5 s), ao voltar pro primeiro plano e no evento `online`,
  testa `<localApiUrl>/health`; respondendo, um interceptor troca o prefixo de toda requisição,
  senão fica no Tailscale. Se uma requisição pela rede local falhar sem resposta, o app volta pro
  Tailscale e só repete sozinho GET/HEAD (um POST pode ter sido gravado antes da queda). Por ser HTTP
  puro, o cleartext é liberado só pra esse IP (`network_security_config.xml`). Vazio, desliga.
- **Login por digital**: depois de um login com "Lembrar usuário e senha", a credencial fica no
  Secure Storage nativo e a digital a libera nas próximas aberturas.
- **Bloqueio ao voltar pro app** (`core/app-lock.service.ts` + `shared/app-lock-overlay.component.ts`):
  depois de X minutos em segundo plano, um overlay acima de tudo (inclusive dos modais, que continuam
  intactos embaixo) pede digital ou PIN do aparelho. Também bloqueia na abertura a frio com token
  salvo. Câmera, seletor de arquivo e folha de compartilhar tiram o app do primeiro plano, então quem
  abre essas telas chama `markExpectedExternalActivity()` (`core/expected-exit.ts`) e o retorno
  seguinte é ignorado.
