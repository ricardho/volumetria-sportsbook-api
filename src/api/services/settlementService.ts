import type { APIRequestContext } from '@playwright/test';
import { toApiResult, type ApiResult } from '../apiClient';

export type SettlementLookup = ApiResult;

/**
 * ⚠️ CONTRATO FICTÍCIO, criado para demonstração no portfólio:
 *   GET /sportsbook/bet/{id}
 *   200 -> { bet: { id, codigo, resultado, valor_retorno, liquidada_em } }
 * Para usar contra uma API real, ajuste o caminho aqui e o mapeamento dos
 * campos em interpretSettlementResponse (src/flows/settlementFlow.ts).
 */
export class SiteSportsbookSettlementService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  async getBet(betId: number | string): Promise<SettlementLookup> {
    const res = await this.request.get(`${this.baseUrl}/sportsbook/bet/${encodeURIComponent(String(betId))}`);
    return toApiResult(res);
  }
}
