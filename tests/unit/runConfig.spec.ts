import { expect, test } from '@playwright/test';
import {
  assertWithinStakeLimit,
  estimateMaxStake,
  parseEnvNumber,
  readExecutionSettings,
  readRunConfig,
} from '../../src/config/runConfig';
import marketsWeights from '../../src/config/marketsWeights.json';

test.describe('parseEnvNumber', () => {
  test('variável ausente ou vazia retorna undefined', () => {
    expect(parseEnvNumber('X', {}, {})).toBeUndefined();
    expect(parseEnvNumber('X', {}, { X: '  ' })).toBeUndefined();
  });

  test('aceita vírgula decimal', () => {
    expect(parseEnvNumber('X', {}, { X: '0,5' })).toBe(0.5);
  });

  for (const [value, rule, message] of [
    ['abc', {}, 'não é um número'],
    ['1.5', { integer: true }, 'inteiro'],
    ['0', { min: 1 }, 'maior ou igual a 1'],
    ['0', { min: 0, exclusiveMin: true }, 'maior que 0'],
    ['1.5', { max: 1 }, 'menor ou igual a 1'],
  ] as const) {
    test(`"${value}" com ${JSON.stringify(rule)} é rejeitado`, () => {
      expect(() => parseEnvNumber('X', rule, { X: value })).toThrow(message);
    });
  }
});

test.describe('readRunConfig', () => {
  test('exige SITE_SPORTSBOOK_TOTAL_BETS', () => {
    expect(() => readRunConfig({})).toThrow('SITE_SPORTSBOOK_TOTAL_BETS');
  });

  test('lê e valida todas as variáveis', () => {
    const config = readRunConfig({
      SITE_SPORTSBOOK_TOTAL_BETS: '20',
      SITE_SPORTSBOOK_BATCH_SIZE: '5',
      SITE_SPORTSBOOK_CONCURRENCY: '3',
      SITE_SPORTSBOOK_ERROR_THRESHOLD: '0.1',
      SITE_SPORTSBOOK_BET_AMOUNT: '0.5',
      SITE_SPORTSBOOK_MIN_PER_CATEGORY: '0',
      SITE_SPORTSBOOK_MAX_TOTAL_VALUE: '50',
    });
    expect(config).toEqual({
      sessionLabel: 'default',
      totalBets: 20,
      batchSize: 5,
      concurrency: 3,
      errorThreshold: 0.1,
      betAmount: 0.5,
      minPerCategory: 0,
      maxTotalValue: 50,
    });
  });

  test('threshold acima de 1 é rejeitado', () => {
    expect(() => readExecutionSettings({ SITE_SPORTSBOOK_ERROR_THRESHOLD: '2' })).toThrow('SITE_SPORTSBOOK_ERROR_THRESHOLD');
  });
});

test.describe('teto de valor total', () => {
  test('estimativa usa o valor fixo ou o teto da faixa sorteada', () => {
    expect(estimateMaxStake(10, 0.5)).toBe(5);
    expect(estimateMaxStake(10)).toBe(10 * marketsWeights._amount.max);
  });

  test('bloqueia só quando o teto está configurado e é ultrapassado', () => {
    expect(() => assertWithinStakeLimit(100)).not.toThrow();
    expect(() => assertWithinStakeLimit(50, 50)).not.toThrow();
    expect(() => assertWithinStakeLimit(50.01, 50)).toThrow('SITE_SPORTSBOOK_MAX_TOTAL_VALUE');
  });
});
