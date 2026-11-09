import { SiteSportsbookFixtureService } from '../api/services/fixtureService';
import { getDefaultEnvironmentName, getEnvironment } from '../config/environments';
import { parseFixtureResponse } from '../parsers/fixtureParser';
import type { Fixture, FixtureMarket } from '../types';

export type PoolFixture = Fixture & { markets: FixtureMarket[] };

export interface FetchFixturesResult {
  fixtures: PoolFixture[];
  liveFixtures: PoolFixture[];
  falhas: string[];
}

/** Aceita tanto o ID da partida quanto a URL inteira de game-details. */
export function extractMatchId(input: string): string {
  const match = input.trim().match(/(\d+)\s*$/);
  if (!match) throw new Error(`Não consegui extrair um ID de partida de: "${input}"`);
  return match[1];
}

export function isLiveFixture(fixture: PoolFixture): boolean {
  return fixture.markets.length > 0 && fixture.markets.every((m) => m.category === 'ao_vivo');
}

/**
 * Busca e faz o parsing de uma lista de IDs/URLs de partida, separando
 * automaticamente em pré-jogo x ao vivo. Não escreve nenhum arquivo —
 * quem chama decide onde salvar o resultado.
 */
export async function fetchFixturesForInputs(
  inputs: string[],
  environment: string = getDefaultEnvironmentName(),
): Promise<FetchFixturesResult> {
  const service = new SiteSportsbookFixtureService(getEnvironment(environment).fixtures);

  const fixtures: PoolFixture[] = [];
  const liveFixtures: PoolFixture[] = [];
  const falhas: string[] = [];

  for (const input of inputs) {
    let matchId: string;
    try {
      matchId = extractMatchId(input);
    } catch (err: any) {
      console.error(err.message);
      falhas.push(input);
      continue;
    }

    console.log(`Buscando fixture ${matchId}...`);
    try {
      const raw = await service.getFixture(matchId);
      const parsed = parseFixtureResponse(raw);
      if (parsed.length === 0) {
        console.warn(`  -> fixture ${matchId} não retornou mercados mapeados (verifique MARKET_CATEGORY_BY_ID em fixtureParser.ts).`);
      }
      for (const f of parsed) {
        const isLive = isLiveFixture(f);
        (isLive ? liveFixtures : fixtures).push(f);
        console.log(`  -> ${f.matchName} (${isLive ? 'AO VIVO' : 'pré-jogo'}), ${f.markets.length} mercados mapeados`);
      }
    } catch (err: any) {
      console.error(`  -> erro ao buscar/processar ${matchId}: ${err.message}`);
      falhas.push(input);
    }
  }

  return { fixtures, liveFixtures, falhas };
}
