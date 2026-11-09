import type { PoolFixture } from '../../src/flows/fixturesFlow';
import type { FixtureMarket, MarketCategory, SeasonMarket } from '../../src/types';

export function market(category: MarketCategory, marketId = '1'): FixtureMarket {
  return {
    marketId,
    marketName: `Mercado ${category}`,
    category,
    specifiers: null,
    outcomes: [
      { outcomeId: '1', outcomeName: 'Opção A', outcomePrice: 2 },
      { outcomeId: '2', outcomeName: 'Opção B', outcomePrice: 3 },
    ],
  } as FixtureMarket;
}

export function fixture(matchId: number, categories: MarketCategory[]): PoolFixture {
  return {
    matchId,
    matchName: `Time ${matchId} x Time ${matchId + 1}`,
    tournamentName: 'Torneio de Teste',
    sportId: 1,
    day: '2030-01-01T12:00:00.000Z',
    markets: categories.map((c) => market(c)),
  };
}

export function seasonMarket(): SeasonMarket {
  return {
    eventId: 1,
    marketId: '534',
    marketName: 'Vencedor',
    specifiers: null,
    tournamentName: 'Torneio de Teste',
    sportId: 1,
    day: '2030-12-31T12:00:00.000Z',
    outcomes: [{ outcomeId: '1', outcomeName: 'Time 1', outcomePrice: 5 }],
  } as SeasonMarket;
}

const SIMPLE: MarketCategory[] = ['resultado_final', 'total_gols', 'parcial_1t', 'escanteios', 'cartoes', 'jogador'];

/** Pool que cobre todas as categorias de marketsWeights.json */
export function fullPool() {
  return {
    fixtures: [fixture(1001, SIMPLE), fixture(1003, SIMPLE), fixture(1005, SIMPLE), fixture(1007, SIMPLE)],
    seasonMarkets: [seasonMarket()],
    liveFixtures: [fixture(2001, ['ao_vivo'])],
  };
}
