import pino from "pino";

/**
 * Shared application logger.
 *
 * Log level is controlled by the LOG_LEVEL environment variable.
 * Valid values: trace | debug | info | warn | error | fatal
 * Default: info
 *
 * Example .env.local:
 *   LOG_LEVEL=debug
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

export default logger;
