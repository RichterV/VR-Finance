import { AlertController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { GastosService } from '../services/gastos.service';
import { confirmIfAnomalous } from './anomaly-check';

describe('confirmIfAnomalous', () => {
  function alertReturning(role: string) {
    const alert = { present: vi.fn(), onDidDismiss: vi.fn(() => Promise.resolve({ role })) };
    return { ctrl: { create: vi.fn(() => Promise.resolve(alert)) } as unknown as AlertController, alert };
  }

  const params = { itemId: 1, value: 380, itemName: 'Lanche' };

  it('lets a normal value through without asking', async () => {
    const gastos = { anomalia: vi.fn(() => of({ anomalo: false, mediana: 60, multiplo: 1.2, amostras: 10 })) };
    const { ctrl } = alertReturning('confirm');
    expect(await confirmIfAnomalous(gastos as unknown as GastosService, ctrl, params)).toBe(true);
    expect(ctrl.create).not.toHaveBeenCalled();
  });

  it('asks and respects "Revisar valor"', async () => {
    const gastos = { anomalia: vi.fn(() => of({ anomalo: true, mediana: 60.5, multiplo: 6.3, amostras: 8 })) };
    const { ctrl } = alertReturning('cancel');
    expect(await confirmIfAnomalous(gastos as unknown as GastosService, ctrl, params)).toBe(false);
    const config = (ctrl.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(config.message).toContain('6,3×');
    expect(config.message).toContain('Lanche');
  });

  it('saves when confirmed and never blocks on a failed check', async () => {
    const anomalo = { anomalia: vi.fn(() => of({ anomalo: true, mediana: 60, multiplo: 6, amostras: 8 })) };
    expect(await confirmIfAnomalous(anomalo as unknown as GastosService, alertReturning('confirm').ctrl, params)).toBe(true);
    const falhou = { anomalia: vi.fn(() => throwError(() => ({ status: 500 }))) };
    expect(await confirmIfAnomalous(falhou as unknown as GastosService, alertReturning('cancel').ctrl, params)).toBe(true);
  });
});
