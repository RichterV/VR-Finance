# Setup - Frontend

Pré-requisitos: **Node.js 24** e **npm 11** (`node --version` / `npm --version` para confirmar).

!!! note "Isso é sobre rodar o frontend que já existe"
    O projeto Ionic (`frontend/`) já foi criado (via `ionic start`) e está versionado dentro do
    repositório. Numa máquina nova, **não** rode `ionic start` de novo — isso criaria um projeto do
    zero, sobrescrevendo o que já existe. Só instale as dependências (passo 2 abaixo).

## 1. Instalar o Ionic CLI (uma vez, globalmente)

```powershell
npm install -g @ionic/cli
```

## 2. Instalar as dependências do projeto

```powershell
cd frontend
npm install
```

## 3. Rodar em modo desenvolvimento

```powershell
ionic serve
```

Abre em `http://localhost:8100` com hot-reload, consumindo a API em `http://localhost:8000` (URL
configurada em `src/environments/environment.ts`).

No dia a dia, o mais simples é rodar o `menu.bat` na raiz do projeto → **1. Aplicação e testes** →
**1. Iniciar aplicação** — ele já sobe backend e frontend juntos, cada um em sua própria janela de
terminal.

!!! warning "Projeto dentro do OneDrive"
    Pelo mesmo motivo citado em [Setup - Backend](setup-backend.md), o `ionic serve` (vite por baixo)
    também pode parar de recarregar depois de algumas edições, se a pasta estiver sincronizada pelo
    OneDrive. Sintoma: a página não reflete uma mudança que devia ter aparecido. Solução: fechar a
    janela do `ionic serve` e rodar de novo.

## 4. Arquivos de ambiente (`src/environments/`)

Três variantes, cada uma com um `apiUrl` diferente, escolhidas via `--configuration` do Angular:

| arquivo | usado por | `apiUrl` |
|---|---|---|
| `environment.ts` | `ionic serve` (dev local) | `http://localhost:8000` |
| `environment.prod.ts` | build web pro deploy (`ionic build --prod`) | `/api` (caminho relativo — funciona através do proxy do nginx no celular, em qualquer dispositivo que acesse o IP dele) |
| `environment.mobile.ts` | build do app Android nativo (ver [Gerar o app Android](build-app.md)) | URL absoluta via Tailscale, usando o hostname MagicDNS (`http://<nome>.tailXXXX.ts.net:8080/api`) em vez do IP — precisa ser absoluta porque o app nativo não roda dentro de um domínio servido pelo nginx; o hostname é preferível ao IP porque continua igual mesmo se o IP do Tailscale mudar |

## 5. Build de produção (para o deploy web)

```powershell
ionic build --prod
```

Gera os arquivos estáticos em `frontend/www/`, servidos pelo nginx no celular (ver
[Deploy](deploy-android-tailscale.md)). Isso já está automatizado no `menu.bat` → **2. Deploy para o
servidor**.

## 6. Testes

Builder do Angular 22 (`@angular/build:unit-test`), roda **Vitest** (não Karma/Jasmine):

```powershell
npm test
```

## 7. Build do app Android (APK)

Requer um ambiente extra (JDK, Android SDK) — ver a página dedicada [Gerar o app Android](build-app.md).
