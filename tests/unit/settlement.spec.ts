import { expect, test } from '@playwright/test';
import { findInconsistency, interpretSettlementResponse } from '../../src/flows/settlementFlow';

const bet = (resultado: string, valor_retorno: number | null = 0, liquidada_em: string | null = '2030-01-02T10:00:00Z') => ({
  status: 200,
  body: { bet: { resultado, valor_retorno, liquidada_em } },
});

test.describe('interpretSettlementResponse', () => {
  test('traduz resposta 200', () => {
    expect(interpretSettlementResponse(bet('GANHOU', 10))).toEqual({
      resultadoFinal: 'ganhou',
      valorRetorno: 10,
      liquidadaEm: '2030-01-02T10:00:00Z',
    });
  });

  test('resultado fora do contrato vira desconhecido', () => {
    expect(interpretSettlementResponse(bet('xpto')).resultadoFinal).toBe('desconhecido');
  });

  test('404 e erros HTTP não viram resultado de aposta', () => {
    expect(interpretSettlementResponse({ status: 404, body: null }).resultadoFinal).toBe('nao_encontrada');
    expect(interpretSettlementResponse({ status: 500, body: null }).resultadoFinal).toBe('erro_consulta');
  });
});

test.describe('findInconsistency', () => {
  const check = (resultado: string, retorno: number | null, liquidada?: string | null) =>
    findInconsistency(5, interpretSettlementResponse(bet(resultado, retorno, liquidada === undefined ? '2030-01-02T10:00:00Z' : liquidada)));

  for (const [resultado, retorno] of [['ganhou', 10], ['perdeu', 0], ['devolvida', 5]] as const) {
    test(`${resultado} com retorno ${retorno} é coerente`, () => {
      expect(check(resultado, retorno)).toBeNull();
    });
  }

  test('pendente não é validada', () => {
    expect(check('pendente', null, null)).toBeNull();
  });

  test('detecta retornos incoerentes', () => {
    expect(check('ganhou', 5)).toContain('Aposta ganha');
    expect(check('perdeu', 3)).toContain('Aposta perdida');
    expect(check('devolvida', 4)).toContain('devolvida');
  });

  test('detecta liquidação sem dados', () => {
    expect(check('ganhou', null)).toContain('sem valor de retorno');
    expect(check('ganhou', 10, null)).toContain('sem data');
  });
});
