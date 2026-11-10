/**
 * Executor do teste de volumetria — roda para UMA sessão por vez. Escalona o
 * volume em lotes e aborta automaticamente quando:
 *   - a taxa de erro real de um lote ultrapassa o threshold configurado
 *     (conflitos de seleção do Bet Builder NÃO contam — são rejeições esperadas);
 *   - a API responde 401 (token expirado/inválido): as apostas restantes do
 *     lote nem são enviadas.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createApiContext } from '../api/apiClient';
import { SiteSportsbookBetService } from '../api/services/betService';
import { getEnvironment } from '../config/environments';
import { computeCoverageReport, generateBetPayload, generateCoverageBatch } from '../factories/betFactory';
import { resolveToken } from '../flows/credentialsFlow';
import { createLogger, type Logger } from '../logging/logger';
import { parseBetResponse } from '../parsers/betResponseParser';
import { resolveSessionPaths, type SessionPaths } from '../session/sessionStore';
import type { BetPayload, PoolFixture, SeasonMarket } from '../types';
import { createLimiter } from './concurrencyLimiter';
import { summarizePayload } from './payloadSummary';

/** Lote padrão: pequeno o bastante para o circuit breaker agir cedo, mesmo quando ninguém informa o tamanho. */
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_ERROR_THRESHOLD = 0.02;

export interface RunSessionParams {
  sessionLabel: string;
  environment: string;
  totalBets: number;
  batchSize?: number;
  concurrency?: number;
  betAmount?: number;
  minPerCategory?: number;
  errorThreshold?: number;
  /** Se já resolvido externamente (ex: pelo wizard, que acabou de logar) — pula a resolução de credenciais. */
  token?: string;
}

type LogResult = (entry: Record<string, unknown>) => void;

interface BatchOutcome {
  successCount: number;
  /** Falhas reais (contam para a taxa de erro). */
  failureCount: number;
  /** Rejeições por conflito de seleção (não contam para a taxa de erro). */
  conflictCount: number;
  /** Apostas aceitas cuja resposta veio sem bets[0].id. */
  unexpectedFormatCount: number;
  /** Apostas do lote que nem chegaram a ser enviadas (token expirou antes). */
  skippedCount: number;
  authExpired: boolean;
}

function newCorrelationId(): string {
  return `QA-SITESPORTSBOOK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function dispatchBatch(
  service: SiteSportsbookBetService,
  payloads: BetPayload[],
  limit: <T>(fn: () => Promise<T>) => Promise<T>,
  logResult: LogResult,
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = {
    successCount: 0,
    failureCount: 0,
    conflictCount: 0,
    unexpectedFormatCount: 0,
    skippedCount: 0,
    authExpired: false,
  };

  const tasks = payloads.map((payload) =>
    limit(async () => {
      // Token expirou no meio do lote: não adianta (nem é seguro) continuar disparando.
      if (outcome.authExpired) {
        outcome.skippedCount++;
        return;
      }

      const correlationId = newCorrelationId();
      const startedAt = Date.now();
      const base = { correlationId, requestSummary: summarizePayload(payload), valorAposta: payload.amount };

      try {
        const result = await service.placeBet(payload);
        const parsed = parseBetResponse(result);

        if (result.status === 401) outcome.authExpired = true;
        if (parsed.ok) outcome.successCount++;
        else if (parsed.statusAposta === 'conflito_selecao') outcome.conflictCount++;
        else outcome.failureCount++;
        if (parsed.formatoInesperado) outcome.unexpectedFormatCount++;

        const { formatoInesperado, ...fields } = parsed;
        logResult({ ...base, status: result.status, durationMs: Date.now() - startedAt, ...fields });
      } catch (err: any) {
        outcome.failureCount++;
        const message = err?.message ?? String(err);
        logResult({
          ...base,
          status: 'error',
          ok: false,
          durationMs: Date.now() - startedAt,
          error: message,
          statusAposta: 'erro',
          erroDetalhe: message,
          apostaId: null,
          codigoRetornado: null,
          clienteId: null,
          clienteNome: null,
        });
      }
    }),
  );

  await Promise.all(tasks);
  return outcome;
}

function readJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err: any) {
    throw new Error(`Não consegui ler ${filePath}: ${err.message}`);
  }
}

function loadDataPools(sessionLabel: string, paths: SessionPaths) {
  if (!fs.existsSync(paths.fixturesPath)) {
    throw new Error(
      `[${sessionLabel}] Pool de fixtures não encontrado em ${paths.fixturesPath}. Rode fetchFixtures (ou o wizard) para essa sessão primeiro.`,
    );
  }
  const optional = <T>(filePath: string): T[] => (fs.existsSync(filePath) ? readJsonFile<T[]>(filePath) : []);
  return {
    fixtures: readJsonFile<PoolFixture[]>(paths.fixturesPath),
    seasonMarkets: optional<SeasonMarket>(paths.seasonMarketsPath),
    liveFixtures: optional<PoolFixture>(paths.liveFixturesPath),
  };
}

/** Abre o NDJSON de resultados e expõe a escrita + um fechamento que propaga erro de disco (em vez de perdê-lo em silêncio). */
function openResultsFile(resultsPath: string, sessionLabel: string, log: Logger) {
  const stream = fs.createWriteStream(resultsPath, { flags: 'a' });
  let streamError: Error | null = null;
  stream.on('error', (err) => {
    streamError ??= err;
    log.error(`Falha ao gravar ${resultsPath}: ${err.message}`);
  });

  const write: LogResult = (entry) => {
    if (!streamError) stream.write(JSON.stringify({ sessionLabel, ...entry }) + '\n');
  };
  const close = () =>
    new Promise<void>((resolve, reject) => {
      // Espera o flush: o relatório lê este arquivo logo depois que a execução retorna.
      stream.end(() => (streamError ? reject(streamError) : resolve()));
    });
  return { write, close, hasError: () => streamError !== null };
}

const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

export async function runVolumetryForSession(params: RunSessionParams): Promise<string> {
  const {
    sessionLabel,
    environment,
    totalBets,
    concurrency = DEFAULT_CONCURRENCY,
    betAmount,
    minPerCategory,
    errorThreshold = DEFAULT_ERROR_THRESHOLD,
    token: providedToken,
  } = params;
  const batchSize = params.batchSize ?? Math.min(totalBets, DEFAULT_BATCH_SIZE);
  const log = createLogger(sessionLabel);

  if (!Number.isInteger(totalBets) || totalBets < 1) throw new Error(`[${sessionLabel}] totalBets inválido: ${totalBets}.`);
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error(`[${sessionLabel}] batchSize inválido: ${batchSize}.`);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error(`[${sessionLabel}] concurrency inválido: ${concurrency}.`);

  const betApi = getEnvironment(environment).api;
  const paths = resolveSessionPaths(sessionLabel);
  const resolvedToken = await resolveToken(sessionLabel, environment, paths, providedToken);
  const { fixtures, seasonMarkets, liveFixtures } = loadDataPools(sessionLabel, paths);

  let allPayloads: BetPayload[] | null = null;
  if (minPerCategory !== undefined) {
    // Cobertura garantida: lança erro claro se alguma categoria ativa não
    // tiver cobertura — o usuário pediu um mínimo garantido por categoria.
    allPayloads = generateCoverageBatch(totalBets, minPerCategory, fixtures, seasonMarkets, liveFixtures, {
      fixedAmount: betAmount,
    });
    log.info(`Cobertura garantida: pelo menos ${minPerCategory} apostas de cada categoria ativa.`);
  }

  // Sorteio aleatório: categorias sem cobertura são excluídas ANTES de
  // disparar qualquer aposta, em vez de derrubar a sessão no meio da execução.
  const coverage = computeCoverageReport(fixtures, seasonMarkets, liveFixtures);
  if (coverage.unavailable.length > 0) {
    log.warn(`Categoria(s) sem cobertura no pool desta sessão — excluída(s) do sorteio: ${coverage.unavailable.join(', ')}.`);
  }
  if (coverage.available.length === 0) {
    throw new Error(
      `[${sessionLabel}] Nenhuma categoria com peso configurado tem cobertura no pool desta sessão. Popule fixtures/liveFixtures/seasonMarkets com dados reais antes de rodar.`,
    );
  }

  const resultsPath = path.join(paths.resultsDir, `results-${sessionLabel}-${Date.now()}.ndjson`);
  const results = openResultsFile(resultsPath, sessionLabel, log);
  const context = await createApiContext(betApi, resolvedToken);
  const service = new SiteSportsbookBetService(context, betApi);
  const limit = createLimiter(concurrency);

  log.info(
    `Iniciando — ambiente: ${environment} (${betApi}), total: ${totalBets} apostas, lote: ${batchSize}, concorrência: ${concurrency}, ` +
      `threshold de erro: ${pct(errorThreshold)}${betAmount !== undefined ? `, valor: R$${betAmount.toFixed(2)}` : ''}`,
  );
  log.info(`Resultados sendo gravados em: ${resultsPath}`);

  try {
    let executed = 0;
    while (executed < totalBets) {
      const currentBatchSize = Math.min(batchSize, totalBets - executed);

      const batchPayloads = allPayloads
        ? allPayloads.slice(executed, executed + currentBatchSize)
        : Array.from({ length: currentBatchSize }, () =>
            generateBetPayload(fixtures, seasonMarkets, liveFixtures, { fixedAmount: betAmount }, coverage.effectiveWeights),
          );

      const batch = await dispatchBatch(service, batchPayloads, limit, results.write);
      const sent = currentBatchSize - batch.skippedCount;
      executed += sent;

      // Conflitos são rejeições esperadas do Bet Builder: saem do numerador E do denominador.
      const evaluated = sent - batch.conflictCount;
      const errorRate = evaluated > 0 ? batch.failureCount / evaluated : 0;
      log.info(
        `Lote concluído: ${executed}/${totalBets} — sucesso: ${batch.successCount}, falha: ${batch.failureCount}, ` +
          `conflito de seleção: ${batch.conflictCount} (taxa de erro: ${pct(errorRate)})`,
      );
      if (batch.unexpectedFormatCount > 0) {
        log.warn(
          `${batch.unexpectedFormatCount} aposta(s) aceita(s) sem bets[0].id na resposta — o settlement não vai conseguir consultá-las. Verifique parsers/betResponseParser.ts.`,
        );
      }

      if (batch.authExpired) {
        log.error(
          `API respondeu 401 (token expirado ou inválido). Abortando essa sessão — ${batch.skippedCount} aposta(s) do lote não foram enviadas. ` +
            'Rode "npm run login" e execute novamente.',
        );
        break;
      }
      if (errorRate > errorThreshold) {
        log.error(`Taxa de erro (${pct(errorRate)}) ultrapassou o threshold (${pct(errorThreshold)}). Abortando essa sessão.`);
        break;
      }
      if (results.hasError()) {
        log.error('Gravação dos resultados falhou — abortando para não disparar apostas sem registro.');
        break;
      }
    }
  } finally {
    await context.dispose();
    await results.close();
  }

  log.info('Finalizado.');
  return resultsPath;
}
