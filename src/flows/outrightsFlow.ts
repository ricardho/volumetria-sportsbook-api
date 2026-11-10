import { withApiContext } from '../api/apiClient';
import { SiteSportsbookOutrightsService } from '../api/services/outrightsService';
import { getDefaultEnvironmentName, getEnvironment } from '../config/environments';
import { parseFirstActiveMarket, parseOutrightsResponse } from '../parsers/outrightsParser';
import type { SeasonMarket } from '../types';

function fetchRawOutrights(environment: string): Promise<any> {
  const baseUrl = getEnvironment(environment).feed;
  return withApiContext(baseUrl, (context) => new SiteSportsbookOutrightsService(context, baseUrl).getOutrights());
}

/**
 * Busca e faz o parsing dos mercados de outright. Não escreve nenhum
 * arquivo — quem chama decide onde salvar.
 */
export async function fetchSeasonMarkets(
  tournamentFilters: string[] = [],
  environment: string = getDefaultEnvironmentName(),
): Promise<SeasonMarket[]> {
  return parseOutrightsResponse(await fetchRawOutrights(environment), tournamentFilters.length > 0 ? tournamentFilters : undefined);
}

/**
 * Busca outrights e já pega o PRIMEIRO evento/mercado ativo disponível, sem
 * exigir nenhum filtro do usuário. Suficiente pra dar cobertura à categoria
 * "aposta_futura" quando o mercado específico não importa muito pro teste.
 */
export async function fetchFirstSeasonMarket(environment: string = getDefaultEnvironmentName()): Promise<SeasonMarket[]> {
  return parseFirstActiveMarket(await fetchRawOutrights(environment));
}
