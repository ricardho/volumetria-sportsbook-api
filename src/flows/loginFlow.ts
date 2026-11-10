import { withApiContext } from '../api/apiClient';
import { SiteSportsbookAuthService, extractToken, extractRefreshToken } from '../api/services/authService';
import { getEnvironment } from '../config/environments';

export interface LoginOutcome {
  token: string;
  refreshToken?: string;
}

/**
 * Autentica e retorna o token (não grava nada em disco — quem chama decide
 * onde/se persistir). Lança erro se o login falhar. A mensagem de erro nunca
 * inclui usuário/senha.
 */
export async function performLogin(environment: string, username: string, password: string): Promise<LoginOutcome> {
  const baseUrl = getEnvironment(environment).api;
  const result = await withApiContext(baseUrl, (context) => new SiteSportsbookAuthService(context, baseUrl).login(username, password));

  if (result.status !== 200 || !result.body?.success) {
    throw new Error(`Login falhou (status ${result.status}).`);
  }

  const token = extractToken(result.body);
  const refreshToken = extractRefreshToken(result.body);
  if (!token) {
    throw new Error('Login retornou 200/success, mas o token não foi encontrado na resposta (results.token).');
  }

  return { token, refreshToken };
}
