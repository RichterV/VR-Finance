import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface DownloadResult {
  /** Preenchido só no app nativo -- indica que o arquivo foi salvo direto no dispositivo (sem prompt). */
  savedNatively: boolean;
}

export interface ShareResult {
  /** false quando o usuário fechou a folha de compartilhar sem escolher um destino -- não é erro. */
  shared: boolean;
}

/**
 * Dispara o download de um Blob já obtido via HttpClient (necessário pra passar pelo
 * auth.interceptor -- um <a href> puro não carregaria o token e cairia em 401).
 *
 * No app Android nativo (Capacitor), um <a download> com blob: não funciona -- a WebView não tem
 * gerenciador de downloads associado a esse esquema, então o clique não faz nada visível pro
 * usuário. Nesse caso grava o arquivo via @capacitor/filesystem direto em Directory.Documents, sem
 * nenhum prompt -- uma folha de compartilhamento (@capacitor/share) foi cogitada, mas o usuário
 * pediu explicitamente que o clique baixe na hora, sem perguntar "com qual app compartilhar".
 *
 * Injetável (em vez de função solta) pra poder ser substituído por um mock via DI nos testes --
 * o test runner do Angular (vitest) não suporta vi.mock em imports relativos.
 */
@Injectable({ providedIn: 'root' })
export class DownloadFileService {
  async trigger(blob: Blob, filename: string): Promise<DownloadResult> {
    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });
      return { savedNatively: true };
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { savedNatively: false };
  }

  /**
   * Variante de `trigger()` pra arquivos que o usuário precisa efetivamente localizar depois (ex:
   * exportação de dados) -- diferente de um anexo avulso, salvar em Directory.Documents não serve
   * aqui: a partir do Android 11 essa pasta é escopada só pro próprio app ("the app can only access
   * the files/folders the app created", doc oficial do @capacitor/filesystem), invisível no app de
   * Arquivos e em qualquer outro app do celular -- o usuário via o toast de sucesso, mas nunca achava
   * o arquivo depois. Aqui o arquivo é gravado só no cache interno (transitório, não precisa
   * sobreviver) e a folha nativa de compartilhar do Android é aberta (@capacitor/share) -- o próprio
   * usuário escolhe o destino final (Arquivos, Drive, e-mail etc.) e sempre sabe onde foi parar.
   */
  async shareFile(blob: Blob, filename: string): Promise<ShareResult> {
    if (!Capacitor.isNativePlatform()) {
      await this.trigger(blob, filename);
      return { shared: true };
    }

    const base64Data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: filename, data: base64Data, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({ files: [uri], dialogTitle: 'Salvar exportação' });
      return { shared: true };
    } catch (err) {
      if (err instanceof Error && err.message === 'Share canceled') {
        return { shared: false };
      }
      throw err;
    }
  }
}
