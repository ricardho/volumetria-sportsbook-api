/**
 * Busca fixtures reais e grava fixtures.prod.json / liveFixtures.prod.json na raiz.
 *
 * Uso:
 *   npm run fetch:fixtures -- colocarAquiGameIds colocarAquiGameIds
 *   npm run fetch:fixtures -- --file matchIds.txt
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PROJECT_ROOT } from '../config/paths';
import { fetchFixturesForInputs } from '../flows/fixturesFlow';

dotenv.config();

function resolveInputsFromArgv(): string[] {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.indexOf('--file');
  if (fileFlagIndex !== -1) {
    const filePath = args[fileFlagIndex + 1];
    if (!filePath) throw new Error('Use --file <caminho> apontando para um arquivo com um ID/URL por linha.');
    return fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  return args;
}

async function main() {
  const inputs = resolveInputsFromArgv();
  if (inputs.length === 0) {
    console.error('Informe pelo menos um ID de partida ou URL de game-details (ou use --file <caminho>).');
    process.exit(1);
  }

  const { fixtures, liveFixtures, falhas } = await fetchFixturesForInputs(inputs);

  fs.writeFileSync(path.join(PROJECT_ROOT, 'fixtures.prod.json'), JSON.stringify(fixtures, null, 2));
  fs.writeFileSync(path.join(PROJECT_ROOT, 'liveFixtures.prod.json'), JSON.stringify(liveFixtures, null, 2));

  console.log(`\nFixtures pré-jogo: ${fixtures.length} -> fixtures.prod.json`);
  console.log(`Fixtures ao vivo: ${liveFixtures.length} -> liveFixtures.prod.json`);
  if (falhas.length > 0) {
    console.log(`Falharam: ${falhas.join(', ')}`);
  }
}

main();
