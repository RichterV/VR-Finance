@echo off
setlocal enabledelayedexpansion

rem Pressupoe acesso SSH sem senha ja configurado (ver doc/docs/deploy-android-tailscale.md, secao "1. Acesso SSH sem senha").
set "REMOTE_USER=u0_a000"
set "REMOTE_PORT=8022"
rem Usa o hostname MagicDNS do Tailscale por padrao (funciona de qualquer lugar, nao so na Wi-Fi de
rem casa) -- so precisa do Tailscale ativo neste PC e no celular. "server-ip.txt" permite sobrescrever
rem (ex: forcar o IP da rede local) sem editar o menu.bat, que nao pode se auto-editar em execucao.
set "SERVER_IP_FILE=%~dp0server-ip.txt"
set "REMOTE_HOST=seu-celular.seu-tailnet.ts.net"
if exist "%SERVER_IP_FILE%" (
    for /f "usebackq delims=" %%i in ("%SERVER_IP_FILE%") do set "REMOTE_HOST=%%i"
)
set "MOBILE_ENV_FILE=%~dp0frontend\src\environments\environment.mobile.ts"
set "NETWORK_SECURITY_CONFIG_FILE=%~dp0frontend\android\app\src\main\res\xml\network_security_config.xml"
set "REMOTE_BACKEND_DIR=/data/data/com.termux/files/home/vrfinance/backend"
set "REMOTE_FRONTEND_DIR=/data/data/com.termux/files/home/vrfinance/frontend-www"
set "REMOTE_SERVICE=/data/data/com.termux/files/usr/var/service/vrfinance-backend"
rem Nivel de API do SEU celular servidor (rode "getprop ro.build.version.sdk" nele pra saber o
rem valor certo -- varia por aparelho, o de baixo e so um exemplo). So usado no deploy do backend
rem pro Termux (opcao 2), nao afeta o build do APK em si.
set "ANDROID_API_LEVEL=27"
set "DEST_DIR=%~dp0Termux"
rem Ajuste os dois caminhos abaixo pra onde voce instalou o JDK 21 e o Android SDK nesta maquina
rem (ver doc/docs/build-app.md) -- os valores de baixo sao so os caminhos usados na maquina original.
set "BUILD_JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "BUILD_ANDROID_SDK=C:\Android\sdk"

:menu
cls
echo ============================================
echo   VR Finance - Menu principal
echo ============================================
echo.
echo   1. Aplicacao e testes (iniciar app, testes de backend/frontend)
echo   2. Deploy para o servidor (enviar frontend/backend pro celular)
echo   3. Ligar / desligar / status do servidor no celular
echo   4. Copiar imagem do Termux (backup completo do celular)
echo   5. Criar build APP (gerar APK Android)
echo   6. Mudar IP do servidor
echo   7. Servidor (SSH / bateria / armazenamento / RAM)
echo   0. Sair
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto app_menu
if "%opcao%"=="2" goto deploy_menu
if "%opcao%"=="3" goto server_menu
if "%opcao%"=="4" goto backup_menu
if "%opcao%"=="5" goto criar_build_app
if "%opcao%"=="6" goto ip_menu
if "%opcao%"=="7" goto servidor_menu
if "%opcao%"=="0" goto fim
goto menu

rem ================================================================
rem  1) Aplicacao e testes
rem ================================================================
:app_menu
cls
echo ============================================
echo   VR Finance - Aplicacao e testes
echo ============================================
echo.
echo   1. Iniciar aplicacao (backend + frontend)
echo   2. Iniciar testes backend
echo   3. Iniciar testes frontend
echo   4. Ver documentacao (mkdocs serve)
echo   0. Voltar
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto app_iniciar
if "%opcao%"=="2" goto app_testes_backend
if "%opcao%"=="3" goto app_testes_frontend
if "%opcao%"=="4" goto app_documentacao
if "%opcao%"=="0" goto menu
goto app_menu

:app_iniciar
start "VR Finance - Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && uvicorn app.main:app --reload"
start "VR Finance - Frontend" cmd /k "cd /d "%~dp0frontend" && ionic serve"
echo.
echo Backend e frontend iniciados em janelas separadas.
pause
goto app_menu

:app_testes_backend
call "%~dp0backend\venv\Scripts\activate.bat"
cd /d "%~dp0backend\tests"
pytest
cd /d "%~dp0"
pause
goto app_menu

:app_testes_frontend
cd /d "%~dp0frontend"
call npm test
cd /d "%~dp0"
pause
goto app_menu

:app_documentacao
start "VR Finance - Documentacao" cmd /k "cd /d "%~dp0doc" && "%~dp0backend\venv\Scripts\mkdocs.exe" serve -a 127.0.0.1:8001"
echo.
echo Documentacao iniciada em janela separada -- acesse http://127.0.0.1:8001
echo (porta 8001, nao 8000, pra nao colidir com o backend quando os dois estiverem rodando juntos).
pause
goto app_menu

rem ================================================================
rem  2) Deploy para o servidor
rem ================================================================
:deploy_menu
cls
echo ============================================
echo   VR Finance - Deploy para o servidor
echo ============================================
echo.
echo   Servidor: %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_PORT%
echo.
echo   1. Deploy completo (frontend + backend)
echo   2. Deploy so o frontend
echo   3. Deploy so o backend
echo   4. Enviar banco de dados local pro celular (sobrescreve os dados de la)
echo   5. Sincronizar dados locais com os dados do servidor (traz o banco de la pro PC)
echo   0. Voltar
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto deploy_completo
if "%opcao%"=="2" goto deploy_frontend
if "%opcao%"=="3" goto deploy_backend
if "%opcao%"=="4" goto deploy_banco
if "%opcao%"=="5" goto deploy_baixar_banco
if "%opcao%"=="0" goto menu
goto deploy_menu

:deploy_completo
call :fazer_deploy_frontend
if errorlevel 1 goto deploy_erro
call :fazer_deploy_backend
if errorlevel 1 goto deploy_erro
call :deploy_verificar
echo.
echo Deploy completo finalizado.
pause
goto deploy_menu

:deploy_frontend
call :fazer_deploy_frontend
if errorlevel 1 goto deploy_erro
call :deploy_verificar
echo.
echo Deploy do frontend finalizado.
pause
goto deploy_menu

:deploy_backend
call :fazer_deploy_backend
if errorlevel 1 goto deploy_erro
call :deploy_verificar
echo.
echo Deploy do backend finalizado.
pause
goto deploy_menu

:deploy_erro
echo.
echo Deploy interrompido por um erro acima.
pause
goto deploy_menu

:deploy_banco
echo.
echo ============================================
echo   ATENCAO - Enviar banco de dados local pro celular
echo ============================================
echo.
echo Isso vai SUBSTITUIR o banco de dados do celular (backend\vrfinance.db de
echo la) pelo banco local (backend\vrfinance.db daqui). Qualquer lancamento
echo que exista SO no celular (e nao no seu banco local) sera perdido.
echo.
echo Use isso apenas quando o banco local estiver mais atualizado que o do
echo celular (ex: depois de importar/editar dados so localmente). NAO e uma
echo etapa de rotina do deploy -- normalmente o deploy so envia codigo.
echo.
echo Por seguranca, o banco atual do celular sera copiado com backup antes de
echo ser sobrescrito.
echo.
set /p confirma="Digite SIM para confirmar: "
if not "%confirma%"=="SIM" (
    echo.
    echo Cancelado.
    pause
    goto deploy_menu
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%t"

echo.
echo [1/4] Parando o backend no celular...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv down %REMOTE_SERVICE%" < NUL

echo [2/4] Fazendo backup do banco atual do celular (vrfinance.db.bak-!TIMESTAMP!)...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cp %REMOTE_BACKEND_DIR%/vrfinance.db %REMOTE_BACKEND_DIR%/vrfinance.db.bak-!TIMESTAMP!" < NUL
if errorlevel 1 (
    echo ERRO: falha ao fazer backup do banco no celular. Nada foi sobrescrito.
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)

echo [3/4] Enviando o banco local pro celular...
pushd "%~dp0backend"
scp -P %REMOTE_PORT% vrfinance.db %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/vrfinance.db
if errorlevel 1 (
    echo ERRO: falha ao enviar o banco. O backup de antes continua em
    echo   %REMOTE_BACKEND_DIR%/vrfinance.db.bak-!TIMESTAMP!
    popd
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)
popd

echo [4/4] Reiniciando o backend...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
call :deploy_verificar

echo.
echo Banco enviado. Backup do banco anterior do celular ficou salvo em:
echo   %REMOTE_BACKEND_DIR%/vrfinance.db.bak-!TIMESTAMP!
echo (apague manualmente quando confirmar que nao precisa mais dele).
echo.
pause
goto deploy_menu

:deploy_baixar_banco
echo.
echo ============================================
echo   ATENCAO - Sincronizar dados locais com o servidor
echo ============================================
echo.
echo Isso vai SUBSTITUIR o banco de dados local (backend\vrfinance.db daqui)
echo pelo banco do celular (que e o servidor real, acessado via Tailscale).
echo Qualquer lancamento que exista SO localmente sera perdido.
echo.
echo Use isso pra trazer pro PC os dados mais recentes lancados direto no
echo celular (ou por outro dispositivo via Tailscale), por exemplo pra
echo testar/depurar localmente com dados atuais.
echo.
echo Por seguranca, o banco local atual sera copiado com backup antes de ser
echo sobrescrito.
echo.
set /p confirma="Digite SIM para confirmar: "
if not "%confirma%"=="SIM" (
    echo.
    echo Cancelado.
    pause
    goto deploy_menu
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%t"

echo.
echo [1/4] Fazendo backup do banco local atual...
pushd "%~dp0backend"
copy /y vrfinance.db "vrfinance.db.bak-!TIMESTAMP!" >NUL
if errorlevel 1 (
    echo ERRO: falha ao fazer backup do banco local. Nada foi sobrescrito.
    popd
    pause
    goto deploy_menu
)

echo [2/4] Parando o backend no celular (pra copiar um banco consistente)...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv down %REMOTE_SERVICE%" < NUL

echo [3/4] Baixando o banco do celular pro PC...
scp -P %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/vrfinance.db vrfinance.db
if errorlevel 1 (
    echo ERRO: falha ao baixar o banco do celular. O backup local continua em
    echo   backend\vrfinance.db.bak-!TIMESTAMP!
    popd
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)
popd

echo [4/4] Reiniciando o backend no celular...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
call :deploy_verificar

echo.
echo Banco local atualizado. Backup do banco local anterior ficou salvo em:
echo   backend\vrfinance.db.bak-!TIMESTAMP!
echo (apague manualmente quando confirmar que nao precisa mais dele).
echo.
pause
goto deploy_menu

:fazer_deploy_frontend
echo.
echo [Frontend] Buildando (ionic build --prod)...
pushd "%~dp0frontend"
call ionic build --prod
if errorlevel 1 (
    echo ERRO: build do frontend falhou.
    popd
    exit /b 1
)

echo [Frontend] Limpando pasta remota...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "rm -rf %REMOTE_FRONTEND_DIR% && mkdir -p %REMOTE_FRONTEND_DIR%" < NUL
if errorlevel 1 (
    echo ERRO: nao consegui limpar a pasta remota do frontend.
    popd
    exit /b 1
)

echo [Frontend] Enviando build novo...
scp -P %REMOTE_PORT% -r www\* %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_FRONTEND_DIR%/
if errorlevel 1 (
    echo ERRO: falha ao enviar o build do frontend.
    popd
    exit /b 1
)
popd
exit /b 0

:fazer_deploy_backend
echo.
echo [Backend] Enviando codigo (app/ e requirements.txt)...
pushd "%~dp0backend"

ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "rm -rf %REMOTE_BACKEND_DIR%/app && mkdir -p %REMOTE_BACKEND_DIR%/app" < NUL
if errorlevel 1 (
    echo ERRO: nao consegui limpar a pasta remota do backend.
    popd
    exit /b 1
)

scp -P %REMOTE_PORT% -r app\* %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/app/
if errorlevel 1 (
    echo ERRO: falha ao enviar o codigo do backend.
    popd
    exit /b 1
)

scp -P %REMOTE_PORT% requirements.txt %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/requirements.txt
if errorlevel 1 (
    echo ERRO: falha ao enviar o requirements.txt.
    popd
    exit /b 1
)
popd

echo [Backend] Instalando dependencias (rapido se nada mudou)...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cd %REMOTE_BACKEND_DIR% && ANDROID_API_LEVEL=%ANDROID_API_LEVEL% venv/bin/pip install -r requirements.txt" < NUL
if errorlevel 1 (
    echo ERRO: falha ao instalar dependencias no celular.
    exit /b 1
)

echo [Backend] Reiniciando o servico...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv restart %REMOTE_SERVICE%" < NUL
exit /b 0

:deploy_verificar
echo.
echo [Verificacao] Aguardando o backend ficar pronto (tenta por ate 30s)...
powershell -NoProfile -Command "$ok = $false; for ($i = 0; $i -lt 15; $i++) { try { $r = Invoke-WebRequest -Uri 'http://%REMOTE_HOST%:8080/api/docs' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Seconds 2 }; if (-not $ok) { Write-Host '  (backend ainda nao respondeu apos 30s -- os testes abaixo podem mostrar erro)' }"
echo.
echo [Verificacao] Testando o site...
curl -s -o NUL -w "  Frontend  http://%REMOTE_HOST%:8080/            -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/
curl -s -o NUL -w "  Backend   http://%REMOTE_HOST%:8080/api/docs    -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/api/docs
exit /b 0

rem ================================================================
rem  3) Ligar / desligar / status do servidor
rem ================================================================
:server_menu
cls
echo ============================================
echo   VR Finance - Ligar/desligar o site
echo ============================================
echo.
echo   Servidor: %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_PORT%
echo.
echo   1. Iniciar o site (subir o backend)
echo   2. Parar o site (derrubar o backend)
echo   3. Reiniciar o backend
echo   4. Ver status
echo   0. Voltar
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto server_iniciar
if "%opcao%"=="2" goto server_parar
if "%opcao%"=="3" goto server_reiniciar
if "%opcao%"=="4" goto server_status
if "%opcao%"=="0" goto menu
goto server_menu

:server_iniciar
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv up %REMOTE_SERVICE%" < NUL
echo.
echo Backend iniciado.
call :server_status_rapido
pause
goto server_menu

:server_parar
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv down %REMOTE_SERVICE%" < NUL
echo.
echo Backend parado. O site vai parar de responder em /api ate voce iniciar de novo.
pause
goto server_menu

:server_reiniciar
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv restart %REMOTE_SERVICE%" < NUL
echo.
echo Backend reiniciado.
call :server_status_rapido
pause
goto server_menu

:server_status
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sv status %REMOTE_SERVICE%" < NUL
call :server_status_rapido
pause
goto server_menu

:server_status_rapido
echo.
curl -s -o NUL -w "  Frontend  http://%REMOTE_HOST%:8080/            -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/
curl -s -o NUL -w "  Backend   http://%REMOTE_HOST%:8080/api/docs    -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/api/docs
exit /b 0

rem ================================================================
rem  4) Copiar imagem do Termux (backup)
rem ================================================================
:backup_menu
cls
echo ============================================
echo   VR Finance - Copiar imagem do Termux
echo ============================================
echo.
echo Isso empacota TODO o ambiente Termux do celular (pacotes instalados,
echo configuracoes do nginx/sshd, codigo do backend, banco de dados, build
echo do frontend etc.) num unico arquivo .tar.gz, salvo em:
echo   %DEST_DIR%
echo.
echo Pode demorar varios minutos e o arquivo pode ter alguns GB, dependendo
echo do que estiver instalado no celular. Serve pra restaurar tudo de uma vez
echo em outro celular no futuro, sem repetir boa parte do passo a passo manual.
echo O venv do backend e o cache de pip NAO entram no backup (sao facilmente
echo reconstruidos e so aumentam o tamanho/tempo do tar) -- apos restaurar,
echo e preciso recriar o venv (ver instrucoes no final).
echo.
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" goto menu

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%t"
set "REMOTE_FILE=termux-backup-!TIMESTAMP!.tar.gz"
set "LOCAL_FILE=%DEST_DIR%\!REMOTE_FILE!"

rem O arquivo temporario fica em /data/data/com.termux/files (irmao de ./home e ./usr, NAO dentro de
rem nenhum dos dois) -- se ficasse dentro de ~ (que e ./home/<user>), o tar reclamaria de "file changed
rem as we read it" por estar escrevendo o proprio arquivo de saida dentro da pasta que esta lendo.
set "REMOTE_TMP=/data/data/com.termux/files/!REMOTE_FILE!"

echo.
echo [1/3] Empacotando o Termux no celular (pode demorar)...
rem tar retorna 1 (nao 0) quando um arquivo muda durante a leitura (ex: runsvdir.log, escrito
rem continuamente pelo runit) -- isso nao invalida o backup, so avisa que aquele arquivo especifico
rem pode estar levemente inconsistente. So codigo >=2 e erro fatal de verdade (--exclude cobre o caso
rem mais comum, e o "if errorlevel 2" tolera outros arquivos ativos que apareçam no futuro).
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cd /data/data/com.termux/files && tar czpf !REMOTE_TMP! --exclude=./home/storage --exclude=./home/runsvdir.log --exclude=./usr/var/cache/apt/archives --exclude=./home/.cache --exclude=./home/vrfinance/backend/venv ./home ./usr" < NUL
if errorlevel 2 (
    echo.
    echo ERRO: falha ao empacotar o Termux no celular.
    pause
    goto backup_menu
)

echo.
echo [2/3] Copiando o arquivo pro PC (pode demorar, e um arquivo grande)...
scp -P %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST%:!REMOTE_TMP! "!LOCAL_FILE!"
if errorlevel 1 (
    echo.
    echo ERRO: falha ao copiar o arquivo do celular. O arquivo remoto NAO foi
    echo apagado, pra voce poder tentar copiar de novo manualmente:
    echo   !REMOTE_TMP!
    pause
    goto backup_menu
)

rem So apaga do celular depois de confirmar que a copia chegou inteira no PC
rem (mesmo tamanho dos dois lados) -- nunca apaga o original as ciegas.
for %%f in ("!LOCAL_FILE!") do set "LOCAL_SIZE=%%~zf"
for /f %%s in ('ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "stat -c %%s !REMOTE_TMP!" ^< NUL') do set "REMOTE_SIZE=%%s"

if not "!LOCAL_SIZE!"=="!REMOTE_SIZE!" (
    echo.
    echo ERRO: o arquivo copiado (!LOCAL_SIZE! bytes^) nao bate com o tamanho do
    echo arquivo no celular (!REMOTE_SIZE! bytes^). O arquivo remoto NAO foi
    echo apagado, por seguranca:
    echo   !REMOTE_TMP!
    pause
    goto backup_menu
)

echo.
echo [3/3] Copia confirmada (!LOCAL_SIZE! bytes^). Limpando o arquivo temporario no celular...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "rm !REMOTE_TMP!" < NUL

echo.
echo ============================================
echo Copia salva em:
echo   !LOCAL_FILE!
echo ============================================
echo.
echo Para restaurar em outro celular (Termux recem-instalado, mesma arquitetura
echo do processador):
echo   1. Copie o .tar.gz pro celular novo (ex: scp, ou compartilhar o arquivo)
echo   2. Abra o Termux novo e rode:
echo      tar xzpf termux-backup-....tar.gz -C /data/data/com.termux/files --recursive-unlink --preserve-permissions
echo   3. Recrie o venv do backend (nao entra no backup):
echo      cd ~/vrfinance/backend ^&^& python -m venv venv
echo      ANDROID_API_LEVEL=$(getprop ro.build.version.sdk) venv/bin/pip install -r requirements.txt
echo   4. Feche e abra o Termux de novo (ou rode "exit" e reabra) pra tudo
echo      recarregar (nginx, sshd, o backend via termux-services, etc.)
echo.
pause
goto menu

rem ================================================================
rem  5) Criar build APP (gerar APK Android via Capacitor)
rem ================================================================
:criar_build_app
cls
echo ============================================
echo   VR Finance - Criar build APP (Android)
echo ============================================
echo.
echo Isso builda o frontend com a configuracao "mobile" (apiUrl absoluto via
echo Tailscale, em vez do /api relativo usado no deploy web), sincroniza com o
echo projeto nativo (Capacitor) e gera um APK de debug pra instalar direto no
echo celular (sideload).
echo.
set "PATH=%BUILD_JAVA_HOME%\bin;%PATH%"
set "JAVA_HOME=%BUILD_JAVA_HOME%"
set "ANDROID_HOME=%BUILD_ANDROID_SDK%"

echo [1/4] Buildando o frontend (configuracao mobile)...
pushd "%~dp0frontend"
call npx ng build --configuration=mobile
if errorlevel 1 (
    echo ERRO: build do frontend falhou.
    popd
    pause
    goto menu
)

echo.
echo [2/4] Sincronizando com o projeto Android (Capacitor)...
call npx cap sync android
if errorlevel 1 (
    echo ERRO: falha ao sincronizar o projeto Android.
    popd
    pause
    goto menu
)

echo.
echo [3/4] Gerando o APK (gradlew assembleDebug, pode demorar na primeira vez)...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERRO: falha ao gerar o APK.
    cd ..
    popd
    pause
    goto menu
)
cd ..
popd

echo.
echo [4/4] Movendo o APK gerado pra raiz do projeto...
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%t"
set "APK_ORIGEM=%~dp0frontend\android\app\build\outputs\apk\debug\app-debug.apk"
set "APK_DESTINO=%~dp0VRFinance-!TIMESTAMP!.apk"
if not exist "%APK_ORIGEM%" (
    echo ERRO: nao encontrei o APK gerado em:
    echo   %APK_ORIGEM%
    pause
    goto menu
)
move /y "%APK_ORIGEM%" "!APK_DESTINO!" >NUL

echo.
echo ============================================
echo APK gerado em:
echo   !APK_DESTINO!
echo ============================================
echo.
echo Copie esse arquivo pro celular (cabo USB, Google Drive, etc.) e abra-o
echo pra instalar -- na primeira vez o Android vai pedir pra habilitar
echo "instalar de fontes desconhecidas" pra esse app/origem.
echo.
pause
goto menu

rem ================================================================
rem  6) Mudar endereco do servidor
rem ================================================================
:ip_menu
cls
echo ============================================
echo   VR Finance - Mudar endereco do servidor
echo ============================================
echo.
echo   Endereco atual usado pelo deploy/SSH:          %REMOTE_HOST%
echo.
echo   Sao dois enderecos separados, cada um usado numa situacao diferente:
echo   - Deploy/SSH (este menu.bat): por padrao usa o hostname MagicDNS do
echo     Tailscale (funciona de qualquer lugar, nao so em casa). So muda se
echo     voce quiser forcar outro endereco (ex: IP da rede local).
echo   - App Android nativo (o APK instalado no celular): tambem usa o
echo     hostname do Tailscale, embutido no build -- so muda se voce
echo     renomear o celular no Tailscale.
echo.
echo   1. Mudar o endereco usado pelo deploy/SSH (este menu.bat)
echo   2. Mudar o endereco usado pelo app Android nativo (precisa gerar novo APK depois)
echo   0. Voltar
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto ip_mudar_local
if "%opcao%"=="2" goto ip_mudar_tailscale
if "%opcao%"=="0" goto menu
goto ip_menu

:ip_mudar_local
echo.
echo Endereco atual: %REMOTE_HOST%
set /p novo_ip="Novo endereco (IP ou hostname do celular), ou Enter para cancelar: "
if "%novo_ip%"=="" (
    echo.
    echo Cancelado.
    pause
    goto ip_menu
)

> "%SERVER_IP_FILE%" echo %novo_ip%
set "REMOTE_HOST=%novo_ip%"
echo.
echo Endereco atualizado para %REMOTE_HOST% (salvo em "%SERVER_IP_FILE%" -- vale
echo pra essa sessao do menu.bat e pras proximas vezes que ele for aberto).
echo.
echo Testando a conexao...
call :deploy_verificar
pause
goto ip_menu

:ip_mudar_tailscale
echo.
set /p novo_ip="Novo endereco do Tailscale (IP ou hostname), ou Enter para cancelar: "
if "%novo_ip%"=="" (
    echo.
    echo Cancelado.
    pause
    goto ip_menu
)

if not exist "%MOBILE_ENV_FILE%" (
    echo.
    echo ERRO: nao encontrei %MOBILE_ENV_FILE%
    pause
    goto ip_menu
)

powershell -NoProfile -Command "(Get-Content -Raw '%MOBILE_ENV_FILE%') -replace 'http://[^:/]+:8080/api', 'http://%novo_ip%:8080/api' | Set-Content -NoNewline '%MOBILE_ENV_FILE%'"

if exist "%NETWORK_SECURITY_CONFIG_FILE%" (
    powershell -NoProfile -Command "(Get-Content -Raw '%NETWORK_SECURITY_CONFIG_FILE%') -replace '(?<=<domain[^>]*>)[^<]+(?=</domain>)', '%novo_ip%' | Set-Content -NoNewline '%NETWORK_SECURITY_CONFIG_FILE%'"
)

echo.
echo environment.mobile.ts e network_security_config.xml atualizados com o novo
echo endereco do Tailscale.
echo.
echo IMPORTANTE: o app Android ja instalado no celular continua com o IP antigo
echo embutido no APK -- gere um novo APK (opcao 5, "Criar build APP") e
echo reinstale no celular pra essa mudanca valer de fato.
echo.
pause
goto ip_menu

rem ================================================================
rem  7) Servidor (SSH / bateria / armazenamento / RAM)
rem ================================================================
:servidor_menu
cls
echo ============================================
echo   VR Finance - Servidor
echo ============================================
echo.
echo   Servidor: %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_PORT%
echo.
echo   1. Iniciar SSH servidor
echo   2. Checar bateria
echo   3. Checar armazenamento
echo   4. Checar uso de RAM
echo   0. Voltar
echo.
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" goto servidor_ssh
if "%opcao%"=="2" goto servidor_bateria
if "%opcao%"=="3" goto servidor_armazenamento
if "%opcao%"=="4" goto servidor_ram
if "%opcao%"=="0" goto menu
goto servidor_menu

:servidor_ssh
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST%
goto servidor_menu

:servidor_bateria
echo.
echo Bateria (capacidade %% / status):
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cat /sys/class/power_supply/battery/capacity; cat /sys/class/power_supply/battery/status" < NUL
pause
goto servidor_menu

:servidor_armazenamento
echo.
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "df -h /data" < NUL
pause
goto servidor_menu

:servidor_ram
echo.
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "free -h" < NUL
echo.
echo Percentual livre (relativo ao total):
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "free | awk '/^Mem:/{print int($4/$2*1000+0.5)/10}'" < NUL
echo Percentual disponivel (relativo ao total):
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "free | awk '/^Mem:/{print int($7/$2*1000+0.5)/10}'" < NUL
pause
goto servidor_menu

:fim
endlocal
