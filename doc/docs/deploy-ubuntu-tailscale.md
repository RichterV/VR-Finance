# Deploy: Ubuntu Server + nginx + Tailscale

Desde 2026-08-29 o servidor é um **notebook com Ubuntu Server**, acessado de qualquer lugar via
[Tailscale](https://tailscale.com/) (hostname MagicDNS `SEU-SERVIDOR.tailXXXX.ts.net`). Ele substituiu
o celular Android/Termux usado antes (ver [Deploy no Android (Termux) — histórico](deploy-android-tailscale.md)).

## Componentes

- **FastAPI + uvicorn** em `127.0.0.1:8000`, supervisionado pelo **systemd** (serviço
  `vrfinance-backend`): reinicia sozinho se cair e sobe no boot, sem interação manual
- **nginx** na porta **8080**: serve o build estático do Ionic (`/var/www/vrfinance`) e faz proxy de
  `/api/` para o uvicorn (removendo o prefixo `/api`)
- **Tailscale** com `tailscale serve`: HTTPS na porta 443 com certificado válido pro hostname MagicDNS,
  repassando para o nginx em `http://127.0.0.1:8080`
- **SQLite** (`~/vrfinance/backend/vrfinance.db`) e anexos em `~/vrfinance/backend/uploads/`

```text
celular/PC ──HTTPS──▶ tailscale serve :443 ──▶ nginx :8080 ─┬─ /      → /var/www/vrfinance
                                                             └─ /api/  → uvicorn 127.0.0.1:8000
rede local ──HTTP───▶ nginx :8080 (direto, pelo IP)
```

## 1. Setup inicial do servidor (uma vez)

Pré-requisitos: Ubuntu Server instalado, um usuário comum (`usuario-do-servidor`), SSH ativo e o
Tailscale instalado e logado no mesmo tailnet do PC e do celular, com **MagicDNS** e **HTTPS**
habilitados no painel do Tailscale.

Copie `scripts/setup_ubuntu_server.sh` pro servidor e rode **direto nele**, com sudo:

```bash
sudo bash ~/setup_ubuntu_server.sh
```

O script é **idempotente** (pode rodar de novo se algo falhar ou para reconfigurar). Ele:

1. Instala `nginx`, `python3-venv` e `python3-pip`
2. Cria `~/vrfinance/backend` (com um venv vazio — as dependências entram no primeiro deploy) e
   `/var/www/vrfinance`
3. Cria o serviço systemd `vrfinance-backend` (`Restart=always`, habilitado no boot)
4. Configura o site do nginx (porta 8080, `try_files ... /index.html` pras rotas do Angular, proxy
   `/api/` → `127.0.0.1:8000/`, `client_max_body_size 12M` pra acompanhar o limite de 10 MB dos
   anexos — o padrão de 1 MB do nginx rejeitaria fotos de celular com 413) e remove o site `default`
5. Libera a porta 8080 no `ufw`, só se ele já estiver ativo
6. Garante que o SSH sobe no boot
7. Cria `/etc/sudoers.d/vrfinance-deploy`, liberando **sem senha** só os comandos que o `menu.sh` usa
   remotamente (`systemctl start/stop/restart/status vrfinance-backend` e `systemctl reload nginx`)

!!! info "Por que o frontend fica em `/var/www`, fora do home"
    O home do usuário tem permissão `750` (só o dono entra). O nginx roda como `www-data` e não
    consegue atravessar o diretório — dava **500** em tudo (`stat() ... failed (13: Permission
    denied)`) numa primeira tentativa com o frontend em `~/vrfinance/frontend-www`. `/var/www` é o
    lugar padrão do nginx pra conteúdo estático.

!!! warning "Sudoers sem coringa"
    Versões recentes do `sudo` rejeitam `*` dentro de argumentos (`wildcards are not allowed in
    command arguments` no `visudo -cf`). Por isso o arquivo lista as invocações exatas, inclusive
    `status ... --no-pager` separado. O script valida com `visudo -cf` antes de instalar — se falhar,
    o arquivo antigo continua valendo.

Depois do script:

1. Copie `backend/.env` e `backend/vrfinance.db` pro servidor **uma vez** (com `scp`, para
   `~/vrfinance/backend/`) — ou crie um `.env` novo lá e rode `python -m app.seed_master`
2. Do PC: `./menu.sh` → **2. Deploy para o servidor** → **1. Deploy completo**
3. Publique via HTTPS (uma vez): `sudo tailscale serve --bg 8080`
4. Teste `https://SEU-SERVIDOR.tailXXXX.ts.net/` (e `http://IP-LOCAL-DO-SERVIDOR:8080/` na rede local)

## 2. Acesso SSH sem senha (no PC)

Todo o deploy é SSH/SCP não interativo, então a chave do PC precisa estar no servidor:

```bash
ssh-keygen -t ed25519            # se ainda não houver ~/.ssh/id_ed25519
ssh-copy-id usuario-do-servidor@SEU-SERVIDOR.tailXXXX.ts.net
```

O usuário, a porta, o hostname do Tailscale e o IP local ficam no topo do `menu.sh` (`REMOTE_USER`,
`REMOTE_PORT`, `TAILSCALE_HOST`, `LOCAL_HOST`).

## 3. Deploy pelo `menu.sh`

Opções do menu principal que falam com o servidor:

| opção | o que faz |
|---|---|
| **2. Deploy para o servidor** | 1 completo · 2 só frontend · 3 só backend · 4 enviar banco local pro servidor · 5 sincronizar dados locais com o servidor |
| **3. Ligar / desligar / status** | `systemctl start/stop/restart/status vrfinance-backend` via SSH |
| **4. Backup do servidor** | `.tar.gz` de `~/vrfinance` (sem o venv) + unit do systemd + site do nginx, baixado pro PC; grava `last_backup.txt` (usado pelo aviso de backup de 30 dias do app) |
| **5. Criar build APP** | APK Android (ver [Gerar o app Android](build-app.md)) |
| **6. Mudar endereço do servidor** | 1 fixa um endereço pro deploy/SSH em `server-ip.txt` · 2 troca o `apiUrl` do APK |
| **7. Servidor** | sessão SSH, bateria, disco, RAM, IP/MAC |
| **8. Preparar pasta GitHub** | espelho público sanitizado (ver [abaixo](#8-espelho-publico-no-github)) |

O **deploy** builda o frontend (`ionic build --prod`), limpa e reenvia `/var/www/vrfinance`, substitui
`~/vrfinance/backend/app/` e o `requirements.txt`, roda `venv/bin/pip install -r requirements.txt`
(rápido se nada mudou), reinicia o serviço e verifica: faz polling de `/api/docs` por até 30s e
mostra o código HTTP do frontend e do backend.

!!! info "Migrações rodam sozinhas"
    Não há passo de migração no deploy: ao reiniciar, o backend aplica as mudanças de schema e as
    migrações de dados pendentes (`_migrate_schema()` em `app/main.py`, com `PRAGMA user_version`
    marcando as de uso único). Faça um backup (opção 4) antes de um deploy com migração de dados.

!!! note "Pode exigir novo login"
    Mudanças no formato do token (ex: a revogação por `token_version`, que passou a exigir `uid`/`tv`
    no JWT) invalidam os tokens antigos — cada aparelho faz login uma vez depois do deploy. Um APK
    novo que mude a origem do WebView também pede login (ver [Gerar o app Android](build-app.md)).

### Banco e `.env` ficam fora do deploy de rotina

O deploy só mexe em código. O banco e o `.env` são copiados uma vez no setup e depois só por escolha
explícita, ambos com confirmação digitando `SIM` e backup do lado sobrescrito:

- **2 → 4. Enviar banco local pro servidor** (PC → servidor, uso raro): para o backend, guarda
  `vrfinance.db.bak-<data>` (e `uploads.bak-<data>`) no servidor, copia banco e anexos, reinicia
- **2 → 5. Sincronizar dados locais com o servidor** (servidor → PC): o servidor é a fonte da
  verdade; traz banco e anexos pro PC para testar com dados reais

Ambas param o serviço antes de copiar, pra ter uma cópia consistente do SQLite. A cópia automática
no login (abaixo) faz o mesmo sem parar o servidor.

## 4. HTTPS via Tailscale

```bash
sudo tailscale serve --bg 8080
```

Publica `https://SEU-SERVIDOR.tailXXXX.ts.net/` (porta 443, certificado automático) apontando para
`http://127.0.0.1:8080`, então o nginx precisa continuar em 8080. O nginx segue escutando em todas as
interfaces (`listen 8080;`), por isso `http://...:8080` continua respondendo — necessário pro acesso
pela rede local. Para deixar só o HTTPS, troque por `listen 127.0.0.1:8080;` (e desligue o
`localApiUrl` do APK).

O build web usa `/api` relativo e funciona nos dois endereços. O APK usa o HTTPS do Tailscale (o
certificado só vale pro hostname, nunca pro IP).

## 5. Rede local primeiro

Em casa, falar direto com o servidor pela LAN é mais rápido que passar pelo Tailscale. Tanto o
`menu.sh` quanto o APK tentam o IP local primeiro:

- **`menu.sh`**: ao entrar nas opções 2, 3, 4 e 7, testa SSH em `LOCAL_HOST` (`ConnectTimeout=2`,
  `BatchMode`); respondendo, usa o IP, senão o hostname do Tailscale. SSH/SCP pelo IP usam
  `-o HostKeyAlias=SEU-SERVIDOR.tailXXXX.ts.net` (reaproveita a chave já aceita, sem prompt). As
  verificações HTTP usam `http://IP-LOCAL-DO-SERVIDOR:8080` na LAN e `https://<hostname>` no
  Tailscale. Um `server-ip.txt` na raiz (opção 6.1, não versionado) fixa um endereço e desliga o
  teste.
- **APK**: `localApiUrl` (`http://IP-LOCAL-DO-SERVIDOR:8080/api`) é testado em `/health` no startup
  (até 1,5s), ao voltar pro primeiro plano e no evento `online`. Uma requisição na LAN que falha com
  status 0 passa a usar o Tailscale; só GET/HEAD são repetidos sozinhos (POST/PUT/DELETE podem ter
  sido gravados antes da queda). Exige `allowMixedContent` e cleartext liberado só pro IP — ver
  [Gerar o app Android](build-app.md#rede-https-por-padrao-http-so-na-rede-local).

!!! tip "Reserve o IP no roteador"
    O IP local fica embutido no APK e no `menu.sh`. Reserve-o no DHCP do roteador (o `menu.sh` → 7 →
    5 mostra IP e MAC da interface do servidor).

## 6. Backup automático pro HD externo

O mesmo notebook tem um HD externo USB (label `hd-externo`, montado em `/mnt/hd-externo` via
`/etc/fstab` com `nofail`) que recebe backups automáticos de hora marcada (script e cron fora deste
repositório, junto com outros serviços da máquina):

- **VR Finance**: `tar` de `~/vrfinance`, mantendo os **3 snapshots** mais recentes (outros serviços
  usam `rsync --link-dest`, com hard links pro snapshot anterior). A poda só roda depois de um backup
  bem-sucedido — falhas repetidas nunca apagam snapshots válidos.
- **Arquivo sentinela**: antes de gravar, o script confere se `/mnt/hd-externo/.hd-externo-presente`
  existe — esse arquivo só existe no disco externo. Sem isso, um HD desmontado faria o backup
  "funcionar" gravando na pasta vazia do disco do sistema.
- **Automount** (`scripts/setup_hd_externo_automount.sh`, rodar uma vez com sudo no servidor): o
  `nofail` só monta no boot, e um HD que cai do barramento USB não remonta sozinho. O script cria
  duas camadas redundantes: um **timer systemd** a cada 2 minutos
  (`mountpoint -q /mnt/hd-externo || mount /mnt/hd-externo`) e uma **regra udev** que remonta na hora
  quando o disco reconecta.

## 7. Cópia automática do banco pro PC

`scripts/sync_db_from_server.sh` faz, a cada login no PC de desenvolvimento, o mesmo que a opção
2 → 5 do menu, mas sem confirmação e **sem parar o backend**:

- **Snapshot consistente** pela API de backup do SQLite (`sqlite3.Connection.backup`, com o `python3`
  do servidor, num arquivo em `/tmp` de lá) — quem estiver usando o app não percebe nada
- **Anexos** via `rsync -rt --delete --stats` (incremental, espelha o servidor)
- O banco baixado passa por **`PRAGMA integrity_check`** antes de substituir o local; a troca é um
  `mv` atômico
- O banco local anterior vai pra `backend/db-backups/vrfinance-AAAAMMDD-HHMMSS.db`, mantendo os **7**
  mais recentes
- **Notificação** (`notify-send`) no sucesso — com o tamanho total no PC (banco + anexos) e quantos
  anexos vieram nesta cópia — e na falha
- Tenta IP local e depois Tailscale, por até 5 minutos (20 × 15s) esperando a rede; `flock` evita
  execuções simultâneas; SSH com `BatchMode=yes` (nunca trava pedindo senha); log em
  `~/.local/state/vrfinance/sync.log` (rotaciona em 1 MB)

Instalação (cria `~/.config/autostart/vrfinance-sync.desktop`, com atraso de 20s após o login, dentro
da sessão gráfica pra que a notificação funcione):

```bash
bash scripts/install_sync_autostart.sh            # instalar
bash scripts/install_sync_autostart.sh --remove   # desinstalar
bash scripts/sync_db_from_server.sh               # rodar na mão
```

!!! warning "Substitui o banco local inteiro"
    Dados que só existem no PC somem na próxima cópia (ficam só nos 7 backups de `db-backups/`).

## 8. Espelho público no GitHub

`./menu.sh` → **8** roda `scripts/prepare_github.py`, que copia `backend/`, `frontend/`, `doc/` e
`menu.sh` para `GitHub/` sem bancos, backups, anexos, `.env`, venv, `node_modules` e builds, troca
hostname/IP/usuário reais por placeholders e remove os módulos pessoais (Operações Bolsa, Devedores)
por substituição exata de blocos — falhando alto se um bloco esperado não for encontrado. No fim,
uma varredura procura vazamentos (valores do `.env`, arquivos SQLite, e-mails, caminhos locais,
nomes de terceiros) antes do `git commit`/`push`.

!!! danger "Nada de dados reais na documentação"
    `doc/` vai pro espelho público. Use sempre placeholders (`SEU-SERVIDOR.tailXXXX.ts.net`,
    `IP-LOCAL-DO-SERVIDOR`, `usuario-do-servidor`) e nunca nomes reais de pessoas em exemplos.
