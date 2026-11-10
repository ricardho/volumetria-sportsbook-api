/**
 * Classifica o tipo de erro a partir do texto retornado pela API. Hoje só
 * distingue "conflito de seleção" (Bet Builder rejeitado por correlação
 * entre mercados, ou por ultrapassar o limite de seleções) dos demais erros
 * — esses "erros esperados" não contam para a taxa de erro que aborta a
 * sessão, nem contaminam a taxa de erro real (timeout, mercado suspenso,
 * etc.) no relatório.
 *
 * ⚠️ O texto exato usado aqui foi observado na mensagem exibida na UI, não
 * confirmado no corpo JSON bruto da resposta da API. Se a categorização não
 * estiver batendo no relatório, ajuste CONFLICT_PATTERNS de acordo com o
 * campo "message" real.
 */
export type ErrorStatus = 'erro' | 'conflito_selecao';

/** Trechos (sem acento, minúsculos) que identificam um conflito de seleções. */
export const CONFLICT_PATTERNS: readonly string[] = ['conflito', 'conflict'];

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function classifyErrorStatus(erroDetalhe: string | null): ErrorStatus {
  if (!erroDetalhe) return 'erro';
  const texto = normalize(erroDetalhe);
  return CONFLICT_PATTERNS.some((p) => texto.includes(p)) ? 'conflito_selecao' : 'erro';
}
