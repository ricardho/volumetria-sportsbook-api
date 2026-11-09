export type SettlementStatus =
  | 'ganhou'
  | 'perdeu'
  | 'devolvida'
  | 'cancelada'
  | 'pendente'
  | 'desconhecido'
  | 'nao_encontrada'
  | 'erro_consulta'
  | 'sem_id';

export interface SettlementEntry {
  sessionLabel?: string;
  correlationId: string;
  apostaId: number | string | null;
  codigoRetornado: string | null;
  tipo: string | null;
  marketName: string | null;
  gameName: string | null;
  valorAposta: number;
  resultadoFinal: SettlementStatus;
  valorRetorno: number | null;
  liquidadaEm: string | null;
  httpStatus: number | null;
  /** Preenchido quando o resultado contradiz o valor de retorno informado pela API */
  inconsistencia: string | null;
}
