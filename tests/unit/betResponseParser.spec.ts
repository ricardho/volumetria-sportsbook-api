import { expect, test } from '@playwright/test';
import { parseBetResponse } from '../../src/parsers/betResponseParser';

test.describe('parseBetResponse', () => {
  test('aposta aceita extrai id, código e cliente', () => {
    const parsed = parseBetResponse({
      status: 201,
      body: { bets: [{ id: 7, codigo: 'ABC', resultado: 'pendente', passador_id: 9, apostador: 'Cliente' }] },
    });
    expect(parsed).toEqual({
      ok: true,
      statusAposta: 'pendente',
      erroDetalhe: null,
      apostaId: 7,
      codigoRetornado: 'ABC',
      clienteId: 9,
      clienteNome: 'Cliente',
      formatoInesperado: false,
    });
  });

  test('aposta aceita sem bets[0].id é marcada como formato inesperado', () => {
    const parsed = parseBetResponse({ status: 201, body: { message: 'ok' } });
    expect(parsed.ok).toBe(true);
    expect(parsed.apostaId).toBeNull();
    expect(parsed.formatoInesperado).toBe(true);
  });

  test('rejeição usa a mensagem da API e classifica conflito', () => {
    const parsed = parseBetResponse({ status: 422, body: { message: 'Conflito entre seleções' } });
    expect(parsed.ok).toBe(false);
    expect(parsed.erroDetalhe).toBe('Conflito entre seleções');
    expect(parsed.statusAposta).toBe('conflito_selecao');
  });

  test('rejeição sem corpo descreve o status HTTP', () => {
    const parsed = parseBetResponse({ status: 503, body: null });
    expect(parsed.erroDetalhe).toBe('HTTP 503 sem corpo de resposta');
    expect(parsed.statusAposta).toBe('erro');
  });
});
