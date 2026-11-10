import type { APIRequestContext } from '@playwright/test';
import type { BetPayload } from '../../types';
import { toApiResult, type ApiResult } from '../apiClient';

export class SiteSportsbookBetService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** Dispara uma aposta contra o endpoint POST /sportsbook/bet. A interpretação da resposta fica em parsers/betResponseParser.ts. */
  async placeBet(payload: BetPayload): Promise<ApiResult> {
    const res = await this.request.post(`${this.baseUrl}/sportsbook/bet`, { data: payload });
    return toApiResult(res);
  }
}
