export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cores por status — adicione novos status aqui conforme aparecerem */
const STATUS_COLORS: Record<string, string> = {
  pendente: '#2f9e44', // aceita pela API, aguardando settlement
  erro: '#e03131', // rejeitada na criação
  conflito_selecao: '#f08c00', // Bet Builder rejeitado por correlação entre mercados ou limite de seleções — não é falha de sistema
  ganhou: '#1c7ed6',
  perdeu: '#e8590c',
  devolvida: '#7950f2',
  cancelada: '#868e96',
  desconhecido: '#c2255c',
  nao_encontrada: '#f59f00',
  erro_consulta: '#c92a2a',
  sem_id: '#495057',
};
export function colorFor(status: string): string {
  return STATUS_COLORS[status] ?? '#868e96';
}

export function buildBarChartSvg(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const barWidth = 90;
  const gap = 48;
  const chartHeight = 240;
  const width = entries.length * (barWidth + gap) + gap;

  const bars = entries
    .map(([status, count], i) => {
      const barHeight = Math.round((count / max) * (chartHeight - 60));
      const x = gap + i * (barWidth + gap);
      const y = chartHeight - barHeight - 40;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${colorFor(status)}" rx="6" />
        <text x="${x + barWidth / 2}" y="${chartHeight - 16}" text-anchor="middle" font-size="14" fill="#374151">${escapeHtml(status)}</text>
        <text x="${x + barWidth / 2}" y="${y - 10}" text-anchor="middle" font-size="16" font-weight="700" fill="#111827">${count}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${chartHeight}" style="width:100%;max-width:${width}px;height:auto" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

export const REPORT_CSS = `
  :root { --fg: #1a1a1a; --muted: #6b7280; --border: #e5e7eb; --bg: #fafafa; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 32px; background: var(--bg); color: var(--fg); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .cards { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; min-width: 140px; }
  .card .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .card .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .chart-box { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 28px; max-width: 640px; }
  .chart-box strong { display: block; margin-bottom: 12px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-size: 13px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  th { background: #f3f4f6; font-weight: 600; color: #374151; }
  tr:last-child td { border-bottom: none; }
  .badge { color: #fff; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-block; }
  .error-cell { color: #b91c1c; font-size: 12px; max-width: 320px; }
`;
