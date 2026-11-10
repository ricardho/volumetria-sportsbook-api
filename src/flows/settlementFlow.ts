import * as fs from 'fs';
import * as path from 'path';
import { createApiContext } from '../api/apiClient';
import { SiteSportsbookSettlementService, type SettlementLookup } from '../api/services/settlementService';
import { getEnvironment } from '../config/environments';
import { readEntries, type LogEntry } from '../reporting/generateReport';
import { createLimiter } from '../runner/concurrencyLimiter';
import { resolveSessionPaths } from '../session/sessionStore';
import type { SettlementEntry, SettlementStatus } from '../types/settlement';
import { resolveSessionEnvironment, resolveToken } from './credentialsFlow';

const KNOWN_RESULTS: SettlementStatus[] = ['ganhou', 'perdeu', 'devolvida', 'cancelada', 'pendente'];

type Interpreted = Pick<SettlementEntry, 'resultadoFinal' | 'valorRetorno' | 'liquidadaEm'>;

/** Traduz a resposta da consulta (ver contrato em settlementService.ts) para o formato interno. */
export function interpretSettlementResponse({ status, body }: SettlementLookup): Interpreted {
  if (status === 404) return { resultadoFinal: 'nao_encontrada', valorRetorno: null, liquidadaEm: null };
  if (status !== 200) return { resultadoFinal: 'erro_consulta', valorRetorno: null, liquidadaEm: null };

  const raw = String(body?.bet?.resultado ?? '').toLowerCase() as SettlementStatus;
  const retorno = body?.bet?.valor_retorno;
  return {
    resultadoFinal: KNOWN_RESULTS.includes(raw) ? raw : 'desconhecido',
    valorRetorno: typeof retorno === 'number' ? retorno : null,
    liquidadaEm: body?.bet?.liquidada_em ?? null,
  };
}

/** Valida a coerência entre o resultado e o valor de retorno informados pela API. */
export function findInconsistency(valorAposta: number, result: Interpreted): string | null {
  const { resultadoFinal, valorRetorno, liquidadaEm } = result;
  if (resultadoFinal === 'desconhecido') return 'Resultado fora dos valores esperados';
  if (!['ganhou', 'perdeu', 'devolvida'].includes(resultadoFinal)) return null;

  if (!liquidadaEm) return 'Aposta liquidada sem data de liquidação';
  if (valorRetorno === null) return 'Aposta liquidada sem valor de retorno';
  if (resultadoFinal === 'ganhou' && valorRetorno <= valorAposta) return 'Aposta ganha com retorno menor ou igual ao valor apostado';
  if (resultadoFinal === 'perdeu' && valorRetorno !== 0) return 'Aposta perdida com retorno diferente de zero';
  if (resultadoFinal === 'devolvida' && valorRetorno !== valorAposta) return 'Aposta devolvida com retorno diferente do valor apostado';
  return null;
}

function settlementOutputPath(inputPath: string): string {
  const name = path.basename(inputPath);
  const outName = name.startsWith('results-') ? name.replace(/^results-/, 'settlement-') : `settlement-${name}`;
  return path.join(path.dirname(inputPath), outName);
}

function toEntry(source: LogEntry, valorAposta: number, result: Interpreted, httpStatus: number | null): SettlementEntry {
  return {
    sessionLabel: source.sessionLabel,
    correlationId: source.correlationId,
    apostaId: source.apostaId ?? null,
    codigoRetornado: source.codigoRetornado ?? null,
    tipo: source.requestSummary?.tipo ?? null,
    marketName: source.requestSummary?.marketName ?? null,
    gameName: source.requestSummary?.gameName ?? null,
    valorAposta,
    ...result,
    httpStatus,
    inconsistencia: findInconsistency(valorAposta, result),
  };
}

export interface SettlementRun {
  outputPath: string;
  entries: SettlementEntry[];
}

/**
 * Consulta o resultado final de cada aposta ACEITA de um results-*.ndjson e
 * grava settlement-*.ndjson ao lado dele. O arquivo original não é alterado;
 * rodar de novo substitui o settlement com os status mais recentes.
 */
export async function settleResultsFile(inputPath: string, concurrency = 10): Promise<SettlementRun> {
  const accepted = readEntries(inputPath).filter((e) => e.ok);
  const outputPath = settlementOutputPath(inputPath);
  if (accepted.length === 0) {
    fs.writeFileSync(outputPath, '');
    return { outputPath, entries: [] };
  }

  const sessionLabel = accepted[0].sessionLabel ?? 'default';
  const paths = resolveSessionPaths(sessionLabel);
  const environment = resolveSessionEnvironment(paths);
  const token = await resolveToken(sessionLabel, environment, paths);
  const api = getEnvironment(environment).api;

  const context = await createApiContext(api, token);
  const service = new SiteSportsbookSettlementService(context, api);
  const limit = createLimiter(concurrency);
  let tokenExpired = false;

  try {
    const results = await Promise.all(
      accepted.map((source) =>
        limit(async (): Promise<SettlementEntry | null> => {
          if (tokenExpired) return null;
          const valorAposta = source.valorAposta ?? source.requestSummary?.amount ?? 0;
          const empty = { valorRetorno: null, liquidadaEm: null };

          if (source.apostaId === null || source.apostaId === undefined) {
            return toEntry(source, valorAposta, { resultadoFinal: 'sem_id', ...empty }, null);
          }
          try {
            const lookup = await service.getBet(source.apostaId);
            if (lookup.status === 401) {
              tokenExpired = true;
              return null;
            }
            return toEntry(source, valorAposta, interpretSettlementResponse(lookup), lookup.status);
          } catch {
            return toEntry(source, valorAposta, { resultadoFinal: 'erro_consulta', ...empty }, null);
          }
        }),
      ),
    );

    if (tokenExpired) {
      throw new Error(`[${sessionLabel}] Token expirado ou inválido (HTTP 401). Rode "npm run login" e execute o settlement novamente.`);
    }

    const entries = results.filter((e): e is SettlementEntry => e !== null);
    fs.writeFileSync(outputPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return { outputPath, entries };
  } finally {
    await context.dispose();
  }
}
