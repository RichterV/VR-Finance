# Setup - Backend

Pré-requisito: **Python 3.13** instalado na máquina (`python --version` para confirmar).

## 1. Criar e ativar o ambiente virtual

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

Se o PowerShell bloquear a ativação com erro de política de execução, rode uma vez (permite scripts
locais só para o seu usuário):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Instalar as dependências

```powershell
pip install -r requirements.txt
```

## 3. Criar o arquivo `.env`

O backend lê configuração de `backend/.env` (não versionado). Copie o exemplo e ajuste os valores:

```powershell
copy .env.example .env
```

Edite `backend/.env` e defina:

- `SECRET_KEY`: qualquer string aleatória longa (usada para assinar os tokens JWT)
- `MASTER_USERNAME` / `MASTER_PASSWORD`: credenciais do usuário master que será criado no próximo passo

## 4. Criar o usuário master no banco

Este comando cria o arquivo do banco (`vrfinance.db`) com as tabelas e insere o usuário master com a
senha já hasheada (lida de `MASTER_USERNAME`/`MASTER_PASSWORD` no `.env`):

```powershell
python -m app.seed_master
```

## 5. (Opcional) Criar o usuário de teste com dados mocados

Útil para testar sem tocar nos dados reais do master — cria o usuário `teste` (senha
`Teste@VRFINANCE`) com ~21 gastos e 8 receitas mocados nos últimos 6 meses. Idempotente: pode rodar de
novo, que ele apaga os lançamentos mocados antigos e recria (não apaga o usuário em si):

```powershell
python -m app.seed_test_user
```

## 6. Rodar o servidor de desenvolvimento

```powershell
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`. Documentação interativa em `http://localhost:8000/docs`.

## 7. Rodar a suíte de testes

```powershell
cd tests
pytest
```

(ou, mais simples, `menu.bat` na raiz do projeto → opção **1. Aplicação e testes** → **2. Iniciar
testes backend**)

## Toda vez que for trabalhar no backend

Só precisa reativar o ambiente virtual (os pacotes já ficam instalados):

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Ou, mais simples: rodar o `menu.bat` na raiz do projeto → **1. Aplicação e testes** → **1. Iniciar
aplicação** (sobe backend e frontend juntos, cada um em sua própria janela de terminal).

!!! warning "Projeto dentro do OneDrive"
    Se a pasta do projeto estiver sincronizada pelo OneDrive, o sync às vezes "engole" os eventos de
    mudança de arquivo que o `--reload` depende para funcionar — o servidor fica servindo código
    antigo silenciosamente. Se uma alteração no backend não parecer ter efeito, feche a janela do
    `uvicorn` e rode de novo antes de investigar mais a fundo.
