import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { ENVIRONMENTS } from '../../src/config/environments';
import { runVolumetryForSession } from '../../src/runner/volumetryRunner';
import { ensureSessionDir, saveSession, sessionDir } from '../../src/session/sessionStore';
import { fullPool } from '../support/builders';
import { startMockServer } from '../support/mockServer';

const originalApi = ENVIRONMENTS.preprod.api;

function createSession(label: string) {
  const { fixtures, seasonMarkets, liveFixtures } = fullPool();
  const dir = ensureSessionDir(label);
  saveSession(label, 'preprod', { token: 'token-ficticio' });
  fs.writeFileSync(path.join(dir, 'fixtures.prod.json'), JSON.stringify(fixtures));
  fs.writeFileSync(path.join(dir, 'liveFixtures.prod.json'), JSON.stringify(liveFixtures));
  fs.writeFileSync(path.join(dir, 'seasonMarkets.json'), JSON.stringify(seasonMarkets));
}

function readResults(filePath: string) {
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
}

const labels = ['__test_ok__', '__test_breaker__', '__test_conflict__'];

test.afterEach(() => {
  ENVIRONMENTS.preprod.api = originalApi;
  for (const label of labels) fs.rmSync(sessionDir(label), { recursive: true, force: true });
});

test('dispara todas as apostas autenticadas e grava uma linha por aposta', async () => {
  const server = await startMockServer(() => ({
    status: 201,
    body: { bets: [{ id: 1, codigo: 'ABC', resultado: 'pendente', passador_id: 9, apostador: 'Cliente Teste' }] },
  }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[0]);
    const resultsPath = await runVolumetryForSession({
      sessionLabel: labels[0],
      environment: 'preprod',
      totalBets: 12,
      batchSize: 4,
      concurrency: 3,
      betAmount: 0.5,
    });

    const entries = readResults(resultsPath);
    expect(entries).toHaveLength(12);
    expect(server.requests).toHaveLength(12);
    expect(server.requests[0].headers.authorization).toBe('Bearer token-ficticio');
    expect(entries.every((e) => e.ok && e.valorAposta === 0.5 && e.sessionLabel === labels[0])).toBe(true);
    expect(entries.every((e) => e.correlationId.startsWith('QA-SITESPORTSBOOK-'))).toBe(true);
  } finally {
    await server.close();
  }
});

test('circuit breaker aborta a sessão após o lote acima do threshold', async () => {
  const server = await startMockServer(() => ({ status: 500, body: { message: 'erro interno' } }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[1]);
    const resultsPath = await runVolumetryForSession({
      sessionLabel: labels[1],
      environment: 'preprod',
      totalBets: 20,
      batchSize: 5,
      concurrency: 5,
    });

    expect(server.requests).toHaveLength(5);
    expect(readResults(resultsPath).every((e) => !e.ok && e.statusAposta === 'erro')).toBe(true);
  } finally {
    await server.close();
  }
});

test('classifica rejeição por conflito de seleções', async () => {
  const server = await startMockServer(() => ({ status: 422, body: { message: 'Conflito entre seleções' } }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[2]);
    const resultsPath = await runVolumetryForSession({ sessionLabel: labels[2], environment: 'preprod', totalBets: 2 });
    expect(readResults(resultsPath).every((e) => e.statusAposta === 'conflito_selecao')).toBe(true);
  } finally {
    await server.close();
  }
});
