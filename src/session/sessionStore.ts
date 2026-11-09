import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT, SAMPLES_DIR, SESSIONS_ROOT } from '../config/paths';
import type { LoginOutcome } from '../flows/loginFlow';

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
  const dir = ensureSessionDir(label);
  const sessionPath = path.join(dir, 'session.json');
  fs.writeFileSync(
    sessionPath,
    JSON.stringify(
      { token: outcome.token, refreshToken: outcome.refreshToken, environment, obtainedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  return sessionPath;
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
