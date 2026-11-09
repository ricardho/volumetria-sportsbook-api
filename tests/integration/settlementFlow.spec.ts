import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { ENVIRONMENTS } from '../../src/config/environments';
import { settleResultsFile } from '../../src/flows/settlementFlow';
import { generateSettlementReport, summarizeSettlement } from '../../src/reporting/generateSettlementReport';
import { ensureSessionDir, saveSession, sessionDir } from '../../src/session/sessionStore';
import { startMockServer } from '../support/mockServer';

const originalApi = ENVIRONMENTS.preprod.api;
const label = '__test_settlement__';

function createResultsFile(lines: object[]) {
  const dir = ensureSessionDir(label);
  saveSession(label, 'preprod', { token: 'token-ficticio' });
  const filePath = path.join(dir, `results-${label}-1.ndjson`);
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify({ sessionLabel: label, ...l })).join('\n') + '\n');
  return filePath;
}

const accepted = (apostaId: number | null) => ({
  correlationId: `QA-${apostaId}`,
  status: 201,
  ok: true,
  valorAposta: 5,
  apostaId,
  codigoRetornado: `COD${apostaId}`,
  requestSummary: { tipo: 'simples', amount: 5, channel: 'mobile', qtdItems: 1, marketName: 'Resultado <Final>', gameName: 'A x B' },
});

test.afterEach(() => {
  ENVIRONMENTS.preprod.api = originalApi;
  fs.rmSync(sessionDir(label), { recursive: true, force: true });
});

const when = '2030-01-02T10:00:00Z';
const bets: Record<string, object> = {
  '/sportsbook/bet/1': { resultado: 'ganhou', valor_retorno: 12, liquidada_em: when },
  '/sportsbook/bet/2': { resultado: 'perdeu', valor_retorno: 0, liquidada_em: when },
  '/sportsbook/bet/3': { resultado: 'pendente', valor_retorno: null, liquidada_em: null },
  '/sportsbook/bet/5': { resultado: 'perdeu', valor_retorno: 9, liquidada_em: when },
};

test('consulta só as aceitas, preserva o original e consolida os resultados', async () => {
  const server = await startMockServer((req) => (bets[req.url] ? { status: 200, body: { bet: bets[req.url] } } : { status: 404 }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    const input = createResultsFile([
      accepted(1),
      accepted(2),
      accepted(3),
      accepted(4),
      accepted(5),
      accepted(null),
      { correlationId: 'QA-rejeitada', status: 422, ok: false, valorAposta: 5, apostaId: null },
    ]);
    const before = fs.readFileSync(input, 'utf-8');

    const { entries, outputPath } = await settleResultsFile(input);

    expect(fs.readFileSync(input, 'utf-8')).toBe(before);
    expect(path.basename(outputPath)).toBe(`settlement-${label}-1.ndjson`);
    expect(server.requests).toHaveLength(5);
    expect(server.requests[0].method).toBe('GET');
    expect(server.requests[0].headers.authorization).toBe('Bearer token-ficticio');
    expect(entries.map((e) => e.resultadoFinal).sort()).toEqual(
      ['ganhou', 'nao_encontrada', 'pendente', 'perdeu', 'perdeu', 'sem_id'].sort(),
    );

    const summary = summarizeSettlement(entries);
    expect(summary.liquidadas).toBe(3);
    expect(summary.pendentes).toBe(1);
    expect(summary.totalApostado).toBe(15);
    expect(summary.totalRetorno).toBe(21);
    expect(summary.ggr).toBe(-6);
    expect(summary.inconsistentes).toBe(1);

    const reportPath = generateSettlementReport(entries, 'teste', path.join(sessionDir(label), 'relatorio.html'));
    const html = fs.readFileSync(reportPath, 'utf-8');
    expect(html).toContain('Relatório de Settlement');
    expect(html).toContain('COD1');
    expect(html).toContain('Resultado &lt;Final&gt;');
  } finally {
    await server.close();
  }
});

test('token expirado interrompe com instrução de novo login e não grava resultado', async () => {
  const server = await startMockServer(() => ({ status: 401, body: {} }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    const input = createResultsFile([accepted(1), accepted(2)]);
    await expect(settleResultsFile(input, 1)).rejects.toThrow('npm run login');
    expect(server.requests).toHaveLength(1);
    expect(fs.existsSync(path.join(sessionDir(label), `settlement-${label}-1.ndjson`))).toBe(false);
  } finally {
    await server.close();
  }
});
