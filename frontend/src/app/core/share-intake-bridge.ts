import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

/** Arquivo que o ShareIntakePlugin (Java) já copiou pro cache do app. */
export interface SharedFileRef {
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

interface ShareIntakePlugin {
  consume(): Promise<{ files: SharedFileRef[]; rejected: number }>;
  addListener(event: 'shareReceived', listener: () => void): Promise<unknown>;
}

const ShareIntake = registerPlugin<ShareIntakePlugin>('ShareIntake');

/**
 * Plugin nativo de "Compartilhar com o VR Finance" atrás de uma classe injetável -- as specs trocam
 * por um mock via DI (o test runner do Angular não suporta `vi.mock`).
 */
@Injectable({ providedIn: 'root' })
export class ShareIntakeBridge {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  onShareReceived(listener: () => void): void {
    void ShareIntake.addListener('shareReceived', listener);
  }

  consume(): Promise<{ files: SharedFileRef[]; rejected: number }> {
    return ShareIntake.consume();
  }

  /** Lê a cópia do cache como File e apaga a cópia (o File já está em memória). */
  async readAndDelete(ref: SharedFileRef): Promise<File> {
    const response = await fetch(Capacitor.convertFileSrc(ref.path));
    const blob = await response.blob();
    void Filesystem.deleteFile({ path: ref.path }).catch(() => undefined);
    return new File([blob], ref.name, { type: ref.mimeType || blob.type });
  }
}
