/**
 * Constrói fixtures.prod.json e liveFixtures.prod.json a partir de respostas
 * do endpoint de fixture capturadas manualmente (uma partida por arquivo).
 *
 * Uso: npm run build:pool
 */
import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT, RAW_FIXTURES_DIR } from '../config/paths';
import { splitByLiveness, type FixturePool } from '../flows/fixturesFlow';
import { parseFixtureResponse } from '../parsers/fixtureParser';
import { savePoolFiles } from '../session/sessionStore';

const rawDir = process.argv[2] ?? RAW_FIXTURES_DIR;

const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`Nenhum .json encontrado em ${rawDir}. Salve as respostas capturadas nessa pasta antes de rodar.`);
  process.exit(1);
}

const pool: FixturePool = { fixtures: [], liveFixtures: [] };
for (const file of files) {
  const filePath = path.join(rawDir, file);
  try {
    splitByLiveness(parseFixtureResponse(JSON.parse(fs.readFileSync(filePath, 'utf-8'))), pool);
  } catch (err: any) {
    console.error(`Ignorando ${filePath}: ${err.message}`);
  }
}

const saved = savePoolFiles(PROJECT_ROOT, pool);

console.log(`Arquivos processados: ${files.length}`);
console.log(`Fixtures pré-jogo: ${pool.fixtures.length} -> ${saved.fixturesPath}`);
console.log(`Fixtures ao vivo: ${pool.liveFixtures.length} -> ${saved.liveFixturesPath}`);
