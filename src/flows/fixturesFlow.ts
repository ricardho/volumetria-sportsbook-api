import { withApiContext } from '../api/apiClient';
import { SiteSportsbookFixtureService } from '../api/services/fixtureService';
import { getDefaultEnvironmentName, getEnvironment } from '../config/environments';
import { createLogger } from '../logging/logger';
import { parseFixtureResponse } from '../parsers/fixtureParser';
import type { PoolFixture } from '../types';

export type { PoolFixture } from '../types';

const log = createLogger('fixtures');

export interface FixturePool {
  fixtures: PoolFixture[];
  liveFixtures: PoolFixture[];
}

export interface FetchFixturesResult extends FixturePool {
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

/** Separa fixtures já parseadas em pré-jogo x ao vivo (acrescentando em `into`, se informado). */
export function splitByLiveness(parsed: PoolFixture[], into: FixturePool = { fixtures: [], liveFixtures: [] }): FixturePool {
  for (const f of parsed) (isLiveFixture(f) ? into.liveFixtures : into.fixtures).push(f);
  return into;
}

/**
 * Busca e faz o parsing de uma lista de IDs/URLs de partida, separando
 * automaticamente em pré-jogo x ao vivo. Não escreve nenhum arquivo —
 * quem chama decide onde salvar o resultado (ver savePoolFiles).
 */
export async function fetchFixturesForInputs(
  inputs: string[],
  environment: string = getDefaultEnvironmentName(),
): Promise<FetchFixturesResult> {
  const baseUrl = getEnvironment(environment).fixtures;
  const pool: FixturePool = { fixtures: [], liveFixtures: [] };
  const falhas: string[] = [];

  await withApiContext(baseUrl, async (context) => {
    const service = new SiteSportsbookFixtureService(context, baseUrl);

    for (const input of inputs) {
      let matchId: string;
      try {
        matchId = extractMatchId(input);
      } catch (err: any) {
        log.error(err.message);
        falhas.push(input);
        continue;
      }

      log.info(`Buscando fixture ${matchId}...`);
      try {
        const parsed = parseFixtureResponse(await service.getFixture(matchId));
        if (parsed.length === 0) {
          log.warn(`fixture ${matchId} não retornou mercados mapeados (verifique MARKET_CATEGORY_BY_ID em fixtureParser.ts).`);
        }
        splitByLiveness(parsed, pool);
        for (const f of parsed) {
          log.info(`  -> ${f.matchName} (${isLiveFixture(f) ? 'AO VIVO' : 'pré-jogo'}), ${f.markets.length} mercados mapeados`);
        }
      } catch (err: any) {
        log.error(`erro ao buscar/processar ${matchId}: ${err.message}`);
        falhas.push(input);
      }
    }
  });

  return { ...pool, falhas };
}
