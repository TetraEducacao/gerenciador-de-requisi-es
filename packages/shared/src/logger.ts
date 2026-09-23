/**
 * Structured logger utility for consistent logging across services.
 * Uses console with structured output; can be replaced with Winston/Pino later.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: Error;
  requestId?: string;
  correlationId?: string;
}

class Logger {
  private minLevel: LogLevel;
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
    const env = process.env.NODE_ENV || 'development';
    this.minLevel = env === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(entry: LogEntry): string {
    const sanitized = this.sanitizeData(entry.data);
    const errorStr = entry.error ? `\n${entry.error.stack}` : '';
    const dataStr = sanitized && Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : '';

    const parts = [
      entry.timestamp,
      `[${entry.level}]`,
      entry.context,
      entry.message,
      dataStr,
      errorStr,
    ].filter(Boolean);

    return parts.join(' ');
  }

  private sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;

    const sanitized = { ...data };
    const secretPatterns = [
      'password',
      'secret',
      'token',
      'key',
      'auth',
      'api_key',
      'apiKey',
      'accessToken',
      'refreshToken',
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (secretPatterns.some((pattern) => lowerKey.includes(pattern))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private logRaw(entry: LogEntry): void {
    const output = this.format(entry);
    const console_fn = {
      [LogLevel.DEBUG]: console.debug,
      [LogLevel.INFO]: console.info,
      [LogLevel.WARN]: console.warn,
      [LogLevel.ERROR]: console.error,
    }[entry.level];

    console_fn(output);
  }

  debug(message: string, data?: Record<string, unknown>, requestId?: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    this.logRaw({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context: this.context,
      data,
      requestId,
    });
  }

  info(message: string, data?: Record<string, unknown>, requestId?: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    this.logRaw({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context: this.context,
      data,
      requestId,
    });
  }

  warn(message: string, data?: Record<string, unknown>, requestId?: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    this.logRaw({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context: this.context,
      data,
      requestId,
    });
  }

  error(message: string, error?: Error, data?: Record<string, unknown>, requestId?: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    this.logRaw({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context: this.context,
      data,
      error,
      requestId,
    });
  }

  child(context: string): Logger {
    const child = new Logger(`${this.context}:${context}`);
    child.minLevel = this.minLevel;
    return child;
  }
}

export default Logger;
