# Gerar o app Android (APK)

Além do web servido pelo nginx no celular (ver [Deploy](deploy-android-tailscale.md)), o projeto
também pode gerar um **app Android nativo** via [Capacitor](https://capacitorjs.com/), empacotando o
mesmo frontend Ionic num APK que se instala direto no celular (sideload), sem passar pela Play Store.

## Por que existe um build separado

O app nativo não roda dentro de um domínio servido pelo nginx — não existe um `/api` relativo para
ele apontar. Por isso existe uma terceira variante de ambiente, `environment.mobile.ts`, com uma URL
**absoluta** via Tailscale — assim o app funciona de qualquer lugar, não só na rede local, contanto que
o Tailscale esteja ativo no celular que roda o app e no celular servidor (ver
[Deploy](deploy-android-tailscale.md)).

Usa o **hostname MagicDNS** do celular servidor (`http://<nome>.tailXXXX.ts.net:8080/api`), não o IP
numérico — o IP do Tailscale já é estável (não muda com queda de luz), mas o hostname é ainda mais
resistente: continua igual mesmo no cenário raro de o celular ser removido e readicionado ao tailnet
(o que pode gerar um IP novo, mas mantém o nome se você renomear o dispositivo igual). Exige MagicDNS
habilitado em [login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns).

## Rede: acessar uma API em HTTP puro (sem TLS) exige dois ajustes

Como a API roda via Tailscale sem certificado (`http://`, não `https://`), o app nativo precisa de
**dois** ajustes específicos — faltar qualquer um dos dois quebra silenciosamente todas as chamadas
à API (não só o login), e o sintoma característico é um erro **instantâneo** ("Usuário ou senha
inválidos" ou qualquer outro erro de request), sem nenhuma demora perceptível de rede — isso é o sinal
de que a requisição foi bloqueada no próprio dispositivo, antes de sequer tentar a conexão. Testar a
mesma credencial direto via `curl` contra a API ajuda a confirmar: se funciona por `curl` mas falha
instantaneamente no app, é bloqueio de plataforma, não credencial/servidor.

1. **Cleartext bloqueado por padrão (Android 9+)**: apps não conseguem fazer requisições HTTP puras
   pra nenhum host por padrão. Resolvido com um `network_security_config.xml` liberando cleartext só
   para o hostname do Tailscale (não globalmente):

   ```xml title="frontend/android/app/src/main/res/xml/network_security_config.xml"
   <network-security-config>
       <domain-config cleartextTrafficPermitted="true">
           <domain includeSubdomains="true">SEU-CELULAR.tailXXXX.ts.net</domain>
       </domain-config>
   </network-security-config>
   ```

   Referenciado no `<application>` do `AndroidManifest.xml` via
   `android:networkSecurityConfig="@xml/network_security_config"`. O tráfego já é criptografado pelo
   túnel WireGuard do Tailscale mesmo sem HTTPS na camada da aplicação — não é uma regressão de
   segurança real.

2. **"Conteúdo misto" (mixed content), independente do item acima**: mesmo com cleartext liberado, o
   login continuava falhando do mesmo jeito instantâneo. Causa: o Capacitor por padrão serve as
   próprias páginas do app em `https://localhost` (um esquema interno dele, sem TLS real por trás) —
   uma página "https" chamando uma API "http" é bloqueado pelo motor do WebView como mixed content,
   e esse bloqueio **não tem nada a ver** com o `network_security_config` (que resolve só o bloqueio de
   cleartext do Android, não o de mixed content do WebView). Resolvido fazendo o próprio app também
   ser servido em `http`, eliminando o descompasso de esquemas:

   ```ts title="frontend/capacitor.config.ts"
   const config: CapacitorConfig = {
     // ...
     server: {
       androidScheme: 'http',
     },
   };
   ```

## Pré-requisitos (uma vez por máquina nova)

Diferente do build web (que só precisa de Node), o build do APK precisa de um **JDK** e do **Android
SDK**. Passos testados nesta máquina (Windows):

### 1. JDK 21

O Capacitor/Android Gradle Plugin atual exige nível de linguagem Java 21 — **JDK 17 não é suficiente**
(erro `invalid source release: 21` na task `compileDebugJavaWithJavac` se usar um JDK mais antigo).

```powershell
winget install --id Microsoft.OpenJDK.21
```

Instala em `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot` (o número de versão exato pode variar
um pouco entre atualizações do winget).

### 2. Android SDK — command-line tools

Não precisa do Android Studio completo, só as ferramentas de linha de comando:

1. Baixe o "Command line tools" para Windows em
   [developer.android.com/studio#command-line-tools-only](https://developer.android.com/studio#command-line-tools-only)
2. Extraia de forma que a estrutura final fique `C:\Android\sdk\cmdline-tools\latest\bin\...`
   (o zip vem com uma pasta `cmdline-tools/` na raiz — ela precisa ficar dentro de outra pasta chamada
   `latest`, é assim que o `sdkmanager` espera encontrar as coisas)
3. Aceite as licenças e instale os pacotes usados pelo projeto (versões definidas em
   `frontend/android/variables.gradle` — `compileSdkVersion`/`targetSdkVersion` atualmente 36):

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root="C:\Android\sdk" --licenses
C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root="C:\Android\sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

O `--licenses` é interativo (pede "y" pra cada licença); num terminal normal, digite `y` e Enter pra
cada uma até aparecer "All SDK package licenses accepted".

### 3. Apontar o projeto Android pro SDK (`local.properties`)

```powershell
cd frontend/android
echo sdk.dir=C:/Android/sdk > local.properties
```

!!! danger "Use `/`, não `\`, nesse arquivo"
    Foi o bug mais chato de descobrir nesta configuração. `local.properties` é lido como um arquivo
    `.properties` do Java, onde `\` é caractere de escape — `sdk.dir=C:\Android\sdk` é interpretado
    como `sdk.dir=C:Androidsdk` (as barras somem silenciosamente), e o Gradle falha bem mais adiante
    com um erro genérico (`java.io.IOException: A sintaxe do nome do arquivo... está incorreta` dentro
    de `SdkLocator.validateSdkPath`), sem indicar que o problema é esse arquivo. Usar `/` evita o
    problema inteiro.

### 4. `gradle.properties` — caminho do projeto com caractere não-ASCII

Se o caminho do projeto tiver algum caractere não-ASCII (acento, ç, etc. — comum em pastas tipo "Área
de Trabalho" de um Windows em português), o Android Gradle Plugin recusa o build por padrão. Isso já
está corrigido em `frontend/android/gradle.properties` (versionado, não precisa repetir numa máquina
nova):

```
android.overridePathCheck=true
```

## Dia a dia: gerar o APK

Com o ambiente acima já configurado uma vez, gerar um novo APK (depois de mudanças no frontend) é
automatizado pelo `menu.bat` na raiz do projeto:

**`menu.bat` → 5. Criar build APP (gerar APK Android)**

Isso builda o frontend com a configuração `mobile` (`environment.mobile.ts`), roda `npx cap sync
android` (copia o build novo pro projeto nativo e atualiza os plugins do Capacitor) e depois
`gradlew assembleDebug`. O APK final é movido para a raiz do projeto como
`VRFinance-<data>-<hora>.apk`.

Rodando manualmente, os mesmos passos são:

```powershell
cd frontend
npx ng build --configuration=mobile
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
.\gradlew.bat assembleDebug
```

O APK fica em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

## Instalar no celular

É um build de **debug**, sem assinatura de release — suficiente pra instalar via sideload (não passa
pela Play Store). Copie o `.apk` pro celular (cabo USB, Google Drive, WhatsApp Web, etc.) e abra o
arquivo — na primeira instalação o Android vai pedir para habilitar "instalar de fontes desconhecidas"
para o app usado para abrir o arquivo (Arquivos, Chrome, etc.).

## Identidade do app

Definida em `frontend/capacitor.config.ts` (`appId` em formato reverse-DNS, `appName` livre):

```ts
appId: 'com.suaempresa.vrfinance',
appName: 'VR Finance',
```

## Ícone do app

Gerado a partir do mesmo favicon usado na versão web (`frontend/src/assets/icon/favicon.svg`, o "$"
branco sobre fundo indigo) — antes disso o app instalado usava o ícone placeholder padrão do
Capacitor/Android, sem nenhuma relação visual com o resto do projeto. As fontes ficam em
`frontend/resources/` (`icon.png` para o ícone legado, `icon-foreground.png`/`icon-background.png`
para o ícone adaptativo do Android 8+), e os mipmaps em `frontend/android/app/src/main/res/mipmap-*/`
são regenerados com:

```powershell
npx @capacitor/assets generate --android
```

Só precisa ser rodado de novo se o favicon/ícone de origem mudar — os mipmaps gerados ficam
versionados, não fazem parte do fluxo normal de build do APK.
