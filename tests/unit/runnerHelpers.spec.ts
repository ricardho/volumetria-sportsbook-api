import { expect, test } from '@playwright/test';
import { ENVIRONMENTS, getEnvironment } from '../../src/config/environments';
import { extractMatchId } from '../../src/flows/fixturesFlow';
import { createLimiter } from '../../src/runner/concurrencyLimiter';
import { classifyErrorStatus } from '../../src/runner/errorClassifier';

test.describe('createLimiter', () => {
  test('nunca ultrapassa o máximo de tarefas simultâneas', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );

    expect(peak).toBe(3);
  });

  test('libera a vaga mesmo quando a tarefa falha', async () => {
    const limit = createLimiter(1);
    await expect(limit(async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});

test.describe('classifyErrorStatus', () => {
  for (const [input, expected] of [
    ['Conflito entre seleções', 'conflito_selecao'],
    ['selection CONFLICT', 'conflito_selecao'],
    ['Mercado suspenso', 'erro'],
    [null, 'erro'],
  ] as const) {
    test(`"${input}" -> ${expected}`, () => {
      expect(classifyErrorStatus(input)).toBe(expected);
    });
  }
});

test.describe('extractMatchId', () => {
  test('aceita ID puro e URL de game-details', () => {
    expect(extractMatchId('12345')).toBe('12345');
    expect(extractMatchId('https://www.sitesportsbook.example/game-details/12345')).toBe('12345');
  });

  test('rejeita entrada sem ID numérico', () => {
    expect(() => extractMatchId('colocarAquiGameIds')).toThrow('Não consegui extrair');
  });
});

test.describe('environments', () => {
  test('ambiente desconhecido lança erro', () => {
    expect(() => getEnvironment('dev')).toThrow('não configurado');
  });

  test('todas as URLs usam o domínio fictício', () => {
    for (const urls of Object.values(ENVIRONMENTS)) {
      for (const url of Object.values(urls)) {
        expect(new URL(url).hostname).toMatch(/\.sitesportsbook\.example$/);
      }
    }
  });
});
