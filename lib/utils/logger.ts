/**
 * Structured logger utility.
 * Routes to console in development, silenced in production.
 * Can be extended to route to external monitoring (Sentry, etc.) in the future.
 */

const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  error: (...args: unknown[]): void => {
    if (isDev) console.error(...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  info: (...args: unknown[]): void => {
    if (isDev) console.info(...args);
  },
};
