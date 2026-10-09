import { Injectable } from '@angular/core';
import { GlobalWorkerOptions, PasswordResponses, getDocument } from 'pdfjs-dist';

const MAX_PAGE_WIDTH_PX = 1000;
const WORKER_ASSET_PATH = '/assets/pdf.worker.min.mjs';

/**
 * Resolve uma URL utilizável como `workerSrc` do pdf.js sem depender do Content-Type que o
 * servidor devolve pro arquivo `.mjs`. O `mime.types` padrão do nginx (o que
 * `scripts/setup_ubuntu_server.sh` usa, sem overrides) não conhece essa extensão -- serve o
 * worker como `application/octet-stream`, e o navegador recusa carregar isso como Worker de
 * módulo ES ("type: module"), quebrando a pré-visualização de PDF só em produção (funciona em
 * dev, onde o dev server já manda o Content-Type certo). Buscar o arquivo via `fetch()` (que não
 * impõe checagem de MIME type de script, diferente de carregar o Worker direto pela URL) e
 * reembalar o texto num `Blob` com o tipo setado por nós mesmos contorna isso, funcionando
 * independente do header que o servidor mandar. Resolvido uma única vez e cacheado no módulo --
 * a mesma blob URL é reaproveitada em todas as pré-visualizações de PDF da sessão.
 */
let workerSrcPromise: Promise<string> | null = null;

function resolveWorkerSrc(): Promise<string> {
  if (!workerSrcPromise) {
    workerSrcPromise = fetch(WORKER_ASSET_PATH)
      .then((res) => res.text())
      .then((code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  }
  return workerSrcPromise;
}

/**
 * PDF protegido por senha (ex: nota de corretagem). `incorrect` = a senha enviada não abriu; sem
 * senha enviada é sempre false (só "precisa de senha").
 */
export class PdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? 'Senha do PDF incorreta' : 'PDF protegido por senha');
    this.name = 'PdfPasswordError';
  }
}

function isPdfjsPasswordError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'PasswordException';
}

/**
 * Renderiza cada página de um PDF como uma imagem (data URL), via pdf.js.
 *
 * Necessário porque a WebView do app Android nativo não tem visualizador de PDF embutido --
 * confirmado num teste real: um <iframe src="blob:..."> pré-visualiza bem no navegador (web) mas
 * fica em branco no APK. Renderizar as páginas como <canvas>/imagem funciona igual nas duas
 * plataformas, então virou o único caminho pra pré-visualização de PDF funcionar de fato dentro
 * do app nativo.
 *
 * Injetável (não uma função solta) pra poder ser mockado via DI nos testes de
 * `AttachmentPreviewModalComponent`, sem depender de um Worker de verdade -- indisponível no
 * ambiente jsdom dos testes (mesmo padrão de `DownloadFileService`, já que o test runner do
 * Angular não suporta `vi.mock` pra imports relativos).
 */
@Injectable({ providedIn: 'root' })
export class PdfPreviewService {
  /** Lança `PdfPasswordError` se o PDF tiver senha e `password` faltar ou estiver errada. */
  async renderPagesAsDataUrls(blob: Blob, password?: string): Promise<string[]> {
    GlobalWorkerOptions.workerSrc = await resolveWorkerSrc();
    // arrayBuffer novo a cada chamada: o pdf.js transfere o buffer pro worker (fica inutilizável),
    // e uma nova tentativa com outra senha precisa dos bytes de novo.
    const data = await blob.arrayBuffer();
    const loadingTask = getDocument({ data, password });
    const pixelRatio = window.devicePixelRatio || 1;
    const images: string[] = [];
    try {
      const pdf = await loadingTask.promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const unscaledWidth = page.getViewport({ scale: 1 }).width;
        const scale = (Math.min(unscaledWidth, MAX_PAGE_WIDTH_PX) / unscaledWidth) * pixelRatio;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        images.push(canvas.toDataURL('image/png'));
      }
    } catch (err) {
      if (isPdfjsPasswordError(err)) {
        throw new PdfPasswordError(err.code === PasswordResponses.INCORRECT_PASSWORD);
      }
      throw err;
    } finally {
      await loadingTask.destroy();
    }
    return images;
  }
}
