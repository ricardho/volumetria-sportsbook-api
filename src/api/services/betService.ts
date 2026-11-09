import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { BetPayload } from '../../types';

export class SiteSportsbookBetService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** Dispara uma aposta contra o endpoint POST /sportsbook/bet */
  async placeBet(payload: BetPayload): Promise<APIResponse> {
    return this.request.post(`${this.baseUrl}/sportsbook/bet`, {
      data: payload,
    });
  }
}
