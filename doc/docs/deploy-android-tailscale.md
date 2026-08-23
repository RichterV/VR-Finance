# Deploy: Android (Termux) + nginx + Tailscale

Objetivo: rodar o backend FastAPI e o build web do frontend Ionic direto num celular Android, servidos
por nginx, acessíveis tanto na rede local quanto de qualquer lugar via Tailscale.

## Componentes

- **Termux**: userland Linux no Android, roda Python, nginx etc. — instalado como app comum (F-Droid
  ou Google Play)
- **FastAPI + uvicorn**: escutando em `127.0.0.1:8000` dentro do Termux
- **Build do Ionic** (`ionic build --prod`): arquivos estáticos servidos pelo nginx
- **nginx**: serve os estáticos do Ionic e faz reverse proxy de `/api` para o uvicorn, na porta 8080
- **Tailscale** (app Android oficial): dá ao celular um IP `100.x.y.z` acessível de qualquer
  dispositivo do seu tailnet, sem precisar abrir porta no roteador

Estes passos já foram executados com sucesso num celular de teste (Android 8.1, API level 27). Os
valores específicos (IP, porta, API level) variam por celular — sempre confirme de novo numa máquina
nova, o resto do procedimento é igual.

## 1. Acesso SSH sem senha

No Termux: instalar `openssh`, definir uma senha local (`passwd`) e iniciar o `sshd`. Depois, copiar a
chave pública do PC pro celular (sem `ssh-copy-id` nativo no Windows):

```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh -p 8022 usuario@IP_DO_CELULAR "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Depois disso, `ssh -p 8022 usuario@IP` loga direto, sem pedir senha — necessário porque todo o deploy
via `menu.bat` depende de SSH/SCP não interativos.

## 2. Localizar a config do nginx

```
/data/data/com.termux/files/usr/etc/nginx/nginx.conf
```

`$PREFIX` no Termux aponta pra essa mesma pasta `usr/`, mas variáveis de ambiente não expandem dentro
de um comando `ssh usuario@ip "comando com $VAR"` disparado do Windows — use sempre o caminho absoluto
acima ao investigar remotamente por SSH.

## 3. Instalar Python e as dependências do backend

```
pkg install python -y
cd ~/vrfinance/backend
python -m venv venv
venv/bin/pip install -r requirements.txt
```

Dois problemas conhecidos nessa etapa, ambos porque pacotes com extensão nativa (Rust/C) não têm wheel
pré-compilado pra plataforma do Termux:

- **`pydantic-core` tentando baixar Rust via `rustup`** (`Target triple not supported by rustup`) →
  instalar o Rust pelo próprio `pkg` do Termux em vez do rustup: `pkg install rust -y`
- **`maturin` sem saber o nível de API do Android** (`Failed to determine Android API level`) →
  descobrir com `getprop ro.build.version.sdk` e repetir a instalação com
  `ANDROID_API_LEVEL=<numero> venv/bin/pip install -r requirements.txt`

## 4. Migrar o `.env` e o banco

```powershell
scp -P 8022 backend\.env usuario@IP:~/vrfinance/backend/.env
scp -P 8022 backend\vrfinance.db usuario@IP:~/vrfinance/backend/vrfinance.db
```

## 5. Configurar o nginx (frontend estático + proxy do backend)

Dentro do bloco `server { listen 8080; ... }`, substituir a `location /` padrão por:

```nginx
location / {
    root /data/data/com.termux/files/home/vrfinance/frontend-www;
    try_files $uri $uri/ /index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
}
```

- A barra final em `proxy_pass` (`.../`) faz o nginx **remover** o prefixo `/api` antes de repassar pro
  backend — as rotas do FastAPI não têm esse prefixo.
- `try_files ... /index.html` é obrigatório porque o Angular Router usa rotas client-side.
- Depois de editar, sempre `nginx -t` (valida sintaxe) e `nginx -s reload` (aplica sem matar conexões)
  — editar o arquivo sem recarregar não tem efeito, o worker continua servindo a config antiga.

## 6. Buildar e copiar o frontend

```powershell
cd frontend
ionic build --prod
scp -P 8022 -r www\* usuario@IP:~/vrfinance/frontend-www/
```

`apiUrl` em `environment.prod.ts` é `/api` (relativo) — funciona por qualquer IP/porta que o nginx
esteja escutando, sem hardcodar endereço.

## 7. Supervisionar o backend (`termux-services`)

Rodar `uvicorn` em primeiro plano mata o processo quando a sessão SSH termina; um `nohup` solto não
reinicia sozinho se cair. A solução é `termux-services` (empacota o `runit`, o mesmo supervisor usado
por padrão pelo nginx/sshd do Termux):

```
pkg install termux-services -y
mkdir -p $PREFIX/var/service/vrfinance-backend/log
cat > $PREFIX/var/service/vrfinance-backend/run <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
cd /data/data/com.termux/files/home/vrfinance/backend
exec venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 2>&1
EOF
chmod +x $PREFIX/var/service/vrfinance-backend/run
```

Sem um arquivo `down` na pasta do serviço, ele sobe automaticamente. O Termux já tem um hook em
`$PREFIX/etc/profile.d/start-services.sh` que sobe o `runsvdir` (o supervisor) em toda sessão nova —
não precisa editar `.bashrc`. Testar:

```
sv status $PREFIX/var/service/*
curl http://127.0.0.1:8000/docs
curl http://127.0.0.1:8080/api/docs
```

!!! warning "`cd pasta && comando &` num único comando SSH"
    Só o processo em si mantém o `cd` — qualquer coisa depois de um `;` no mesmo comando SSH (`tail
    log`, etc.) roda de volta na pasta original (`~`). Use caminho completo pra checar logs depois de
    um comando em background.

## 8. Automação: `menu.bat`

Os passos 4–7 (build+envio do frontend, envio do código do backend, reinstalação de dependências,
restart do serviço) já estão automatizados na opção **2. Deploy para o servidor** do `menu.bat` (raiz
do projeto), com sub-opções pra deploy completo, só frontend, só backend, e sincronizar o banco de
dados nos dois sentidos (com backup automático antes de qualquer sobrescrita e confirmação digitando
`SIM`). A opção **3** liga/desliga/reinicia o backend remoto; a **4** faz um backup completo do
ambiente Termux; a **5** gera o APK do app Android nativo (ver [Gerar o app Android](build-app.md)).

### Endereço do servidor: por padrão usa o Tailscale, não o IP local

`menu.bat` usa `REMOTE_HOST` pra todo SSH/SCP (deploy, sincronizar banco, backup, ligar/desligar). Por
padrão esse valor é o **hostname MagicDNS** do celular servidor (`<nome>.tailXXXX.ts.net`, o nome do
seu tailnet) — funciona de qualquer lugar, não só quando o PC está na mesma Wi-Fi do celular, desde
que o Tailscale esteja ativo nos dois. Esse valor não é editado direto no `.bat` (o script não pode
editar a si mesmo em execução, ver nota em **Scripts .bat da raiz**) — fica num arquivo opcional,
`server-ip.txt`, lido no início se existir. `menu.bat` → **6. Mudar endereço do servidor** → **1** pede
um novo valor e grava esse arquivo, útil se quiser forçar outro endereço (ex: o IP da rede local, ou
se o Tailscale estiver fora do ar). A mesma opção → **2** atualiza o endereço usado pelo app Android
nativo (`environment.mobile.ts`) — só deve precisar disso se o celular for renomeado no Tailscale, já
que tanto o IP quanto o hostname do Tailscale são estáveis independente da rede local.

## Pendente

- **`Termux:Boot`**: hoje o `runsvdir` só sobe quando uma sessão do Termux é aberta (app ou SSH) — pra
  sobreviver a um reboot completo do celular sem interação humana seria preciso instalar o app
  `Termux:Boot`, que dispara um script ao ligar o celular. Não configurado ainda.

## Tailscale (acesso remoto fora da rede local)

O Tailscale cria uma rede privada (VPN via WireGuard) entre dispositivos logados na mesma conta. Cada
um ganha um IP fixo (`100.x.y.z`) alcançável só pelos outros dispositivos da mesma conta — nunca fica
exposto pra internet em geral, e não precisa abrir porta no roteador.

**Importante**: no Android, o Tailscale **não é um pacote do Termux** (`pkg install tailscale` não é o
caminho). É um app Android normal, que roda como uma VPN do sistema — a instalação é pela Play Store.

### No celular servidor (o que roda Termux/nginx/backend)

1. Instalar o app **Tailscale** pela Play Store e fazer login (grátis até 100 dispositivos)
2. Aceitar a permissão de VPN que o Android pede
3. Ativar o toggle principal do app
4. Anotar o IP mostrado na tela do app (ex: `100.x.y.z`)
5. **Essencial**: Configurações do Android → Apps → Tailscale → Bateria → **"Sem restrições"** — sem
   isso o Android pode matar a VPN em segundo plano e o acesso remoto para sem aviso

Não precisa mudar nada no nginx/backend — eles já escutam em `0.0.0.0:8080`, então a interface do
Tailscale já fica alcançável automaticamente, igual à Wi-Fi local.

### No celular/notebook que vai acessar de fora

1. Instalar o mesmo app Tailscale (ou o cliente Windows/Mac/Linux)
2. Login com a mesma conta
3. Ativar a VPN

### Testar

Fora da rede Wi-Fi local, com o Tailscale ativo nos dois aparelhos: `http://100.x.y.z:8080/` deve
carregar o mesmo site.

### MagicDNS (recomendado em vez do IP numérico)

Ativado em [login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) — dá ao celular
servidor um hostname (`<nome>.tailXXXX.ts.net`) além do IP. O app Android nativo (ver [Gerar o app
Android](build-app.md)) usa esse hostname em `environment.mobile.ts`, não o IP: o IP do Tailscale já é
estável, mas o hostname é ainda mais resistente (continua igual mesmo se o celular for removido e
readicionado ao tailnet, cenário em que o IP pode mudar).

### Pendente: HTTPS

Hoje o site é servido em HTTP puro, mesmo via Tailscale (o tráfego já vai criptografado pelo túnel
WireGuard, mas o navegador mostra "não seguro" porque o protocolo em si não tem certificado). O
Tailscale tem `tailscale serve`, que gera certificado HTTPS automático (Let's Encrypt) pro nome
MagicDNS — mas depende da CLI do Tailscale, que o app Android padrão não expõe; seria preciso rodar o
`tailscaled` dentro do Termux (modo "userspace networking", sem precisar de root) em vez do app
Android. Não configurado ainda.
