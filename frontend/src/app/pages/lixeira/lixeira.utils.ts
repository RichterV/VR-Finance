/** Nome de cada tipo de registro na lixeira (entity_type do backend). */
export const TIPO_LABEL: Record<string, string> = {
  gasto: 'Gasto',
  receita: 'Receita',
  servico_veiculo: 'Serviço de veículo',
  servico_casa: 'Serviço da casa',
  nota_fiscal: 'Nota fiscal',
  empresa: 'Documento da empresa',
};

export function tipoLabel(entityType: string): string {
  return TIPO_LABEL[entityType] ?? entityType;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias de calendário (no fuso do aparelho) de `de` até `ate`. */
function diasEntre(de: Date, ate: Date): number {
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((inicio(ate) - inicio(de)) / DIA_MS);
}

/** "Some hoje" / "Some amanhã" / "Some em 13 dias". */
export function expiraTexto(expiraEm: string, agora: Date = new Date()): string {
  const dias = diasEntre(agora, new Date(expiraEm));
  if (dias <= 0) return 'Some hoje';
  if (dias === 1) return 'Some amanhã';
  return `Some em ${dias} dias`;
}

/** "Excluído hoje" / "Excluído ontem" / "Excluído há 3 dias". */
export function excluidoTexto(deletedAt: string, agora: Date = new Date()): string {
  const dias = diasEntre(new Date(deletedAt), agora);
  if (dias <= 0) return 'Excluído hoje';
  if (dias === 1) return 'Excluído ontem';
  return `Excluído há ${dias} dias`;
}
