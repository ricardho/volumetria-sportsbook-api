/**
 * Leitura e validação das variáveis de execução do .env. Valor inválido
 * (ex: "abc", negativo, threshold > 1) gera erro claro ANTES de qualquer
 * aposta — em vez de virar NaN e terminar a execução em silêncio.
 */
import marketsWeights from './marketsWeights.json';

interface NumberRule {
  integer?: boolean;
  min?: number;
  max?: number;
  /** Se true, o mínimo é exclusivo (valor precisa ser > min). */
  exclusiveMin?: boolean;
}

export function parseEnvNumber(name: string, rule: NumberRule = {}, env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;

  const value = Number(raw.replace(',', '.'));
  const invalid = (reason: string) => new Error(`${name}="${raw}" é inválido: ${reason}.`);

  if (!Number.isFinite(value)) throw invalid('não é um número');
  if (rule.integer && !Number.isInteger(value)) throw invalid('precisa ser um número inteiro');
  if (rule.min !== undefined) {
    if (rule.exclusiveMin ? value <= rule.min : value < rule.min) {
      throw invalid(`precisa ser ${rule.exclusiveMin ? 'maior que' : 'maior ou igual a'} ${rule.min}`);
    }
  }
  if (rule.max !== undefined && value > rule.max) throw invalid(`precisa ser menor ou igual a ${rule.max}`);
  return value;
}

/** Configurações de execução comuns ao `test:volumetry` e ao wizard. */
export interface ExecutionSettings {
  batchSize?: number;
  concurrency?: number;
  errorThreshold?: number;
  minPerCategory?: number;
  /** Teto de valor total (R$) por execução — protege contra volume/valor digitado errado. */
  maxTotalValue?: number;
}

export function readExecutionSettings(env: NodeJS.ProcessEnv = process.env): ExecutionSettings {
  return {
    batchSize: parseEnvNumber('SITE_SPORTSBOOK_BATCH_SIZE', { integer: true, min: 1 }, env),
    concurrency: parseEnvNumber('SITE_SPORTSBOOK_CONCURRENCY', { integer: true, min: 1 }, env),
    errorThreshold: parseEnvNumber('SITE_SPORTSBOOK_ERROR_THRESHOLD', { min: 0, max: 1 }, env),
    minPerCategory: parseEnvNumber('SITE_SPORTSBOOK_MIN_PER_CATEGORY', { integer: true, min: 0 }, env),
    maxTotalValue: parseEnvNumber('SITE_SPORTSBOOK_MAX_TOTAL_VALUE', { min: 0, exclusiveMin: true }, env),
  };
}

export interface RunConfig extends ExecutionSettings {
  sessionLabel: string;
  totalBets: number;
  betAmount?: number;
}

/** Configuração completa do `npm run test:volumetry`. SITE_SPORTSBOOK_TOTAL_BETS é obrigatório (não há volume padrão). */
export function readRunConfig(env: NodeJS.ProcessEnv = process.env): RunConfig {
  const totalBets = parseEnvNumber('SITE_SPORTSBOOK_TOTAL_BETS', { integer: true, min: 1 }, env);
  if (totalBets === undefined) {
    throw new Error('Defina SITE_SPORTSBOOK_TOTAL_BETS (quantidade de apostas) no .env ou no terminal antes de rodar.');
  }
  return {
    ...readExecutionSettings(env),
    sessionLabel: env.SITE_SPORTSBOOK_SESSION_LABEL?.trim() || 'default',
    totalBets,
    betAmount: parseEnvNumber('SITE_SPORTSBOOK_BET_AMOUNT', { min: 0, exclusiveMin: true }, env),
  };
}

/**
 * Valor máximo que a execução pode apostar: com valor fixo, é exato; sem
 * valor fixo, usa o teto da faixa sorteada (_amount.max em marketsWeights.json).
 */
export function estimateMaxStake(totalBets: number, betAmount?: number): number {
  const perBet = betAmount ?? marketsWeights._amount.max;
  return Number((totalBets * perBet).toFixed(2));
}

export function assertWithinStakeLimit(estimatedStake: number, maxTotalValue?: number): void {
  if (maxTotalValue !== undefined && estimatedStake > maxTotalValue) {
    throw new Error(
      `Valor total estimado (R$${estimatedStake.toFixed(2)}) ultrapassa SITE_SPORTSBOOK_MAX_TOTAL_VALUE (R$${maxTotalValue.toFixed(2)}). ` +
        'Reduza o volume/valor ou aumente o teto conscientemente.',
    );
  }
}
