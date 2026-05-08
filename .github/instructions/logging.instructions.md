---
description: "Use when adding logging, debug output, console.log, or any observability/tracing statements. Covers logger setup, log levels, and structured logging patterns with pino."
applyTo: "**/*.ts"
---
# Logging with Pino

Always use the shared pino logger from `@/lib/logger` — never use `console.log`, `console.warn`, `console.error`, or `console.debug` directly.

## Import

```ts
import logger from "@/lib/logger";
```

## Default Log Level

Use `logger.debug(...)` by default unless the message is a genuine warning or error.

| Level | When to use |
|-------|-------------|
| `debug` | Diagnostic info, prompts, AI inputs/outputs, pipeline steps, resolved values |
| `info` | Significant lifecycle events visible in production (server start, cache rebuild) |
| `warn` | Recoverable unexpected states |
| `error` | Unrecoverable failures (always include the error object) |

## Structured Logging Pattern

Pass a data object as the first argument, message string as the second:

```ts
// ✅ correct — structured
logger.debug({ userId, resolvedNames }, "Resolved character names");
logger.error({ err, storagePath }, "Storage upload failed");

// ❌ wrong — unstructured string concatenation
logger.debug(`Resolved: ${resolvedNames}`);
console.log("Resolved:", resolvedNames);
```

## Level Control

The `LOG_LEVEL` environment variable controls the minimum level at runtime.

```env
# .env.local
LOG_LEVEL=debug   # show all debug output locally
LOG_LEVEL=info    # default for production
```

Output is plain JSON (pino default). To get pretty output in development, pipe the dev server:

```sh
npm run dev | npx pino-pretty
```

The logger is defined in `lib/logger.ts` — do not create additional pino instances. Do NOT add a `transport` option — pino-pretty worker threads are incompatible with Next.js bundling.
