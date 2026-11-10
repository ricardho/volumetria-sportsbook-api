import type { APIRequestContext } from '@playwright/test';
import { toApiResult, type ApiResult } from '../apiClient';

/**
 * Service de autenticação do siteSportsbook — CONFIRMADO contra o siteSportsbook real em
 * produção (POST https://api.sitesportsbook.example/auth/login, 200 OK).
 */
export class SiteSportsbookAuthService {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** POST /auth/login — confirmado contra produção */
  async login(username: string, password: string): Promise<ApiResult> {
    const res = await this.request.post(`${this.baseUrl}/auth/login`, {
      data: {
        username,
        password,
        googleId: null,
        googleIdToken: null,
        loginMode: 'email',
      },
    });
    return toApiResult(res);
  }

  /**
   * POST /auth/refresh — HIPÓTESE (caminho e payload baseados no
   * serviço de API de outro sportsbook), ainda não confirmada contra o siteSportsbook.
   * O formato de resposta provavelmente segue o mesmo envelope
   * {success, results: {...}} do login, mas isso também não foi validado.
   */
  async refreshToken(refreshToken: string): Promise<ApiResult> {
    const res = await this.request.post(`${this.baseUrl}/auth/refresh`, {
      data: { refreshToken },
    });
    return toApiResult(res);
  }
}

/**
 * Extrai o token de acesso da resposta de login. Schema confirmado contra
 * produção: { success, results: { token, tokenCassino, refreshToken, user } }.
 */
export function extractToken(loginResponseBody: any): string | undefined {
  return loginResponseBody?.results?.token;
}

/** Extrai o refreshToken da resposta de login (mesmo schema confirmado). */
export function extractRefreshToken(loginResponseBody: any): string | undefined {
  return loginResponseBody?.results?.refreshToken;
}

/** Extrai o token específico do cassino (results.tokenCassino), caso a suíte precise dele mais adiante. */
export function extractCasinoToken(loginResponseBody: any): string | undefined {
  return loginResponseBody?.results?.tokenCassino;
}
