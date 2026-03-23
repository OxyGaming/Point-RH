/**
 * LogCollector — Traçabilité complète du moteur de simulation.
 *
 * Chaque décision du moteur (exclusion, violation, score, cascade)
 * doit produire une entrée de log. Aucune décision silencieuse.
 *
 * Usage :
 *   const logger = createLogger();
 *   logger.info('RULE_OK', { agentId: 'A1', jsId: 'JS42', data: { repos: 720 } });
 *   const entries = logger.all();
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  agentId?: string;
  jsId?: string;
  data?: Record<string, unknown>;
}

export class LogCollector {
  private readonly logs: LogEntry[] = [];

  private add(
    level: LogLevel,
    event: string,
    meta?: { agentId?: string; jsId?: string; data?: Record<string, unknown> }
  ): void {
    this.logs.push({ ts: new Date().toISOString(), level, event, ...meta });
  }

  debug(event: string, meta?: { agentId?: string; jsId?: string; data?: Record<string, unknown> }): void {
    this.add('DEBUG', event, meta);
  }

  info(event: string, meta?: { agentId?: string; jsId?: string; data?: Record<string, unknown> }): void {
    this.add('INFO', event, meta);
  }

  warn(event: string, meta?: { agentId?: string; jsId?: string; data?: Record<string, unknown> }): void {
    this.add('WARN', event, meta);
  }

  error(event: string, meta?: { agentId?: string; jsId?: string; data?: Record<string, unknown> }): void {
    this.add('ERROR', event, meta);
  }

  /** Toutes les entrées pour un agent donné (ou toutes si pas d'agentId) */
  forAgent(agentId: string): LogEntry[] {
    return this.logs.filter(l => !l.agentId || l.agentId === agentId);
  }

  /** Toutes les entrées pour une JS donnée */
  forJs(jsId: string): LogEntry[] {
    return this.logs.filter(l => !l.jsId || l.jsId === jsId);
  }

  /** Toutes les entrées (copie immuable) */
  all(): LogEntry[] {
    return [...this.logs];
  }

  /** Vide les logs — à appeler entre deux simulations si l'instance est réutilisée */
  reset(): void {
    this.logs.length = 0;
  }
}

/** Crée une nouvelle instance de LogCollector pour une simulation */
export function createLogger(): LogCollector {
  return new LogCollector();
}
