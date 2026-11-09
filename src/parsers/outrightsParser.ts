import type { SeasonMarket } from '../types';

/**
 * Parser da resposta de GET /v1/outrights (apostas futuras / mercados de
 * temporada). Formato confirmado via DevTools contra pré-produção.
 *
 * Diferente do endpoint de fixture: essa chamada não recebe ID nenhum —
 * retorna TODOS os eventos de outright disponíveis de uma vez só.
 */

interface RawOutcome {
  id: string;
  name: string;
  odds: number;
  order: number | null;
  specifiers: string | null;
  status: string;
  product_id: string;
}

interface RawMarket {
  id: number;
  name: string;
  status: string;
  specifiers: string | null;
  order: number | null;
  outcomes: Record<string, RawOutcome>;
}

interface RawEvent {
  id: number;
  order: number | null;
  name: string;
  name_region?: string;
  acronym_region?: string;
  sport_id: number;
  type: string; // "season"
  status: string;
  start_date: string;
  end_date: string;
  category?: { id: string; name: string };
  tournament?: { id: string; name: string; category_id: string; category_name: string };
  markets: Record<string, RawMarket>;
}

type RawOutrightsResponse = Record<string, RawEvent>;

/**
 * Pega o PRIMEIRO evento ativo da resposta (na ordem em que a API retorna)
 * e, dentro dele, o primeiro mercado ativo com pelo menos um outcome ativo.
 * Usado quando não faz sentido perguntar qual torneio/mercado escolher —
 * suficiente para dar cobertura à categoria "aposta_futura" sem exigir
 * nenhuma decisão do usuário.
 *
 * Retorna um array com 0 ou 1 SeasonMarket.
 */
export function parseFirstActiveMarket(raw: RawOutrightsResponse): SeasonMarket[] {
  for (const event of Object.values(raw)) {
    if (event.status !== 'ACTIVE') continue;

    for (const market of Object.values(event.markets)) {
      if (market.status !== 'ACTIVE') continue;

      const activeOutcomes = Object.values(market.outcomes).filter((o) => o.status === 'ACTIVE');
      if (activeOutcomes.length === 0) continue;

      return [
        {
          eventId: event.id,
          marketId: String(market.id),
          marketName: market.name,
          specifiers: market.specifiers,
          tournamentName: event.name,
          sportId: event.sport_id,
          day: event.end_date,
          outcomes: activeOutcomes.map((o) => ({
            outcomeId: o.id,
            outcomeName: o.name,
            outcomePrice: o.odds,
          })),
        },
      ];
    }
  }

  return [];
}

/**
 * Converte a resposta bruta de /v1/outrights em SeasonMarket[] (formato
 * interno usado por betFactory.ts / generateFutureBet).
 *
 * @param raw JSON retornado pelo endpoint
 * @param tournamentFilters se informado, mantém só eventos cujo "name" contenha
 *   (case-insensitive) algum dos textos da lista — útil pra não importar
 *   centenas de torneios de uma vez quando só alguns interessam ao teste.
 */
export function parseOutrightsResponse(raw: RawOutrightsResponse, tournamentFilters?: string[]): SeasonMarket[] {
  const result: SeasonMarket[] = [];

  for (const event of Object.values(raw)) {
    if (event.status !== 'ACTIVE') continue;

    if (tournamentFilters && tournamentFilters.length > 0) {
      const matches = tournamentFilters.some((f) => event.name.toLowerCase().includes(f.toLowerCase()));
      if (!matches) continue;
    }

    for (const market of Object.values(event.markets)) {
      if (market.status !== 'ACTIVE') continue;

      const activeOutcomes = Object.values(market.outcomes).filter((o) => o.status === 'ACTIVE');
      if (activeOutcomes.length === 0) continue;

      result.push({
        eventId: event.id,
        marketId: String(market.id),
        marketName: market.name,
        specifiers: market.specifiers,
        // O nome do torneio usado no payload real de aposta inclui o ano
        // (ex: "Premier League 26/27") — isso bate com event.name, não com
        // tournament.name (que costuma ser só o nome genérico da competição).
        tournamentName: event.name,
        sportId: event.sport_id,
        // "day" no payload de aposta parece ser um prazo/cutoff — usamos
        // end_date como aproximação mais próxima disponível nesse endpoint.
        day: event.end_date,
        outcomes: activeOutcomes.map((o) => ({
          outcomeId: o.id,
          outcomeName: o.name,
          outcomePrice: o.odds,
        })),
      });
    }
  }

  return result;
}
