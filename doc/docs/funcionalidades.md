# Funcionalidades e telas

Visão das telas do app e de onde cada coisa vive no código. O dashboard (Home) está detalhado em
[Analítico](analitico.md), os módulos opcionais em [Módulos opcionais](modulos-opcionais.md) e tudo
sobre comprovantes em [Anexos e compartilhamento](anexos.md).

## Navegação

O app é praticamente single-page: **Home** (`/home`) é o dashboard e o ponto de partida das ações; as
demais rotas são `/dados`, as telas dos módulos, `/admin`, e as telas fora do layout (`/login`,
`/trocar-senha`, `/servidor-indisponivel`). Tabela completa de rotas e guards em
[Arquitetura](arquitetura.md#rotas-e-guards).

- **Header da Home**: "Início", sino de notificações, olho de esconder valores e os botões Adicionar
  gasto / Adicionar receita (com texto) e Visualizar dados / Categorias / Perfil (só ícone, com
  `title`). No celular ficam só Visualizar dados, sino e olho — o resto vai para o botão "+" e o
  rodapé da conta.
- **Menu lateral** (`layout/main-layout.component.*`): só navegação — Início (com subitens que rolam
  até cada seção da Home) e os módulos habilitados. No desktop (≥992px) é um hover-menu (barra fina que
  expande ao passar o mouse, com pin para fixar e empurrar o conteúdo); abaixo disso, `ion-split-pane`
  com hambúrguer abaixo de 768px.
- **Rodapé da conta** (`layout/account-footer.component.ts`), fixo embaixo do menu: cartão com foto
  (ou iniciais), nome completo e `username · Master/Usuário` — tocar abre o **Perfil** — e atalhos
  pequenos para **Categorias**, **Admin** (só master), **Lixeira** e **Sair**. Item novo que não seja módulo vai
  para o rodapé, não para a lista.
- **Modais**: abertos por `ModalController`; os de uso comum passam pelo
  `core/modal-launcher.service.ts`. No desktop abrem como painel lateral à direita (`side-modal`); no
  celular, em tela cheia.

## Lançamentos

### Adicionar gasto

Prioridade (Essencial / Não essencial) → Categoria (só as ativas daquela prioridade) → Valor → Data →
"Parcelado?" (+ número de meses) **ou** "Repetir todo mês" (+ dia do mês e término opcional) →
Descrição → Anexos.

- **Valor** com máscara de centavos que enche da direita para a esquerda
  (`shared/currency-input.directive.ts`) e foco automático ao abrir. Pode vir preenchido pelo
  [valor lido do comprovante](anexos.md#valor-lido-do-comprovante).
- **Parcelado** gera N linhas (o valor digitado é o de **cada parcela**, não o total), ligadas por
  `installment_group_id`. Editar uma parcela replica prioridade, categoria, valor e descrição no grupo;
  uma parcela futura pode ser **antecipada** para o mês atual (com valor de desconto opcional).
- **Alerta de anomalia**: antes de salvar um gasto avulso, `shared/anomaly-check.ts` consulta
  `GET /gastos/anomalia` e pede confirmação se o valor estiver muito acima do normal da categoria
  (critério em [Analítico](analitico.md)).

### Adicionar receita

Valor → **% de caixa** → Data → "Repetir todo mês" → Descrição → Anexos.

- O % de caixa (a parte da receita que se pretende guardar) usa
  `shared/cash-percentage-field.component.ts`, também em Editar receita/recorrência: slider de 5 em 5
  com marcas, ajuste fino por botões −/+ (1%), número digitável e atalhos 0/10/20/30/50%. Mostra o
  valor calculado em tempo real.
- Começa no padrão do usuário (`users.default_cash_percentage`, 50% se nunca definido). "Usar como
  padrão" salva o valor atual (`PUT /auth/me/default-cash-percentage`) — no backend, não no
  `localStorage`, para valer igual na web e no APK.

### Data do lançamento

Hoje por padrão; o calendário permite de hoje até o último dia do mês seguinte, nunca passado
(`shared/launch-date-field.component.ts`, espelho de `resolve_launch_date` do backend). Quando a data
cai em outro mês, aparece "Vai contar em Outubro/2026". A data **não é editável** depois de criada.
"Hoje" é sempre no fuso de Brasília (`today_local()`), não no do servidor, que roda em UTC.

### Recorrências

"Repetir todo mês" cria uma regra que gera um lançamento comum a cada virada de mês, sem cron. Regras,
término e a aba **Recorrências** de `/dados` estão em
[Analítico](analitico.md#gastos-e-receitas-recorrentes).

### Visualizar dados (`/dados`)

Abas Gastos, Receitas e Recorrências. Tabelas paginadas (25 por vez, "Carregar mais"), por data
decrescente, com filtro opcional de mês/ano (e o botão de voltar o período ao padrão), busca,
ordenação por coluna (client-side, sobre o que já foi carregado — `shared/sortable.ts` +
`<th appSortTh>`), editar e excluir. A prioridade aparece como um ponto colorido antes da categoria;
lançamento de recorrência tem um ícone de repetição ao lado da data.

### Categorias

Modal (`modals/itens/`, nome interno "itens"/`dropdown_options`): abas Essencial / Não essencial,
"Nova categoria" no topo da lista, renomear e excluir (**soft delete** — gastos antigos continuam
apontando para ela). Com o módulo de análise inflacionária, cada categoria essencial tem o toggle
"Cesta de inflação".

### Excluir com "Desfazer"

Excluir gasto, receita, parcela de devedor, operação, veículo, serviço ou categoria some na hora e mostra
um toast "Desfazer"; o `DELETE` só vai depois de 5 s (`shared/undo-delete.service.ts`). Sair da página,
fechar o modal de Categorias ou mandar o app para o segundo plano confirma na hora; se o `DELETE`
falhar, o item volta. Excluir usuário e anexo continuam com alerta de confirmação.

### Lixeira (`/lixeira`)

Depois do "Desfazer", o que foi excluído (gasto, receita, serviço, operação, parcela de devedor, nota
fiscal e anexo) ainda fica 15 dias na **Lixeira**, aberta pelo rodapé da conta, pra qualquer usuário.
Cada linha mostra o tipo, o título, o valor, a data do registro, quando foi excluído e quando some
("Some em 13 dias", em amarelo nos 2 últimos dias), com os anexos que saíram junto (o olho abre a
mesma pré-visualização dos anexos). Ações: **Restaurar** (volta pro lugar; a Home recarrega),
**Excluir de vez** (com alerta) e **Esvaziar lixeira** no header. Filtro por tipo quando há mais de
um. Excluir continua igual pro usuário — a lixeira é só a rede de segurança.

## Notificações

- **Sino** no header da Home com contador de não lidas (`modals/notificacoes/`) e, quando chega o
  resumo do mês, o card "Seu resumo de <mês> chegou" no topo da Home (uma linha, com "Ver resumo";
  some ao abrir ou no "×", que marca como lido).
- **Resumo do mês** (`modals/resumo-mensal/`): conteúdo e regras de geração em
  [Analítico](analitico.md#resumo-da-virada-do-mes-get-notificacoes).
- **Relatório anual pronto**: na virada do ano; tocar abre a geração do PDF já no ano — ver
  [Módulos opcionais](modulos-opcionais.md#relatorios-em-pdf).
- Estado em `NotificacoesService` (signals), carregado fora das seções do dashboard — uma falha aqui
  não trava a Home. Push no celular ficou para depois (exigiria geração ativa e um canal de push).
- **Aviso de backup** (só master): quando o último backup tem 30 dias ou mais (`GET /backup-status`),
  um aviso aparece uma vez por abertura do app, fixo embaixo, sem capturar cliques, e some em 5 s.

## Perfil

Modal só da conta logada (`modals/perfil/`), em seções:

- **Meus dados**: username, nome e sobrenome (`PUT /auth/me`, que devolve um token novo porque o JWT
  carrega o username) e a **foto de perfil**.
- **Aparência**: grade com os 15 temas; tocar aplica e salva (ver [Visual e temas](visual-e-temas.md)).
- **Trocar senha**: senha atual + nova (diferente da atual); o aparelho continua logado com o token
  devolvido, os outros são deslogados.
- **Segurança** (só no APK, com trava de tela no aparelho): tempo do bloqueio ao voltar para o app.
- **Sair**, como botão de texto no fim.

### Foto de perfil

"Adicionar foto" / "Trocar foto" / "Remover", ao lado do nome. O seletor é `image/*` **sem**
`capture`, então no celular o Android oferece câmera e galeria (o Perfil chama
`markExpectedExternalActivity()` para a volta não disparar o bloqueio).

- **No aparelho**: `shared/avatar-photo.ts` recorta no centro, reduz para 768px e converte para JPEG
  antes de enviar — inclusive HEIC, que o backend não lê.
- **No servidor** (`app/avatars.py`, Pillow): aceita JPEG/PNG/WebP pelo conteúdo real, até 10MB e
  60 megapixels (anti "bomba de descompressão"), gira pelo EXIF, recorta quadrado, 512px, JPEG 85
  **sem metadados** (foto de celular traz GPS e modelo do aparelho). Transparência vira a cor de
  cartão do tema padrão. Arquivo em `<upload_dir>/avatars/<uuid4>.jpg`.
- **Exibição**: `<img src>` não manda o token, então a foto vem por `HttpClient` como blob
  (`core/avatar.service.ts`, uma requisição por usuário + versão) e é mostrada por `<app-user-avatar>`
  (foto, ou iniciais, ou nada). `UserOut.avatar_version` é a chave de cache. Aparece no rodapé da
  conta do menu e, no Admin, pequena ao lado do nome de quem tem foto (`GET /auth/users/{id}/avatar`,
  só master).

## Administração (`/admin`)

Só master. Lista de usuários (nome com foto, username, perfil, última atividade — "Nunca" se ainda não
usou —, módulos em chips, marcador "Troca de senha pendente"), criar/editar no side-modal
`modals/admin-usuario/` (username, nome, sobrenome, senha inicial/reset, um toggle por módulo),
excluir (cascata, com alerta) e "Mudar pra conta teste". No celular, a tabela vira um cartão por
usuário. Regras de conta e módulos em [Autenticação](autenticacao.md#painel-de-administracao).

## Celular e desktop

- **Botão flutuante "+"** (Gasto/Receita) na Home, só no celular.
- **Tabelas viram cartões** abaixo de 768px: a tabela com `.has-cards` some e uma `.entry-list` irmã
  (um `.entry-card` por linha, estilos em `global.scss`) aparece — os dois no DOM, troca por media
  query. Sem cabeçalho clicável, a ordenação vira `<app-sort-select>`
  (`shared/sort-select.component.ts`), que lê e escreve o mesmo `SortState` da tabela. Toda tabela
  nova de listagem segue esse padrão.
- **Botão "voltar período ao padrão"** (`shared/reset-period-button.component.ts`) à esquerda de todo
  par mês/ano: volta só o período (para "todos" nas listagens, mês atual na Home), desabilitado quando
  já está no padrão.
- Utilitários `.desktop-only`/`.mobile-only` em `global.scss`.

## Telas fora do layout

- **Login** (`pages/login/`): card centralizado com a marca. Estado é resetado em
  `ionViewWillEnter()`, porque o Ionic mantém a página em cache e reexibia a tentativa anterior depois
  de um logout. No APK, com "Lembrar usuário e senha" e digital ativada, mostra a tela de digital —
  ver [Autenticação](autenticacao.md#no-app-android-apk).
- **Defina sua senha** (`/trocar-senha`): troca obrigatória quando a senha foi definida pelo master.
- **Servidor indisponível** (`/servidor-indisponivel`): quando a checagem do usuário falha por
  timeout, 5xx ou falta de rede — o token é mantido (só 401/403 deslogam), com "Tentar novamente".
- **Bloqueio do app** (APK): overlay acima de tudo, não uma rota (`shared/app-lock-overlay.component.ts`).
