import { faker } from '@faker-js/faker';
import type {
  BetPayload,
  BetItem,
  BetBuilderItem,
  BetBuilderSelection,
  FutureBetItem,
  Fixture,
  FixtureMarket,
  SeasonMarket,
  MarketCategory,
  Channel,
} from '../types';
import marketsWeights from '../config/marketsWeights.json';

type BetTypeKey =
  | 'resultado_final'
  | 'total_gols'
  | 'parcial_1t'
  | 'escanteios'
  | 'cartoes'
  | 'jogador'
  | 'multipla'
  | 'bet_builder'
  | 'aposta_futura'
  | 'ao_vivo';

const ALL_BET_TYPES: BetTypeKey[] = [
  'resultado_final',
  'total_gols',
  'parcial_1t',
  'escanteios',
  'cartoes',
  'jogador',
  'multipla',
  'bet_builder',
  'aposta_futura',
  'ao_vivo',
];

type CategoryWeights = Record<BetTypeKey, number>;

function defaultWeights(): CategoryWeights {
  return {
    resultado_final: marketsWeights.resultado_final,
    total_gols: marketsWeights.total_gols,
    parcial_1t: marketsWeights.parcial_1t,
    escanteios: marketsWeights.escanteios,
    cartoes: marketsWeights.cartoes,
    jogador: marketsWeights.jogador,
    multipla: marketsWeights.multipla,
    bet_builder: marketsWeights.bet_builder,
    aposta_futura: (marketsWeights as any).aposta_futura ?? 0,
    ao_vivo: (marketsWeights as any).ao_vivo ?? 0,
  };
}

/** Categorias que têm peso > 0 configurado (ou seja, participariam do sorteio se tivessem cobertura) */
export function getActiveCategories(weights: CategoryWeights = defaultWeights()): BetTypeKey[] {
  return ALL_BET_TYPES.filter((k) => (weights[k] ?? 0) > 0);
}

/** Sorteia uma chave de um objeto de pesos (ex: { resultado_final: 25, multipla: 15, ... }) */
function weightedPick<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function pickBetType(weights: CategoryWeights = defaultWeights()): BetTypeKey {
  return weightedPick(weights);
}

/** Retorna todos os mercados de uma fixture que pertencem a uma categoria específica */
function marketsByCategory(fixture: Fixture & { markets: FixtureMarket[] }, category: MarketCategory) {
  return fixture.markets.filter((m) => m.category === category);
}

/**
 * Verifica se uma categoria TEM cobertura real nos pools fornecidos — ou
 * seja, se dá pra gerar pelo menos uma aposta dessa categoria sem lançar
 * erro. Usado para validar ANTES de disparar qualquer aposta (ver
 * computeCoverageReport), em vez de descobrir a falta de cobertura no meio
 * da execução.
 */
function hasCoverage(
  category: BetTypeKey,
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  seasonMarkets: SeasonMarket[],
  liveFixtures: (Fixture & { markets: FixtureMarket[] })[],
): boolean {
  switch (category) {
    case 'aposta_futura':
      return seasonMarkets.length > 0;
    case 'ao_vivo':
      return liveFixtures.some((f) => marketsByCategory(f, 'ao_vivo').length > 0);
    case 'bet_builder':
      return fixtures.some((f) => new Set(f.markets.map((m) => m.category)).size >= 2);
    case 'multipla': {
      // precisa de pelo menos 2 fixtures DIFERENTES com algum mercado "simples" utilizável
      const simpleCategories: MarketCategory[] = ['resultado_final', 'total_gols', 'parcial_1t', 'escanteios', 'cartoes', 'jogador'];
      const fixturesComMercadoSimples = fixtures.filter((f) => simpleCategories.some((c) => marketsByCategory(f, c).length > 0));
      return fixturesComMercadoSimples.length >= 2;
    }
    default:
      // categorias "simples": resultado_final, total_gols, parcial_1t, escanteios, cartoes, jogador
      return fixtures.some((f) => marketsByCategory(f, category as MarketCategory).length > 0);
  }
}

export interface CoverageReport {
  available: BetTypeKey[];
  unavailable: BetTypeKey[];
  /** Pesos com as categorias sem cobertura zeradas — use isso no lugar dos pesos de marketsWeights.json ao gerar apostas aleatórias */
  effectiveWeights: CategoryWeights;
}

/**
 * Verifica, para cada categoria com peso > 0, se ela tem cobertura real nos
 * pools da sessão. Rode isso UMA VEZ antes de começar a disparar apostas
 * (não a cada aposta) — é barato e permite avisar/decidir antes de gastar
 * qualquer requisição real.
 */
export function computeCoverageReport(
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  seasonMarkets: SeasonMarket[] = [],
  liveFixtures: (Fixture & { markets: FixtureMarket[] })[] = [],
  weights: CategoryWeights = defaultWeights(),
): CoverageReport {
  const active = getActiveCategories(weights);
  const available: BetTypeKey[] = [];
  const unavailable: BetTypeKey[] = [];

  for (const category of active) {
    if (hasCoverage(category, fixtures, seasonMarkets, liveFixtures)) {
      available.push(category);
    } else {
      unavailable.push(category);
    }
  }

  const effectiveWeights: CategoryWeights = { ...weights };
  for (const category of unavailable) {
    effectiveWeights[category] = 0;
  }

  return { available, unavailable, effectiveWeights };
}

/** Monta um BetItem "solto" a partir de uma fixture + mercado + outcome sorteados */
function buildBetItem(
  fixture: Fixture,
  market: FixtureMarket,
): BetItem {
  const outcome = faker.helpers.arrayElement(market.outcomes);
  return {
    day: fixture.day,
    marketId: market.marketId,
    marketName: market.marketName,
    matchId: fixture.matchId,
    matchName: fixture.matchName,
    outcomeId: outcome.outcomeId,
    outcomeName: outcome.outcomeName,
    outcomePrice: outcome.outcomePrice,
    productId: market.productId ?? '3',
    specifiers: market.specifiers,
    tournamentName: fixture.tournamentName,
    sportId: fixture.sportId,
  };
}

/** Sorteia uma fixture que tenha pelo menos um mercado da categoria pedida */
function pickFixtureWithCategory(
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  category: MarketCategory,
) {
  const candidates = fixtures.filter((f) => marketsByCategory(f, category).length > 0);
  if (candidates.length === 0) {
    throw new Error(
      `Nenhuma fixture no pool tem mercado da categoria "${category}". Popule fixtures.sample.json com dados reais dessa categoria.`,
    );
  }
  const fixture = faker.helpers.arrayElement(candidates);
  const market = faker.helpers.arrayElement(marketsByCategory(fixture, category));
  return { fixture, market };
}

function randomAmount(): number {
  const { min, max } = (marketsWeights as any)._amount;
  return Number(faker.number.float({ min, max, fractionDigits: 2 }));
}

function randomChannel(): Channel {
  return faker.helpers.arrayElement<Channel>(['mobile', 'internet']);
}

/** Gera uma aposta simples (1 item) em uma categoria específica de mercado (resultado_final, total_gols, parcial_1t, escanteios, cartoes ou jogador) */
function generateSimpleBet(
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  category: MarketCategory,
): BetPayload {
  const { fixture, market } = pickFixtureWithCategory(fixtures, category);
  const item = buildBetItem(fixture, market);
  return {
    accept_odds_changes: false,
    odds_change: null,
    use_bonus: false,
    full_url: null,
    items: [item],
    channel: randomChannel(),
    is_superodds: false,
    amount: randomAmount(),
  };
}

/** Gera uma múltipla: N seleções, cada uma de uma partida diferente */
function generateMultipla(fixtures: (Fixture & { markets: FixtureMarket[] })[]): BetPayload {
  const { min_selecoes, max_selecoes } = (marketsWeights as any)._multipla;
  const n = faker.number.int({ min: min_selecoes, max: max_selecoes });

  // categorias "simples" que podem compor uma múltipla (evita puxar bet builder aqui dentro)
  const simpleCategories: MarketCategory[] = [
    'resultado_final',
    'total_gols',
    'parcial_1t',
    'escanteios',
    'cartoes',
    'jogador',
  ];

  const usedMatchIds = new Set<number>();
  const items: BetItem[] = [];

  let attempts = 0;
  while (items.length < n && attempts < n * 10) {
    attempts++;
    const category = faker.helpers.arrayElement(simpleCategories);
    let picked;
    try {
      picked = pickFixtureWithCategory(fixtures, category);
    } catch {
      continue; // categoria sem candidatos no pool, tenta outra
    }
    if (usedMatchIds.has(picked.fixture.matchId)) continue; // múltipla exige partidas diferentes
    usedMatchIds.add(picked.fixture.matchId);
    items.push(buildBetItem(picked.fixture, picked.market));
  }

  if (items.length < 2) {
    throw new Error('Pool de fixtures insuficiente para montar uma múltipla com partidas diferentes.');
  }

  return {
    accept_odds_changes: false,
    odds_change: null,
    use_bonus: false,
    full_url: null,
    items,
    channel: randomChannel(),
    is_superodds: false,
    amount: randomAmount(),
  };
}

/** Gera um Bet Builder: várias seleções combinadas na MESMA partida */
function generateBetBuilder(fixtures: (Fixture & { markets: FixtureMarket[] })[]): BetPayload {
  const { min_selecoes, max_selecoes } = (marketsWeights as any)._bet_builder;
  const n = faker.number.int({ min: min_selecoes, max: max_selecoes });

  // Agrupa os mercados por "família" (categoria) e sorteia no máximo 1 por
  // família — reduz bastante o risco de combinar seleções correlacionadas
  // (ex: 3 variantes de "Resultado Final com vantagem", ou dois mercados
  // que descrevem a mesma dimensão estatística do jogo), que a API real
  // rejeita como "Conflito entre seleções". Não elimina 100% os conflitos
  // (só o provedor de odds sabe a tabela de correlação completa), mas
  // reduz a taxa observada sem exigir esse mapeamento.

  // escolhe uma fixture que tenha mercados de pelo menos 2 famílias diferentes
  const candidates = fixtures.filter((f) => new Set(f.markets.map((m) => m.category)).size >= 2);
  if (candidates.length === 0) {
    throw new Error('Nenhuma fixture no pool tem mercados de pelo menos 2 famílias diferentes para montar um Bet Builder.');
  }
  const fixture = faker.helpers.arrayElement(candidates);

  const byFamily = new Map<MarketCategory, FixtureMarket[]>();
  for (const market of fixture.markets) {
    const list = byFamily.get(market.category) ?? [];
    list.push(market);
    byFamily.set(market.category, list);
  }
  const families = faker.helpers.shuffle([...byFamily.keys()]);
  const chosenFamilies = families.slice(0, Math.min(n, families.length));
  // 1 mercado sorteado por família escolhida (nunca 2 do mesmo marketId/família juntos)
  const chosenMarkets = chosenFamilies.map((family) => faker.helpers.arrayElement(byFamily.get(family)!));

  const selections: BetBuilderSelection[] = chosenMarkets.map((market) => {
    const outcome = faker.helpers.arrayElement(market.outcomes);
    return {
      specifiers: market.specifiers,
      marketId: market.marketId,
      marketName: market.marketName,
      outcomeId: outcome.outcomeId,
      outcomeName: outcome.outcomeName,
      outcomePrice: outcome.outcomePrice,
      productId: '3',
    };
  });

  // odd combinada aproximada = produto das odds individuais (mesma lógica usada por bet builders de mercado)
  const combinedPrice = Number(
    selections.reduce((acc, s) => acc * s.outcomePrice, 1).toFixed(2),
  );

  const item: BetBuilderItem = {
    type: 'custom-bet',
    matchId: fixture.matchId,
    matchName: fixture.matchName,
    tournamentName: fixture.tournamentName,
    day: fixture.day,
    sportId: fixture.sportId,
    outcomePrice: combinedPrice,
    selections,
  };

  return {
    accept_odds_changes: false,
    odds_change: null,
    use_bonus: false,
    full_url: null,
    items: [item],
    channel: randomChannel(),
    is_superodds: false,
    amount: randomAmount(),
  };
}

/** Gera uma Aposta Futura (mercado de temporada, não ligado a uma partida específica) */
function generateFutureBet(seasonMarkets: SeasonMarket[]): BetPayload {
  if (seasonMarkets.length === 0) {
    throw new Error(
      'Pool de seasonMarkets vazio — popule seasonMarkets.sample.json com mercados de temporada reais para gerar Apostas Futuras.',
    );
  }
  const market = faker.helpers.arrayElement(seasonMarkets);
  const outcome = faker.helpers.arrayElement(market.outcomes);

  const item: FutureBetItem = {
    eventId: market.eventId,
    type: 'season',
    day: market.day,
    marketId: market.marketId,
    marketName: market.marketName,
    outcomeId: outcome.outcomeId,
    outcomeName: outcome.outcomeName,
    outcomePrice: outcome.outcomePrice,
    productId: 3,
    specifiers: market.specifiers,
    tournamentName: market.tournamentName,
    sportId: market.sportId,
  };

  return {
    accept_odds_changes: false,
    odds_change: null,
    use_bonus: false,
    full_url: null,
    items: [item],
    channel: randomChannel(),
    is_superodds: false,
    amount: randomAmount(),
  };
}

/** Gera um payload de UM tipo específico (sem sorteio) — usado tanto pelo sorteio aleatório quanto pela cobertura garantida. */
function generateBetOfType(
  type: BetTypeKey,
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  seasonMarkets: SeasonMarket[],
  liveFixtures: (Fixture & { markets: FixtureMarket[] })[],
  options: { fixedAmount?: number },
): BetPayload {
  let payload: BetPayload;
  switch (type) {
    case 'multipla':
      payload = generateMultipla(fixtures);
      break;
    case 'bet_builder':
      payload = generateBetBuilder(fixtures);
      break;
    case 'aposta_futura':
      payload = generateFutureBet(seasonMarkets);
      break;
    case 'ao_vivo':
      payload = generateSimpleBet(liveFixtures, 'ao_vivo');
      break;
    default:
      payload = generateSimpleBet(fixtures, type as MarketCategory);
  }

  if (options.fixedAmount !== undefined) {
    payload.amount = options.fixedAmount;
  }

  return payload;
}

/**
 * Gera um payload de aposta sorteado conforme a matriz de pesos em marketsWeights.json.
 * @param fixtures pool de partidas reais com mercados/odds já carregados (ver fixtures.sample.json)
 * @param seasonMarkets pool de mercados de temporada (Aposta Futura) já carregados (ver seasonMarkets.sample.json) — opcional, necessário só se o peso de "aposta_futura" for > 0
 * @param liveFixtures pool de partidas ao vivo já carregadas (ver liveFixtures.sample.json) — opcional, necessário só se o peso de "ao_vivo" for > 0
 * @param options.fixedAmount se informado, TODAS as apostas geradas usam exatamente esse valor em vez de sortear dentro da faixa de marketsWeights.json — use isso para rodadas controladas (ex: 10 apostas de R$0,50)
 */
export function generateBetPayload(
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  seasonMarkets: SeasonMarket[] = [],
  liveFixtures: (Fixture & { markets: FixtureMarket[] })[] = [],
  options: { fixedAmount?: number } = {},
  weights: CategoryWeights = defaultWeights(),
): BetPayload {
  const type = pickBetType(weights);
  return generateBetOfType(type, fixtures, seasonMarkets, liveFixtures, options);
}

/**
 * Gera um LOTE de apostas garantindo cobertura mínima de cada categoria ativa
 * (peso > 0 em marketsWeights.json) — essencial para volumes pequenos, onde
 * sorteio aleatório puro pode nunca sortear categorias de peso baixo (ex:
 * bet_builder, aposta_futura).
 *
 * Estratégia: gera `minPerCategory` apostas de CADA categoria ativa primeiro
 * (cobertura garantida), depois preenche o restante do volume com sorteio
 * aleatório normal (respeitando os pesos), e por fim embaralha a ordem final
 * — assim as apostas "garantidas" não saem todas em sequência.
 *
 * @param totalCount total de apostas a gerar (ex: 20)
 * @param minPerCategory quantas apostas de CADA categoria ativa devem aparecer no mínimo (ex: 2)
 * @throws se totalCount for menor que (nº de categorias ativas × minPerCategory)
 */
export function generateCoverageBatch(
  totalCount: number,
  minPerCategory: number,
  fixtures: (Fixture & { markets: FixtureMarket[] })[],
  seasonMarkets: SeasonMarket[] = [],
  liveFixtures: (Fixture & { markets: FixtureMarket[] })[] = [],
  options: { fixedAmount?: number } = {},
): BetPayload[] {
  const activeCategories = getActiveCategories();

  // Cobertura garantida exige que TODA categoria ativa consiga gerar pelo
  // menos minPerCategory apostas — diferente do sorteio aleatório puro, aqui
  // não faz sentido "excluir e seguir": se você pediu cobertura mínima de
  // uma categoria que não existe no pool, é melhor travar com um erro claro
  // do que silenciosamente entregar menos do que foi pedido.
  const { unavailable } = computeCoverageReport(fixtures, seasonMarkets, liveFixtures, defaultWeights());
  const unavailableActive = unavailable.filter((c) => activeCategories.includes(c));
  if (unavailableActive.length > 0) {
    throw new Error(
      `Cobertura garantida impossível: ${unavailableActive.length} categoria(s) sem NENHUMA cobertura no pool desta sessão (${unavailableActive.join(', ')}). ` +
        `Popule fixtures/seasonMarkets/liveFixtures com dados reais dessas categorias, ou zere o peso delas em marketsWeights.json.`,
    );
  }

  const required = activeCategories.length * minPerCategory;
  if (required > totalCount) {
    throw new Error(
      `Volume insuficiente para garantir cobertura: ${activeCategories.length} categorias ativas × ${minPerCategory} mínimo = ${required} apostas necessárias, mas totalCount é ${totalCount}. Aumente o volume, reduza minPerCategory, ou zere o peso de alguma categoria em marketsWeights.json.`,
    );
  }

  const payloads: BetPayload[] = [];

  for (const category of activeCategories) {
    for (let i = 0; i < minPerCategory; i++) {
      payloads.push(generateBetOfType(category, fixtures, seasonMarkets, liveFixtures, options));
    }
  }

  const remaining = totalCount - payloads.length;
  for (let i = 0; i < remaining; i++) {
    payloads.push(generateBetPayload(fixtures, seasonMarkets, liveFixtures, options));
  }

  // embaralha (Fisher-Yates) para as apostas "garantidas" não saírem todas em bloco
  for (let i = payloads.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [payloads[i], payloads[j]] = [payloads[j], payloads[i]];
  }

  return payloads;
}
