import prompts from 'prompts';

/**
 * Confirmação s/n em português. O tipo "confirm" nativo da lib prompts só
 * aceita as teclas y/n (inglês) mesmo com mensagem em português — isso
 * confundia quem digitava "s" e via a tela travar sem nenhum feedback.
 */
export async function confirmSimNao(message: string, defaultValue: boolean): Promise<boolean> {
  const { resposta } = await prompts({
    type: 'text',
    name: 'resposta',
    message: `${message} (s/n)`,
    initial: defaultValue ? 's' : 'n',
    validate: (v: string) => ['s', 'sim', 'n', 'nao', 'não'].includes(v.trim().toLowerCase()) || 'Digite "s" ou "n".',
  });
  if (resposta === undefined) return defaultValue; // Ctrl+C / cancelado
  return ['s', 'sim'].includes(resposta.trim().toLowerCase());
}

/** Flag que libera produção sem pergunta interativa (ex: execução agendada/CI). */
export const CONFIRM_PROD_FLAG = '--confirmar-prod';

/**
 * Exige confirmação explícita antes de apostar dinheiro real: em terminal
 * interativo, a pessoa digita "PROD"; fora dele, só segue com --confirmar-prod.
 * Retorna false se a execução não deve continuar.
 */
export async function confirmProduction(summary: string, argv: string[] = process.argv): Promise<boolean> {
  if (argv.includes(CONFIRM_PROD_FLAG)) return true;

  if (!process.stdin.isTTY) {
    console.error(`Ambiente é PRODUÇÃO e o terminal não é interativo. Rode com ${CONFIRM_PROD_FLAG} para confirmar: ${summary}`);
    return false;
  }

  console.log(`\n⚠️  PRODUÇÃO — dinheiro real será apostado.\n${summary}`);
  const { resposta } = await prompts({ type: 'text', name: 'resposta', message: 'Digite PROD para confirmar:' });
  return resposta?.trim() === 'PROD';
}
