# Arquitetura

## Visão geral

```
Ionic (Angular)  --HTTP/JSON+JWT-->  FastAPI  --SQLAlchemy-->  SQLite
```

- O frontend Ionic consome a API FastAPI via HTTP, enviando o token JWT no header `Authorization: Bearer <token>`
  em toda requisição autenticada.
- O backend expõe rotas REST organizadas por domínio (`/auth`, `/gastos`, `/receitas`,
  `/dropdown-options`, `/resumo`, `/veiculos`, `/servicos-veiculos`).
- O banco é um único arquivo SQLite (`vrfinance.db`), criado automaticamente pelo SQLAlchemy na primeira execução.

## Estrutura do backend

```
backend/
├── app/
│   ├── main.py            # cria o app FastAPI, registra os routers, CORS
│   ├── config.py          # variáveis de ambiente (Settings via pydantic-settings)
│   ├── database.py        # engine + SessionLocal + Base (SQLAlchemy)
│   ├── models.py           # tabelas: User, DropdownOption, Gasto, Receita, Vehicle, VehicleService
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
│       └── servicos_veiculos.py
├── requirements.txt
├── .env                    # segredos locais (não versionar)
└── .env.example
```

## Estrutura do frontend

O frontend é um app Ionic + Angular, gerado via `ionic start` (ver
[Setup - Frontend](setup-frontend.md)). A navegação é single-page: só existem as rotas `/login`,
`/home`, `/dados` e `/veiculos`.

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
- **Modals** (não são rotas, abrem por cima da página atual via `ModalController`): Adicionar Gasto,
  Adicionar Receita, Categorias (gerenciar itens do dropdown de Essencial/Não essencial), Editar Gasto,
  Editar Receita, Perfil (trocar senha / criar usuário / editar-excluir usuários / mudar pra conta
  teste, tudo restrito ao master, + **Sair**), Gráfico expandido (fullscreen, com seletor de janela
  12/24/36 meses), Detalhes do mês (fullscreen, read-only, tabelas de gastos/receitas do mês ordenadas
  do maior pro menor, com os 3 maiores gastos destacados), Adicionar/Editar Veículo, Adicionar/Editar
  Serviço de veículo

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
