/**
 * OpenTelemetry SDK initialization — must be imported BEFORE any other module.
 *
 * Set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://jaeger:4318) to enable export.
 * If the env var is absent, the SDK initialises with a no-op exporter (zero overhead).
 *
 * Usage in server.ts (very first line):
 *   import './instrumentation.js';
 *
 * Trace ID propagation:
 *   - All incoming HTTP requests get a trace span via @opentelemetry/auto-instrumentations-node.
 *   - BullMQ workers should read context.active() and call propagator.inject() when enqueueing.
 *   - The helper `getTraceId()` below returns the active trace ID for embedding in job payloads.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, propagation } from '@opentelemetry/api';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
  ...({
    resourceAttributes: {
      'service.name': process.env.OTEL_SERVICE_NAME ?? 'aiseo-api',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    },
  } as any),
  traceExporter: OTEL_ENDPOINT
    ? new OTLPTraceExporter({ url: `${OTEL_ENDPOINT}/v1/traces` })
    : undefined,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations that add little value
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

// Start SDK; errors are non-fatal (OTel is purely observational).
try {
  sdk.start();
} catch (err) {
  console.warn('[OTel] SDK start failed (tracing disabled):', err);
}

// Graceful shutdown — flush pending spans on process exit.
process.on('SIGTERM', async () => {
  try { await sdk.shutdown(); } catch { /* ignore */ }
});

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Returns the current active trace ID (hex string) or `undefined` when there
 * is no active span. Use this to embed traceId in BullMQ job data for
 * correlation across process boundaries.
 */
export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return ctx.traceId !== '00000000000000000000000000000000' ? ctx.traceId : undefined;
}

/**
 * Injects W3C traceparent header into a plain object (mutates `carrier`).
 * Call this before passing headers to external HTTP clients so trace context
 * is propagated across service boundaries (SEMrush, Gemini, SERP APIs, etc.).
 *
 * @example
 * const headers: Record<string, string> = {};
 * injectTraceContext(headers);
 * fetch(url, { headers });
 */
export function injectTraceContext(carrier: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), carrier);
  return carrier;
}
