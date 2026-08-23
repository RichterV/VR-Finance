# VR Finance

Aplicativo pessoal de controle financeiro que criei pra organizar meus proprios gastos
e receitas, e como projeto de estudo (FastAPI + Ionic/Angular + SQLite, com app Android
nativo via Capacitor). Estou disponibilizando o codigo aqui porque pode ser util pra
quem quiser algo parecido, quiser estudar a stack ou so der uma olhada em como foi
construido -- nao e um produto polido nem pretende virar um, e as decisoes de escopo
foram tomadas em cima das minhas proprias necessidades.

## Funcionalidades

- **Dashboard** (Home): resumo mensal, resumo anual e um relatorio geral historico,
  com graficos de evolucao mensal (gastos essenciais/nao essenciais, caixa real),
  caixa pretendido vs. real, e totais por ano/mes pra ver sazonalidade.
- **Gastos**: cadastro com prioridade (essencial/nao essencial), categoria
  personalizavel, e suporte a compras parceladas (gera uma linha por mes
  automaticamente).
- **Receitas**: cadastro com um percentual configuravel de "caixa" (quanto da receita
  vira reserva).
- **Categorias**: gerenciamento das categorias de gasto (criar/editar/excluir com soft
  delete, pra nao quebrar o historico).
- **Visualizar dados**: tabelas paginadas e ordenaveis de todos os gastos/receitas, com
  filtro por mes/ano, edicao e exclusao.
- **Manutencao de veiculos**: modulo separado pra registrar servicos (peca, mao de
  obra), custo e quilometragem por veiculo, com grafico de evolucao de gastos.
- **Autenticacao**: JWT, com um usuario master que pode criar outros usuarios; os
  dados financeiros sao isolados por usuario.
- **Modo privacidade**: um botao oculta todos os valores da tela (util pra usar em
  publico).
- **Dark mode** fixo, com layout responsivo (menu lateral no desktop, navegacao
  simplificada no mobile).
- **App Android nativo** (Capacitor) alem da versao web, pra usar direto do celular.
- Suite de testes automatizados (pytest no backend, Vitest no frontend).

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: Ionic + Angular (standalone components, sem NgModules)
- App mobile: Capacitor (Android)
- Docs: mkdocs-material (pasta `doc/`)

## Rodando localmente

1. **Backend**: `cd backend`, crie um venv, `pip install -r requirements.txt`, copie
   `.env.example` pra `.env` e preencha `SECRET_KEY`/`MASTER_USERNAME`/
   `MASTER_PASSWORD`, rode `python -m app.seed_master` e depois
   `uvicorn app.main:app --reload`.
2. **Frontend**: `cd frontend`, `npm install`, `ionic serve` (usa
   `environment.ts`, que ja aponta pro backend local em `http://localhost:8000`).

Ver `doc/` (arquitetura, modelo de dados, autenticacao, API, guias de setup) pra mais
detalhes.

## Sobre esta copia (placeholders)

Este repositorio e uma copia sanitizada do meu projeto pessoal -- enderecos, hostname
do meu Tailscale e usuarios reais foram trocados por placeholders genericos antes de
publicar. Se for alem de rodar localmente (deploy num servidor proprio, gerar o APK
Android), ajuste pro seu proprio ambiente:

- `frontend/src/environments/environment.mobile.ts` e
  `frontend/android/app/src/main/res/xml/network_security_config.xml` (endereco real
  do seu servidor, se for gerar o app Android nativo).
- `menu.bat` (topo do arquivo: `REMOTE_USER`, `REMOTE_HOST`, `REMOTE_PORT` do seu
  proprio servidor).
- `frontend/capacitor.config.ts`, `frontend/android/app/build.gradle` e
  `frontend/android/app/src/main/res/values/strings.xml` usam o appId de exemplo
  `com.example.vrfinance` -- troque pelo seu proprio antes de publicar um app de
  verdade.

`frontend/android/app/src/main/assets/` nao vem neste repositorio de proposito (e o
build web compilado, embutiria enderecos/config antigos nos arquivos .js minificados).
Antes de gerar o APK, rode `npx ng build --configuration=mobile` seguido de
`npx cap sync android` dentro de `frontend/` pra recriar essa pasta a partir do zero.