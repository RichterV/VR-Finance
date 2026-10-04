# Setup - Backend

Ambiente de desenvolvimento: **Linux** (testado no Linux Mint 22 / Ubuntu 24.04), bash e
**Python 3.12+** (`python3 --version` para confirmar).

!!! note "E o `menu.bat`?"
    O projeto começou num PC com Windows, com um `menu.bat` (cmd.exe/PowerShell) na raiz. A máquina
    de desenvolvimento passou a ser Linux, e o menu foi reescrito como **`menu.sh`** (bash), com as
    mesmas opções. O `menu.bat` e o `scripts/prepare-github.ps1` continuam no repositório só como
    histórico — nada chama mais esses arquivos.

## 1. Pré-requisito do sistema: `venv`

No Ubuntu/Mint, o Python do sistema não traz o `ensurepip`, então o `python3 -m venv` falha sem o
pacote do `apt`:

```bash
sudo apt install -y python3.12-venv
```

## 2. Criar e ativar o ambiente virtual

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

!!! warning "Venv copiado de outra máquina não funciona"
    Um `venv` criado no Windows (pastas `Scripts/` e `Lib/`) ou em outra máquina não serve — apague e
    recrie com o comando acima (no Linux as pastas são `bin/` e `lib/`).

## 3. Instalar as dependências

```bash
pip install -r requirements.txt
```

`requirements.txt` é enxuto: FastAPI, uvicorn, SQLAlchemy, Pydantic (+ `pydantic-settings`),
`python-dotenv`, PyJWT, bcrypt e `python-multipart` (upload de anexos). Para desenvolver, instale
também o `requirements-dev.txt` (pytest, httpx, mkdocs e mkdocs-material — o `menu.sh` usa o
`mkdocs` de `backend/venv/bin/`):

```bash
pip install -r requirements-dev.txt
```

## 4. Criar o arquivo `.env`

O backend lê configuração de `backend/.env` (não versionado). Copie o exemplo e ajuste os valores:

```bash
cp .env.example .env
```

Edite `backend/.env` e defina:

- `SECRET_KEY`: string aleatória longa (assina os tokens JWT) — ex: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `MASTER_USERNAME` / `MASTER_PASSWORD`: credenciais do usuário master criado no próximo passo
- `DATABASE_URL` e `ACCESS_TOKEN_EXPIRE_MINUTES` podem ficar com o valor do exemplo (SQLite local,
  token de 7 dias)

## 5. Criar o usuário master no banco

Cria o arquivo do banco (`vrfinance.db`) com as tabelas e insere o usuário master com a senha já
hasheada (lida de `MASTER_USERNAME`/`MASTER_PASSWORD` no `.env`):

```bash
python -m app.seed_master
```

!!! info "Migrações de schema rodam sozinhas"
    Não há Alembic. Ao subir, o backend (`_migrate_schema()` em `app/main.py`) cria as tabelas que
    faltam, adiciona colunas novas, cria índices e roda migrações de dados de uso único (marcadas por
    `PRAGMA user_version`). Num banco antigo, basta subir o backend com o código novo.

## 6. (Opcional) Criar o usuário de teste com dados mocados

Útil para testar sem tocar nos dados reais — cria (ou recria) o usuário `teste` com uma base grande e
isolada, cobrindo ~4 anos (de janeiro de 4 anos atrás até o mês atual) em **todos os módulos**:
categorias (algumas na cesta de inflação e uma inativa), ~1.500 gastos (fixos, variáveis com
sazonalidade, parcelados com parcelas futuras), receitas com reajuste anual, recorrências (inclusive
uma pausada), veículos e serviços com km crescente, operações na bolsa, devedores com parcelas em
atraso e anexos PDF mínimos. A semente aleatória é fixa (mesma base no mesmo dia).

```bash
python -m app.seed_test_user
```

É **idempotente**: rodar de novo apaga tudo do `teste` (inclusive anexos em disco) e recria, sem
mexer em outros usuários; também reativa todos os módulos e zera a troca obrigatória de senha. A
senha do `teste` fica definida no próprio script.

## 7. Rodar o servidor de desenvolvimento

```bash
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`. Documentação interativa em `http://localhost:8000/docs`.

## 8. Rodar a suíte de testes

Suíte **pytest** grande (centenas de testes: auth/JWT, módulos por usuário, gastos/receitas,
recorrências, resumos, anexos, segurança, desempenho...), com banco SQLite em memória isolado por
teste (`tests/conftest.py`):

```bash
cd tests
pytest
```

Ou pelo menu: `./menu.sh` → **1. Aplicação e testes** → **2. Iniciar testes backend**.

## Toda vez que for trabalhar no backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

Ou, mais simples: `./menu.sh` na raiz → **1. Aplicação e testes** → **1. Iniciar aplicação** (abre
backend e frontend em duas janelas do `gnome-terminal`). A opção **4** do mesmo submenu sobe esta
documentação (`mkdocs serve` em `http://127.0.0.1:8001`).

## Trazer os dados reais do servidor

Para depurar com dados recentes, o banco (e os anexos) do servidor pode ser copiado pro PC:

- **Manual**: `./menu.sh` → **2. Deploy para o servidor** → **5. Sincronizar dados locais com o
  servidor** (para o backend lá, copia, reinicia; o banco local anterior vira backup).
- **Automático a cada login**: `bash scripts/install_sync_autostart.sh` registra o
  `scripts/sync_db_from_server.sh` no autostart da sessão — ver
  [Deploy (Ubuntu Server + Tailscale)](deploy-ubuntu-tailscale.md#7-copia-automatica-do-banco-pro-pc).

!!! warning "Substitui o banco local inteiro"
    Dados que só existem no PC (ex: a base do `teste` gerada localmente) somem na próxima cópia —
    ficam só nos backups em `backend/db-backups/` (7 mais recentes).

!!! tip "Código novo não aparece?"
    Se o `--reload` continuar servindo uma versão antiga mesmo depois de reiniciar o processo, apague
    os `__pycache__` (`find backend -name __pycache__ -exec rm -rf {} +`) antes de investigar outras
    causas — já aconteceu com o projeto numa pasta sincronizada por nuvem (OneDrive), em que o `mtime`
    dos arquivos confundia o cache de bytecode.
