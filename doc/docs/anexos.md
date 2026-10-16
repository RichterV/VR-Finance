# Anexos e compartilhamento

Comprovantes (imagem ou PDF) podem ser anexados a gastos, receitas, serviços de veículo, operações
bolsa, devedores, notas fiscais (que aceitam também o XML da NFS-e) e aos documentos da empresa. Esta
página junta o lado do backend (armazenamento, regras) e o do frontend (componentes, fluxos do APK).

## Armazenamento e regras (backend)

- **Metadado no banco, arquivo no disco**: tabela `attachments` (ver
  [Modelo de dados](modelo-de-dados.md#attachments)) e o arquivo em
  `backend/uploads/<entity_type>/<uuid4>.<ext>` — o nome em disco é sempre um UUID novo, nunca o nome
  enviado (evita path traversal e colisão). `backend/uploads/` é gitignored e entra no backup do
  servidor e na cópia automática pro PC.
- **Um router genérico** (`routers/attachments.py`) para os 7 tipos, com `entity_type` + `entity_id`
  como chave lógica (sem FK). Endpoints em [API](api.md#anexos).
- **Tipo e tamanho**: whitelist `image/jpeg`, `image/png`, `image/webp`, `image/heic`,
  `application/pdf`, até 10MB (`ALLOWED_CONTENT_TYPES`/`MAX_FILE_SIZE_BYTES`). O tipo declarado
  precisa bater com a **assinatura real** do arquivo (`sniff_content_type`); XML só em `nota_fiscal`.
  O frontend espelha a whitelist em `shared/attachment-types.ts` só para avisar mais rápido — quem
  garante é o backend.
- **Grupo de parcelas**: gasto parcelado e devedor anexam ao `installment_group_id`, não a uma
  parcela — todas as parcelas mostram os mesmos anexos. A checagem de posse no backend aceita tanto o
  grupo quanto o id de uma parcela; quem garante "sempre o grupo" é o frontend
  (`installment_group_id ?? id`), com teste específico para isso.
- **Lixeira**: excluir um registro manda os anexos dele pra [lixeira](modelo-de-dados.md#lixeira)
  junto (15 dias, dá pra restaurar); numa parcela, o anexo do grupo só vai junto com a **última**
  parcela (a contagem das restantes é feita antes do `delete`, por causa do `autoflush=False`).
  Excluir um anexo sozinho também vai pra lixeira. O arquivo fica no disco até sair de lá de vez.
  Excluir um usuário apaga todos os anexos dele. O arquivo só sai do disco
  **depois do commit** (evento `after_commit` da sessão); um upload cujo commit falha apaga o arquivo
  recém-gravado.
- **Módulo**: anexos de tipos de módulo opcional (`ENTITY_MODULE`) respondem 403 sem o módulo.

!!! note "Arquivos em texto puro"
    Os arquivos não são criptografados no disco. Isso foi avaliado e adiado de propósito (o modelo de
    ameaça considerado é o roubo físico do disco), não é um esquecimento.

## Anexar (frontend)

`shared/attachment-picker.component.ts`, usado em todos os modais de Adicionar/Editar dos tipos com
anexo:

- Botão "+ Adicionar arquivo" (pill tracejado), **arrastar e soltar** em cima dele e **Ctrl+V** — os
  três caminhos passam pelo mesmo `addFiles()` (uma validação só). O `dragover` precisa de
  `preventDefault()`, senão o navegador nunca dispara o `drop`.
- **Tirar foto** (celular — APK ou navegador com `pointer: coarse`): um
  `<input type="file" accept="image/*" capture="environment">`. No APK o Capacitor abre o app de
  câmera via `FileProvider`, sem plugin. O manifest **não** declara `CAMERA` de propósito (declarar
  faria o Capacitor pedir a permissão em runtime). A foto é reduzida por `shared/camera-photo.ts`
  (`shrinkPhoto`: maior lado 2560px, JPEG 0,85, respeitando o EXIF, nome `foto-AAAA-MM-DD_HH-MM-SS.jpg`)
  para caber nos 10MB; se o WebView não decodificar o formato, vai o original.
- **Criação × edição**: no Adicionar, os arquivos esperam na fila até o registro salvar
  (`commit()`, via `shared/save-with-attachments.ts`); no Editar, sobem na hora.
- **Salvar bloqueado enquanto o anexo processa/sobe**: os modais expõem `attachmentBusy` — o botão vira
  "Aguarde o anexo..." e o `submit()` retorna cedo (cobre o Enter). Antes dava pra salvar durante a
  redução da foto e o registro ficava sem ela.
- O picker emite `filesAdded`, usado pelo [valor lido do comprovante](#valor-lido-do-comprovante).
- Abrir câmera/seletor chama `markExpectedExternalActivity()`, para a volta não disparar o
  [bloqueio do app](autenticacao.md#no-app-android-apk).

## Listar, ver, baixar e compartilhar

- **Ícone de anexo nas listas**: sempre o **primeiro** da coluna de ações (decisão explícita, para não
  desalinhar linhas com e sem anexo), e só nas linhas que têm anexo — calculado em lote por página com
  `GET /attachments/exists` (sem uma requisição por linha). Abre
  `shared/attachments-popover.component.ts`, com o formato embaixo do ícone ("PDF", "JPG"… via
  `attachmentFormatLabel`) e, para cada arquivo, visualizar, baixar e (no celular) compartilhar.
- **Pré-visualização** (`modals/attachment-preview/`): imagem e PDF com zoom por botões de lupa,
  pinça, duplo clique (1x/2x) e roda do mouse, sempre ancorado no ponto focal (`focalZoomScroll` em
  `shared/pinch-zoom.ts`). Na web a roda sozinha dá zoom e Ctrl+roda rola (no app nativo, Ctrl+roda =
  zoom); `isLikelyMouseWheel` separa mouse de trackpad por heurística. Ampliado, mouse arrasta e toque
  usa o scroll nativo. PDF na web usa o visualizador do navegador (iframe); no APK é rasterizado com
  **pdf.js** (`shared/pdf-preview.service.ts`).
- **PDF com senha no APK** (notas de corretagem costumam ter): o serviço lança `PdfPasswordError` e o
  modal pede "Senha do PDF". A última senha que funcionou fica **só em memória** (some ao fechar o app)
  e é tentada primeiro no próximo PDF protegido.
- **Baixar** (`shared/download-file.service.ts`): no navegador, link com blob; no APK grava direto em
  `Directory.Documents` com `@capacitor/filesystem`, sem prompt (um `<a download>` não faz nada no
  WebView, e a folha de compartilhar foi rejeitada para este caso por exigir um passo a mais).
- **Compartilhar** (só no celular, `canShareAttachment()`): no APK via `@capacitor/share` (grava no
  cache e abre a folha do sistema); no navegador do celular via Web Share API com `File` (exige HTTPS).
  Cancelar a folha não é erro.
- A exportação de dados usa `shareFile()` no APK, porque arquivos em `Documents` ficam invisíveis
  para outros apps no Android 11+ — ver [Módulos opcionais](modulos-opcionais.md#exportar-dados).

## Receber arquivo de outro app (APK)

No Android, "Compartilhar" num PDF, imagem ou XML (gerenciador de arquivos, galeria, apps de
mensagem…) lista o VR Finance. O app pergunta **"O que você quer cadastrar?"** e abre o Adicionar
daquele tipo com o arquivo já na fila de anexos.

```text
outro app ──ACTION_SEND──▶ ShareIntakePlugin (Java) ──copia pro cache──▶ consume()
                                                                          │
core/share-intake-bridge.ts (lê e apaga a cópia) ◀────────────────────────┘
        │
core/share-intake.service.ts ──espera login/desbloqueio──▶ folha "O que você quer cadastrar?"
        ├─ Gasto / Receita ──────────▶ ModalLauncherService (modal da Home) com initialFiles
        ├─ módulos ──────────────────▶ navega pra página do módulo → onSharedFiles() abre o modal
        └─ Anexar a um existente ────▶ modals/anexar-existente/
```

- **Manifest**: `intent-filter` de `SEND`/`SEND_MULTIPLE` para `image/*`, `application/pdf`,
  `text/xml` e `application/xml`.
- **`ShareIntakePlugin.java`** (plugin local, registrado no `MainActivity`): o `content://` recebido só
  vale enquanto durar a permissão do app de origem, então cada arquivo é copiado na hora para o cache
  (`shared-intake/`, até 40MB). Trata o intent no `load()` (app fechado) ou no `handleOnNewIntent`
  (app aberto — a activity é `singleTask`), ignora o intent repetido ao abrir pela tela de "recentes"
  e guarda os arquivos até o JS chamar `consume()`; o evento `shareReceived` só avisa que há algo.
  Sobras com mais de 1h são apagadas.
- **`core/share-intake.service.ts`** (iniciado no `AppComponent`): a pergunta só aparece com usuário
  logado, sem troca de senha pendente e com o app desbloqueado — o arquivo espera o login ou a
  digital. Tipo vazio/genérico é deduzido pela extensão (`normalizeSharedFile`); foto acima de 10MB
  passa pelo `shrinkPhoto`; o resto é recusado com aviso.
- **Opções**: Gasto, Receita e os módulos habilitados (Serviço de veículo, Operação na bolsa,
  Devedor, Nota fiscal, Documento da empresa), mais "Anexar a um lançamento existente", separado por
  uma linha. Só XML → só Nota fiscal (nova ou existente).
- Os modais de Adicionar (e Empresa > Dados e documentos) recebem `initialFiles`, repassado ao
  `attachment-picker` (mesma validação). Em Nota fiscal, um XML compartilhado é lido como no
  "Importar do XML" (se a leitura falhar, entra só como anexo).
- Os módulos abrem pela própria página (`onSharedFiles(target, handler)` no construtor), para a lista
  dela recarregar ao salvar.

## Anexar a um lançamento existente

Última opção da folha de compartilhar: `modals/anexar-existente/`.

- No topo, o arquivo e o valor lido do comprovante; em seguida **"Pode ser este"**: até 5 lançamentos
  com o **mesmo valor em centavos**, de 60 dias atrás até o fim do mês seguinte, mais perto de hoje
  primeiro, uma linha por grupo de parcelas (`pickSuggestions`).
- Seletor "Tipo" (gasto, receita e os módulos do usuário; só XML → só nota fiscal), busca e
  "Carregar mais".
- Tocar → confirmação → sobe os arquivos (gasto parcelado/devedor no `installment_group_id`) → toast
  "Anexado ao gasto X" com **Ver**, que abre o Editar daquele registro.
- Cada tipo é uma `RecordSource` em `shared/record-sources.service.ts` (listagem, sugestões e editor),
  usando os endpoints de listagem que já existiam — **sem backend novo**. As páginas de lista
  recarregam com `onSharedAttached(tipos, reload)`.

## Valor lido do comprovante

Ao anexar um comprovante em Adicionar gasto, receita, serviço ou devedor — por qualquer caminho
(compartilhar, seletor, câmera, Ctrl+V, arrastar) —, o campo **Valor** é preenchido se estiver vazio,
com o aviso "Valor lido do comprovante — confira antes de salvar"
(`shared/receipt-value-hint.component.ts`). Nunca salva sozinho nem sobrescreve o que foi digitado
durante a leitura (`ReceiptValueAutofill` em `shared/receipt-value.service.ts`). Data, descrição e
detecção de duplicidade ficaram de fora de propósito.

- **PDF**: texto extraído com pdf.js (`shared/pdf-text.ts`, primeiras 3 páginas, importado sob
  demanda — o pdf.js só é baixado quando se anexa um PDF). Web e APK.
- **Imagem**: OCR no próprio aparelho com ML Kit (`TextRecognitionPlugin.java`), **só no APK**; na web
  imagem não é lida. Usa a versão do Google Play Services (modelo baixado na instalação) em vez da
  embutida, que aumentava o APK em ~40 MB.
- **Nada sai do aparelho** — nem para o servidor, nem para serviço externo.
- **Regra** (`shared/receipt-value.ts`, funções puras com testes): (1) um rótulo ("Valor final",
  "Valor total", "Total pago", "Valor pago", "Valor"…) com o valor na mesma linha ou sozinho na
  seguinte; (2) sem isso — o OCR costuma ler a coluna de rótulos separada da de valores, e o DANFE põe
  os rótulos numa linha e os números sem "R$" na de baixo —, o valor que mais se repete no documento
  (empate: o primeiro com "R$"). R$ 0,00 é ignorado, e linhas de imposto, frete, desconto, saldo etc.
  (`IGNORED_LINE`) não contam — num DANFE o único valor com "R$" pode ser o dos tributos aproximados.
