@echo off
setlocal enabledelayedexpansion

rem Pressupoe acesso SSH sem senha ja configurado (chave publica em ~/.ssh/authorized_keys do
rem servidor) e o setup inicial ja rodado la (ver scripts/setup_ubuntu_server.sh).
set "REMOTE_USER=usuario-servidor"
set "REMOTE_PORT=22"
rem Usa o hostname MagicDNS do Tailscale por padrao (funciona de qualquer lugar, nao so na mesma
rem rede) -- so precisa do Tailscale ativo neste PC e no servidor. "server-ip.txt" permite sobrescrever
rem (ex: forcar o IP da rede local) sem editar o menu.bat, que nao pode se auto-editar em execucao.
set "SERVER_IP_FILE=%~dp0server-ip.txt"
set "REMOTE_HOST=seu-servidor.seu-tailnet.ts.net"
if exist "%SERVER_IP_FILE%" (
    for /f "usebackq delims=" %%i in ("%SERVER_IP_FILE%") do set "REMOTE_HOST=%%i"
)
set "MOBILE_ENV_FILE=%~dp0frontend\src\environments\environment.mobile.ts"
set "NETWORK_SECURITY_CONFIG_FILE=%~dp0frontend\android\app\src\main\res\xml\network_security_config.xml"
set "REMOTE_BACKEND_DIR=/home/usuario-servidor/vrfinance/backend"
rem Fora do home (/home/usuario-servidor tem permissao 750 -- o nginx, rodando como www-data, nao
rem conseguiria atravessar o diretorio pra servir os arquivos). /var/www e' o padrao do nginx.
set "REMOTE_FRONTEND_DIR=/var/www/vrfinance"
rem Nome do servico systemd (nao um caminho -- gerenciado via "sudo systemctl", ver
rem scripts/setup_ubuntu_server.sh, que ja libera esses comandos especificos sem senha).
set "REMOTE_SERVICE=vrfinance-backend"
set "DEST_DIR=%~dp0Backups"
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
echo   2. Deploy para o servidor (enviar frontend/backend pro notebook)
echo   3. Ligar / desligar / status do servidor no notebook
echo   4. Backup do servidor (projeto + configuracoes)
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
echo   4. Enviar banco de dados local pro servidor (sobrescreve os dados de la)
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
echo   ATENCAO - Enviar banco de dados local pro servidor
echo ============================================
echo.
echo Isso vai SUBSTITUIR o banco de dados do servidor (backend\vrfinance.db de
echo la) pelo banco local (backend\vrfinance.db daqui), e tambem a pasta de
echo anexos (backend\uploads\), se existir localmente. Qualquer lancamento ou
echo anexo que exista SO no servidor (e nao aqui) sera perdido.
echo.
echo Use isso apenas quando o banco local estiver mais atualizado que o do
echo servidor (ex: depois de importar/editar dados so localmente). NAO e uma
echo etapa de rotina do deploy -- normalmente o deploy so envia codigo.
echo.
echo Por seguranca, o banco atual do servidor sera copiado com backup antes de
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
echo [1/4] Parando o backend no servidor...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl stop %REMOTE_SERVICE%" < NUL

echo [2/4] Fazendo backup do banco atual do servidor (vrfinance.db.bak-!TIMESTAMP!)...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cp %REMOTE_BACKEND_DIR%/vrfinance.db %REMOTE_BACKEND_DIR%/vrfinance.db.bak-!TIMESTAMP!" < NUL
if errorlevel 1 (
    echo ERRO: falha ao fazer backup do banco no servidor. Nada foi sobrescrito.
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)

echo [3/4] Enviando o banco local pro servidor...
pushd "%~dp0backend"
scp -P %REMOTE_PORT% vrfinance.db %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/vrfinance.db
if errorlevel 1 (
    echo ERRO: falha ao enviar o banco. O backup de antes continua em
    echo   %REMOTE_BACKEND_DIR%/vrfinance.db.bak-!TIMESTAMP!
    popd
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)

if exist "uploads" (
    echo [3b] Sincronizando anexos ^(pasta uploads\^) pro servidor...
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "[ -d %REMOTE_BACKEND_DIR%/uploads ] && mv %REMOTE_BACKEND_DIR%/uploads %REMOTE_BACKEND_DIR%/uploads.bak-!TIMESTAMP! || true" < NUL
    scp -P %REMOTE_PORT% -r uploads %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/
    if errorlevel 1 (
        echo AVISO: falha ao enviar a pasta de anexos. O banco ja foi enviado; se o
        echo servidor tinha anexos antigos, o backup ficou em
        echo   %REMOTE_BACKEND_DIR%/uploads.bak-!TIMESTAMP!
    )
) else (
    echo [3b] Nenhuma pasta local de anexos ^(backend\uploads^) -- nada a sincronizar.
)
popd

echo [4/4] Reiniciando o backend...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
call :deploy_verificar

echo.
echo Banco enviado. Backup do banco anterior do servidor ficou salvo em:
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
echo pelo banco do servidor (o notebook, acessado via Tailscale), e tambem a
echo pasta de anexos (backend\uploads\), se existir no servidor. Qualquer
echo lancamento ou anexo que exista SO localmente sera perdido.
echo.
echo Use isso pra trazer pro PC os dados mais recentes lancados direto no
echo servidor (ou por outro dispositivo via Tailscale), por exemplo pra
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

echo [2/4] Parando o backend no servidor (pra copiar um banco consistente)...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl stop %REMOTE_SERVICE%" < NUL

echo [3/4] Baixando o banco do servidor pro PC...
scp -P %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/vrfinance.db vrfinance.db
if errorlevel 1 (
    echo ERRO: falha ao baixar o banco do servidor. O backup local continua em
    echo   backend\vrfinance.db.bak-!TIMESTAMP!
    popd
    ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
    pause
    goto deploy_menu
)

echo [3b] Sincronizando anexos (pasta uploads\) do servidor pro PC...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "[ -d %REMOTE_BACKEND_DIR%/uploads ]" < NUL
if not errorlevel 1 (
    if exist "uploads" move /y "uploads" "uploads.bak-!TIMESTAMP!" >NUL
    scp -P %REMOTE_PORT% -r %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_BACKEND_DIR%/uploads .
    if errorlevel 1 (
        echo AVISO: falha ao baixar a pasta de anexos. O banco ja foi baixado; se o PC
        echo tinha anexos antigos, o backup ficou em backend\uploads.bak-!TIMESTAMP!
    )
) else (
    echo [3b] Servidor nao tem pasta de anexos ^(uploads/^) ainda -- nada a sincronizar.
)
popd

echo [4/4] Reiniciando o backend no servidor...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
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
rem So limpa o CONTEUDO (find -mindepth 1 -delete), nunca o diretorio em si -- /var/www e' dono
rem de root, entao o usuario usuario-servidor (dono so de /var/www/vrfinance) nao tem permissao pra apagar
rem a entrada do diretorio no pai, so o que esta dentro dele. Um "rm -rf %REMOTE_FRONTEND_DIR%"
rem direto falha nesse ultimo passo (com "Permission denied") depois de ja ter apagado tudo la
rem dentro -- ja aconteceu uma vez e deixou o site sem frontend ate o proximo deploy corrigir isso.
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "mkdir -p %REMOTE_FRONTEND_DIR% && find %REMOTE_FRONTEND_DIR% -mindepth 1 -delete" < NUL
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
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "cd %REMOTE_BACKEND_DIR% && venv/bin/pip install -r requirements.txt" < NUL
if errorlevel 1 (
    echo ERRO: falha ao instalar dependencias no servidor.
    exit /b 1
)

echo [Backend] Reiniciando o servico...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl restart %REMOTE_SERVICE%" < NUL
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
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl start %REMOTE_SERVICE%" < NUL
echo.
echo Backend iniciado.
call :server_status_rapido
pause
goto server_menu

:server_parar
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl stop %REMOTE_SERVICE%" < NUL
echo.
echo Backend parado. O site vai parar de responder em /api ate voce iniciar de novo.
pause
goto server_menu

:server_reiniciar
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl restart %REMOTE_SERVICE%" < NUL
echo.
echo Backend reiniciado.
call :server_status_rapido
pause
goto server_menu

:server_status
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "sudo systemctl status %REMOTE_SERVICE% --no-pager" < NUL
call :server_status_rapido
pause
goto server_menu

:server_status_rapido
echo.
curl -s -o NUL -w "  Frontend  http://%REMOTE_HOST%:8080/            -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/
curl -s -o NUL -w "  Backend   http://%REMOTE_HOST%:8080/api/docs    -> HTTP %%{http_code}\n" http://%REMOTE_HOST%:8080/api/docs
exit /b 0

rem ================================================================
rem  4) Backup do servidor (projeto + configuracoes)
rem ================================================================
:backup_menu
cls
echo ============================================
echo   VR Finance - Backup do servidor
echo ============================================
echo.
echo Isso empacota a pasta do projeto no servidor (~/vrfinance -- codigo,
echo banco de dados, build do frontend, .env) mais os arquivos de configuracao
echo do systemd e do nginx, num unico .tar.gz, salvo em:
echo   %DEST_DIR%
echo.
echo O venv do backend NAO entra no backup (facilmente reconstruido e so
echo aumenta o tamanho/tempo do tar) -- apos restaurar, e preciso recria-lo
echo (ver instrucoes no final). Isso NAO e um backup do Ubuntu inteiro (pra
echo isso, reinstalar o SO e rodar scripts/setup_ubuntu_server.sh de novo).
echo.
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" goto menu

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%t"
set "REMOTE_FILE=vrfinance-backup-!TIMESTAMP!.tar.gz"
set "LOCAL_FILE=%DEST_DIR%\!REMOTE_FILE!"

rem O arquivo temporario fica em /tmp (fora de ~/vrfinance) pra nao dar "file changed as we read it"
rem por escrever o proprio arquivo de saida dentro da pasta que esta sendo lida.
set "REMOTE_TMP=/tmp/!REMOTE_FILE!"

echo.
echo [1/3] Empacotando o projeto e as configuracoes no servidor...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "tar czf !REMOTE_TMP! --exclude=vrfinance/backend/venv -C /home/%REMOTE_USER% vrfinance --transform 's,^,vrfinance/,S' -C /etc/systemd/system %REMOTE_SERVICE%.service --transform 's,^,etc-systemd/,S' -C /etc/nginx/sites-available vrfinance --transform 's,^,etc-nginx/,S'" < NUL
if errorlevel 1 (
    echo.
    echo ERRO: falha ao empacotar o backup no servidor.
    pause
    goto backup_menu
)

echo.
echo [2/3] Copiando o arquivo pro PC...
scp -P %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST%:!REMOTE_TMP! "!LOCAL_FILE!"
if errorlevel 1 (
    echo.
    echo ERRO: falha ao copiar o arquivo do servidor. O arquivo remoto NAO foi
    echo apagado, pra voce poder tentar copiar de novo manualmente:
    echo   !REMOTE_TMP!
    pause
    goto backup_menu
)

rem So apaga do servidor depois de confirmar que a copia chegou inteira no PC
rem (mesmo tamanho dos dois lados) -- nunca apaga o original as ciegas.
for %%f in ("!LOCAL_FILE!") do set "LOCAL_SIZE=%%~zf"
for /f %%s in ('ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "stat -c %%s !REMOTE_TMP!" ^< NUL') do set "REMOTE_SIZE=%%s"

if not "!LOCAL_SIZE!"=="!REMOTE_SIZE!" (
    echo.
    echo ERRO: o arquivo copiado (!LOCAL_SIZE! bytes^) nao bate com o tamanho do
    echo arquivo no servidor (!REMOTE_SIZE! bytes^). O arquivo remoto NAO foi
    echo apagado, por seguranca:
    echo   !REMOTE_TMP!
    pause
    goto backup_menu
)

echo.
echo [3/3] Copia confirmada (!LOCAL_SIZE! bytes^). Limpando o arquivo temporario no servidor...
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "rm !REMOTE_TMP!" < NUL

rem Grava a hora deste backup num arquivo simples no servidor -- e o que GET /backup-status (app)
rem le pra saber ha quantos dias foi o ultimo backup e mostrar (ou nao) o aviso pro usuario master.
rem Sem isso o app nao tem como saber que um backup acabou de acontecer (o menu.bat roda no PC,
rem nao tem login na API). Formato ISO 8601 com offset explicito (+00:00, nao "Z") porque o
rem Python do backend usa datetime.fromisoformat, que so aceita "Z" a partir do 3.11.
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "date -u +%%Y-%%m-%%dT%%H:%%M:%%S+00:00 > %REMOTE_BACKEND_DIR%/last_backup.txt" < NUL

echo.
echo ============================================
echo Copia salva em:
echo   !LOCAL_FILE!
echo ============================================
echo.
echo Para restaurar num servidor novo (Ubuntu Server, mesmo usuario "usuario-servidor"):
echo   1. Rode scripts/setup_ubuntu_server.sh la (cria pastas, servico, nginx)
echo   2. Copie o .tar.gz pro servidor novo e extraia:
echo      tar xzf vrfinance-backup-....tar.gz -C /tmp/restore
echo      cp -r /tmp/restore/vrfinance/. ~/vrfinance/
echo      sudo cp /tmp/restore/etc-systemd/*.service /etc/systemd/system/
echo      sudo cp /tmp/restore/etc-nginx/vrfinance /etc/nginx/sites-available/
echo   3. Recrie o venv do backend (nao entra no backup):
echo      cd ~/vrfinance/backend ^&^& python3 -m venv venv ^&^& venv/bin/pip install -r requirements.txt
echo   4. sudo systemctl daemon-reload ^&^& sudo systemctl restart %REMOTE_SERVICE% ^&^& sudo systemctl reload nginx
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
echo   - App Android nativo (o APK instalado no celular): aponta pro backend
echo     no servidor (notebook) via o hostname do Tailscale, embutido no
echo     build -- so muda se voce renomear o servidor no Tailscale.
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
set /p novo_ip="Novo endereco (IP ou hostname do servidor), ou Enter para cancelar: "
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
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "bat=$(ls /sys/class/power_supply/ | grep -m1 BAT); cat /sys/class/power_supply/$bat/capacity; cat /sys/class/power_supply/$bat/status" < NUL
pause
goto servidor_menu

:servidor_armazenamento
echo.
ssh -p %REMOTE_PORT% %REMOTE_USER%@%REMOTE_HOST% "df -h /" < NUL
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
