# VR Finance

Aplicativo pessoal de controle financeiro que criei pra organizar meus próprios gastos
e receitas, e como projeto de estudo (FastAPI + Ionic/Angular + SQLite, com app Android
nativo via Capacitor). Estou disponibilizando o código aqui porque pode ser útil pra
quem quiser algo parecido, quiser estudar a stack ou só quiser dar uma olhada em como foi
construído -- não é um produto polido nem pretende virar um, e as decisões de escopo
foram tomadas em cima das minhas próprias necessidades.

## Funcionalidades

- **Dashboard** (Home): resumo mensal, resumo anual e um relatório geral histórico,
  com gráficos de evolução mensal (gastos essenciais/não essenciais, caixa real),
  caixa pretendido vs. real, e totais por ano/mês pra ver sazonalidade.
- **Gastos**: cadastro com prioridade (essencial/não essencial), categoria
  personalizável, e suporte a compras parceladas (gera uma linha por mês
  automaticamente).
- **Receitas**: cadastro com um percentual configurável de "caixa" (quanto da receita
  vira reserva).
- **Categorias**: gerenciamento das categorias de gasto (criar/editar/excluir com soft
  delete, pra não quebrar o histórico).
- **Visualizar dados**: tabelas paginadas e ordenáveis de todos os gastos/receitas, com
  filtro por mês/ano, edição e exclusão.
- **Manutenção de veículos**: módulo separado pra registrar serviços (peça, mão de
  obra), custo e quilometragem por veículo, com gráfico de evolução de gastos.
- **Autenticação**: JWT, com um usuário master que pode criar outros usuários; os
  dados financeiros são isolados por usuário.
- **Modo privacidade**: um botão oculta todos os valores da tela (útil pra usar em
  público).
- **Dark mode** fixo, com layout responsivo (menu lateral no desktop, navegação
  simplificada no mobile).
- **App Android nativo** (Capacitor) além da versão web, pra usar direto do celular.
- Suíte de testes automatizados (pytest no backend, Vitest no frontend).

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
   `environment.ts`, que já aponta pro backend local em `http://localhost:8000`).

Ver `doc/` (arquitetura, modelo de dados, autenticação, API, guias de setup) pra mais
detalhes.

## Sobre esta cópia (placeholders)

Este repositório é uma cópia sanitizada do meu projeto pessoal -- endereços, hostname
do meu Tailscale e usuários reais foram trocados por placeholders genéricos antes de
publicar. Se for além de rodar localmente (deploy num servidor próprio, gerar o APK
Android), ajuste pro seu próprio ambiente:

- `frontend/src/environments/environment.mobile.ts` e
  `frontend/android/app/src/main/res/xml/network_security_config.xml` (endereço real
  do seu servidor, se for gerar o app Android nativo).
- `menu.bat` (topo do arquivo: `REMOTE_USER`, `REMOTE_HOST`, `REMOTE_PORT` do seu
  próprio servidor).
- `frontend/capacitor.config.ts`, `frontend/android/app/build.gradle` e
  `frontend/android/app/src/main/res/values/strings.xml` usam o appId de exemplo
  `com.example.vrfinance` -- troque pelo seu próprio antes de publicar um app de
  verdade.

`frontend/android/app/src/main/assets/` não vem neste repositório de propósito -- é o
build web compilado, e embutiria endereços/config antigos nos arquivos .js minificados.
Antes de gerar o APK, rode `npx ng build --configuration=mobile` seguido de
`npx cap sync android` dentro de `frontend/` pra recriar essa pasta a partir do zero.
