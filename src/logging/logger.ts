/**
 * Logger de console com timestamp ISO e nível — facilita cruzar o que a suíte
 * imprimiu com os logs do servidor. O registro detalhado de cada aposta
 * continua no NDJSON da sessão; isto aqui é só o acompanhamento ao vivo.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

function format(level: string, prefix: string | undefined, message: string): string {
  return `${new Date().toISOString()} ${level.padEnd(5)} ${prefix ? `[${prefix}] ` : ''}${message}`;
}

export function createLogger(prefix?: string): Logger {
  return {
    info: (message) => console.log(format('INFO', prefix, message)),
    warn: (message) => console.warn(format('WARN', prefix, message)),
    error: (message) => console.error(format('ERROR', prefix, message)),
  };
}
