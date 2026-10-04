# Gerar o app Android (APK)

Além do build web servido pelo nginx do servidor (ver [Deploy](deploy-ubuntu-tailscale.md)), o
projeto gera um **app Android nativo** via [Capacitor](https://capacitorjs.com/) (Capacitor 8,
`frontend/android/`, versionado), empacotando o mesmo frontend Ionic num APK de debug instalado por
sideload, sem Play Store.

## Por que existe um build separado

O app nativo não roda dentro de um domínio servido pelo nginx — não existe um `/api` relativo para
ele apontar. Por isso existe a variante `environment.mobile.ts`, com URLs **absolutas**:

```ts title="frontend/src/environments/environment.mobile.ts"
export const environment = {
  production: true,
  apiUrl: 'https://SEU-SERVIDOR.tailXXXX.ts.net/api',      // Tailscale (HTTPS)
  localApiUrl: 'http://IP-LOCAL-DO-SERVIDOR:8080/api',     // rede de casa, tentada primeiro
};
```

- `apiUrl` usa o **hostname MagicDNS** do servidor (exige MagicDNS e HTTPS habilitados no painel do
  Tailscale). O certificado só vale pro hostname, nunca pro IP. Funciona de qualquer lugar, contanto
  que o Tailscale esteja ativo no celular.
- `localApiUrl` é testado antes (`/health`, até 1,5s no startup); respondendo, o app fala direto com o
  nginx na LAN. Vazio desliga.
- Para trocar o endereço do Tailscale: `./menu.sh` → **6** → **2** (reescreve só a linha `apiUrl:`) e
  gere um APK novo — o endereço fica embutido no build.

## Rede: HTTPS por padrão, HTTP só na rede local

Desde 2026-09-26 a API é servida em **HTTPS** pelo `tailscale serve` (ver
[Deploy](deploy-ubuntu-tailscale.md#4-https-via-tailscale)), então o app voltou ao padrão do Capacitor:
as páginas dele são servidas em `https://localhost`, sem `server.androidScheme` no
`capacitor.config.ts`.

Os dois contornos de HTTP puro continuam existindo, mas **só pro acesso pela rede local** (o nginx na
LAN é `http://`, porque o certificado não vale pro IP):

1. **Conteúdo misto** — uma página `https://localhost` chamando uma API `http://` é bloqueada pelo
   WebView. Liberado em `capacitor.config.ts`:

    ```ts title="frontend/capacitor.config.ts"
    android: {
      allowMixedContent: true,
    },
    ```

2. **Cleartext bloqueado (Android 9+)** — liberado **só pro IP local do servidor**, todo o resto
   continua exigindo HTTPS:

    ```xml title="frontend/android/app/src/main/res/xml/network_security_config.xml"
    <network-security-config>
        <domain-config cleartextTrafficPermitted="true">
            <domain includeSubdomains="false">IP-LOCAL-DO-SERVIDOR</domain>
        </domain-config>
    </network-security-config>
    ```

    Referenciado no `<application>` do `AndroidManifest.xml` via
    `android:networkSecurityConfig="@xml/network_security_config"`.

!!! warning "Na LAN o tráfego vai sem criptografia"
    Pela rede local, senha e JWT trafegam em HTTP puro. É uma troca consciente (velocidade em casa);
    fora de casa o app usa o Tailscale com HTTPS.

!!! tip "Sintoma de bloqueio no próprio aparelho"
    Um erro **instantâneo** em qualquer requisição (ex: "Usuário ou senha inválidos" sem nenhuma
    demora de rede) indica bloqueio client-side (cleartext ou conteúdo misto), não credencial errada.
    Se a mesma credencial funciona via `curl` contra a API, é bloqueio de plataforma.

## Plugins nativos

Confira as versões em `frontend/package.json`:

| plugin | uso |
|---|---|
| `@aparajita/capacitor-biometric-auth` (10.x, a única major compatível com Capacitor 8) | login por digital e bloqueio ao voltar pro app |
| `@aparajita/capacitor-secure-storage` | guarda usuário/senha lembrados e a flag de biometria |
| `@capacitor/filesystem` | baixar anexo direto em Documentos, sem prompt |
| `@capacitor/share` | compartilhar anexo e a exportação de dados (folha nativa de compartilhar) |
| `@capacitor/app` | eventos de primeiro/segundo plano (bloqueio, troca rede local/Tailscale), botão voltar |
| `@capacitor/haptics`, `@capacitor/keyboard`, `@capacitor/status-bar` | plugins padrão do template Ionic |

A foto da câmera nos anexos não usa plugin: é um `<input type="file" capture="environment">`, que o
Capacitor trata abrindo o app de câmera. O manifest **não** declara `CAMERA` de propósito (declarar
faria o Capacitor pedir a permissão em runtime).

### Login por digital e bloqueio do app (resumo)

- **Login por digital**: depois de um login manual com "Lembrar usuário e senha", o app oferece
  ativar a digital. Nas próximas aberturas, aparece uma tela de digital que reenvia a credencial
  salva pro `/auth/login` (gera um JWT novo).
- **Bloqueio ao voltar pro app**: depois de X minutos em segundo plano (Perfil → Segurança:
  imediatamente / 1 / 5 / 15 min / nunca; padrão 5 min se a digital estiver ativa), um overlay pede a
  digital (ou PIN/padrão do Android). Abertura a frio com token salvo também bloqueia. Câmera, seletor
  de arquivo e folha de compartilhar não disparam o bloqueio (`markExpectedExternalActivity()`).

## Pré-requisitos (uma vez por máquina nova)

O build do APK precisa de um **JDK 21** e do **Android SDK**. Tudo instalado em espaço de usuário,
sem `sudo` e sem Android Studio:

### 1. JDK 21

O Android Gradle Plugin atual exige Java 21 — **JDK 17 não é suficiente** (erro
`invalid source release: 21` em `compileDebugJavaWithJavac`). Baixe o tarball do
[Eclipse Temurin 21](https://adoptium.net/temurin/releases/?version=21) (Linux x64) e extraia em
`~/jdk/`:

```bash
mkdir -p ~/jdk
tar xzf OpenJDK21U-jdk_x64_linux_hotspot_*.tar.gz -C ~/jdk
ls ~/jdk   # ex: jdk-21.0.12.1+1
```

### 2. Android SDK — command-line tools

1. Baixe o "Command line tools only" para Linux em
   [developer.android.com/studio#command-line-tools-only](https://developer.android.com/studio#command-line-tools-only)
2. Extraia de forma que a estrutura final fique `~/Android/sdk/cmdline-tools/latest/bin/...` (o zip
   vem com uma pasta `cmdline-tools/` que precisa ficar dentro de outra chamada `latest`)
3. Aceite as licenças e instale os pacotes (versões batendo com `compileSdkVersion`/`targetSdkVersion`
   = 36 em `frontend/android/variables.gradle`):

```bash
export JAVA_HOME=~/jdk/jdk-21.0.12.1+1
export PATH="$JAVA_HOME/bin:$PATH"
SDK=~/Android/sdk
$SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK --licenses
$SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

### 3. Apontar o projeto pro SDK (`local.properties`)

```bash
echo "sdk.dir=$HOME/Android/sdk" > frontend/android/local.properties
```

(caminho absoluto; o arquivo não é versionado.)

### 4. Apontar o `menu.sh` pros dois

No topo do `menu.sh`, `BUILD_JAVA_HOME` (`$HOME/jdk/jdk-21...`) e `BUILD_ANDROID_SDK`
(`$HOME/Android/sdk`) — ajuste se a versão extraída do JDK for outra.

## Dia a dia: gerar o APK

**`./menu.sh` → 5. Criar build APP (gerar APK Android)**

Builda o frontend com a configuração `mobile`, roda `npx cap sync android` (copia o build pro projeto
nativo e atualiza os plugins) e `./gradlew assembleDebug`. O APK final é movido pra raiz do projeto
como `VRFinance-<data>-<hora>.apk`.

Manualmente, os mesmos passos:

```bash
cd frontend
npx ng build --configuration=mobile
npx cap sync android
cd android
export JAVA_HOME=~/jdk/jdk-21.0.12.1+1 ANDROID_HOME=~/Android/sdk
./gradlew assembleDebug
```

O APK fica em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

## Instalar no celular

É um build de **debug**, sem assinatura de release — suficiente pra sideload. Copie o `.apk` pro
celular (cabo USB, Google Drive, etc.) e abra o arquivo — na primeira instalação o Android pede para
habilitar "instalar de fontes desconhecidas" para o app usado para abrir o arquivo.

!!! note "Pode pedir login de novo"
    Mudanças na origem do WebView (como a ida de `http://localhost` para `https://localhost` em
    2026-09-26) ou na forma do token (revogação por `token_version`) fazem o app pedir login uma vez
    depois de instalar o APK novo. A credencial lembrada/digital fica no Secure Storage nativo e não
    é afetada.

## Identidade do app

Definida em `frontend/capacitor.config.ts` (`appId` em formato reverse-DNS, `appName` livre):

```ts
appId: 'com.suaempresa.vrfinance',
appName: 'VR Finance',
```

## Ícone do app

O mesmo "$" do favicon web (`frontend/src/assets/icon/favicon.svg`), escuro sobre **fundo verde** (a
identidade visual trocou de indigo pra verde em 2026-09-13). As fontes ficam em `frontend/resources/`
(`icon.png` legado, `icon-foreground.png`/`icon-background.png` pro ícone adaptativo), e os mipmaps
em `frontend/android/app/src/main/res/mipmap-*/` são regenerados com:

```bash
npx @capacitor/assets generate --android
```

Só precisa rodar de novo se o ícone de origem mudar — os mipmaps ficam versionados.

## Histórico e pegadinhas

Registradas porque custaram tempo — algumas valem só no Windows, onde o build era feito até
2026-09-17.

- **`local.properties` com `\` (Windows)**: o arquivo é lido como `.properties` do Java, onde `\` é
  escape — `sdk.dir=C:\Android\sdk` vira `C:Androidsdk` silenciosamente, e o Gradle falha bem depois
  com `java.io.IOException: A sintaxe do nome do arquivo... está incorreta` (em
  `SdkLocator.validateSdkPath`). Use sempre `/`.
- **Caminho do projeto com acento**: o Android Gradle Plugin recusa por padrão caminhos com
  caracteres não-ASCII (ex: "Área de Trabalho"). Corrigido com `android.overridePathCheck=true` em
  `frontend/android/gradle.properties` (versionado).
- **Quando a API era HTTP puro** (até 2026-09-26): além de liberar cleartext pro hostname do Tailscale
  no `network_security_config.xml`, era preciso `server: { androidScheme: 'http' }` no
  `capacitor.config.ts` — sem isso o WebView (em `https://localhost`) bloqueava a API `http://` como
  conteúdo misto, um bloqueio independente do cleartext do Android. Os dois saíram com o HTTPS; hoje
  só sobra a liberação restrita ao IP local descrita acima.
- **Download de anexo**: `<a download>` com `blob:` não faz nada no WebView do Capacitor (não há
  gerenciador de downloads) — por isso o `@capacitor/filesystem`. Exportar Dados usa a folha de
  compartilhar porque `Directory.Documents`, no Android 11+, fica invisível fora do próprio app.
