import type { APIRequestContext } from '@playwright/test';

export class SiteSportsbookOutrightsService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** GET /v1/outrights — uma única chamada traz TODOS os torneios disponíveis */
  async getOutrights(): Promise<any> {
    const url = `${this.baseUrl}/v1/outrights`;
    const res = await this.request.get(url);
    if (!res.ok()) {
      throw new Error(`HTTP ${res.status()} ao buscar outrights (${url})`);
    }
    return res.json();
  }
}
