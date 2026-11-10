import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT, SAMPLES_DIR, SESSIONS_ROOT } from '../config/paths';
import type { LoginOutcome } from '../flows/loginFlow';
import { createLogger } from '../logging/logger';
import type { PoolFixture } from '../types';

const log = createLogger('sessão');

/** Conteúdo de .sessions/<label>/session.json (ou .session.json no modo legado). */
export interface StoredSession {
  token?: string;
  refreshToken?: string;
  environment?: string;
  obtainedAt?: string;
}

/** Pastas sincronizadas com a nuvem: o .gitignore não impede que tokens e dados de cliente sejam enviados para lá. */
const CLOUD_SYNC_MARKERS = ['onedrive', 'dropbox', 'google drive', 'icloud'];
let cloudSyncWarned = false;

function warnIfCloudSynced(): void {
  if (cloudSyncWarned) return;
  const lower = PROJECT_ROOT.toLowerCase();
  if (CLOUD_SYNC_MARKERS.some((m) => lower.includes(m))) {
    cloudSyncWarned = true;
    log.warn(
      `O projeto está numa pasta sincronizada com a nuvem (${PROJECT_ROOT}). Tokens em .sessions/ e resultados com dados de cliente ` +
        'serão enviados para essa nuvem. Mova o projeto para uma pasta local ou exclua .sessions/ da sincronização.',
    );
  }
}

/** Grava JSON com permissão restrita ao dono (0600 em sistemas POSIX; no Windows vale a ACL da pasta). */
function writeJsonPrivate(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function sessionDir(label: string): string {
  return path.join(SESSIONS_ROOT, label);
}

export function ensureSessionDir(label: string): string {
  const dir = sessionDir(label);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function sessionExists(label: string): boolean {
  return fs.existsSync(path.join(sessionDir(label), 'session.json'));
}

/** Lista os rótulos de todas as sessões já configuradas (pastas dentro de .sessions/ com um session.json válido). */
export function listSessionLabels(): string[] {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  return fs
    .readdirSync(SESSIONS_ROOT)
    .filter((f) => fs.statSync(path.join(SESSIONS_ROOT, f)).isDirectory())
    .filter((label) => sessionExists(label));
}

/** Grava o resultado do login em .sessions/<label>/session.json */
export function saveSession(label: string, environment: string, outcome: LoginOutcome): string {
  warnIfCloudSynced();
  const dir = ensureSessionDir(label);
  const sessionPath = path.join(dir, 'session.json');
  const session: StoredSession = {
    token: outcome.token,
    refreshToken: outcome.refreshToken,
    environment,
    obtainedAt: new Date().toISOString(),
  };
  writeJsonPrivate(sessionPath, session);
  return sessionPath;
}

/** Lê um arquivo de sessão; retorna null se ele não existir. */
export function readSession(sessionFile: string): StoredSession | null {
  if (!fs.existsSync(sessionFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as StoredSession;
  } catch (err: any) {
    throw new Error(`Arquivo de sessão corrompido (${sessionFile}): ${err.message}. Rode "npm run login" novamente.`);
  }
}

/** Grava o pool de fixtures (pré-jogo + ao vivo) no diretório informado. Retorna os caminhos gravados. */
export function savePoolFiles(dir: string, pool: { fixtures: PoolFixture[]; liveFixtures: PoolFixture[] }) {
  const fixturesPath = path.join(dir, 'fixtures.prod.json');
  const liveFixturesPath = path.join(dir, 'liveFixtures.prod.json');
  fs.writeFileSync(fixturesPath, JSON.stringify(pool.fixtures, null, 2));
  fs.writeFileSync(liveFixturesPath, JSON.stringify(pool.liveFixtures, null, 2));
  return { fixturesPath, liveFixturesPath };
}

export interface SessionPaths {
  sessionFile: string;
  fixturesPath: string;
  liveFixturesPath: string;
  seasonMarketsPath: string;
  resultsDir: string;
  usingSessionDir: boolean;
}

/** Resolve os caminhos da sessão: pasta em .sessions/ ou, no modo legado, arquivos soltos na raiz. */
export function resolveSessionPaths(sessionLabel: string): SessionPaths {
  if (sessionExists(sessionLabel)) {
    const dir = sessionDir(sessionLabel);
    return {
      sessionFile: path.join(dir, 'session.json'),
      fixturesPath: path.join(dir, 'fixtures.prod.json'),
      liveFixturesPath: path.join(dir, 'liveFixtures.prod.json'),
      seasonMarketsPath: path.join(dir, 'seasonMarkets.json'),
      resultsDir: dir,
      usingSessionDir: true,
    };
  }
  return {
    sessionFile: path.join(PROJECT_ROOT, '.session.json'),
    fixturesPath: process.env.SITE_SPORTSBOOK_FIXTURES_PATH ?? path.join(SAMPLES_DIR, 'fixtures.sample.json'),
    liveFixturesPath: process.env.SITE_SPORTSBOOK_LIVE_FIXTURES_PATH ?? path.join(SAMPLES_DIR, 'liveFixtures.sample.json'),
    seasonMarketsPath: process.env.SITE_SPORTSBOOK_SEASON_MARKETS_PATH ?? path.join(SAMPLES_DIR, 'seasonMarkets.sample.json'),
    resultsDir: PROJECT_ROOT,
    usingSessionDir: false,
  };
}
