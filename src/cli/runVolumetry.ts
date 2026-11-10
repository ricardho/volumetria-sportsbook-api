/**
 * Roda o teste de volumetria para uma sessão, configurado por variáveis de ambiente.
 *
 * Uso: SITE_SPORTSBOOK_TOTAL_BETS=1000 npm run test:volumetry
 *      (em produção pede confirmação; sem terminal interativo, use -- --confirmar-prod)
 */
import * as dotenv from 'dotenv';
import { getDefaultEnvironmentName } from '../config/environments';
import { assertWithinStakeLimit, estimateMaxStake, readRunConfig } from '../config/runConfig';
import { runVolumetryForSession } from '../runner/volumetryRunner';
import { confirmProduction } from './shared/prompts';

dotenv.config();

async function main() {
  const environment = getDefaultEnvironmentName();
  const config = readRunConfig();

  const estimatedStake = estimateMaxStake(config.totalBets, config.betAmount);
  assertWithinStakeLimit(estimatedStake, config.maxTotalValue);

  if (environment === 'prod') {
    const valor = config.betAmount !== undefined ? `R$${config.betAmount.toFixed(2)} cada` : 'valor sorteado por aposta';
    const confirmed = await confirmProduction(
      `Sessão "${config.sessionLabel}": ${config.totalBets} apostas (${valor}), até R$${estimatedStake.toFixed(2)} em jogo.`,
    );
    if (!confirmed) {
      console.log('Execução cancelada.');
      process.exitCode = 1;
      return;
    }
  }

  await runVolumetryForSession({ ...config, environment });
}

main().catch((err) => {
  console.error('Erro fatal na execução do teste:', err?.message ?? err);
  process.exit(1);
});
