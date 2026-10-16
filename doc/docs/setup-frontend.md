# Setup - Frontend

Pré-requisitos: **Node.js 24** (exigência do Angular CLI 22) e npm 11, num ambiente Linux com bash.

!!! note "Isso é sobre rodar o frontend que já existe"
    O projeto Ionic + Angular 22 (`frontend/`, standalone components) já está versionado. Numa máquina
    nova, **não** rode `ionic start` de novo — isso criaria um projeto do zero, sobrescrevendo o que
    já existe. Só instale as dependências (passo 2 abaixo).

## 1. Node via `nvm` e Ionic CLI

O Node é instalado em espaço de usuário com o [nvm](https://github.com/nvm-sh/nvm) (sem `sudo`, sem
depender da versão do `apt`):

```bash
nvm install 24
nvm use 24
npm install -g @ionic/cli
```

O `menu.sh` já faz `source ~/.nvm/nvm.sh` no topo, então as opções dele enxergam o Node certo mesmo
num terminal que não carregou o nvm.

## 2. Instalar as dependências do projeto

```bash
cd frontend
npm install
```

!!! warning "`node_modules` copiado de outro sistema não funciona"
    Algumas dependências têm binários nativos por plataforma (ex: `@esbuild/win32-x64` vs.
    `@esbuild/linux-x64`). Um `node_modules` vindo do Windows quebra no Linux — apague a pasta e rode
    `npm install` de novo.

## 3. Rodar em modo desenvolvimento

```bash
ionic serve
```

Abre em `http://localhost:8100` com hot-reload, consumindo a API em `http://localhost:8000` (URL
configurada em `src/environments/environment.ts`).

No dia a dia, o mais simples é `./menu.sh` na raiz → **1. Aplicação e testes** → **1. Iniciar
aplicação** — sobe backend e frontend juntos, cada um na sua janela de terminal.

## 4. Arquivos de ambiente (`src/environments/`)

Três variantes, escolhidas via `--configuration` do Angular. Todas têm `apiUrl` e `localApiUrl`:

| arquivo | usado por | `apiUrl` | `localApiUrl` |
|---|---|---|---|
| `environment.ts` | `ionic serve` (dev local) | `http://localhost:8000` | vazio |
| `environment.prod.ts` | build web do deploy (`ionic build --prod`) | `/api` (relativo — passa pelo proxy do nginx, funciona em qualquer endereço que sirva o site) | vazio |
| `environment.mobile.ts` | APK Android (ver [Gerar o app Android](build-app.md)) | `https://SEU-SERVIDOR.tailXXXX.ts.net/api` (HTTPS via Tailscale, hostname MagicDNS) | `http://IP-LOCAL-DO-SERVIDOR:8080/api` |

O app nativo não roda dentro de um domínio servido pelo nginx, por isso precisa de URL absoluta. Ele
**tenta a rede local primeiro**: no startup, ao voltar pro primeiro plano e quando a rede volta,
`core/api-base.ts` testa `<localApiUrl>/health`; se responder, um interceptor troca o prefixo de toda
requisição pro endereço local; senão, usa o Tailscale. `localApiUrl: ''` desliga a tentativa.
Detalhes em [Deploy (Ubuntu Server + Tailscale)](deploy-ubuntu-tailscale.md#5-rede-local-primeiro).

## 5. Build de produção (para o deploy web)

```bash
ionic build --prod
```

Gera os arquivos estáticos em `frontend/www/`, servidos pelo nginx do servidor (ver
[Deploy](deploy-ubuntu-tailscale.md)). Já automatizado em `./menu.sh` → **2. Deploy para o
servidor**.

## 6. Testes

Builder do Angular 22 (`@angular/build:unit-test`), que roda **Vitest** (não Karma/Jasmine):

```bash
npm test
```

O `npm test` roda antes o `scripts/check-a11y.mjs`, que falha se algum botão só de ícone ficar sem
`aria-label` (também disponível sozinho em `npm run check:a11y`). Ou pelo menu: `./menu.sh` → **1** →
**3. Iniciar testes frontend**.

!!! tip "Padrões das specs"
    Specs com `ModalController`/`RouterLink` precisam de `provideIonicAngular()`/`provideRouter([])`;
    serviços HTTP usam `provideHttpClient()` + `provideHttpClientTesting()`. Para algo que chama
    `Router.navigateByUrl`, mocke o `Router` direto. `vi.mock` de imports relativos não é suportado
    pelo runner do Angular — prefira mock via DI.

## 7. Build do app Android (APK)

Requer um ambiente extra (JDK 21, Android SDK) — ver [Gerar o app Android](build-app.md).
