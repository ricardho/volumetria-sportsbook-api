import type { BetPayload } from '../types';

/** Resumo legível de um payload, gravado em cada linha do NDJSON e usado no relatório. */
export function summarizePayload(payload: BetPayload) {
  const firstItem = payload.items[0] as any;
  const firstItemType = firstItem.type;
  let tipo: string;
  if (payload.items.length > 1) tipo = 'multipla';
  else if (firstItemType === 'custom-bet') tipo = 'bet_builder';
  else if (firstItemType === 'season') tipo = 'aposta_futura';
  else if (firstItem.productId === '1') tipo = 'ao_vivo';
  else tipo = 'simples';

  let marketName: string;
  let gameName: string;

  if (payload.items.length > 1) {
    marketName = `Múltipla (${payload.items.length} seleções)`;
    gameName = payload.items.map((i: any) => i.matchName).join(' + ');
  } else if (firstItemType === 'custom-bet') {
    marketName = `Bet Builder (${firstItem.selections.length} seleções)`;
    gameName = firstItem.matchName;
  } else if (firstItemType === 'season') {
    marketName = firstItem.marketName;
    gameName = firstItem.tournamentName;
  } else {
    marketName = firstItem.marketName;
    gameName = firstItem.matchName;
  }

  return { tipo, amount: payload.amount, channel: payload.channel, qtdItems: payload.items.length, marketName, gameName };
}
