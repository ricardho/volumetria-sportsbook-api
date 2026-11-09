/**
 * Classifica o tipo de erro a partir do texto retornado pela API. Hoje só
 * distingue "conflito de seleção" (Bet Builder rejeitado por correlação
 * entre mercados, ou por ultrapassar o limite de seleções) dos demais erros
 * — isso evita que esses "erros esperados" contaminem a taxa de erro real
 * (timeout, mercado suspenso, etc.) no relatório.
 *
 * ⚠️ O texto exato usado aqui foi observado na mensagem exibida na UI, não
 * confirmado no corpo JSON bruto da resposta da API. Se a categorização não
 * estiver batendo no relatório, ajuste de acordo com o campo "message" real.
 */
export function classifyErrorStatus(erroDetalhe: string | null): 'erro' | 'conflito_selecao' {
  if (!erroDetalhe) return 'erro';
  const texto = erroDetalhe.toLowerCase();
  if (texto.includes('conflito') || texto.includes('conflict')) return 'conflito_selecao';
  return 'erro';
}
