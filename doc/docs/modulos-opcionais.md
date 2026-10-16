# Módulos opcionais

Além de **Início** (dashboard, Gastos, Receitas, Recorrências e Categorias — sempre disponível), cada
usuário tem um conjunto de módulos habilitados pelo master no painel de Administração. O master
sempre tem todos; usuário novo começa sem nenhum.

| chave | tela | o que é |
|---|---|---|
| `veiculos` | `/veiculos` | [Manutenção Veículos](#manutencao-veiculos) |
| `manutencao_casa` | `/casa` | [Manutenção Casa](#manutencao-casa) |
| `operacoes_bolsa` | `/operacoes-bolsa` | [Operações Bolsa](#operacoes-bolsa) |
| `devedores` | `/devedores` | [Devedores](#devedores) |
| `empresa` | `/empresa` | [Empresa (MEI)](#empresa-mei) |
| `ferramentas` | `/ferramentas` | [Ferramentas](#ferramentas) (calculadoras, só frontend) |
| `exportar_dados` | `/exportar-dados` | [Exportar Dados](#exportar-dados) e [Relatórios em PDF](#relatorios-em-pdf) |
| `analise_inflacionaria` | — | seção da Home + toggles "Cesta de inflação" em Categorias — ver [Analítico](analitico.md) |

## Como um módulo funciona

- **Registro único**: `backend/app/modules.py` (`OPTIONAL_MODULES`) e o espelho
  `frontend/src/app/core/modules.ts` (chave, rótulo, ícone, rota). O menu lateral, o `moduleGuard` e os
  toggles do admin são montados a partir dele. Módulo sem `route` (Análise inflacionária) não vira item
  de menu. Um módulo novo entra nos dois registros + `ModuleKey` em `schemas.py`.
- **Bloqueio nas duas pontas**: menu esconde, `moduleGuard` (`data: { module }` na rota) redireciona
  para `/home`, e o backend responde 403 via `require_module(key)` no `APIRouter` — inclusive anexos
  (`ENTITY_MODULE`) e exportação daquele módulo. Vale na hora, sem novo login.
- **Desabilitar não apaga dados** — só esconde e bloqueia.
- **Isolamento**: Manutenção Casa, Operações Bolsa, Devedores e Empresa usam tabelas próprias no mesmo `vrfinance.db`,
  sem FK cruzada com gastos/receitas/categorias. Nota fiscal recebida não vira receita, por exemplo.
- Módulos de terceiros ficam **só no menu lateral** (sem botão no header da Home).

!!! note "Espelho público"
    Operações Bolsa e Devedores são removidos do espelho publicado no GitHub por
    `scripts/prepare_github.py` (blocos marcados com `# --- início/fim: Operações Bolsa/Devedores` e
    substituições exatas). Arquivo novo que referencie esses models precisa entrar no script.

## Manutenção Veículos

Cadastro de veículos (nome + ano, soft delete) e de serviços (veículo, descrição, observação, valor,
tipo — `peca` | `peca_mao_de_obra` | `peca_mao_de_obra_propria` —, quilometragem; data automática).

- **Cards por veículo** (total gasto, quantidade de serviços, último serviço), com filtro de mês/ano no
  topo (vazio = histórico inteiro) que afeta **só** os cards (`GET /veiculos/resumo?ano=&mes=`).
- **Gráfico "Evolução de gastos"**: colunas por veículo (serviço é evento esporádico — uma linha curva
  sugeria gasto contínuo), sempre os últimos 12 meses, independente do filtro.
- Tabelas de veículos e de serviços (paginada, com busca e filtro por veículo).
- **Quilometragem obrigatória e sempre crescente por veículo**: na criação, não pode ser menor que o
  maior km já registrado; na edição, tem de ficar entre o serviço anterior e o próximo (por data, com
  `id` como desempate) — igual ao vizinho é permitido. Vizinhos sem km (histórico importado) são
  ignorados. `_validate_mileage_order` em `routers/servicos_veiculos.py`.

## Manutenção Casa

Mesmo desenho de Manutenção Veículos, pra casa: cadastro de **imóveis** (só nome, soft delete) e de
**serviços** (`routers/casa.py`, tudo sob `/casa`). Separado das finanças pessoais — serviço da casa
não vira gasto. Decisões do usuário (2026-10-15): imóveis + serviços (funciona com um imóvel só e já
suporta mais), data escolhida no cadastro, e os campos abaixo.

- **Serviço**: imóvel, **categoria** (obrigatória, lista fixa: `eletrica`, `hidraulica`, `pintura`,
  `estrutura` — "Telhado e estrutura" —, `eletrodomesticos`, `jardim`, `limpeza`, `impostos`, `documentos`, `outros`),
  descrição, valor (≥ 0), **data** (hoje por padrão; aceita passado, nunca futuro — 400), prestador
  (opcional), tipo (`material` | `material_mao_de_obra` | `material_mao_de_obra_propria`, opcional),
  **garantia até** (opcional, nunca antes da data do serviço — 400; atalhos 3 meses / 6 meses / 1 ano /
  5 anos no modal, contados da data do serviço), observação e anexos. A data não muda depois (mesma
  regra de gastos); editar troca o resto, inclusive o imóvel.
- **Tela** (`pages/casa/`): filtro de mês/ano que vale **só** pros cartões por imóvel e pro "Por
  categoria" (mesma regra de Veículos); cartão "Em garantia" (serviços com garantia vigente — tocar
  filtra a lista); gráfico "Evolução de gastos" em colunas por imóvel, sempre 12 meses (reaproveita o
  montador de Veículos; sem legenda com um imóvel só); "Por categoria" com barras em escala comum
  (tocar filtra a lista); tabelas de imóveis e de serviços (busca na descrição/prestador/observação,
  filtros por imóvel, categoria e "Com garantia", paginada de 25 em 25). A coluna Imóvel só aparece
  quando há mais de um (inclusive serviço de imóvel já excluído).
- Modais `modals/imovel/` e `modals/servico-casa/` servem pra adicionar e editar. O campo de data é o
  `shared/date-field.component.ts` (faixa livre, `optional` = pode ficar vazio, com "×").
- Integra com anexos (`servico_casa`), lixeira, Exportar Dados (`casa`: `imoveis.csv` +
  `servicos_casa.csv`), "Compartilhar com o VR Finance" e "Anexar a um lançamento existente".

### Compartilhamento de imóveis

Qualquer usuário compartilha um imóvel **seu** com outro, digitando o username exato e um nível de
permissão (ação **Compartilhar** na tabela de imóveis, modal `modals/compartilhar-imovel/`). Só vale
depois que o convidado **aceita** o convite na central de notificações (Aceitar/Recusar direto na
lista). Os dois passam a trabalhar sobre os **mesmos** serviços e anexos — o dado continua do dono.
Lógica em `app/compartilhamento.py`, rotas em `routers/compartilhamentos.py` (ver [API](api.md)).

| Nível | Ver serviços, resumo, anexos | Cadastrar serviço / subir anexo | Editar serviço | Excluir serviço / anexo |
|---|---|---|---|---|
| Leitura | ✓ | | | |
| Cadastro | ✓ | ✓ | | |
| Edição | ✓ | ✓ | ✓ | |
| Tudo | ✓ | ✓ | ✓ | ✓ |

- **Sempre só do dono**: renomear/excluir o imóvel, compartilhar, mudar o nível e restaurar itens da
  lixeira. Ação acima do nível responde **403** (o app só esconde os botões).
- **Ciclo**: pendente → aceito → encerrado (dono revoga, convidado sai ou o imóvel é excluído);
  pendente → recusado, cancelado (remetente) ou expirado (30 dias sem resposta). Cada passo avisa o
  outro lado por notificação; cancelamento e expiração apagam o convite.
- **Envio inválido** (username inexistente, o próprio usuário, sem o módulo): sempre "Não foi possível
  enviar para esse usuário." — a resposta não revela quais contas existem.
- **Onde fica o dado**: o que o convidado cadastra é gravado com o `user_id` do dono (exportação,
  lixeira, backup e exclusão de conta não mudam); `servicos_casa.criado_por` guarda quem cadastrou
  ("cadastrado por Fulano"). Exclusão do convidado vai pra lixeira do dono. Cada um exporta só os
  próprios imóveis. O resumo do convidado soma os próprios e os compartilhados.
- **Admin**: só visualiza (seção "Compartilhamentos" no modal do usuário).

## Operações Bolsa

Registro de operações, sem dashboard (decisão de escopo): tabela paginada com filtro por ticker
(substring) e tipo, ordenação por coluna e modais de Adicionar/Editar.

- **Compra/Venda** (ativo): ticker, quantidade (aceita fração) e um toggle "em dólar?". Em reais, só o
  valor em R$; em dólar, valor em US$ **e** cotação do dia (obrigatória em compra e venda, para tudo
  ser convertível para R$).
- **Compra/Venda de dólar** (câmbio puro): sem ticker nem quantidade; valor em R$ e cotação.
- O backend deriva o valor que falta (`value_brl = value_usd × cotação` ou `value_usd = value_brl ÷
  cotação`). Data automática, não editável.
- **Ticker sempre em maiúsculas**: `shared/uppercase-input.directive.ts` (`<ion-input appUppercase>`)
  converte pelo `valueChanges` do controle e pede o teclado em maiúsculas; o backend grava `.upper()`.

## Devedores

Dívidas de terceiros com o usuário, **sempre parceladas** (mínimo 1x): o cadastro (devedor, descrição,
valor da parcela, número de parcelas) gera N linhas a partir do mês atual, cada uma com `status`
próprio (`pago`/`nao_pago`).

- Editar devedor/descrição/valor **replica no grupo**; o status é por parcela. Toggle rápido de "Pago"
  na linha, sem abrir modal.
- Parcela do mês atual aparece destacada (lembrete visual, não trava nada).
- **Aviso de parcela esquecida**: `GET /devedores/pendencias` conta parcelas `nao_pago` de **qualquer**
  mês anterior ao atual — vira um badge no item "Devedores" do menu (`DevedoresService.pendenciasCount`),
  recalculado depois de cada ação que muda status. Também entra no resumo da virada do mês.

## Empresa (MEI)

Cadastro da empresa (uma por usuário: nome, CNPJ, data de abertura), **notas fiscais de serviço**,
**limite de faturamento do MEI** e **documentos da empresa** (CCMEI, contratos, declarações — anexos
com `entity_type = empresa`). Tela `/empresa`; modais `empresa-config` ("Dados e documentos"),
`nota-fiscal` e `declaracao-anual`.

- **CNPJ** conferido pelos dígitos verificadores no backend (`app/empresa.py`) e no front
  (`shared/cnpj.ts`); gravado só com dígitos. Exemplo válido para testes: `11.222.333/0001-81`.
- **Nota entra pelo XML da NFS-e**: "Importar do XML da nota" envia o arquivo para
  `POST /empresa/notas/ler-xml`, que **só lê** (`app/nfse_xml.py`) e devolve os campos + avisos (nota
  já cadastrada, prestador diferente do CNPJ da empresa, substituição); a pessoa confere e salva, e o
  XML já entra na fila de anexos. Leiaute nacional (Emissor Nacional, obrigatório para o MEI) com
  ABRASF como reserva; as tags são buscadas pelo nome local, sem depender de namespace; XML com
  DOCTYPE é recusado.
- **Notas substituídas**: a substituta traz `subst/chSubstda` no XML → `substitui_chave`; a original
  ganha `substituida_por`, aparece apagada com o selo "substituída pela N" e sai do limite e das
  somas. `vincular_substituicao` liga nos dois sentidos, em qualquer ordem de cadastro;
  `desvincular_substituta` ao excluir/editar a substituta.
- **Limite**: soma das notas pela **competência** (não pela emissão) contra R$ 81.000/ano, ou R$ 6.750
  por mês no ano de abertura (mês começado conta inteiro). Barra amarela a partir de 80%, vermelha
  acima de 100%, com o texto da regra de excesso (até 20%: imposto sobre o excesso e desenquadramento
  no ano seguinte; acima de 20%: retroativo).
- **Fora de propósito**: controle de DAS (o DAS já é lançado nos gastos pessoais), clientes a receber,
  despesas da empresa.
- **Declaração anual** (DASN-SIMEI): PDF de apoio gerado em Exportar Dados > Relatórios — ver
  [abaixo](#relatorios-em-pdf).

## Ferramentas

Duas calculadoras 100% client-side, sem salvar nada (`pages/ferramentas/calculators.ts`, funções
puras testadas):

- **Juros compostos**: valor inicial + aporte mensal reajustado uma vez por ano, rentabilidade anual
  convertida em taxa mensal equivalente (`(1 + anual)^(1/12) − 1`).
- **À vista vs. a prazo**: decide por **valor presente líquido** — cada parcela é descontada pelo CDI
  mensal líquido de IR e a soma comparada com o preço à vista. IR pela tabela regressiva pelo prazo
  (22,5% / 20% / 17,5% / 15%) ou manual. Uma tabela mês a mês colapsável simula investir o valor à
  vista e ir pagando as parcelas (só informativa).

## Exportar Dados

`/exportar-dados` tem duas abas: **Dados** e **Relatórios**.

**Dados**: um cartão por módulo (Gastos, Receitas, Manutenção Veículos, Operações Bolsa, Devedores,
Categorias, Empresa — só os habilitados), cada um com "Baixar" um `.zip` (`GET /export/{modulo}`):

- CSV com `;`, latin-1 e vírgula decimal (abre direto no Excel em português).
- Pasta `anexos/` com os comprovantes; a coluna `anexos` do CSV traz o nome do arquivo dentro do zip.
  Anexo de grupo parcelado aparece em todas as parcelas do CSV, mas entra uma vez só no zip.
- Veículos gera dois CSVs; Categorias inclui as inativas (é cópia de backup); Empresa leva
  `empresa.csv`, `notas_fiscais.csv`, XML/PDF das notas em `anexos/` e os documentos em `documentos/`.
- No navegador baixa direto; no APK abre a folha de compartilhar (`shareFile()`), porque o que o app
  grava em `Documents` fica invisível para outros apps no Android 11+.

### Relatórios em PDF

Os dois pedem o ano num modal antes de gerar (abertos pelo `ModalLauncherService`) e, no APK, vão pela
folha de compartilhar. Gerados no backend com **fpdf2**; base comum em `app/pdf_relatorio.py`
(cartões, tabelas e gráficos desenhados à mão — barras agrupadas/empilhadas e horizontais —, sem
matplotlib). **Sem fundo branco**: toda página é pintada num tom de papel `#f2efe9`, por conforto
visual. Erros de uma requisição `responseType: 'blob'` são lidos de dentro do Blob
(`httpBlobErrorMessage` em `shared/http-error.ts`).

- **Relatório anual de receitas e gastos** (`GET /relatorios/anual?ano=`, `app/relatorio_anual.py`,
  `modals/relatorio-anual/`): cartões com variação contra o **mesmo período** do ano anterior,
  destaques em frases, mês a mês (gráfico + tabela), essencial × não essencial, categorias (top 10 +
  tabela), maiores gastos **pontuais**, compromissos (parcelas, parcelamentos novos, o que fica para o
  ano seguinte, contas fixas), receitas por fonte, ritmo (média por mês/dia, dia da semana), inflação
  pessoal (só com o módulo) e glossário. Sem Veículos/Devedores/Bolsa.
    - **Conta fixa** = recorrência cadastrada **ou** o mesmo lançamento (categoria + descrição) uma
      vez por mês em 3+ meses, com valor até 20% da mediana (`MESES_REPETICAO`, `VARIACAO_FIXA`).
      "Maiores gastos pontuais" exclui parcelas e contas fixas (senão a lista seria só o aluguel).
    - **Ano em andamento**: relatório parcial, números até **hoje**, e o que já está lançado com data
      futura numa seção "Ainda programado".
    - **Aviso na virada do ano**: `GET /notificacoes` cria uma vez por ano a notificação
      `relatorio_anual` ("Seu relatório de AAAA está pronto", sem dados), só para quem tem
      `exportar_dados` e teve lançamento no ano — a partir do relatório de 2026. Tocar nela abre a
      geração já no ano.
- **Declaração anual do MEI** (`GET /empresa/declaracao-anual`, `app/declaracao_mei.py`,
  `modals/declaracao-anual/`, só com o módulo `empresa`): pede o ano (padrão: o anterior, nunca antes
  da abertura), "Teve empregado no ano?" e "Outras receitas sem nota". O PDF destaca os campos da
  DASN-SIMEI (receita de comércio = R$ 0, serviços, total, empregado), traz dados da empresa, período
  (desde a abertura no 1º ano), avisos (inclusive número faltando na sequência das notas), limite, mês a
  mês e as notas incluídas e substituídas. Ano pela **competência**, mesma regra do limite. DAS pago
  não entra (vem preenchido no portal).
