#!/usr/bin/env bash
#
# VR Finance - menu principal (porte de menu.bat pra Linux).
#
# Pressupoe acesso SSH sem senha ja configurado (chave publica em
# ~/.ssh/authorized_keys do servidor) e o setup inicial ja rodado la (ver
# scripts/setup_ubuntu_server.sh).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Guarda de seguranca: este script e interativo (menu com "read"). Se for executado sem um
# terminal de verdade anexado (ex: duplo-clique no gerenciador de arquivos configurado pra
# "executar" em vez de abrir um terminal), todo "read" falha instantaneamente (stdin fechado),
# e o "while true" do menu vira um loop infinito chamando "clear" sem parar -- isso ja travou
# a maquina inteira uma vez (spawns de processo sem fim). Aborta cedo em vez de arriscar isso
# de novo.
if [ ! -t 0 ] || [ ! -t 1 ]; then
    echo "ERRO: menu.sh precisa rodar dentro de um terminal de verdade (stdin/stdout" >&2
    echo "precisam ser um terminal interativo)." >&2
    echo "Abra um terminal e rode: $0" >&2
    echo "(o atalho na Area de Trabalho, \"VR Finance - Menu.desktop\", ja faz isso certo --" >&2
    echo "duplo-clique direto no menu.sh sem esse atalho pode nao abrir terminal nenhum.)" >&2
    exit 1
fi

REMOTE_USER="usuario-servidor"
REMOTE_PORT="22"
# Endereco do servidor: tenta primeiro o IP da rede local (LOCAL_HOST) e, se o SSH nao
# responder, usa o hostname MagicDNS do Tailscale (funciona de qualquer lugar, mas precisa
# do Tailscale ativo neste PC) -- ver select_remote_host, chamado ao entrar em cada opcao
# que fala com o servidor. "server-ip.txt" forca um endereco fixo (sem tentativa/fallback).
SERVER_IP_FILE="$SCRIPT_DIR/server-ip.txt"
TAILSCALE_HOST="seu-servidor.seu-tailnet.ts.net"
LOCAL_HOST="ip-local-do-servidor"
# nginx direto na LAN (HTTP puro -- o certificado HTTPS do Tailscale so vale pro hostname)
LOCAL_WEB_PORT="8080"
REMOTE_HOST="$TAILSCALE_HOST"
WEB_BASE="https://$TAILSCALE_HOST"
SSH_OPTS=()
MOBILE_ENV_FILE="$SCRIPT_DIR/frontend/src/environments/environment.mobile.ts"
REMOTE_BACKEND_DIR="/home/usuario-servidor/vrfinance/backend"
# Fora do home (/home/usuario-servidor tem permissao 750 -- o nginx, rodando como www-data, nao
# conseguiria atravessar o diretorio pra servir os arquivos). /var/www e o padrao do nginx.
REMOTE_FRONTEND_DIR="/var/www/vrfinance"
# Nome do servico systemd (nao um caminho -- gerenciado via "sudo systemctl", ver
# scripts/setup_ubuntu_server.sh, que ja libera esses comandos especificos sem senha).
REMOTE_SERVICE="vrfinance-backend"
DEST_DIR="$SCRIPT_DIR/Backups"
# Ajuste os dois caminhos abaixo se JDK/Android SDK estiverem em outro lugar nesta
# maquina. Os valores de baixo sao os caminhos usados na maquina original (JDK 21
# portatil da Eclipse Temurin em ~/jdk, Android cmdline-tools em ~/Android/sdk -- os
# dois instalados sem sudo, sem depender de pacotes do sistema).
BUILD_JAVA_HOME="$HOME/jdk/jdk-21.0.12.1+1"
BUILD_ANDROID_SDK="$HOME/Android/sdk"

# Node/npm/ionic sao instalados via nvm (user-space) nesta maquina -- garante que
# estejam no PATH pra qualquer submenu que precise (testes de frontend, ionic serve,
# ng build).
NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
fi

# Define REMOTE_HOST/SSH_OPTS/WEB_BASE: IP local se o SSH responder em ate 2s, senao Tailscale.
# HostKeyAlias faz o SSH pelo IP conferir a mesma chave do servidor ja aceita pro hostname do
# Tailscale no known_hosts (sem isso pediria pra aceitar uma chave "nova" e o teste falharia).
select_remote_host() {
    if [ -f "$SERVER_IP_FILE" ]; then
        REMOTE_HOST="$(head -n1 "$SERVER_IP_FILE" | tr -d '\r\n')"
        SSH_OPTS=()
        WEB_BASE="https://$REMOTE_HOST"
        if [ "$REMOTE_HOST" = "$LOCAL_HOST" ]; then
            SSH_OPTS=(-o "HostKeyAlias=$TAILSCALE_HOST")
            WEB_BASE="http://$LOCAL_HOST:$LOCAL_WEB_PORT"
        fi
        echo "Servidor: $REMOTE_HOST (fixado em server-ip.txt)"
        return
    fi
    echo "Testando conexao com o servidor pela rede local ($LOCAL_HOST)..."
    if ssh -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=2 -o "HostKeyAlias=$TAILSCALE_HOST" \
        "$REMOTE_USER@$LOCAL_HOST" true </dev/null >/dev/null 2>&1; then
        REMOTE_HOST="$LOCAL_HOST"
        SSH_OPTS=(-o "HostKeyAlias=$TAILSCALE_HOST")
        WEB_BASE="http://$LOCAL_HOST:$LOCAL_WEB_PORT"
        echo "  OK -- usando a rede local."
    else
        REMOTE_HOST="$TAILSCALE_HOST"
        SSH_OPTS=()
        WEB_BASE="https://$TAILSCALE_HOST"
        echo "  Sem resposta -- usando o Tailscale ($TAILSCALE_HOST)."
    fi
}

ssh_remote() {
    ssh -p "$REMOTE_PORT" "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" "$@" </dev/null
}

scp_remote() {
    scp -P "$REMOTE_PORT" "${SSH_OPTS[@]}" "$@"
}

pause() {
    read -rp "Pressione Enter para continuar..." _ || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
}

# ================================================================
#  Menu principal
# ================================================================
main_loop() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Menu principal"
        echo "============================================"
        echo
        echo "  1. Aplicacao e testes (iniciar app, testes de backend/frontend)"
        echo "  2. Deploy para o servidor (enviar frontend/backend pro notebook)"
        echo "  3. Ligar / desligar / status do servidor no notebook"
        echo "  4. Backup do servidor (projeto + configuracoes)"
        echo "  5. Criar build APP (gerar APK Android)"
        echo "  6. Mudar IP do servidor"
        echo "  7. Servidor (SSH / bateria / armazenamento / RAM)"
        echo "  0. Sair"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) app_menu ;;
            2) select_remote_host; deploy_menu ;;
            3) select_remote_host; server_menu ;;
            4) select_remote_host; backup_menu ;;
            5) criar_build_app ;;
            6) ip_menu ;;
            7) select_remote_host; servidor_menu ;;
            0) echo; exit 0 ;;
        esac
    done
}

# ================================================================
#  1) Aplicacao e testes
# ================================================================
app_menu() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Aplicacao e testes"
        echo "============================================"
        echo
        echo "  1. Iniciar aplicacao (backend + frontend)"
        echo "  2. Iniciar testes backend"
        echo "  3. Iniciar testes frontend"
        echo "  4. Ver documentacao (mkdocs serve)"
        echo "  0. Voltar"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) app_iniciar ;;
            2) app_testes_backend ;;
            3) app_testes_frontend ;;
            4) app_documentacao ;;
            0) return ;;
        esac
    done
}

app_iniciar() {
    local backend_cmd frontend_cmd
    backend_cmd="cd \"$SCRIPT_DIR/backend\" && source venv/bin/activate && uvicorn app.main:app --reload; exec bash"
    frontend_cmd="cd \"$SCRIPT_DIR/frontend\" && source \"$HOME/.nvm/nvm.sh\" 2>/dev/null; ionic serve; exec bash"

    gnome-terminal --title="VR Finance - Backend" -- bash -c "$backend_cmd"
    gnome-terminal --title="VR Finance - Frontend" -- bash -c "$frontend_cmd"
    echo
    echo "Backend e frontend iniciados em janelas separadas."
    pause
}

app_testes_backend() {
    (cd "$SCRIPT_DIR/backend" && source venv/bin/activate && cd tests && pytest)
    pause
}

app_testes_frontend() {
    (cd "$SCRIPT_DIR/frontend" && npm test)
    pause
}

app_documentacao() {
    local docs_cmd
    docs_cmd="cd \"$SCRIPT_DIR/doc\" && \"$SCRIPT_DIR/backend/venv/bin/mkdocs\" serve -a 127.0.0.1:8001; exec bash"
    gnome-terminal --title="VR Finance - Documentacao" -- bash -c "$docs_cmd"
    echo
    echo "Documentacao iniciada em janela separada -- acesse http://127.0.0.1:8001"
    echo "(porta 8001, nao 8000, pra nao colidir com o backend quando os dois estiverem rodando juntos)."
    pause
}

# ================================================================
#  2) Deploy para o servidor
# ================================================================
deploy_menu() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Deploy para o servidor"
        echo "============================================"
        echo
        echo "  Servidor: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
        echo
        echo "  1. Deploy completo (frontend + backend)"
        echo "  2. Deploy so o frontend"
        echo "  3. Deploy so o backend"
        echo "  4. Enviar banco de dados local pro servidor (sobrescreve os dados de la)"
        echo "  5. Sincronizar dados locais com os dados do servidor (traz o banco de la pro PC)"
        echo "  0. Voltar"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) deploy_completo ;;
            2) deploy_opcao_frontend ;;
            3) deploy_opcao_backend ;;
            4) deploy_banco ;;
            5) deploy_baixar_banco ;;
            0) return ;;
        esac
    done
}

deploy_completo() {
    if ! fazer_deploy_frontend; then deploy_erro; return; fi
    if ! fazer_deploy_backend; then deploy_erro; return; fi
    deploy_verificar
    echo
    echo "Deploy completo finalizado."
    pause
}

deploy_opcao_frontend() {
    if ! fazer_deploy_frontend; then deploy_erro; return; fi
    deploy_verificar
    echo
    echo "Deploy do frontend finalizado."
    pause
}

deploy_opcao_backend() {
    if ! fazer_deploy_backend; then deploy_erro; return; fi
    deploy_verificar
    echo
    echo "Deploy do backend finalizado."
    pause
}

deploy_erro() {
    echo
    echo "Deploy interrompido por um erro acima."
    pause
}

deploy_banco() {
    echo
    echo "============================================"
    echo "  ATENCAO - Enviar banco de dados local pro servidor"
    echo "============================================"
    echo
    echo "Isso vai SUBSTITUIR o banco de dados do servidor (backend/vrfinance.db de"
    echo "la) pelo banco local (backend/vrfinance.db daqui), e tambem a pasta de"
    echo "anexos (backend/uploads/), se existir localmente. Qualquer lancamento ou"
    echo "anexo que exista SO no servidor (e nao aqui) sera perdido."
    echo
    echo "Use isso apenas quando o banco local estiver mais atualizado que o do"
    echo "servidor (ex: depois de importar/editar dados so localmente). NAO e uma"
    echo "etapa de rotina do deploy -- normalmente o deploy so envia codigo."
    echo
    echo "Por seguranca, o banco atual do servidor sera copiado com backup antes de"
    echo "ser sobrescrito."
    echo
    read -rp "Digite SIM para confirmar: " confirma || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
    if [ "$confirma" != "SIM" ]; then
        echo
        echo "Cancelado."
        pause
        return
    fi

    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)"

    echo
    echo "[1/4] Parando o backend no servidor..."
    ssh_remote "sudo systemctl stop $REMOTE_SERVICE"

    echo "[2/4] Fazendo backup do banco atual do servidor (vrfinance.db.bak-$timestamp)..."
    if ! ssh_remote "cp $REMOTE_BACKEND_DIR/vrfinance.db $REMOTE_BACKEND_DIR/vrfinance.db.bak-$timestamp"; then
        echo "ERRO: falha ao fazer backup do banco no servidor. Nada foi sobrescrito."
        ssh_remote "sudo systemctl start $REMOTE_SERVICE"
        pause
        return
    fi

    echo "[3/4] Enviando o banco local pro servidor..."
    if ! scp_remote "$SCRIPT_DIR/backend/vrfinance.db" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/vrfinance.db"; then
        echo "ERRO: falha ao enviar o banco. O backup de antes continua em"
        echo "  $REMOTE_BACKEND_DIR/vrfinance.db.bak-$timestamp"
        ssh_remote "sudo systemctl start $REMOTE_SERVICE"
        pause
        return
    fi

    if [ -d "$SCRIPT_DIR/backend/uploads" ]; then
        echo "[3b] Sincronizando anexos (pasta uploads/) pro servidor..."
        ssh_remote "[ -d $REMOTE_BACKEND_DIR/uploads ] && mv $REMOTE_BACKEND_DIR/uploads $REMOTE_BACKEND_DIR/uploads.bak-$timestamp || true"
        if ! scp_remote -r "$SCRIPT_DIR/backend/uploads" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/"; then
            echo "AVISO: falha ao enviar a pasta de anexos. O banco ja foi enviado; se o"
            echo "servidor tinha anexos antigos, o backup ficou em"
            echo "  $REMOTE_BACKEND_DIR/uploads.bak-$timestamp"
        fi
    else
        echo "[3b] Nenhuma pasta local de anexos (backend/uploads) -- nada a sincronizar."
    fi

    echo "[4/4] Reiniciando o backend..."
    ssh_remote "sudo systemctl start $REMOTE_SERVICE"
    deploy_verificar

    echo
    echo "Banco enviado. Backup do banco anterior do servidor ficou salvo em:"
    echo "  $REMOTE_BACKEND_DIR/vrfinance.db.bak-$timestamp"
    echo "(apague manualmente quando confirmar que nao precisa mais dele)."
    echo
    pause
}

deploy_baixar_banco() {
    echo
    echo "============================================"
    echo "  ATENCAO - Sincronizar dados locais com o servidor"
    echo "============================================"
    echo
    echo "Isso vai SUBSTITUIR o banco de dados local (backend/vrfinance.db daqui)"
    echo "pelo banco do servidor (o notebook, acessado via Tailscale), e tambem a"
    echo "pasta de anexos (backend/uploads/), se existir no servidor. Qualquer"
    echo "lancamento ou anexo que exista SO localmente sera perdido."
    echo
    echo "Use isso pra trazer pro PC os dados mais recentes lancados direto no"
    echo "servidor (ou por outro dispositivo via Tailscale), por exemplo pra"
    echo "testar/depurar localmente com dados atuais."
    echo
    echo "Por seguranca, o banco local atual sera copiado com backup antes de ser"
    echo "sobrescrito."
    echo
    read -rp "Digite SIM para confirmar: " confirma || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
    if [ "$confirma" != "SIM" ]; then
        echo
        echo "Cancelado."
        pause
        return
    fi

    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)"

    echo
    echo "[1/4] Fazendo backup do banco local atual..."
    if ! cp "$SCRIPT_DIR/backend/vrfinance.db" "$SCRIPT_DIR/backend/vrfinance.db.bak-$timestamp"; then
        echo "ERRO: falha ao fazer backup do banco local. Nada foi sobrescrito."
        pause
        return
    fi

    echo "[2/4] Parando o backend no servidor (pra copiar um banco consistente)..."
    ssh_remote "sudo systemctl stop $REMOTE_SERVICE"

    echo "[3/4] Baixando o banco do servidor pro PC..."
    if ! scp_remote "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/vrfinance.db" "$SCRIPT_DIR/backend/vrfinance.db"; then
        echo "ERRO: falha ao baixar o banco do servidor. O backup local continua em"
        echo "  backend/vrfinance.db.bak-$timestamp"
        ssh_remote "sudo systemctl start $REMOTE_SERVICE"
        pause
        return
    fi

    echo "[3b] Sincronizando anexos (pasta uploads/) do servidor pro PC..."
    if ssh_remote "[ -d $REMOTE_BACKEND_DIR/uploads ]"; then
        if [ -d "$SCRIPT_DIR/backend/uploads" ]; then
            mv "$SCRIPT_DIR/backend/uploads" "$SCRIPT_DIR/backend/uploads.bak-$timestamp"
        fi
        if ! scp_remote -r "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/uploads" "$SCRIPT_DIR/backend/"; then
            echo "AVISO: falha ao baixar a pasta de anexos. O banco ja foi baixado; se o PC"
            echo "tinha anexos antigos, o backup ficou em backend/uploads.bak-$timestamp"
        fi
    else
        echo "[3b] Servidor nao tem pasta de anexos (uploads/) ainda -- nada a sincronizar."
    fi

    echo "[4/4] Reiniciando o backend no servidor..."
    ssh_remote "sudo systemctl start $REMOTE_SERVICE"
    deploy_verificar

    echo
    echo "Banco local atualizado. Backup do banco local anterior ficou salvo em:"
    echo "  backend/vrfinance.db.bak-$timestamp"
    echo "(apague manualmente quando confirmar que nao precisa mais dele)."
    echo
    pause
}

fazer_deploy_frontend() {
    echo
    echo "[Frontend] Buildando (ionic build --prod)..."
    (cd "$SCRIPT_DIR/frontend" && ionic build --prod)
    if [ $? -ne 0 ]; then
        echo "ERRO: build do frontend falhou."
        return 1
    fi

    echo "[Frontend] Limpando pasta remota..."
    # So limpa o CONTEUDO (find -mindepth 1 -delete), nunca o diretorio em si -- /var/www e
    # dono de root, entao o usuario usuario-servidor (dono so de /var/www/vrfinance) nao tem
    # permissao pra apagar a entrada do diretorio no pai, so o que esta dentro dele.
    if ! ssh_remote "mkdir -p $REMOTE_FRONTEND_DIR && find $REMOTE_FRONTEND_DIR -mindepth 1 -delete"; then
        echo "ERRO: nao consegui limpar a pasta remota do frontend."
        return 1
    fi

    echo "[Frontend] Enviando build novo..."
    if ! scp_remote -r "$SCRIPT_DIR/frontend/www/"* "$REMOTE_USER@$REMOTE_HOST:$REMOTE_FRONTEND_DIR/"; then
        echo "ERRO: falha ao enviar o build do frontend."
        return 1
    fi
    return 0
}

fazer_deploy_backend() {
    echo
    echo "[Backend] Enviando codigo (app/ e requirements.txt)..."
    if ! ssh_remote "rm -rf $REMOTE_BACKEND_DIR/app && mkdir -p $REMOTE_BACKEND_DIR/app"; then
        echo "ERRO: nao consegui limpar a pasta remota do backend."
        return 1
    fi

    if ! scp_remote -r "$SCRIPT_DIR/backend/app/"* "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/app/"; then
        echo "ERRO: falha ao enviar o codigo do backend."
        return 1
    fi

    if ! scp_remote "$SCRIPT_DIR/backend/requirements.txt" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_BACKEND_DIR/requirements.txt"; then
        echo "ERRO: falha ao enviar o requirements.txt."
        return 1
    fi

    echo "[Backend] Instalando dependencias (rapido se nada mudou)..."
    if ! ssh_remote "cd $REMOTE_BACKEND_DIR && venv/bin/pip install -r requirements.txt"; then
        echo "ERRO: falha ao instalar dependencias no servidor."
        return 1
    fi

    echo "[Backend] Reiniciando o servico..."
    ssh_remote "sudo systemctl restart $REMOTE_SERVICE"
    return 0
}

deploy_verificar() {
    echo
    echo "[Verificacao] Aguardando o backend ficar pronto (tenta por ate 30s)..."
    local ok=0 i code
    for i in $(seq 1 15); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$WEB_BASE/api/docs" 2>/dev/null)"
        if [ "$code" = "200" ]; then
            ok=1
            break
        fi
        sleep 2
    done
    if [ "$ok" -eq 0 ]; then
        echo "  (backend ainda nao respondeu apos 30s -- os testes abaixo podem mostrar erro)"
    fi

    echo
    echo "[Verificacao] Testando o site..."
    printf "  Frontend  %s/            -> HTTP %s\n" "$WEB_BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/")"
    printf "  Backend   %s/api/docs    -> HTTP %s\n" "$WEB_BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/api/docs")"
}

# ================================================================
#  3) Ligar / desligar / status do servidor
# ================================================================
server_menu() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Ligar/desligar o site"
        echo "============================================"
        echo
        echo "  Servidor: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
        echo
        echo "  1. Iniciar o site (subir o backend)"
        echo "  2. Parar o site (derrubar o backend)"
        echo "  3. Reiniciar o backend"
        echo "  4. Ver status"
        echo "  0. Voltar"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) server_iniciar ;;
            2) server_parar ;;
            3) server_reiniciar ;;
            4) server_status ;;
            0) return ;;
        esac
    done
}

server_iniciar() {
    ssh_remote "sudo systemctl start $REMOTE_SERVICE"
    echo
    echo "Backend iniciado."
    server_status_rapido
    pause
}

server_parar() {
    ssh_remote "sudo systemctl stop $REMOTE_SERVICE"
    echo
    echo "Backend parado. O site vai parar de responder em /api ate voce iniciar de novo."
    pause
}

server_reiniciar() {
    ssh_remote "sudo systemctl restart $REMOTE_SERVICE"
    echo
    echo "Backend reiniciado."
    server_status_rapido
    pause
}

server_status() {
    ssh_remote "sudo systemctl status $REMOTE_SERVICE --no-pager"
    server_status_rapido
    pause
}

server_status_rapido() {
    echo
    printf "  Frontend  %s/            -> HTTP %s\n" "$WEB_BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/")"
    printf "  Backend   %s/api/docs    -> HTTP %s\n" "$WEB_BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/api/docs")"
}

# ================================================================
#  4) Backup do servidor (projeto + configuracoes)
# ================================================================
backup_menu() {
    clear
    echo "============================================"
    echo "  VR Finance - Backup do servidor"
    echo "============================================"
    echo
    echo "Isso empacota a pasta do projeto no servidor (~/vrfinance -- codigo,"
    echo "banco de dados, build do frontend, .env) mais os arquivos de configuracao"
    echo "do systemd e do nginx, num unico .tar.gz, salvo em:"
    echo "  $DEST_DIR"
    echo
    echo "O venv do backend NAO entra no backup (facilmente reconstruido e so"
    echo "aumenta o tamanho/tempo do tar) -- apos restaurar, e preciso recria-lo"
    echo "(ver instrucoes no final). Isso NAO e um backup do Ubuntu inteiro (pra"
    echo "isso, reinstalar o SO e rodar scripts/setup_ubuntu_server.sh de novo)."
    echo
    read -rp "Continuar? (s/N): " confirma || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
    case "$confirma" in
        [sS]) ;;
        *) return ;;
    esac

    mkdir -p "$DEST_DIR"

    local timestamp remote_file local_file remote_tmp
    timestamp="$(date +%Y%m%d-%H%M%S)"
    remote_file="vrfinance-backup-$timestamp.tar.gz"
    local_file="$DEST_DIR/$remote_file"
    # Fica em /tmp (fora de ~/vrfinance) pra nao dar "file changed as we read it" por
    # escrever o proprio arquivo de saida dentro da pasta que esta sendo lida.
    remote_tmp="/tmp/$remote_file"

    echo
    echo "[1/3] Empacotando o projeto e as configuracoes no servidor..."
    if ! ssh_remote "tar czf $remote_tmp --exclude=vrfinance/backend/venv -C /home/$REMOTE_USER vrfinance --transform 's,^,vrfinance/,S' -C /etc/systemd/system $REMOTE_SERVICE.service --transform 's,^,etc-systemd/,S' -C /etc/nginx/sites-available vrfinance --transform 's,^,etc-nginx/,S'"; then
        echo
        echo "ERRO: falha ao empacotar o backup no servidor."
        pause
        return
    fi

    echo
    echo "[2/3] Copiando o arquivo pro PC..."
    if ! scp_remote "$REMOTE_USER@$REMOTE_HOST:$remote_tmp" "$local_file"; then
        echo
        echo "ERRO: falha ao copiar o arquivo do servidor. O arquivo remoto NAO foi"
        echo "apagado, pra voce poder tentar copiar de novo manualmente:"
        echo "  $remote_tmp"
        pause
        return
    fi

    # So apaga do servidor depois de confirmar que a copia chegou inteira no PC (mesmo
    # tamanho dos dois lados) -- nunca apaga o original as ciegas.
    local local_size remote_size
    local_size="$(stat -c %s "$local_file")"
    remote_size="$(ssh_remote "stat -c %s $remote_tmp")"

    if [ "$local_size" != "$remote_size" ]; then
        echo
        echo "ERRO: o arquivo copiado ($local_size bytes) nao bate com o tamanho do"
        echo "arquivo no servidor ($remote_size bytes). O arquivo remoto NAO foi"
        echo "apagado, por seguranca:"
        echo "  $remote_tmp"
        pause
        return
    fi

    echo
    echo "[3/3] Copia confirmada ($local_size bytes). Limpando o arquivo temporario no servidor..."
    ssh_remote "rm $remote_tmp"

    # Grava a hora deste backup num arquivo simples no servidor -- e o que GET /backup-status
    # (app) le pra saber ha quantos dias foi o ultimo backup.
    ssh_remote "date -u +%Y-%m-%dT%H:%M:%S+00:00 > $REMOTE_BACKEND_DIR/last_backup.txt"

    echo
    echo "============================================"
    echo "Copia salva em:"
    echo "  $local_file"
    echo "============================================"
    echo
    echo "Para restaurar num servidor novo (Ubuntu Server, mesmo usuario \"usuario-servidor\"):"
    echo "  1. Rode scripts/setup_ubuntu_server.sh la (cria pastas, servico, nginx)"
    echo "  2. Copie o .tar.gz pro servidor novo e extraia:"
    echo "     tar xzf vrfinance-backup-....tar.gz -C /tmp/restore"
    echo "     cp -r /tmp/restore/vrfinance/. ~/vrfinance/"
    echo "     sudo cp /tmp/restore/etc-systemd/*.service /etc/systemd/system/"
    echo "     sudo cp /tmp/restore/etc-nginx/vrfinance /etc/nginx/sites-available/"
    echo "  3. Recrie o venv do backend (nao entra no backup):"
    echo "     cd ~/vrfinance/backend && python3 -m venv venv && venv/bin/pip install -r requirements.txt"
    echo "  4. sudo systemctl daemon-reload && sudo systemctl restart $REMOTE_SERVICE && sudo systemctl reload nginx"
    echo
    pause
}

# ================================================================
#  5) Criar build APP (gerar APK Android via Capacitor)
# ================================================================
criar_build_app() {
    clear
    echo "============================================"
    echo "  VR Finance - Criar build APP (Android)"
    echo "============================================"
    echo
    echo "Isso builda o frontend com a configuracao \"mobile\" (apiUrl absoluto via"
    echo "Tailscale, em vez do /api relativo usado no deploy web), sincroniza com o"
    echo "projeto nativo (Capacitor) e gera um APK de debug pra instalar direto no"
    echo "celular (sideload)."
    echo

    export PATH="$BUILD_JAVA_HOME/bin:$PATH"
    export JAVA_HOME="$BUILD_JAVA_HOME"
    export ANDROID_HOME="$BUILD_ANDROID_SDK"

    echo "[1/4] Buildando o frontend (configuracao mobile)..."
    (cd "$SCRIPT_DIR/frontend" && npx ng build --configuration=mobile)
    if [ $? -ne 0 ]; then
        echo "ERRO: build do frontend falhou."
        pause
        return
    fi

    echo
    echo "[2/4] Sincronizando com o projeto Android (Capacitor)..."
    (cd "$SCRIPT_DIR/frontend" && npx cap sync android)
    if [ $? -ne 0 ]; then
        echo "ERRO: falha ao sincronizar o projeto Android."
        pause
        return
    fi

    echo
    echo "[3/4] Gerando o APK (gradlew assembleDebug, pode demorar na primeira vez)..."
    (cd "$SCRIPT_DIR/frontend/android" && ./gradlew assembleDebug)
    if [ $? -ne 0 ]; then
        echo "ERRO: falha ao gerar o APK."
        pause
        return
    fi

    echo
    echo "[4/4] Movendo o APK gerado pra raiz do projeto..."
    local timestamp apk_origem apk_destino
    timestamp="$(date +%Y%m%d-%H%M%S)"
    apk_origem="$SCRIPT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
    apk_destino="$SCRIPT_DIR/VRFinance-$timestamp.apk"
    if [ ! -f "$apk_origem" ]; then
        echo "ERRO: nao encontrei o APK gerado em:"
        echo "  $apk_origem"
        pause
        return
    fi
    mv -f "$apk_origem" "$apk_destino"

    echo
    echo "============================================"
    echo "APK gerado em:"
    echo "  $apk_destino"
    echo "============================================"
    echo
    echo "Copie esse arquivo pro celular (cabo USB, Google Drive, etc.) e abra-o"
    echo "pra instalar -- na primeira vez o Android vai pedir pra habilitar"
    echo "\"instalar de fontes desconhecidas\" pra esse app/origem."
    echo
    pause
}

# ================================================================
#  6) Mudar endereco do servidor
# ================================================================
ip_menu() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Mudar endereco do servidor"
        echo "============================================"
        echo
        echo "  Endereco atual usado pelo deploy/SSH:          $REMOTE_HOST"
        echo
        echo "  Sao dois enderecos separados, cada um usado numa situacao diferente:"
        echo "  - Deploy/SSH (este menu.sh): tenta primeiro o IP da rede local"
        echo "    ($LOCAL_HOST) e, sem resposta, o hostname do Tailscale. A opcao 1"
        echo "    fixa um endereco (sem tentativa/fallback) em server-ip.txt."
        echo "  - App Android nativo (o APK instalado no celular): mesma logica (rede"
        echo "    local primeiro), com o hostname do Tailscale embutido no build --"
        echo "    so muda se voce renomear o servidor no Tailscale."
        echo
        echo "  1. Mudar o endereco usado pelo deploy/SSH (este menu.sh)"
        echo "  2. Mudar o endereco usado pelo app Android nativo (precisa gerar novo APK depois)"
        echo "  0. Voltar"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) ip_mudar_local ;;
            2) ip_mudar_tailscale ;;
            0) return ;;
        esac
    done
}

ip_mudar_local() {
    echo
    echo "Endereco atual: $REMOTE_HOST"
    read -rp "Novo endereco (IP ou hostname do servidor), ou Enter para cancelar: " novo_ip || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
    if [ -z "$novo_ip" ]; then
        echo
        echo "Cancelado."
        pause
        return
    fi

    echo "$novo_ip" > "$SERVER_IP_FILE"
    select_remote_host
    echo
    echo "Endereco atualizado para $REMOTE_HOST (salvo em \"$SERVER_IP_FILE\" -- vale"
    echo "pra essa sessao do menu.sh e pras proximas vezes que ele for aberto)."
    echo
    echo "Testando a conexao..."
    deploy_verificar
    pause
}

ip_mudar_tailscale() {
    echo
    read -rp "Novo endereco do Tailscale (IP ou hostname), ou Enter para cancelar: " novo_ip || { echo; echo "Entrada encerrada -- saindo."; exit 1; }
    if [ -z "$novo_ip" ]; then
        echo
        echo "Cancelado."
        pause
        return
    fi

    if [ ! -f "$MOBILE_ENV_FILE" ]; then
        echo
        echo "ERRO: nao encontrei $MOBILE_ENV_FILE"
        pause
        return
    fi

    # HTTPS via Tailscale (certificado so vale pro hostname MagicDNS, nao pra IP).
    # So a linha "apiUrl:" -- a "localApiUrl:" (IP da rede local, http) fica intacta.
    sed -i -E "/^[[:space:]]*apiUrl:/ s#https?://[^/'\"]+/api#https://$novo_ip/api#" "$MOBILE_ENV_FILE"

    echo
    echo "environment.mobile.ts atualizado com o novo endereco do Tailscale"
    echo "(https://$novo_ip/api -- use o hostname MagicDNS, o certificado nao vale pra IP)."
    echo
    echo "IMPORTANTE: o app Android ja instalado no celular continua com o IP antigo"
    echo "embutido no APK -- gere um novo APK (opcao 5, \"Criar build APP\") e"
    echo "reinstale no celular pra essa mudanca valer de fato."
    echo
    pause
}

# ================================================================
#  7) Servidor (SSH / bateria / armazenamento / RAM)
# ================================================================
servidor_menu() {
    while true; do
        clear
        echo "============================================"
        echo "  VR Finance - Servidor"
        echo "============================================"
        echo
        echo "  Servidor: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
        echo
        echo "  1. Iniciar SSH servidor"
        echo "  2. Checar bateria"
        echo "  3. Checar armazenamento"
        echo "  4. Checar uso de RAM"
        echo "  5. Ver IP e MAC do servidor"
        echo "  0. Voltar"
        echo
        read -rp "Escolha uma opcao: " opcao || { echo; echo "Entrada encerrada -- saindo."; exit 1; }

        case "$opcao" in
            1) ssh -p "$REMOTE_PORT" "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" ;;
            2) servidor_bateria ;;
            3) servidor_armazenamento ;;
            4) servidor_ram ;;
            5) servidor_rede ;;
            0) return ;;
        esac
    done
}

servidor_bateria() {
    echo
    echo "Bateria (capacidade % / status):"
    ssh_remote 'bat=$(ls /sys/class/power_supply/ | grep -m1 BAT); cat /sys/class/power_supply/$bat/capacity; cat /sys/class/power_supply/$bat/status'
    pause
}

servidor_armazenamento() {
    echo
    ssh_remote "df -h /"
    pause
}

servidor_ram() {
    echo
    ssh_remote "free -h"
    echo
    echo "Percentual livre (relativo ao total):"
    ssh_remote 'free | awk '"'"'/^Mem:/{print int($4/$2*1000+0.5)/10}'"'"''
    echo "Percentual disponivel (relativo ao total):"
    ssh_remote 'free | awk '"'"'/^Mem:/{print int($7/$2*1000+0.5)/10}'"'"''
    pause
}

servidor_rede() {
    echo
    echo "Interface de rede local (nome / IP / MAC):"
    ssh_remote 'IFACE=$(ip -o -4 route show to default | awk '"'"'{print $5; exit}'"'"'); echo "$IFACE"; ip -4 addr show dev "$IFACE" | awk '"'"'/inet /{print $2}'"'"'; ip link show dev "$IFACE" | awk '"'"'/ether/{print $2}'"'"''
    echo
    echo "IP do Tailscale:"
    ssh_remote "command -v tailscale >/dev/null 2>&1 && tailscale ip -4 || echo indisponivel"
    pause
}

# ================================================================
#  8) Preparar pasta GitHub (copia sanitizada)
# ================================================================

main_loop
