/**
 * Login — pergunta usuário/senha na hora (nada é salvo em disco) e grava só
 * o TOKEN resultante em .sessions/<label>/session.json (git-ignored).
 *
 * Uso: npm run login
 */
import * as dotenv from 'dotenv';
import prompts from 'prompts';
import { getDefaultEnvironmentName } from '../config/environments';
import { performLogin } from '../flows/loginFlow';
import { saveSession } from '../session/sessionStore';

dotenv.config();

async function main() {
  const environment = getDefaultEnvironmentName();

  const answers = await prompts([
    { type: 'text', name: 'username', message: 'CPF/usuário siteSportsbook:' },
    { type: 'password', name: 'password', message: 'Senha:' },
    { type: 'text', name: 'label', message: 'Rótulo para essa sessão:', initial: 'default' },
  ]);

  if (!answers.username || !answers.password) {
    console.error('Login cancelado — usuário/senha não informados.');
    process.exit(1);
  }

  try {
    const outcome = await performLogin(environment, answers.username, answers.password);
    const sessionPath = saveSession(answers.label || 'default', environment, outcome);
    console.log(`Login OK. Token salvo em ${sessionPath} (git-ignored).`);
    console.log('A senha NÃO foi salva em nenhum arquivo.');
  } catch (err: any) {
    console.error(`Login falhou: ${err.message}`);
    process.exit(1);
  }
}

main();
