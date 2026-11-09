import * as fs from 'fs';
import type { SessionPaths } from '../session/sessionStore';
import { performLogin } from './loginFlow';

/** Resolve o token na ordem: informado, arquivo de sessão e, no modo legado, variáveis do .env. */
export async function resolveToken(
  sessionLabel: string,
  environment: string,
  paths: SessionPaths,
  providedToken?: string,
): Promise<string> {
  if (providedToken) return providedToken;

  if (fs.existsSync(paths.sessionFile)) {
    const session = JSON.parse(fs.readFileSync(paths.sessionFile, 'utf-8'));
    if (session.token) {
      console.log(`[${sessionLabel}] Usando token de ${paths.sessionFile} (obtido em ${session.obtainedAt}).`);
      return session.token;
    }
  }

  if (!paths.usingSessionDir) {
    const authToken = process.env.SITE_SPORTSBOOK_AUTH_TOKEN ?? '';
    if (authToken) return authToken;

    const username = process.env.SITE_SPORTSBOOK_USERNAME ?? '';
    const password = process.env.SITE_SPORTSBOOK_PASSWORD ?? '';
    if (username && password) {
      console.warn(`[${sessionLabel}] Usando SITE_SPORTSBOOK_USERNAME/SITE_SPORTSBOOK_PASSWORD do .env — prefira "npm run login".`);
      return (await performLogin(environment, username, password)).token;
    }
  }

  throw new Error(`[${sessionLabel}] Nenhuma credencial encontrada. Rode "npm run login" (ou o assistente "npm run wizard") primeiro.`);
}
