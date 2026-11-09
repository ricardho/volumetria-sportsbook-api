/**
 * Constrói fixtures.prod.json e liveFixtures.prod.json a partir de respostas
 * do endpoint de fixture capturadas manualmente (uma partida por arquivo).
 *
 * Uso: npm run build:pool
 */
import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT, RAW_FIXTURES_DIR } from '../config/paths';
import { isLiveFixture, type PoolFixture } from '../flows/fixturesFlow';
import { parseFixtureResponse } from '../parsers/fixtureParser';

const rawDir = process.argv[2] ?? RAW_FIXTURES_DIR;
const outFixtures = path.join(PROJECT_ROOT, 'fixtures.prod.json');
const outLive = path.join(PROJECT_ROOT, 'liveFixtures.prod.json');

const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`Nenhum .json encontrado em ${rawDir}. Salve as respostas capturadas nessa pasta antes de rodar.`);
  process.exit(1);
}

const fixtures: PoolFixture[] = [];
const liveFixtures: PoolFixture[] = [];

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf-8'));
  for (const f of parseFixtureResponse(raw)) {
    (isLiveFixture(f) ? liveFixtures : fixtures).push(f);
  }
}

fs.writeFileSync(outFixtures, JSON.stringify(fixtures, null, 2));
fs.writeFileSync(outLive, JSON.stringify(liveFixtures, null, 2));

console.log(`Arquivos processados: ${files.length}`);
console.log(`Fixtures pré-jogo: ${fixtures.length} -> ${outFixtures}`);
console.log(`Fixtures ao vivo: ${liveFixtures.length} -> ${outLive}`);
