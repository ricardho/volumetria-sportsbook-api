import { getDefaultEnvironmentName } from '../config/environments';
import { createLogger } from '../logging/logger';
import { readSession, type SessionPaths } from '../session/sessionStore';
import { performLogin } from './loginFlow';

/** Resolve o token na ordem: informado, arquivo de sessão e, no modo legado, variáveis do .env. */
export async function resolveToken(
  sessionLabel: string,
  environment: string,
  paths: SessionPaths,
  providedToken?: string,
): Promise<string> {
  if (providedToken) return providedToken;
  const log = createLogger(sessionLabel);

  const session = readSession(paths.sessionFile);
  if (session?.token) {
    if (session.environment && session.environment !== environment) {
      throw new Error(
        `[${sessionLabel}] O token em ${paths.sessionFile} foi obtido em "${session.environment}", mas a execução é em "${environment}". Rode "npm run login" no ambiente correto.`,
      );
    }
    log.info(`Usando token de ${paths.sessionFile} (obtido em ${session.obtainedAt}).`);
    return session.token;
  }

  if (!paths.usingSessionDir) {
    const authToken = process.env.SITE_SPORTSBOOK_AUTH_TOKEN ?? '';
    if (authToken) return authToken;

    const username = process.env.SITE_SPORTSBOOK_USERNAME ?? '';
    const password = process.env.SITE_SPORTSBOOK_PASSWORD ?? '';
    if (username && password) {
      log.warn('Usando SITE_SPORTSBOOK_USERNAME/SITE_SPORTSBOOK_PASSWORD do .env — prefira "npm run login".');
      return (await performLogin(environment, username, password)).token;
    }
  }

  throw new Error(`[${sessionLabel}] Nenhuma credencial encontrada. Rode "npm run login" (ou o assistente "npm run wizard") primeiro.`);
}

/** Ambiente em que a sessão foi autenticada (session.json); sem essa informação, usa SITE_SPORTSBOOK_ENV. */
export function resolveSessionEnvironment(paths: SessionPaths): string {
  return readSession(paths.sessionFile)?.environment ?? getDefaultEnvironmentName();
}
