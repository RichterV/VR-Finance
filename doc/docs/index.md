# VR Finance

Aplicativo pessoal de controle financeiro: gastos, receitas e "caixa" (a parte da receita que se
pretende guardar), com um dashboard analítico em cima disso e alguns módulos opcionais à parte.

- **Backend**: FastAPI + SQLAlchemy, banco SQLite (um único arquivo, `vrfinance.db`)
- **Frontend**: Ionic + Angular 22 (componentes standalone, sem NgModules), tema escuro fixo
- **App Android**: o mesmo frontend empacotado com Capacitor (APK de sideload, não está na Play Store)
- **Hospedagem**: notebook com Ubuntu Server + nginx + systemd, acesso remoto via Tailscale com HTTPS
  — ver [Deploy (Ubuntu Server + Tailscale)](deploy-ubuntu-tailscale.md)

## Funcionalidades

| Área | O que tem |
|---|---|
| **Lançamentos** | Gastos (essencial/não essencial, por categoria, parcelados ou não), receitas com % de caixa (slider com padrão por usuário), data escolhida no cadastro (de hoje até o fim do mês seguinte), listagem paginada e editável em `/dados` |
| **Recorrências** | "Repetir todo mês" em gasto/receita: o app cria sozinho o lançamento de cada mês na virada (sem cron), com aba própria em `/dados` pra editar, pausar, retomar e excluir |
| **Dashboard (Home)** | Resumo mensal com projeção do fim do mês, Indicadores (poupança, comprometimento com parcelas, custo fixo, % essencial), Resumo anual com gráficos, Relatório geral e Análise inflacionária pessoal — ver [Analítico](analitico.md) |
| **Notificações** | Sino na Home com o **resumo da virada do mês** (gerado no dia 1, guarda os últimos 12) |
| **Alertas** | Confirmação antes de salvar um gasto muito acima do normal da categoria (anomalia) |
| **Anexos** | Comprovante (imagem/PDF) em gastos, receitas, serviços de veículo, operações e devedores: arrastar e soltar, Ctrl+V, foto direto da câmera no celular, pré-visualização com zoom e compartilhar (WhatsApp etc.) no celular |
| **Módulos opcionais** | Manutenção Veículos, Operações Bolsa, Devedores, Empresa (MEI: notas fiscais, limite de faturamento, documentos e PDF da declaração anual), Ferramentas (calculadoras), Exportar Dados (CSV + anexos em `.zip`) e Análise inflacionária — habilitados por usuário |
| **Usuários** | Login obrigatório (JWT), sem cadastro público: o usuário master cria as contas no painel `/admin`, escolhe os módulos de cada uma e a conta nova troca a senha no primeiro acesso — ver [Autenticação](autenticacao.md) |
| **App Android** | Login por digital, bloqueio por digital/PIN ao voltar do segundo plano, tenta a rede local antes do Tailscale |
| **Celular** | Botão flutuante "+", tabelas viram cartões, menu lateral com hambúrguer; no desktop os modais abrem como painel lateral |
| **"Desfazer"** | Exclusões somem na hora e só vão pro servidor depois de 5 s, com botão de desfazer |

Valores em Real brasileiro (R$). Os dados são sempre separados por usuário: cada login só vê e
cadastra os próprios lançamentos.

## Estrutura do repositório

```
Finance/
├── backend/          # API FastAPI (app/, tests/ com pytest, requirements.txt)
├── frontend/         # App Ionic/Angular (src/) + projeto nativo Android (android/, Capacitor)
├── doc/              # Esta documentação (mkdocs + material)
├── scripts/          # Setup do servidor, cópia do banco do servidor pro PC, preparo do espelho público
│   ├── setup_ubuntu_server.sh         # nginx + systemd + sudoers no servidor (rodar uma vez)
│   ├── setup_hd_externo_automount.sh  # remonta o HD de backup se ele cair do USB
│   ├── sync_db_from_server.sh         # traz banco + anexos do servidor pro PC no login
│   ├── install_sync_autostart.sh      # registra o script acima no autostart da sessão
│   └── prepare_github.py              # gera a cópia sanitizada publicada no GitHub
├── menu.sh           # Menu interativo: rodar em dev, testes, deploy, controle do servidor, build do APK
└── CLAUDE.md         # Registro detalhado de status e decisões do projeto
```

O `menu.sh` (bash) concentra as tarefas do dia a dia: subir backend + frontend em modo de
desenvolvimento, rodar as suítes de teste (pytest e Vitest), fazer deploy pro servidor via SSH,
ligar/desligar o backend remoto, sincronizar o banco entre PC e servidor, gerar o APK e preparar a
pasta do espelho público. Ele substituiu o antigo `menu.bat` do Windows, que continua no repositório
só como histórico.

Use o menu acima para navegar pela arquitetura, modelo de dados, autenticação, endpoints da API,
as telas analíticas (resumos e gráficos) e os guias de setup de cada parte do projeto.
