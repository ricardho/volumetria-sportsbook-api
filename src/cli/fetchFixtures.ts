/**
 * Busca fixtures reais e grava fixtures.prod.json / liveFixtures.prod.json na raiz.
 *
 * Uso:
 *   npm run fetch:fixtures -- colocarAquiGameIds colocarAquiGameIds
 *   npm run fetch:fixtures -- --file matchIds.txt
 */
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { PROJECT_ROOT } from '../config/paths';
import { fetchFixturesForInputs } from '../flows/fixturesFlow';
import { savePoolFiles } from '../session/sessionStore';

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
  const saved = savePoolFiles(PROJECT_ROOT, { fixtures, liveFixtures });

  console.log(`\nFixtures pré-jogo: ${fixtures.length} -> ${saved.fixturesPath}`);
  console.log(`Fixtures ao vivo: ${liveFixtures.length} -> ${saved.liveFixturesPath}`);
  if (falhas.length > 0) {
    console.log(`Falharam: ${falhas.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
