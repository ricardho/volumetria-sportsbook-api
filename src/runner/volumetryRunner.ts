/**
 * Executor do teste de volumetria — roda para UMA sessão por vez. Escalona o
 * volume em lotes e aborta automaticamente se a taxa de erro de um lote
 * ultrapassar o threshold configurado.
 */
import { request as playwrightRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createAuthenticatedContext } from '../api/apiClient';
import { SiteSportsbookBetService } from '../api/services/betService';
import { getEnvironment } from '../config/environments';
import { computeCoverageReport, generateBetPayload, generateCoverageBatch } from '../factories/betFactory';
import { resolveToken } from '../flows/credentialsFlow';
import type { PoolFixture } from '../flows/fixturesFlow';
import { resolveSessionPaths, type SessionPaths } from '../session/sessionStore';
import type { BetPayload, SeasonMarket } from '../types';
import { createLimiter } from './concurrencyLimiter';
import { classifyErrorStatus } from './errorClassifier';
import { summarizePayload } from './payloadSummary';

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

async function dispatchBatch(
  service: SiteSportsbookBetService,
  payloads: BetPayload[],
  limit: (fn: () => Promise<void>) => Promise<void>,
  logResult: LogResult,
) {
  let successCount = 0;
  let failureCount = 0;

  const tasks = payloads.map((payload) =>
    limit(async () => {
      const correlationId = `QA-SITESPORTSBOOK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = Date.now();

      try {
        const response = await service.placeBet(payload);
        const status = response.status();
        const body = await response.json().catch(() => null);

        const ok = status === 201;
        if (ok) successCount++;
        else failureCount++;

        const erroDetalhe = ok ? null : (body?.message ?? (body ? JSON.stringify(body) : `HTTP ${status} sem corpo de resposta`));

        logResult({
          correlationId,
          status,
          ok,
          durationMs: Date.now() - startedAt,
          requestSummary: summarizePayload(payload),
          clienteId: body?.bets?.[0]?.passador_id ?? null,
          clienteNome: body?.bets?.[0]?.apostador ?? null,
          valorAposta: payload.amount,
          statusAposta: ok ? (body?.bets?.[0]?.resultado ?? 'pendente') : classifyErrorStatus(erroDetalhe),
          erroDetalhe,
          apostaId: body?.bets?.[0]?.id ?? null,
          codigoRetornado: body?.bets?.[0]?.codigo ?? null,
          idRetornado: body?.bets?.[0]?.id ?? null,
        });
      } catch (err: any) {
        failureCount++;
        logResult({
          correlationId,
          status: 'error',
          ok: false,
          error: err?.message ?? String(err),
          requestSummary: summarizePayload(payload),
          clienteId: null,
          clienteNome: null,
          valorAposta: payload.amount,
          statusAposta: 'erro',
          erroDetalhe: err?.message ?? String(err),
          apostaId: null,
        });
      }
    }),
  );

  await Promise.all(tasks);
  return { successCount, failureCount };
}

function readJsonIfExists<T>(filePath: string, fallback: T): T {
  return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T) : fallback;
}

function loadDataPools(sessionLabel: string, paths: SessionPaths) {
  if (!fs.existsSync(paths.fixturesPath)) {
    throw new Error(
      `[${sessionLabel}] Pool de fixtures não encontrado em ${paths.fixturesPath}. Rode fetchFixtures (ou o wizard) para essa sessão primeiro.`,
    );
  }
  return {
    fixtures: JSON.parse(fs.readFileSync(paths.fixturesPath, 'utf-8')) as PoolFixture[],
    seasonMarkets: readJsonIfExists<SeasonMarket[]>(paths.seasonMarketsPath, []),
    liveFixtures: readJsonIfExists<PoolFixture[]>(paths.liveFixturesPath, []),
  };
}

export async function runVolumetryForSession(params: RunSessionParams): Promise<string> {
  const {
    sessionLabel,
    environment,
    totalBets,
    batchSize = totalBets,
    concurrency = 20,
    betAmount,
    minPerCategory,
    errorThreshold = 0.02,
    token: providedToken,
  } = params;

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
    console.log(`[${sessionLabel}] Cobertura garantida: pelo menos ${minPerCategory} apostas de cada categoria ativa.`);
  }

  // Sorteio aleatório: categorias sem cobertura são excluídas ANTES de
  // disparar qualquer aposta, em vez de derrubar a sessão no meio da execução.
  const coverage = computeCoverageReport(fixtures, seasonMarkets, liveFixtures);
  if (coverage.unavailable.length > 0) {
    console.warn(
      `[${sessionLabel}] Aviso: categoria(s) sem cobertura no pool desta sessão — excluída(s) do sorteio: ${coverage.unavailable.join(', ')}.`,
    );
  }
  if (coverage.available.length === 0) {
    throw new Error(
      `[${sessionLabel}] Nenhuma categoria com peso configurado tem cobertura no pool desta sessão. Popule fixtures/liveFixtures/seasonMarkets com dados reais antes de rodar.`,
    );
  }

  const resultsPath = path.join(paths.resultsDir, `results-${sessionLabel}-${Date.now()}.ndjson`);
  const resultsStream = fs.createWriteStream(resultsPath, { flags: 'a' });
  const logResult: LogResult = (entry) => {
    resultsStream.write(JSON.stringify({ sessionLabel, ...entry }) + '\n');
  };

  const context = await createAuthenticatedContext(playwrightRequest, resolvedToken, betApi);
  const service = new SiteSportsbookBetService(context, betApi);
  const limit = createLimiter(concurrency);

  console.log(
    `[${sessionLabel}] Iniciando — ambiente: ${environment} (${betApi}), total: ${totalBets} apostas, lote: ${batchSize}, concorrência: ${concurrency}${betAmount !== undefined ? `, valor: R$${betAmount.toFixed(2)}` : ''}`,
  );
  console.log(`[${sessionLabel}] Resultados sendo gravados em: ${resultsPath}`);

  try {
    let executed = 0;
    while (executed < totalBets) {
      const currentBatchSize = Math.min(batchSize, totalBets - executed);

      const batchPayloads = allPayloads
        ? allPayloads.slice(executed, executed + currentBatchSize)
        : Array.from({ length: currentBatchSize }, () =>
            generateBetPayload(fixtures, seasonMarkets, liveFixtures, { fixedAmount: betAmount }, coverage.effectiveWeights),
          );

      const { successCount, failureCount } = await dispatchBatch(service, batchPayloads, limit, logResult);
      executed += currentBatchSize;

      const errorRate = failureCount / currentBatchSize;
      console.log(
        `[${sessionLabel}] Lote concluído: ${executed}/${totalBets} — sucesso: ${successCount}, falha: ${failureCount} (taxa de erro: ${(errorRate * 100).toFixed(2)}%)`,
      );

      if (errorRate > errorThreshold) {
        console.error(
          `[${sessionLabel}] Taxa de erro (${(errorRate * 100).toFixed(2)}%) ultrapassou o threshold (${(errorThreshold * 100).toFixed(2)}%). Abortando essa sessão.`,
        );
        break;
      }
    }
  } finally {
    await context.dispose();
    // Espera o flush: o relatório lê este arquivo logo depois que a função retorna.
    await new Promise<void>((resolve) => resultsStream.end(() => resolve()));
  }

  console.log(`[${sessionLabel}] Finalizado.`);
  return resultsPath;
}
