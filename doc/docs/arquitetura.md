# Arquitetura

## Visão geral

```
Ionic (Angular)  --HTTP/JSON+JWT-->  FastAPI  --SQLAlchemy-->  SQLite
```

- O frontend Ionic consome a API FastAPI via HTTP, enviando o token JWT no header `Authorization: Bearer <token>`
  em toda requisição autenticada.
- O backend expõe rotas REST organizadas por domínio (`/auth`, `/gastos`, `/receitas`,
  `/dropdown-options`, `/resumo`, `/veiculos`, `/servicos-veiculos`, `/operacoes-bolsa`, `/devedores`,
  `/attachments`, `/backup-status`).
- O banco é um único arquivo SQLite (`vrfinance.db`), criado automaticamente pelo SQLAlchemy na primeira execução.
- Anexos (comprovantes) não ficam no banco — só o metadado; o arquivo em si vai pra
  `backend/uploads/<entity_type>/` em disco, fora do SQLite.

## Estrutura do backend

```
backend/
├── app/
│   ├── main.py            # cria o app FastAPI, registra os routers, CORS
│   ├── config.py          # variáveis de ambiente (Settings via pydantic-settings)
│   ├── database.py        # engine + SessionLocal + Base (SQLAlchemy)
│   ├── models.py           # tabelas: User, DropdownOption, Gasto, Receita, Vehicle, VehicleService,
│   │                       #   OperacaoBolsa, Devedor, Attachment
│   ├── schemas.py          # schemas Pydantic (request/response)
│   ├── security.py         # hash de senha (bcrypt) + JWT (pyjwt)
│   ├── deps.py              # get_db, get_current_user, require_master
│   ├── utils.py             # add_months (cálculo de parcelas), last_day_of_month (corte do resumo)
│   ├── seed_master.py       # script para criar o usuário master no banco
│   ├── seed_test_user.py    # script idempotente que cria o usuário "teste" com dados mocados
│   └── routers/
│       ├── auth.py
│       ├── dropdown_options.py
│       ├── gastos.py
│       ├── receitas.py
│       ├── resumo.py
│       ├── veiculos.py
│       ├── servicos_veiculos.py
│       ├── operacoes_bolsa.py
│       ├── devedores.py
│       ├── attachments.py     # router genérico de anexos, cobre os 5 módulos via entity_type/entity_id
│       └── backup_status.py
├── uploads/                # arquivos de anexo em disco (<entity_type>/<uuid>.<ext>), gitignored
├── requirements.txt
├── .env                    # segredos locais (não versionar)
└── .env.example
```

## Estrutura do frontend

O frontend é um app Ionic + Angular, gerado via `ionic start` (ver
[Setup - Frontend](setup-frontend.md)). A navegação é single-page: as rotas são `/login`, `/home`,
`/dados`, `/veiculos`, `/operacoes-bolsa` e `/devedores`.

- **Login**: única página fora do layout autenticado
- **Home** (`/home`): dashboard único — funde os resumos mensal, anual e o "Relatório geral" (totais
  por ano e por mês do calendário, somando todos os anos), cada seção com cards de métricas + gráficos
  + percentuais por categoria, mais um header com 5 botões de ação (Adicionar gasto, Adicionar receita,
  Visualizar dados, Categorias, Perfil). Um ícone de olho no header oculta/revela todos os valores
  financeiros (inclusive eixos de gráfico) — só existe nessa página
- **Visualizar dados** (`/dados`): tabelas paginadas (25 por vez, "carregar mais") de Gastos e
  Receitas, com filtro opcional por mês/ano
- **Manutenção Veículos** (`/veiculos`, só acessível pelo menu lateral): cards de resumo por veículo,
  gráfico de evolução mensal, tabela de veículos e tabela paginada de serviços de manutenção
- **Operações Bolsa** (`/operacoes-bolsa`, só acessível pelo menu lateral): tabela paginada de
  operações na bolsa, com filtro por ticker/tipo e ordenação por coluna — sem dashboard/resumo
  agregado, só tabela + CRUD
- **Devedores** (`/devedores`, só acessível pelo menu lateral): tabela paginada de parcelas de
  devedores, com filtro por devedor/status/mês/ano, ordenação por coluna, toggle rápido de status por
  linha e destaque visual da parcela do mês atual. O item "Devedores" do menu lateral ganha um badge
  com a contagem de parcelas vencidas não pagas (`GET /devedores/pendencias`)
- **Modals** (não são rotas, abrem por cima da página atual via `ModalController`): Adicionar Gasto,
  Adicionar Receita, Categorias (gerenciar itens do dropdown de Essencial/Não essencial), Editar Gasto,
  Editar Receita, Perfil (trocar senha / criar usuário / editar-excluir usuários / mudar pra conta
  teste, tudo restrito ao master, + **Sair**), Gráfico expandido (fullscreen, com seletor de janela
  12/24/36 meses), Detalhes do mês (fullscreen, read-only, tabelas de gastos/receitas do mês ordenadas
  do maior pro menor, com os 3 maiores gastos destacados), Adicionar/Editar Veículo, Adicionar/Editar
  Serviço de veículo, Adicionar/Editar Operação Bolsa, Adicionar/Editar Devedor

### Anexos (comprovantes)

Upload opcional de imagem/PDF em gastos, receitas, serviços de veículo, operações bolsa e devedores —
ver [Modelo de dados](modelo-de-dados.md#attachments) e [API](api.md#anexos). Peças reutilizadas em
`frontend/src/app/shared/`:

- `attachment-picker.component.ts`: seletor usado nos modais de Adicionar/Editar dos 5 módulos (botão
  "+ Adicionar arquivo"). Em modo de criação os arquivos ficam em espera até o registro pai salvar
  (`commit(entityId)`); em modo de edição sobem na hora.
- `attachments-popover.component.ts`: lista de download, aberta pelo ícone "Baixar anexos" (sempre o
  primeiro ícone da coluna de ações, em qualquer tabela) — só aparece nas linhas que de fato têm
  anexo, calculado em lote via `GET /attachments/exists` pra evitar uma requisição por linha.
- `download-file.service.ts` (`DownloadFileService`): no navegador, baixa via blob + `<a download>`.
  No app Android nativo (Capacitor), esse esquema não funciona (a WebView não tem gerenciador de
  downloads associado a `blob:`) — usa `@capacitor/filesystem` pra gravar direto em
  `Directory.Documents`, sem nenhum prompt de "compartilhar com qual app".

### Aviso de backup

`shared/backup-warning-banner.component.ts`: banner fixo no topo do layout principal, visível só pro
usuário master, quando fazem 30 dias ou mais desde o último backup (`GET /backup-status`) — ver
[API](api.md#backup).

## App Android nativo (Capacitor)

Além do build web, o projeto também gera um APK via [Capacitor](https://capacitorjs.com/) — ver
[Gerar o app Android](build-app.md). O projeto nativo vive em `frontend/android/` (criado por `npx cap
add android`, versionado) e usa uma terceira variante de ambiente,
`frontend/src/environments/environment.mobile.ts`, com `apiUrl` absoluto via Tailscale — diferente do
`environment.prod.ts` do build web, que usa `/api` relativo (funciona só atrás do proxy do nginx).

No desktop (≥992px), os modals abrem ancorados na borda direita da tela (painel lateral, não
centralizados), e o menu lateral é oculto por padrão, expandindo no hover — com um botão de pin pra
fixá-lo aberto. Abaixo de 992px, o app usa o `ion-split-pane` padrão do Ionic (menu sempre visível
≥768px, escondido atrás de um hambúrguer abaixo disso) e modals centralizados/fullscreen — essa é a
faixa de touch, onde o hover não existe.

O tema visual é fixo (dark mode "Slate Dark", não segue o tema do sistema), definido em
`frontend/src/theme/variables.scss`.
