export class SiteSportsbookFixtureService {
  constructor(private readonly baseUrl: string) {}

  /** GET /data?key=fixture&id={matchId} — retorna a resposta bruta da fixture */
  async getFixture(matchId: string): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/data?key=fixture&id=${matchId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar fixture ${matchId} (${url})`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }
}
