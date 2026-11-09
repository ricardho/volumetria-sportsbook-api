import type { APIRequestContext } from '@playwright/test';

/**
 * Cria um APIRequestContext autenticado.
 * Ajuste os headers conforme o mecanismo de auth real (Bearer token, cookie de sessão, etc.)
 */
export async function createAuthenticatedContext(
  playwrightRequest: { newContext: (opts: any) => Promise<APIRequestContext> },
  authToken: string,
  baseUrl: string,
): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  });
}
