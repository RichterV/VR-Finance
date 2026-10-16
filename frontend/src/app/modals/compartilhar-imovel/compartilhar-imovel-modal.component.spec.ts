import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController, provideIonicAngular, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { CasaService, Compartilhamento } from '../../services/casa.service';
import { CompartilharImovelModalComponent } from './compartilhar-imovel-modal.component';

const ref = (id: number, username: string, nome: string) => ({ id, username, nome });

function share(overrides: Partial<Compartilhamento> = {}): Compartilhamento {
  return {
    id: 7,
    item_tipo: 'imovel',
    item_id: 4,
    item_nome: 'Casa 1',
    dono: ref(1, 'dona', 'Ana Dona'),
    convidado: ref(2, 'bruno', 'Bruno C'),
    nivel: 'cadastro',
    status: 'aceito',
    created_at: '2026-10-01T12:00:00+00:00',
    respondido_em: '2026-10-02T12:00:00+00:00',
    encerrado_em: null,
    expira_em: null,
    ...overrides,
  };
}

describe('CompartilharImovelModalComponent', () => {
  let casa: Record<string, ReturnType<typeof vi.fn>>;
  let dismiss: ReturnType<typeof vi.fn>;
  let alertRole: string;

  function setup(existing: Compartilhamento[] = []) {
    casa = {
      listCompartilhamentos: vi.fn(() => of(existing)),
      compartilhar: vi.fn(() => of(share({ id: 8, status: 'pendente', expira_em: '2026-11-15T12:00:00+00:00' }))),
      mudarNivel: vi.fn(() => of(share({ nivel: 'total' }))),
      encerrarCompartilhamento: vi.fn(() => of(undefined)),
    };
    dismiss = vi.fn();
    alertRole = 'destructive';
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: CasaService, useValue: casa },
        { provide: ModalController, useValue: { dismiss } },
        { provide: ToastController, useValue: { create: vi.fn(async () => ({ present: vi.fn() })) } },
        {
          provide: AlertController,
          useValue: { create: vi.fn(async () => ({ present: vi.fn(), onDidDismiss: async () => ({ role: alertRole }) })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompartilharImovelModalComponent);
    fixture.componentInstance.imovel = { id: 4, name: 'Casa 1', active: true };
    fixture.detectChanges();
    return fixture;
  }

  it('lists who the property is shared with, pending ones with a Cancel action', () => {
    const fixture = setup([share(), share({ id: 9, status: 'pendente', convidado: ref(3, 'carla', 'Carla D'), expira_em: '2026-11-15T12:00:00+00:00' })]);
    expect(casa['listCompartilhamentos']).toHaveBeenCalledWith(4);
    const text = (fixture.nativeElement as HTMLElement).querySelector('.share-list')?.textContent ?? '';
    expect(text).toContain('Bruno C');
    expect(text).toContain('Aguardando resposta');
    expect(text).toContain('Cancelar');
    expect(text).toContain('Encerrar');
  });

  it('sends an invite with the trimmed username and chosen level, then closes as saved', () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.form.setValue({ username: '  bruno ', nivel: 'edicao' });
    c.enviar();
    expect(casa['compartilhar']).toHaveBeenCalledWith(4, 'bruno', 'edicao');
    expect(c.compartilhamentos().map((s) => s.id)).toEqual([8]);
    c.dismiss();
    expect(dismiss).toHaveBeenCalledWith(null, 'saved');
  });

  it('shows the backend message when the invite is refused', () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    casa['compartilhar'].mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Não foi possível enviar para esse usuário.' } })),
    );
    c.form.setValue({ username: 'ninguem', nivel: 'leitura' });
    c.enviar();
    expect(c.errorMessage()).toBe('Não foi possível enviar para esse usuário.');
  });

  it('asks for a username before sending', () => {
    const c = setup().componentInstance;
    c.enviar();
    expect(casa['compartilhar']).not.toHaveBeenCalled();
    expect(c.errorMessage()).toBeTruthy();
  });

  it('changes the level and ends a share after confirming', async () => {
    const c = setup([share()]).componentInstance;
    c.mudarNivel(share(), 'total');
    expect(casa['mudarNivel']).toHaveBeenCalledWith(7, 'total');

    await c.encerrar(share());
    expect(casa['encerrarCompartilhamento']).toHaveBeenCalledWith(7);
    expect(c.compartilhamentos()).toEqual([]);
  });

  it('keeps the share when the confirmation is dismissed', async () => {
    const c = setup([share()]).componentInstance;
    alertRole = 'cancel';
    await c.encerrar(share());
    expect(casa['encerrarCompartilhamento']).not.toHaveBeenCalled();
  });

  it('closes as cancel when nothing changed', () => {
    setup().componentInstance.dismiss();
    expect(dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
