import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT } from '../config/paths';
import type { SettlementEntry } from '../types/settlement';
import { REPORT_CSS, buildBarChartSvg, colorFor, escapeHtml } from './htmlHelpers';

const LIQUIDATED = ['ganhou', 'perdeu', 'devolvida'];

export function summarizeSettlement(entries: SettlementEntry[]) {
  const statusCounts: Record<string, number> = {};
  for (const e of entries) statusCounts[e.resultadoFinal] = (statusCounts[e.resultadoFinal] ?? 0) + 1;

  const liquidated = entries.filter((e) => LIQUIDATED.includes(e.resultadoFinal));
  const totalApostado = liquidated.reduce((sum, e) => sum + e.valorAposta, 0);
  const totalRetorno = liquidated.reduce((sum, e) => sum + (e.valorRetorno ?? 0), 0);

  return {
    total: entries.length,
    statusCounts,
    liquidadas: liquidated.length,
    pendentes: statusCounts.pendente ?? 0,
    totalApostado,
    totalRetorno,
    /** Resultado da casa: apostado menos retorno, só sobre apostas já liquidadas */
    ggr: totalApostado - totalRetorno,
    inconsistentes: entries.filter((e) => e.inconsistencia).length,
  };
}

const money = (value: number) => `R$ ${value.toFixed(2)}`;

/** Gera o relatório HTML pós-settlement e retorna o caminho do arquivo. */
export function generateSettlementReport(entries: SettlementEntry[], sourceLabel: string, outPath?: string): string {
  const s = summarizeSettlement(entries);

  const card = (label: string, value: string | number, color?: string) =>
    `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value"${color ? ` style="color:${color}"` : ''}>${escapeHtml(String(value))}</div></div>`;

  const cards = [
    card('Apostas consultadas', s.total),
    card('Liquidadas', s.liquidadas),
    ...Object.entries(s.statusCounts).map(([status, count]) => card(status, count, colorFor(status))),
    card('Total apostado', money(s.totalApostado)),
    card('Total retornado', money(s.totalRetorno)),
    card('GGR', money(s.ggr)),
    card('Inconsistências', s.inconsistentes, s.inconsistentes > 0 ? '#e03131' : '#2f9e44'),
  ].join('');

  const rows = entries
    .map(
      (e) => `
        <tr>
          <td>${escapeHtml(e.sessionLabel ?? '-')}</td>
          <td>${escapeHtml(String(e.apostaId ?? '-'))}</td>
          <td>${escapeHtml(e.codigoRetornado ?? '-')}</td>
          <td>${escapeHtml(e.tipo ?? '-')}</td>
          <td>${escapeHtml(e.marketName ?? '-')}</td>
          <td>${escapeHtml(e.gameName ?? '-')}</td>
          <td>${money(e.valorAposta)}</td>
          <td><span class="badge" style="background:${colorFor(e.resultadoFinal)}">${escapeHtml(e.resultadoFinal)}</span></td>
          <td>${e.valorRetorno === null ? '-' : money(e.valorRetorno)}</td>
          <td>${escapeHtml(e.liquidadaEm ?? '-')}</td>
          <td class="error-cell">${escapeHtml(e.inconsistencia ?? '')}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatório de Settlement — siteSportsbook</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <h1>Relatório de Settlement — siteSportsbook</h1>
  <div class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} · Origem: ${escapeHtml(sourceLabel)}</div>
  <div class="cards">${cards}</div>
  <div class="chart-box"><strong>Apostas por resultado final</strong>${buildBarChartSvg(s.statusCounts)}</div>
  <table>
    <thead>
      <tr>
        <th>Sessão</th><th>ID da aposta</th><th>Código</th><th>Tipo</th><th>Mercado</th><th>Jogo</th>
        <th>Valor</th><th>Resultado</th><th>Retorno</th><th>Liquidada em</th><th>Inconsistência</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const finalPath = outPath ?? path.join(PROJECT_ROOT, `relatorio-settlement-${Date.now()}.html`);
  fs.writeFileSync(finalPath, html);
  return finalPath;
}
