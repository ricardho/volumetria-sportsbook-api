import { expect, test } from '@playwright/test';
import { parseFixtureResponse } from '../../src/parsers/fixtureParser';

function rawResponse(sportService: string, marketIds: number[]) {
  const markets = Object.fromEntries(
    marketIds.map((id) => [
      String(id),
      {
        id,
        name: `Mercado ${id}`,
        status: 'ACTIVE',
        specifiers: null,
        outcomes: {
          '1': { id: 1, name: 'A', odds: 2, order: 1, specifiers: null, status: 'ACTIVE', product_id: '3' },
          '2': { id: 2, name: 'B', odds: 3, order: 2, specifiers: null, status: 'ACTIVE', product_id: '3' },
        },
      },
    ]),
  );
  return {
    details: { key: 'fixture' },
    '10': {
      id: 10,
      name: 'Torneio',
      sport_id: 1,
      fixtures: {
        '123': { id: 123, name: 'A x B', startTime: 1893456000000, sportService, status: 'ACTIVE', markets },
      },
    },
  };
}

test('partida pré-jogo classifica pelo marketId e ignora mercado não mapeado', () => {
  const [parsed] = parseFixtureResponse(rawResponse('PRE', [1, 999999]));
  expect(parsed.matchId).toBe(123);
  expect(parsed.tournamentName).toBe('Torneio');
  expect(parsed.markets.map((m) => m.category)).toEqual(['resultado_final']);
});

test('partida ao vivo marca todos os mercados como ao_vivo', () => {
  const [parsed] = parseFixtureResponse(rawResponse('LIVE', [1, 999999]));
  expect(parsed.markets.length).toBeGreaterThan(0);
  expect(parsed.markets.every((m) => m.category === 'ao_vivo')).toBe(true);
});

test('fixture sem mercado conhecido é descartada', () => {
  expect(parseFixtureResponse(rawResponse('PRE', [999999]))).toEqual([]);
});
