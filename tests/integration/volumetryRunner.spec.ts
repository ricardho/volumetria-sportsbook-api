import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { ENVIRONMENTS } from '../../src/config/environments';
import { DEFAULT_BATCH_SIZE, runVolumetryForSession } from '../../src/runner/volumetryRunner';
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

const labels = ['__test_ok__', '__test_breaker__', '__test_conflict__', '__test_401__', '__test_default_batch__', '__test_env__'];

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

test('conflito de seleções é classificado e não aciona o circuit breaker', async () => {
  const server = await startMockServer(() => ({ status: 422, body: { message: 'Conflito entre seleções' } }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[2]);
    const resultsPath = await runVolumetryForSession({ sessionLabel: labels[2], environment: 'preprod', totalBets: 6, batchSize: 2 });
    expect(server.requests).toHaveLength(6);
    expect(readResults(resultsPath).every((e) => e.statusAposta === 'conflito_selecao')).toBe(true);
  } finally {
    await server.close();
  }
});

test('HTTP 401 interrompe a sessão sem disparar o restante do lote', async () => {
  const server = await startMockServer(() => ({ status: 401, body: { message: 'Unauthorized' } }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[3]);
    const resultsPath = await runVolumetryForSession({
      sessionLabel: labels[3],
      environment: 'preprod',
      totalBets: 20,
      batchSize: 10,
      concurrency: 1,
      errorThreshold: 1,
    });
    expect(server.requests).toHaveLength(1);
    expect(readResults(resultsPath)).toHaveLength(1);
  } finally {
    await server.close();
  }
});

test('sem batchSize, o volume é dividido em lotes e o circuit breaker age antes do fim', async () => {
  const server = await startMockServer(() => ({ status: 500, body: { message: 'erro interno' } }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[4]);
    await runVolumetryForSession({ sessionLabel: labels[4], environment: 'preprod', totalBets: 250 });
    expect(server.requests).toHaveLength(DEFAULT_BATCH_SIZE);
  } finally {
    await server.close();
  }
});

test('token obtido em outro ambiente é recusado antes de qualquer aposta', async () => {
  const server = await startMockServer(() => ({ status: 201, body: {} }));
  ENVIRONMENTS.preprod.api = server.url;
  try {
    createSession(labels[5]);
    saveSession(labels[5], 'prod', { token: 'token-de-prod' });
    await expect(
      runVolumetryForSession({ sessionLabel: labels[5], environment: 'preprod', totalBets: 1 }),
    ).rejects.toThrow('obtido em "prod"');
    expect(server.requests).toHaveLength(0);
  } finally {
    await server.close();
  }
});
