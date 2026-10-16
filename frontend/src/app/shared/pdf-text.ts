import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

import { resolveWorkerSrc } from './pdf-preview.service';

/**
 * Texto das primeiras páginas de um PDF (comprovante gerado pelo banco tem texto de verdade, não é
 * imagem), uma linha por linha do PDF. Módulo separado e importado sob demanda: assim o pdf.js só
 * é baixado quando alguém anexa um PDF. Lança erro com PDF com senha ou inválido.
 */
export async function extractPdfText(blob: Blob, maxPages = 3): Promise<string> {
  GlobalWorkerOptions.workerSrc = await resolveWorkerSrc();
  const loadingTask = getDocument({ data: await blob.arrayBuffer() });
  try {
    const pdf = await loadingTask.promise;
    let text = '';
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      text += '\n';
    }
    return text;
  } finally {
    await loadingTask.destroy();
  }
}
