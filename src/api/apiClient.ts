import { request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test';

/** Timeout de cada requisição — evita que uma chamada pendurada segure a vaga de concorrência para sempre. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Resultado padronizado de uma chamada: status HTTP + corpo JSON (null se a resposta não for JSON). */
export interface ApiResult<T = any> {
  status: number;
  body: T | null;
}

export async function toApiResult<T = any>(res: APIResponse): Promise<ApiResult<T>> {
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status(), body };
}

/** Cria um APIRequestContext para a base informada; com `authToken`, envia `Authorization: Bearer`. */
export async function createApiContext(baseURL: string, authToken?: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    extraHTTPHeaders: {
      Accept: 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
}

/** Abre um contexto, executa `fn` e sempre libera o contexto no final (inclusive em erro). */
export async function withApiContext<T>(
  baseURL: string,
  fn: (context: APIRequestContext) => Promise<T>,
  authToken?: string,
): Promise<T> {
  const context = await createApiContext(baseURL, authToken);
  try {
    return await fn(context);
  } finally {
    await context.dispose();
  }
}
