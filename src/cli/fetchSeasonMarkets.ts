/**
 * Busca os mercados de outright (apostas futuras) e grava seasonMarkets.prod.json na raiz.
 *
 * Uso:
 *   npm run fetch:outrights                                  # todos os torneios (pode ser MUITO grande)
 *   npm run fetch:outrights -- "Premier League" "Bola de Ouro"  # só os que contêm esses textos no nome
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PROJECT_ROOT } from '../config/paths';
import { fetchSeasonMarkets } from '../flows/outrightsFlow';

dotenv.config();

async function main() {
  const filters = process.argv.slice(2);
  if (filters.length === 0) {
    console.warn(
      'Nenhum filtro de torneio informado — isso vai trazer TODOS os torneios de outright disponíveis (pode ser um volume grande). Use argumentos para filtrar, ex: npm run fetch:outrights -- "Premier League".',
    );
  }

  const seasonMarkets = await fetchSeasonMarkets(filters);
  const outPath = path.join(PROJECT_ROOT, 'seasonMarkets.prod.json');
  fs.writeFileSync(outPath, JSON.stringify(seasonMarkets, null, 2));

  console.log(`${seasonMarkets.length} mercados de outright salvos em ${outPath}`);
  if (seasonMarkets.length > 0) {
    const tournaments = new Set(seasonMarkets.map((m) => m.tournamentName));
    console.log(`Torneios incluídos: ${Array.from(tournaments).join(', ')}`);
  }
}

main();
