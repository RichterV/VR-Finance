# VR Finance

Aplicativo pessoal de controle financeiro.

- **Backend**: FastAPI + SQLAlchemy, banco SQLite
- **Frontend**: Ionic (Angular)
- **Autenticação**: login obrigatório, JWT, cadastro de novos usuários restrito a um usuário master
- **Anexos**: upload opcional de comprovante (imagem/PDF) em gastos, receitas, serviços de veículo,
  operações bolsa e devedores, com download depois
- **Hospedagem**: notebook Ubuntu Server + nginx, acesso remoto via Tailscale

## Estrutura do repositório

```
Finance/
├── backend/     # API FastAPI
├── frontend/    # App Ionic
└── doc/         # Esta documentação (mkdocs + material)
```

Use o menu acima para navegar pela arquitetura, modelo de dados, autenticação, endpoints da API,
as telas analíticas (resumos e gráficos) e os guias de setup de cada parte do projeto.
