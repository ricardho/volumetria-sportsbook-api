import type { Fixture, FixtureMarket, MarketCategory } from '../types';

/**
 * Mapa de marketId conhecido (catálogo do provedor de odds usado pelo siteSportsbook) -> categoria
 * interna usada na matriz de pesos (marketsWeights.json). Mercados com um
 * marketId não presente aqui são ignorados pelo parser — adicione novas
 * entradas conforme mais tipos de mercado forem mapeados.
 */
export const MARKET_CATEGORY_BY_ID: Record<string, MarketCategory> = {
  '1': 'resultado_final',
  '1601': 'resultado_final',
  '18': 'total_gols',
  '68': 'parcial_1t',
  '166': 'escanteios',
  '139': 'cartoes',
  '1578': 'jogador',
  '38': 'jogador', // "Marcar o 1º Gol" (quem marca primeiro)
};

interface RawOutcome {
  id: number | string;
  name: string;
  odds: number;
  specifiers?: string | null;
  product_id?: string;
  status?: string;
}

interface RawLine {
  lineId: string;
  specifiers: string;
  status?: string;
  columns: Record<string, RawOutcome>;
}

interface RawHandicapRow {
  home?: RawOutcome;
  away?: RawOutcome;
}

interface RawMarket {
  id: number;
  name: string;
  status?: string;
  specifiers?: string | null;
  outcomes?: Record<string, RawOutcome>;
  lineTable?: { lines: RawLine[] };
  handicapTable?: { rows: RawHandicapRow[] };
}

interface RawFixture {
  id: number;
  name: string;
  startTime: number;
  sportService?: string; // "LIVE" identifica partida ao vivo
  status?: string;
  markets?: Record<string, RawMarket>;
}

interface RawTournament {
  id: number;
  name: string;
  sport_id: number;
  fixtures: Record<string, RawFixture>;
}

function toOutcome(o: RawOutcome) {
  return {
    outcomeId: String(o.id),
    outcomeName: o.name,
    outcomePrice: o.odds,
  };
}

/**
 * Extrai um ou mais "sub-mercados" estruturais de um RawMarket:
 * - mercado com `outcomes` direto -> 1 FixtureMarket
 * - mercado com `lineTable` -> 1 FixtureMarket por linha (ex: total=0.5, total=1.5, ...)
 * - mercado com `handicapTable` -> 1 FixtureMarket por linha de handicap
 */
function extractStructuralMarkets(raw: RawMarket): Array<Omit<FixtureMarket, 'category'>> {
  const results: Array<Omit<FixtureMarket, 'category'>> = [];

  if (raw.outcomes && Object.keys(raw.outcomes).length > 0) {
    const activeOutcomes = Object.values(raw.outcomes).filter((o) => (o.status ?? 'ACTIVE') === 'ACTIVE');
    if (activeOutcomes.length > 0) {
      results.push({
        marketId: String(raw.id),
        marketName: raw.name,
        specifiers: raw.specifiers ?? null,
        productId: activeOutcomes[0].product_id ?? '3',
        outcomes: activeOutcomes.map(toOutcome),
      });
    }
  }

  if (raw.lineTable) {
    for (const line of raw.lineTable.lines) {
      if ((line.status ?? 'ACTIVE') !== 'ACTIVE') continue;
      const cols = Object.values(line.columns).filter((c) => (c.status ?? 'ACTIVE') === 'ACTIVE');
      if (cols.length === 0) continue;
      results.push({
        marketId: String(raw.id),
        marketName: raw.name,
        specifiers: line.specifiers,
        productId: cols[0].product_id ?? '3',
        outcomes: cols.map(toOutcome),
      });
    }
  }

  if (raw.handicapTable) {
    for (const row of raw.handicapTable.rows) {
      const sides = [row.home, row.away].filter(
        (s): s is RawOutcome => !!s && (s.status ?? 'ACTIVE') === 'ACTIVE',
      );
      if (sides.length === 0) continue;
      results.push({
        marketId: String(raw.id),
        marketName: raw.name,
        specifiers: sides[0].specifiers ?? null,
        productId: sides[0].product_id ?? '3',
        outcomes: sides.map(toOutcome),
      });
    }
  }

  return results;
}

/**
 * Converte a resposta bruta do endpoint de fixture (GET .../data?key=fixture&id=X,
 * ou o endpoint real confirmado fixtures.sitesportsbook.example/data?key=fixture&id=X) no formato
 * interno usado por betFactory.ts.
 *
 * Detecta automaticamente se a partida é ao vivo (sportService === "LIVE") e,
 * nesse caso, marca TODOS os mercados extraídos com a categoria "ao_vivo" —
 * caso contrário, usa MARKET_CATEGORY_BY_ID para classificar cada mercado.
 *
 * Mercados com marketId não mapeado em MARKET_CATEGORY_BY_ID são ignorados.
 */
export function parseFixtureResponse(
  raw: Record<string, unknown>,
): (Fixture & { markets: FixtureMarket[] })[] {
  const result: (Fixture & { markets: FixtureMarket[] })[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'details') continue;
    const tournament = value as RawTournament;
    if (!tournament?.fixtures) continue;

    for (const rawFixture of Object.values(tournament.fixtures)) {
      const isLive = rawFixture.sportService === 'LIVE';
      const markets: FixtureMarket[] = [];

      for (const rawMarket of Object.values(rawFixture.markets ?? {})) {
        const category: MarketCategory | undefined = isLive
          ? 'ao_vivo'
          : MARKET_CATEGORY_BY_ID[String(rawMarket.id)];
        if (!category) continue; // mercado não mapeado — ignorado

        for (const structural of extractStructuralMarkets(rawMarket)) {
          markets.push({ ...structural, category });
        }
      }

      if (markets.length === 0) continue; // nenhum mercado conhecido/ativo nessa fixture

      result.push({
        matchId: rawFixture.id,
        matchName: rawFixture.name,
        tournamentName: tournament.name,
        sportId: tournament.sport_id,
        day: new Date(rawFixture.startTime).toISOString(),
        markets,
      });
    }
  }

  return result;
}
