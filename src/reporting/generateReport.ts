/**
 * Gera um relatório HTML autocontido (sem dependência de internet) a partir
 * de um ou mais results-*.ndjson produzidos pelo teste de volumetria.
 * Uso: ver src/cli/report.ts
 *
 * Detecção automática (sem argumentos):
 *   1. Se .sessions/ tiver alguma sessão com resultados, junta o results-*.ndjson MAIS RECENTE de cada sessão.
 *   2. Senão, cai para o modo legado: o results-*.ndjson mais recente solto na raiz do projeto.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT } from '../config/paths';
import { listSessionLabels, sessionDir } from '../session/sessionStore';
import { REPORT_CSS, buildBarChartSvg, colorFor, escapeHtml } from './htmlHelpers';

interface RequestSummary {
  tipo: string;
  amount: number;
  channel: string;
  qtdItems: number;
  marketName: string;
  gameName: string;
}

export interface LogEntry {
  sessionLabel?: string;
  correlationId: string;
  status: number | string;
  ok: boolean;
  durationMs?: number;
  error?: string;
  requestSummary?: RequestSummary;
  clienteId?: number | null;
  clienteNome?: string | null;
  valorAposta?: number;
  statusAposta?: string;
  apostaId?: number | null;
  codigoRetornado?: string | null;
  erroDetalhe?: string | null;
}

/** Acha o results-*.ndjson mais recente dentro de um diretório específico. */
function latestResultsFileIn(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('results-') && f.endsWith('.ndjson'));
  if (files.length === 0) return null;
  files.sort();
  return path.join(dir, files[files.length - 1]);
}

/**
 * Resolve quais arquivos entram no relatório quando nenhum é passado
 * explicitamente por linha de comando.
 */
export function resolveDefaultInputPaths(): string[] {
  const labels = listSessionLabels();
  if (labels.length > 0) {
    const paths = labels
      .map((label) => latestResultsFileIn(sessionDir(label)))
      .filter((p): p is string => p !== null);
    if (paths.length > 0) return paths;
  }
  // Modo legado: raiz do projeto
  const legacy = latestResultsFileIn(PROJECT_ROOT);
  if (!legacy) {
    throw new Error(
      'Nenhum results-*.ndjson encontrado (nem em .sessions/, nem na raiz do projeto). Rode o teste de volumetria primeiro.',
    );
  }
  return [legacy];
}

export function readEntries(filePath: string): LogEntry[] {
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as LogEntry);
}

/**
 * Gera o relatório HTML consolidado a partir de uma lista de arquivos
 * results-*.ndjson (um ou vários — vários viram um único relatório, com
 * coluna de sessão para diferenciar). Retorna o caminho do HTML gerado.
 */
export function generateReportFromFiles(inputPaths: string[], outPath?: string): string {
  const entries: LogEntry[] = inputPaths.flatMap((p) => readEntries(p));

  const total = entries.length;
  const statusCounts: Record<string, number> = {};
  for (const e of entries) {
    const status = e.statusAposta ?? (e.ok ? 'pendente' : 'erro');
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  const successCount = entries.filter((e) => e.ok).length;
  const successRate = total > 0 ? (successCount / total) * 100 : 0;

  const distinctSessions = new Set(entries.map((e) => e.sessionLabel).filter((s): s is string => Boolean(s)));
  const showSessionColumn = distinctSessions.size > 0;

  // Taxa de sucesso por sessão (só faz sentido mostrar quando há rótulo de sessão nos dados)
  const perSessionStats = Array.from(distinctSessions).map((label) => {
    const sessionEntries = entries.filter((e) => e.sessionLabel === label);
    const sessionTotal = sessionEntries.length;
    const sessionSuccess = sessionEntries.filter((e) => e.ok).length;
    const sessionRate = sessionTotal > 0 ? (sessionSuccess / sessionTotal) * 100 : 0;
    const sessionStatusCounts: Record<string, number> = {};
    for (const e of sessionEntries) {
      const status = e.statusAposta ?? (e.ok ? 'pendente' : 'erro');
      sessionStatusCounts[status] = (sessionStatusCounts[status] ?? 0) + 1;
    }
    return { label, total: sessionTotal, success: sessionSuccess, rate: sessionRate, statusCounts: sessionStatusCounts };
  });

  const rows = entries
    .map((e) => {
      const status = e.statusAposta ?? (e.ok ? 'pendente' : 'erro');
      const valor = e.valorAposta ?? e.requestSummary?.amount ?? 0;
      const detalheErro = status === 'erro' || status === 'conflito_selecao' ? (e.erroDetalhe ?? e.error ?? '—') : '';
      return `
        <tr>
          ${showSessionColumn ? `<td>${escapeHtml(e.sessionLabel ?? '-')}</td>` : ''}
          <td>${e.clienteId ?? '-'}</td>
          <td>${escapeHtml(e.clienteNome ?? '-')}</td>
          <td>${e.apostaId ?? '-'}</td>
          <td><span class="badge" style="background:${colorFor(status)}">${escapeHtml(status)}</span></td>
          <td>R$ ${valor.toFixed(2)}</td>
          <td>${escapeHtml(e.requestSummary?.marketName ?? '-')}</td>
          <td>${escapeHtml(e.requestSummary?.gameName ?? '-')}</td>
          <td class="error-cell">${escapeHtml(detalheErro)}</td>
        </tr>`;
    })
    .join('');

  const cardsHtml = [
    `<div class="card"><div class="label">Total de apostas</div><div class="value">${total}</div></div>`,
    `<div class="card"><div class="label">Taxa de sucesso</div><div class="value" style="color:${successRate >= 70 ? '#2f9e44' : successRate >= 40 ? '#f08c00' : '#e03131'}">${successRate.toFixed(1)}%</div></div>`,
    ...Object.entries(statusCounts).map(
      ([s, c]) =>
        `<div class="card"><div class="label">${escapeHtml(s)}</div><div class="value" style="color:${colorFor(s)}">${c}</div></div>`,
    ),
  ].join('');

  const perSessionTableHtml =
    perSessionStats.length > 0
      ? `
  <div class="chart-box" style="max-width: 100%;">
    <strong>Taxa de sucesso por sessão (usuário)</strong>
    <table>
      <thead>
        <tr>
          <th>Sessão</th>
          <th>Total</th>
          <th>Sucesso</th>
          <th>Taxa de Sucesso</th>
          ${Array.from(new Set(perSessionStats.flatMap((s) => Object.keys(s.statusCounts))))
            .map((s) => `<th>${escapeHtml(s)}</th>`)
            .join('')}
        </tr>
      </thead>
      <tbody>
        ${perSessionStats
          .map((s) => {
            const allStatuses = Array.from(new Set(perSessionStats.flatMap((ps) => Object.keys(ps.statusCounts))));
            return `
        <tr>
          <td>${escapeHtml(s.label)}</td>
          <td>${s.total}</td>
          <td>${s.success}</td>
          <td><strong style="color:${s.rate >= 70 ? '#2f9e44' : s.rate >= 40 ? '#f08c00' : '#e03131'}">${s.rate.toFixed(1)}%</strong></td>
          ${allStatuses.map((st) => `<td>${s.statusCounts[st] ?? 0}</td>`).join('')}
        </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>`
      : '';



  const sourceLabel =
    inputPaths.length === 1
      ? path.basename(inputPaths[0])
      : `${inputPaths.length} sessões (${Array.from(distinctSessions).join(', ')})`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatório — Teste de Volumetria siteSportsbook</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <h1>Relatório — Teste de Volumetria siteSportsbook</h1>
  <div class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} · Origem: ${escapeHtml(sourceLabel)}</div>

  <div class="cards">${cardsHtml}</div>

  <div class="chart-box">
    <strong>Total de apostas por status</strong>
    ${buildBarChartSvg(statusCounts)}
  </div>

  ${perSessionTableHtml}

  <table>
    <thead>
      <tr>
        ${showSessionColumn ? '<th>Sessão</th>' : ''}
        <th>ID Cliente</th>
        <th>Nome Cliente</th>
        <th>ID Aposta</th>
        <th>Status</th>
        <th>Valor</th>
        <th>Mercado</th>
        <th>Jogo</th>
        <th>Detalhe do Erro</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  const resolvedOutPath = outPath ?? path.join(PROJECT_ROOT, `relatorio-${Date.now()}.html`);
  fs.writeFileSync(resolvedOutPath, html);
  return resolvedOutPath;
}
