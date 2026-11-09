/** Fonte única das URLs de cada ambiente — nenhum outro arquivo deve declarar URL de API. */
export interface EnvironmentUrls {
  /** API principal: login e criação de apostas */
  api: string;
  /** API de fixtures (partidas, mercados e odds) */
  fixtures: string;
  /** Feed de outrights (Aposta Futura) */
  feed: string;
}

export const ENVIRONMENTS: Record<string, EnvironmentUrls> = {
  preprod: {
    api: 'https://api-preprod.sitesportsbook.example',
    fixtures: 'https://fixtures-preprod.sitesportsbook.example',
    feed: 'https://feed-preprod.sitesportsbook.example',
  },
  prod: {
    api: 'https://api.sitesportsbook.example',
    fixtures: 'https://fixtures.sitesportsbook.example',
    feed: 'https://feed.sitesportsbook.example',
  },
};

export function getEnvironment(name: string): EnvironmentUrls {
  const environment = ENVIRONMENTS[name];
  if (!environment) {
    throw new Error(`Ambiente "${name}" não configurado em ENVIRONMENTS (src/config/environments.ts).`);
  }
  return environment;
}

export function getDefaultEnvironmentName(): string {
  return process.env.SITE_SPORTSBOOK_ENV ?? 'preprod';
}
