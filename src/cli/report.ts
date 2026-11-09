/**
 * Gera o relatório HTML a partir de um ou mais results-*.ndjson.
 *
 * Uso:
 *   npm run report                                # detecta automaticamente (sessões ou legado)
 *   npm run report -- ./a.ndjson ./b.ndjson       # arquivos específicos, um relatório consolidado
 */
import { generateReportFromFiles, resolveDefaultInputPaths } from '../reporting/generateReport';

const argInputs = process.argv.slice(2);
const inputPaths = argInputs.length > 0 ? argInputs : resolveDefaultInputPaths();

const outPath =
  inputPaths.length === 1
    ? inputPaths[0].replace(/\.ndjson$/, '.html').replace(/results-/, 'relatorio-')
    : undefined;

console.log(`Relatório gerado: ${generateReportFromFiles(inputPaths, outPath)}`);
