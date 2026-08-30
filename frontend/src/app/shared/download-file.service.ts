import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

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
}
