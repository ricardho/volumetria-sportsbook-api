import type { ApiResult } from '../api/apiClient';
import { classifyErrorStatus } from '../runner/errorClassifier';

/** Status HTTP que a API devolve quando a aposta é criada. */
export const BET_CREATED_STATUS = 201;

export interface ParsedBetResponse {
  ok: boolean;
  /** 'pendente' (ou o resultado devolvido) quando aceita; 'erro' | 'conflito_selecao' quando rejeitada. */
  statusAposta: string;
  erroDetalhe: string | null;
  apostaId: number | null;
  codigoRetornado: string | null;
  clienteId: number | null;
  clienteNome: string | null;
  /** true quando a aposta foi aceita mas a resposta não trouxe bets[0].id — o settlement não vai conseguir consultá-la. */
  formatoInesperado: boolean;
}

/**
 * Único ponto que conhece o formato da resposta de POST /sportsbook/bet
 * (ver BetResponse em src/types/index.ts). Se a API mudar, ajuste aqui.
 */
export function parseBetResponse({ status, body }: ApiResult): ParsedBetResponse {
  const ok = status === BET_CREATED_STATUS;
  const bet = body?.bets?.[0];

  if (ok) {
    return {
      ok,
      statusAposta: bet?.resultado ?? 'pendente',
      erroDetalhe: null,
      apostaId: bet?.id ?? null,
      codigoRetornado: bet?.codigo ?? null,
      clienteId: bet?.passador_id ?? null,
      clienteNome: bet?.apostador ?? null,
      formatoInesperado: bet?.id === undefined || bet?.id === null,
    };
  }

  const erroDetalhe: string = body?.message ?? (body ? JSON.stringify(body) : `HTTP ${status} sem corpo de resposta`);
  return {
    ok,
    statusAposta: classifyErrorStatus(erroDetalhe),
    erroDetalhe,
    apostaId: null,
    codigoRetornado: null,
    clienteId: null,
    clienteNome: null,
    formatoInesperado: false,
  };
}
