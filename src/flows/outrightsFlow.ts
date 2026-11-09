import { SiteSportsbookOutrightsService } from '../api/services/outrightsService';
import { getDefaultEnvironmentName, getEnvironment } from '../config/environments';
import { parseFirstActiveMarket, parseOutrightsResponse } from '../parsers/outrightsParser';
import type { SeasonMarket } from '../types';

/**
 * Busca e faz o parsing dos mercados de outright. Não escreve nenhum
 * arquivo — quem chama decide onde salvar.
 */
export async function fetchSeasonMarkets(
  tournamentFilters: string[] = [],
  environment: string = getDefaultEnvironmentName(),
): Promise<SeasonMarket[]> {
  const raw = await new SiteSportsbookOutrightsService(getEnvironment(environment).feed).getOutrights();
  return parseOutrightsResponse(raw, tournamentFilters.length > 0 ? tournamentFilters : undefined);
}

/**
 * Busca outrights e já pega o PRIMEIRO evento/mercado ativo disponível, sem
 * exigir nenhum filtro do usuário. Suficiente pra dar cobertura à categoria
 * "aposta_futura" quando o mercado específico não importa muito pro teste.
 */
export async function fetchFirstSeasonMarket(environment: string = getDefaultEnvironmentName()): Promise<SeasonMarket[]> {
  const raw = await new SiteSportsbookOutrightsService(getEnvironment(environment).feed).getOutrights();
  return parseFirstActiveMarket(raw);
}
