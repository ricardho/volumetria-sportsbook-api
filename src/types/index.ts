/**
 * Tipos do payload de apostas do siteSportsbook (API api-preprod.sitesportsbook.example/sportsbook/bet)
 * Mapeados a partir de payloads reais capturados via DevTools em pré-produção.
 */

export type Channel = 'mobile' | 'internet';

/** Uma seleção "solta" — usada em aposta simples e como cada entrada de uma múltipla */
export interface BetItem {
  day: string; // ISO datetime do início da partida
  marketId: string;
  marketName: string;
  matchId: number;
  matchName: string;
  outcomeId: string; // numérico para a maioria dos mercados, "player:{id}" para mercados de jogador
  outcomeName: string;
  outcomePrice: number;
  productId: string; // "3" = provedor de odds, observado em todos os exemplos até agora
  specifiers: string | null; // ex: "total=2.5", "count=5", "xup=3", ou null quando o mercado não usa linha
  tournamentName: string;
  sportId: number;
}

/** Uma seleção dentro de um Bet Builder — igual ao BetItem mas sem matchId/matchName/day (herdados do item pai) */
export interface BetBuilderSelection {
  specifiers: string | null;
  marketId: string;
  marketName: string;
  outcomeId: string;
  outcomeName: string;
  outcomePrice: number;
  productId: string;
}

/** Item de Bet Builder — combina várias seleções da MESMA partida em uma única "aposta combinada" */
export interface BetBuilderItem {
  type: 'custom-bet';
  matchId: number;
  matchName: string;
  tournamentName: string;
  day: string;
  sportId: number;
  outcomePrice: number; // odd combinada de todas as seleções
  selections: BetBuilderSelection[];
}

/** Item de Aposta Futura — mercado de temporada (ex: vencedor de uma liga), não ligado a uma partida específica */
export interface FutureBetItem {
  eventId: number; // id do evento/temporada, não de uma partida
  type: 'season';
  day: string;
  marketId: string;
  marketName: string;
  outcomeId: string; // formato observado: "pre:outcometext:{id}"
  outcomeName: string;
  outcomePrice: number;
  productId: string | number; // observado como número neste tipo de mercado, string nos demais
  specifiers: string | null; // formato observado: "variant=pre:markettext:{id}"
  tournamentName: string;
  sportId: number;
}

export type AnyBetItem = BetItem | BetBuilderItem | FutureBetItem;

/** Payload completo enviado para POST /sportsbook/bet */
export interface BetPayload {
  accept_odds_changes: boolean;
  odds_change: null;
  use_bonus: boolean;
  full_url: null;
  items: AnyBetItem[];
  channel: Channel;
  is_superodds: boolean;
  amount: number;
}

/** Resposta esperada da API ao criar a aposta com sucesso */
export interface BetResponse {
  message: string;
  bets: Array<{
    passador_id: number;
    apostador: string;
    ativo: boolean;
    valor: number;
    horario: string;
    resultado: string;
    codigo: string;
    chave: string;
    id: number;
    [key: string]: unknown;
  }>;
  total_amount: number;
  balance_type: string;
  balance_before: number;
  balance_after: number;
}

/** Categoria de mercado usada para aplicar a matriz de pesos */
export type MarketCategory =
  | 'resultado_final'
  | 'total_gols'
  | 'jogador'
  | 'escanteios'
  | 'cartoes'
  | 'parcial_1t'
  | 'bet_builder'
  | 'aposta_futura'
  | 'ao_vivo';

/** Um mercado disponível dentro de uma fixture real (carregado do endpoint de fixture) */
export interface FixtureMarket {
  marketId: string;
  marketName: string;
  category: MarketCategory;
  specifiers: string | null;
  productId?: string; // "3" = pré-jogo (padrão), "1" = ao vivo
  outcomes: Array<{
    outcomeId: string;
    outcomeName: string;
    outcomePrice: number;
  }>;
}

/** Uma partida real disponível para apostar, com seus mercados já carregados */
export interface Fixture {
  matchId: number;
  matchName: string;
  tournamentName: string;
  sportId: number;
  day: string;
}

/** Um mercado de temporada (Aposta Futura) disponível, ex: "vencedor da Premier League" */
export interface SeasonMarket {
  eventId: number;
  marketId: string;
  marketName: string;
  specifiers: string | null;
  tournamentName: string;
  sportId: number;
  day: string; // prazo/limite observado para esse mercado de temporada
  outcomes: Array<{
    outcomeId: string;
    outcomeName: string;
    outcomePrice: number;
  }>;
}
