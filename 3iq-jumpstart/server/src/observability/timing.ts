import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import type { FastifyBaseLogger } from 'fastify'

const tracer = trace.getTracer('3iq-server')

/** Runs fn inside an OpenTelemetry span (a no-op without an SDK) and logs its duration. */
export async function timed<T>(
  log: FastifyBaseLogger,
  step: string,
  attrs: Attributes,
  fn: () => Promise<T>
): Promise<T> {
  const started = performance.now()
  return tracer.startActiveSpan(step, { attributes: attrs }, async span => {
    try {
      const result = await fn()
      log.info({ step, durationMs: Math.round(performance.now() - started), ...attrs }, `${step} done`)
      return result
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) })
      log.warn({ step, durationMs: Math.round(performance.now() - started), failed: true, ...attrs }, `${step} failed`)
      throw err
    } finally {
      span.end()
    }
  })
}
