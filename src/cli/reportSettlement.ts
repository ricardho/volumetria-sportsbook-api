/**
 * Consulta o resultado final das apostas e gera o relatório de settlement.
 * Rode depois do fim das partidas; pode ser repetido até não haver pendentes.
 *
 * Uso:
 *   npm run report:settlement                        # results mais recente de cada sessão
 *   npm run report:settlement -- ./results-123.ndjson
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { settleResultsFile } from '../flows/settlementFlow';
import { resolveDefaultInputPaths } from '../reporting/generateReport';
import { generateSettlementReport, summarizeSettlement } from '../reporting/generateSettlementReport';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const inputs = args.length > 0 ? args : resolveDefaultInputPaths();
  const concurrency = process.env.SITE_SPORTSBOOK_CONCURRENCY ? Number(process.env.SITE_SPORTSBOOK_CONCURRENCY) : undefined;

  const runs = [];
  for (const input of inputs) {
    console.log(`Consultando settlement de ${input}...`);
    runs.push(await settleResultsFile(input, concurrency));
  }

  const entries = runs.flatMap((r) => r.entries);
  const singleOutput = runs.length === 1 ? runs[0].outputPath : undefined;
  const reportPath = generateSettlementReport(
    entries,
    singleOutput ? path.basename(inputs[0]) : `${runs.length} sessões`,
    singleOutput && path.join(path.dirname(singleOutput), `relatorio-${path.basename(singleOutput, '.ndjson')}.html`),
  );

  const summary = summarizeSettlement(entries);
  console.log(`\nConsultadas: ${summary.total} | Liquidadas: ${summary.liquidadas} | Pendentes: ${summary.pendentes} | Inconsistências: ${summary.inconsistentes}`);
  if (summary.pendentes > 0) console.log('Ainda há apostas pendentes: rode novamente depois do fim das partidas.');
  console.log(`Relatório gerado: ${reportPath}`);

  if (summary.inconsistentes > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
