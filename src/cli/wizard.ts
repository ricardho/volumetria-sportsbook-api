/**
 * Assistente de configuração — guia você por todo o fluxo (ambiente, login,
 * fixtures, volume e valor) para uma ou mais sessões, mostra um resumo final
 * pra confirmação, dispara todas as sessões em PARALELO, e ao final já gera
 * e aponta o relatório consolidado.
 *
 * Uso:
 *   npm run wizard
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import prompts from 'prompts';
import { assertWithinStakeLimit, estimateMaxStake, readExecutionSettings } from '../config/runConfig';
import { performLogin } from '../flows/loginFlow';
import { fetchFixturesForInputs } from '../flows/fixturesFlow';
import { fetchFirstSeasonMarket } from '../flows/outrightsFlow';
import { DEFAULT_BATCH_SIZE, DEFAULT_CONCURRENCY, DEFAULT_ERROR_THRESHOLD, runVolumetryForSession } from '../runner/volumetryRunner';
import { generateReportFromFiles } from '../reporting/generateReport';
import { ensureSessionDir, saveSession, savePoolFiles } from '../session/sessionStore';
import { confirmProduction, confirmSimNao } from './shared/prompts';

dotenv.config();

interface SessionPlan {
  label: string;
  totalBets: number;
  betAmount: number;
}

/** O rótulo vira nome de pasta em .sessions/ — nada de barras, espaços ou "..". */
const VALID_LABEL = /^[\w-]+$/;

async function main() {
  console.log('=== Assistente de Configuração — Teste de Volumetria siteSportsbook ===\n');

  // Lote, concorrência e threshold vêm do .env (validados) — os mesmos do test:volumetry.
  // minPerCategory fica de fora de propósito: cada sessão do wizard tem seu próprio pool,
  // e exigir cobertura de toda categoria derrubaria sessões sem outrights/ao vivo.
  const settings = readExecutionSettings();

  const { environment } = await prompts({
    type: 'text',
    name: 'environment',
    message: 'Qual ambiente você quer validar? Digite "prod" ou "preprod":',
    validate: (v: string) => ['prod', 'preprod'].includes(v.trim().toLowerCase()) || 'Digite exatamente "prod" ou "preprod".',
    format: (v: string) => v.trim().toLowerCase(),
  });
  if (!environment) {
    console.log('Cancelado.');
    return;
  }

  const sessions: SessionPlan[] = [];
  let addMore = true;
  let sessionCount = 0;

  while (addMore) {
    sessionCount++;
    console.log(`\n--- Configurando sessão #${sessionCount} ---`);

    const creds = await prompts([
      { type: 'text', name: 'username', message: 'CPF/usuário siteSportsbook:' },
      { type: 'password', name: 'password', message: 'Senha:' },
    ]);
    if (!creds.username || !creds.password) {
      console.log('Login cancelado — encerrando o assistente.');
      break;
    }

    console.log('Autenticando...');
    let outcome;
    try {
      outcome = await performLogin(environment, creds.username, creds.password);
    } catch (err: any) {
      console.error(`Login falhou: ${err.message}`);
      const retry = await confirmSimNao('Tentar de novo?', true);
      if (retry) {
        sessionCount--;
        continue;
      }
      break;
    }
    console.log('Login OK.');

    const { label } = await prompts({
      type: 'text',
      name: 'label',
      message: 'Rótulo para essa sessão (ex: usuario1):',
      initial: `usuario${sessionCount}`,
      validate: (v: string) => VALID_LABEL.test(v.trim()) || 'Use só letras, números, hífen ou sublinhado.',
    });
    const sessionLabel = (label || `usuario${sessionCount}`).trim();

    saveSession(sessionLabel, environment, outcome);
    const dir = ensureSessionDir(sessionLabel);

    const { fixturesInput } = await prompts({
      type: 'text',
      name: 'fixturesInput',
      message: 'IDs ou URLs das partidas para essa sessão (separados por espaço):',
    });
    const inputs = (fixturesInput ?? '').trim().split(/\s+/).filter(Boolean);

    if (inputs.length === 0) {
      console.warn('Nenhuma fixture informada — essa sessão vai falhar ao gerar apostas até você rodar o fetch de fixtures manualmente.');
    } else {
      console.log('Buscando fixtures...');
      const { fixtures, liveFixtures, falhas } = await fetchFixturesForInputs(inputs, environment);
      savePoolFiles(dir, { fixtures, liveFixtures });
      console.log(
        `${fixtures.length} fixtures pré-jogo, ${liveFixtures.length} ao vivo salvas para "${sessionLabel}".${falhas.length > 0 ? ` (${falhas.length} falharam)` : ''}`,
      );
    }

    const wantsOutrights = await confirmSimNao('Incluir mercados de Aposta Futura (outrights) nessa sessão?', false);

    if (wantsOutrights) {
      console.log('Buscando mercados de outright (primeiro torneio/mercado ativo disponível)...');
      const seasonMarkets = await fetchFirstSeasonMarket(environment);
      fs.writeFileSync(path.join(dir, 'seasonMarkets.json'), JSON.stringify(seasonMarkets, null, 2));
      if (seasonMarkets.length > 0) {
        console.log(`Mercado selecionado para "${sessionLabel}": "${seasonMarkets[0].marketName}" (${seasonMarkets[0].tournamentName}).`);
      } else {
        console.warn('Nenhum mercado ativo encontrado em /v1/outrights no momento.');
      }
    }

    const { totalBets } = await prompts({
      type: 'number',
      name: 'totalBets',
      message: `Quantas apostas a sessão "${sessionLabel}" deve gerar?`,
      initial: 1000,
      min: 1,
    });

    const { betAmount } = await prompts({
      type: 'number',
      name: 'betAmount',
      message: 'Valor de cada aposta (R$):',
      initial: 0.5,
      float: true,
      round: 2,
      min: 0.01,
    });

    sessions.push({ label: sessionLabel, totalBets: totalBets ?? 0, betAmount: betAmount ?? 0.5 });

    addMore = await confirmSimNao('Deseja configurar outra sessão de usuário?', false);
  }

  if (sessions.length === 0) {
    console.log('\nNenhuma sessão configurada. Encerrando sem rodar nada.');
    return;
  }

  console.log('\n=== Resumo da execução ===');
  console.log(`Ambiente: ${environment.toUpperCase()}`);
  let grandTotalBets = 0;
  let grandTotalValue = 0;
  for (const s of sessions) {
    const subtotal = estimateMaxStake(s.totalBets, s.betAmount);
    grandTotalBets += s.totalBets;
    grandTotalValue += subtotal;
    console.log(`  ${s.label}: ${s.totalBets} apostas × R$${s.betAmount.toFixed(2)} = R$${subtotal.toFixed(2)}`);
  }
  console.log(`  TOTAL: ${grandTotalBets} apostas, R$${grandTotalValue.toFixed(2)} em jogo`);
  console.log(
    `  Execução: lote ${settings.batchSize ?? `até ${DEFAULT_BATCH_SIZE}`}, concorrência ${settings.concurrency ?? DEFAULT_CONCURRENCY} por sessão, ` +
      `aborta com taxa de erro > ${((settings.errorThreshold ?? DEFAULT_ERROR_THRESHOLD) * 100).toFixed(2)}% ou HTTP 401`,
  );
  try {
    assertWithinStakeLimit(grandTotalValue, settings.maxTotalValue);
  } catch (err: any) {
    console.error(`\n${err.message}`);
    console.log('Execução cancelada. As sessões configuradas continuam salvas em .sessions/ para uso posterior.');
    process.exitCode = 1;
    return;
  }
  // Em produção, "s" não basta: é preciso digitar PROD (evita confirmar no automático).
  const confirmStart =
    environment === 'prod'
      ? await confirmProduction(`${grandTotalBets} apostas, até R$${grandTotalValue.toFixed(2)} em jogo.`, [])
      : await confirmSimNao('\nConfirma o início da execução?', false);

  if (!confirmStart) {
    console.log('Execução cancelada. As sessões configuradas continuam salvas em .sessions/ para uso posterior.');
    return;
  }

  console.log(`\nIniciando ${sessions.length} sessão(ões) em paralelo...\n`);

  const resultsPaths = await Promise.all(
    sessions.map((s) =>
      runVolumetryForSession({
        sessionLabel: s.label,
        environment,
        totalBets: s.totalBets,
        betAmount: s.betAmount,
        batchSize: settings.batchSize,
        concurrency: settings.concurrency,
        errorThreshold: settings.errorThreshold,
      }).catch((err) => {
        console.error(`[${s.label}] Falhou: ${err.message}`);
        return null;
      }),
    ),
  );

  const validResultsPaths = resultsPaths.filter((p): p is string => p !== null);

  if (validResultsPaths.length === 0) {
    console.error('\nNenhuma sessão gerou resultados — não há o que reportar.');
    return;
  }

  console.log('\nTodas as sessões finalizadas. Gerando relatório consolidado...');
  const reportPath = generateReportFromFiles(validResultsPaths);
  console.log(`\nRelatório disponível em: ${reportPath}`);
}

main().catch((err) => {
  console.error('Erro fatal no assistente:', err);
  process.exit(1);
});
