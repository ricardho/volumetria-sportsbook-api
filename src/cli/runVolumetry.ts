/**
 * Roda o teste de volumetria para uma sessão, configurado por variáveis de ambiente.
 *
 * Uso: SITE_SPORTSBOOK_TOTAL_BETS=1000 npm run test:volumetry
 */
import * as dotenv from 'dotenv';
import { getDefaultEnvironmentName } from '../config/environments';
import { runVolumetryForSession } from '../runner/volumetryRunner';

dotenv.config();

function optionalNumber(name: string): number | undefined {
  const value = process.env[name];
  return value ? Number(value) : undefined;
}

runVolumetryForSession({
  sessionLabel: process.env.SITE_SPORTSBOOK_SESSION_LABEL ?? 'default',
  environment: getDefaultEnvironmentName(),
  totalBets: Number(process.env.SITE_SPORTSBOOK_TOTAL_BETS ?? 500),
  batchSize: optionalNumber('SITE_SPORTSBOOK_BATCH_SIZE'),
  concurrency: optionalNumber('SITE_SPORTSBOOK_CONCURRENCY'),
  betAmount: optionalNumber('SITE_SPORTSBOOK_BET_AMOUNT'),
  minPerCategory: optionalNumber('SITE_SPORTSBOOK_MIN_PER_CATEGORY'),
  errorThreshold: optionalNumber('SITE_SPORTSBOOK_ERROR_THRESHOLD'),
}).catch((err) => {
  console.error('Erro fatal na execução do teste:', err);
  process.exit(1);
});
