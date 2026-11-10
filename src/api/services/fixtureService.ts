import type { APIRequestContext } from '@playwright/test';

export class SiteSportsbookFixtureService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** GET /data?key=fixture&id={matchId} — retorna a resposta bruta da fixture */
  async getFixture(matchId: string): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/data`;
    const res = await this.request.get(url, { params: { key: 'fixture', id: matchId } });
    if (!res.ok()) {
      throw new Error(`HTTP ${res.status()} ao buscar fixture ${matchId} (${url})`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
}
