import { expect, test } from '@playwright/test';
import {
  computeCoverageReport,
  generateBetPayload,
  generateCoverageBatch,
  getActiveCategories,
} from '../../src/factories/betFactory';
import { summarizePayload } from '../../src/runner/payloadSummary';
import { fixture, fullPool } from '../support/builders';

test.describe('computeCoverageReport', () => {
  test('pool completo cobre todas as categorias ativas', () => {
    const { fixtures, seasonMarkets, liveFixtures } = fullPool();
    const report = computeCoverageReport(fixtures, seasonMarkets, liveFixtures);
    expect(report.unavailable).toEqual([]);
    expect(report.available).toEqual(getActiveCategories());
  });

  test('zera o peso de categorias sem cobertura', () => {
    const report = computeCoverageReport([fixture(1, ['resultado_final'])]);
    expect(report.unavailable).toContain('ao_vivo');
    expect(report.unavailable).toContain('multipla');
    expect(report.effectiveWeights.ao_vivo).toBe(0);
    expect(report.effectiveWeights.resultado_final).toBeGreaterThan(0);
  });
});

test.describe('generateBetPayload', () => {
  test('usa o valor fixo quando informado', () => {
    const { fixtures, seasonMarkets, liveFixtures } = fullPool();
    for (let i = 0; i < 50; i++) {
      expect(generateBetPayload(fixtures, seasonMarkets, liveFixtures, { fixedAmount: 0.5 }).amount).toBe(0.5);
    }
  });

  test('múltipla nunca repete partida', () => {
    const { fixtures, seasonMarkets, liveFixtures } = fullPool();
    const payloads = generateCoverageBatch(200, 20, fixtures, seasonMarkets, liveFixtures);
    const multiplas = payloads.filter((p) => p.items.length > 1);
    expect(multiplas.length).toBeGreaterThanOrEqual(20);
    for (const p of multiplas) {
      const ids = p.items.map((i: any) => i.matchId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

test.describe('generateCoverageBatch', () => {
  test('entrega o total pedido com o mínimo de cada tipo', () => {
    const { fixtures, seasonMarkets, liveFixtures } = fullPool();
    const payloads = generateCoverageBatch(40, 2, fixtures, seasonMarkets, liveFixtures);
    expect(payloads).toHaveLength(40);

    const tipos = payloads.map((p) => summarizePayload(p).tipo);
    for (const tipo of ['multipla', 'bet_builder', 'aposta_futura']) {
      expect(tipos.filter((t) => t === tipo).length).toBeGreaterThanOrEqual(2);
    }
  });

  test('lança erro se o volume não comporta o mínimo', () => {
    const { fixtures, seasonMarkets, liveFixtures } = fullPool();
    expect(() => generateCoverageBatch(5, 2, fixtures, seasonMarkets, liveFixtures)).toThrow('Volume insuficiente');
  });

  test('lança erro se falta cobertura de alguma categoria', () => {
    expect(() => generateCoverageBatch(40, 2, [fixture(1, ['resultado_final'])])).toThrow('Cobertura garantida impossível');
  });
});
