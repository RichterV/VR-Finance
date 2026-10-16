import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActionSheetController, ModalController, ToastController } from '@ionic/angular';

import { AppLockService } from './app-lock.service';
import { AuthService, CurrentUser } from './auth.service';
import { ModalLauncherService } from './modal-launcher.service';
import { ModuleKey } from './modules';
import { SharedFileRef, ShareIntakeBridge } from './share-intake-bridge';
import { SHARE_OPTIONS, ShareIntakeService, isSupportedSharedFile, normalizeSharedFile, shareOptionsFor } from './share-intake.service';

const pdf = () => new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' });
const xml = () => new File(['<x/>'], 'nfse.xml', { type: '' });

describe('normalizeSharedFile', () => {
  it('mantém tipos aceitos', () => {
    const file = pdf();
    expect(normalizeSharedFile(file)).toBe(file);
  });

  it('deduz o tipo pela extensão quando vem vazio ou genérico', () => {
    expect(normalizeSharedFile(new File(['x'], 'foto.JPG', { type: '' })).type).toBe('image/jpeg');
    expect(normalizeSharedFile(new File(['x'], 'doc.pdf', { type: 'application/octet-stream' })).type).toBe('application/pdf');
    expect(normalizeSharedFile(new File(['x'], 'foto', { type: 'image/jpg' })).type).toBe('image/jpeg');
  });

  it('deixa como está o que não reconhece', () => {
    const docx = normalizeSharedFile(new File(['x'], 'contrato.docx', { type: 'application/msword' }));
    expect(isSupportedSharedFile(docx)).toBe(false);
  });
});

describe('shareOptionsFor', () => {
  const all = (_: ModuleKey) => true;
  const none = (_: ModuleKey) => false;

  it('sem módulos, só gasto, receita e anexar a um existente', () => {
    expect(shareOptionsFor([pdf()], none).map((o) => o.target)).toEqual(['gasto', 'receita', 'existente']);
  });

  it('com todos os módulos, todas as opções', () => {
    expect(shareOptionsFor([pdf()], all)).toHaveLength(SHARE_OPTIONS.length);
  });

  it('só XML: só nota fiscal (e nada sem o módulo Empresa)', () => {
    expect(shareOptionsFor([xml()], all).map((o) => o.target)).toEqual(['nota_fiscal', 'existente']);
    expect(shareOptionsFor([xml()], none)).toEqual([]);
  });

  it('XML junto de PDF não restringe', () => {
    expect(shareOptionsFor([xml(), pdf()], all)).toHaveLength(SHARE_OPTIONS.length);
  });
});

describe('ShareIntakeService', () => {
  let user: ReturnType<typeof signal<CurrentUser | null>>;
  let locked: ReturnType<typeof signal<boolean>>;
  let refs: SharedFileRef[];
  let onShare: (() => void) | null;
  let chosen: string | null;
  let sheetButtons: { text: string }[];
  let launcher: {
    adicionarGasto: ReturnType<typeof vi.fn>;
    adicionarReceita: ReturnType<typeof vi.fn>;
    sideModalOptions: () => object;
  };
  let router: { url: string; navigateByUrl: ReturnType<typeof vi.fn> };
  let toasts: string[];
  let toastButtons: { text: string; handler: () => void }[];
  let modalCtrl: { create: ReturnType<typeof vi.fn> };
  let modalResult: { data?: unknown; role?: string };

  function setup(modules: ModuleKey[] = []) {
    user = signal<CurrentUser | null>(null);
    locked = signal(false);
    refs = [{ path: '/cache/a', name: 'nota.pdf', mimeType: 'application/pdf', size: 4 }];
    onShare = null;
    chosen = 'Gasto';
    sheetButtons = [];
    toasts = [];
    toastButtons = [];
    modalResult = { role: 'cancel' };
    modalCtrl = {
      create: vi.fn(async () => ({ present: async () => undefined, onDidDismiss: async () => modalResult })),
    };
    launcher = {
      adicionarGasto: vi.fn().mockResolvedValue(undefined),
      adicionarReceita: vi.fn().mockResolvedValue(undefined),
      sideModalOptions: () => ({}),
    };
    router = { url: '/home', navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ShareIntakeBridge,
          useValue: {
            isNative: () => true,
            onShareReceived: (fn: () => void) => (onShare = fn),
            consume: async () => {
              const files = refs;
              refs = [];
              return { files, rejected: 0 };
            },
            readAndDelete: async (ref: SharedFileRef) => new File(['%PDF'], ref.name, { type: ref.mimeType }),
          },
        },
        {
          provide: AuthService,
          useValue: { currentUser: () => user(), hasModule: (k: ModuleKey) => modules.includes(k) },
        },
        { provide: AppLockService, useValue: { locked } },
        { provide: ModalLauncherService, useValue: launcher },
        { provide: Router, useValue: router },
        { provide: ModalController, useValue: modalCtrl },
        {
          provide: ActionSheetController,
          useValue: {
            create: async (opts: { buttons: { text: string; data?: unknown; role?: string }[] }) => {
              sheetButtons = opts.buttons;
              const button = opts.buttons.find((b) => b.text === chosen);
              return {
                present: async () => undefined,
                onDidDismiss: async () => (button?.role === 'cancel' || !button ? { role: 'cancel' } : { data: button.data }),
              };
            },
          },
        },
        {
          provide: ToastController,
          useValue: {
            create: async (o: { message: string; buttons?: { text: string; handler: () => void }[] }) => {
              toasts.push(o.message);
              toastButtons = o.buttons ?? [];
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
    return TestBed.inject(ShareIntakeService);
  }

  async function settle() {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(500);
    }
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('espera o login pra perguntar e abre Adicionar gasto com o arquivo', async () => {
    const service = setup();
    service.init();
    await settle();
    expect(service.pending()).toHaveLength(1);
    expect(launcher.adicionarGasto).not.toHaveBeenCalled();

    user.set({ must_change_password: false } as CurrentUser);
    await settle();
    expect(sheetButtons.map((b) => b.text)).toEqual(['Gasto', 'Receita', 'Anexar a um lançamento existente', 'Cancelar']);
    expect(launcher.adicionarGasto).toHaveBeenCalledTimes(1);
    const files = launcher.adicionarGasto.mock.calls[0][0] as File[];
    expect(files.map((f) => f.name)).toEqual(['nota.pdf']);
    expect(service.pending()).toEqual([]);
  });

  it('não pergunta com o app bloqueado; pergunta ao desbloquear', async () => {
    const service = setup();
    user.set({ must_change_password: false } as CurrentUser);
    locked.set(true);
    service.init();
    await settle();
    expect(launcher.adicionarGasto).not.toHaveBeenCalled();
    locked.set(false);
    await settle();
    expect(launcher.adicionarGasto).toHaveBeenCalledTimes(1);
  });

  it('cancelar descarta o arquivo', async () => {
    const service = setup();
    chosen = 'Cancelar';
    user.set({ must_change_password: false } as CurrentUser);
    service.init();
    await settle();
    expect(launcher.adicionarGasto).not.toHaveBeenCalled();
    expect(service.pending()).toEqual([]);
  });

  it('módulo: navega pra página e deixa o pedido pra ela', async () => {
    const service = setup(['veiculos']);
    chosen = 'Serviço de veículo';
    user.set({ must_change_password: false } as CurrentUser);
    service.init();
    await settle();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/veiculos');
    expect(service.takeRequest('gasto')).toBeNull();
    expect(service.takeRequest('servico_veiculo')?.map((f) => f.name)).toEqual(['nota.pdf']);
    expect(service.takeRequest('servico_veiculo')).toBeNull();
  });

  it('arquivo recebido com o app aberto (evento) também é tratado', async () => {
    const service = setup();
    user.set({ must_change_password: false } as CurrentUser);
    service.init();
    await settle();
    expect(launcher.adicionarGasto).toHaveBeenCalledTimes(1);

    refs = [{ path: '/cache/b', name: 'recibo.pdf', mimeType: 'application/pdf', size: 4 }];
    chosen = 'Receita';
    onShare?.();
    await settle();
    expect(launcher.adicionarReceita).toHaveBeenCalledTimes(1);
  });

  it('avisa quando o arquivo não é aceito', async () => {
    const service = setup();
    refs = [{ path: '/cache/c', name: 'planilha.xlsx', mimeType: 'application/vnd.ms-excel', size: 4 }];
    user.set({ must_change_password: false } as CurrentUser);
    service.init();
    await settle();
    expect(toasts).toHaveLength(1);
    expect(service.pending()).toEqual([]);
    expect(launcher.adicionarGasto).not.toHaveBeenCalled();
  });

  it('anexar a um existente: abre a escolha, avisa e o "Ver" abre o editar', async () => {
    const service = setup();
    chosen = 'Anexar a um lançamento existente';
    const openEditor = vi.fn(async () => ({ onDidDismiss: async () => ({ role: 'saved' }) }));
    modalResult = {
      role: 'attached',
      data: { count: 1, row: { title: 'Mercado', record: { id: 7 }, source: { type: 'gasto', toNoun: 'ao gasto', openEditor } } },
    };
    user.set({ must_change_password: false } as CurrentUser);
    service.init();
    await settle();

    // O modal é importado sob demanda (carregamento de módulo de verdade, fora dos timers falsos)
    await vi.waitFor(() => expect(toasts).toHaveLength(1), { timeout: 5000 });
    expect(modalCtrl.create).toHaveBeenCalledTimes(1);
    expect(modalCtrl.create.mock.calls[0][0].componentProps.files.map((f: File) => f.name)).toEqual(['nota.pdf']);
    expect(toasts).toEqual(['Anexado ao gasto Mercado.']);
    const firstEvent = service.attached();
    expect(firstEvent?.type).toBe('gasto');

    toastButtons.find((b) => b.text === 'Ver')!.handler();
    await settle();
    expect(openEditor).toHaveBeenCalledWith({ id: 7 });
    // Salvou no editar: a lista aberta recarrega de novo
    expect(service.attached()!.at).toBeGreaterThanOrEqual(firstEvent!.at);
    expect(service.attached()).not.toBe(firstEvent);
  });
});
