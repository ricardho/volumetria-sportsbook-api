import { expect, test } from '@playwright/test';
import { SiteSportsbookAuthService } from '../../src/api/services/authService';
import { SiteSportsbookBetService } from '../../src/api/services/betService';
import { SiteSportsbookFixtureService } from '../../src/api/services/fixtureService';
import { SiteSportsbookOutrightsService } from '../../src/api/services/outrightsService';
import { startMockServer } from '../support/mockServer';

test('AuthService envia o body de login esperado', async ({ request }) => {
  const server = await startMockServer(() => ({ status: 200, body: { success: true, results: { token: 't' } } }));
  try {
    const result = await new SiteSportsbookAuthService(request, server.url).login('usuario', 'senha-ficticia');
    expect(result.status).toBe(200);
    expect(server.requests[0].url).toBe('/auth/login');
    expect(server.requests[0].body).toEqual({
      username: 'usuario',
      password: 'senha-ficticia',
      googleId: null,
      googleIdToken: null,
      loginMode: 'email',
    });
  } finally {
    await server.close();
  }
});

test('BetService faz POST no endpoint de apostas', async ({ request }) => {
  const server = await startMockServer(() => ({ status: 201, body: {} }));
  try {
    const response = await new SiteSportsbookBetService(request, server.url).placeBet({ amount: 1, items: [] } as any);
    expect(response.status).toBe(201);
    expect(server.requests[0].method).toBe('POST');
    expect(server.requests[0].url).toBe('/sportsbook/bet');
  } finally {
    await server.close();
  }
});

test('FixtureService monta a query e propaga erro HTTP', async ({ request }) => {
  const server = await startMockServer((req) => (req.url.includes('id=404') ? { status: 404 } : { status: 200, body: { ok: true } }));
  try {
    const service = new SiteSportsbookFixtureService(request, server.url);
    await expect(service.getFixture('123')).resolves.toEqual({ ok: true });
    expect(server.requests[0].url).toBe('/data?key=fixture&id=123');
    await expect(service.getFixture('404')).rejects.toThrow('HTTP 404');
  } finally {
    await server.close();
  }
});

test('OutrightsService chama /v1/outrights', async ({ request }) => {
  const server = await startMockServer(() => ({ status: 200, body: [] }));
  try {
    await expect(new SiteSportsbookOutrightsService(request, server.url).getOutrights()).resolves.toEqual([]);
    expect(server.requests[0].url).toBe('/v1/outrights');
  } finally {
    await server.close();
  }
});
