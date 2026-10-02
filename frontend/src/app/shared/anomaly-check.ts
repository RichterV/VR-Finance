import { AlertController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { GastosService } from '../services/gastos.service';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MULTIPLO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Antes de salvar um gasto avulso: se o valor estiver muito acima do normal da categoria, pergunta
 * se é isso mesmo (pega erro de digitação tipo R$ 3.800 no lugar de R$ 38,00). true = pode salvar.
 * Falha na checagem nunca impede de salvar.
 */
export async function confirmIfAnomalous(
  gastos: GastosService,
  alertCtrl: AlertController,
  params: { itemId: number; value: number; itemName: string },
): Promise<boolean> {
  let result;
  try {
    result = await firstValueFrom(gastos.anomalia(params.itemId, params.value));
  } catch {
    return true;
  }
  if (!result.anomalo) return true;

  const contexto =
    result.multiplo !== null && result.mediana !== null
      ? ` é cerca de ${MULTIPLO.format(result.multiplo)}× o seu normal (mediana de ${BRL.format(result.mediana)})`
      : ' está bem acima do seu normal';
  const alert = await alertCtrl.create({
    header: 'Valor fora do comum',
    message: `${BRL.format(params.value)} em ${params.itemName}${contexto}. Salvar mesmo assim?`,
    buttons: [
      { text: 'Revisar valor', role: 'cancel' },
      { text: 'Salvar', role: 'confirm' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'confirm';
}
