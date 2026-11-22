// Activates Azure Monitor telemetry only when APPLICATIONINSIGHTS_CONNECTION_STRING is set.
// Must run before fastify/http are imported, so it is loaded from instrument.ts.
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export function setupObservability(): void {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return

  try {
    const { useAzureMonitor } = require('@azure/monitor-opentelemetry')
    const { registerInstrumentations } = require('@opentelemetry/instrumentation')
    const { FastifyInstrumentation } = require('@opentelemetry/instrumentation-fastify')

    useAzureMonitor({
      azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      },
    })

    registerInstrumentations({
      instrumentations: [new FastifyInstrumentation()],
    })

    console.log('Azure Monitor telemetry enabled')
  } catch (err) {
    console.warn('Azure Monitor telemetry failed to start:', err)
  }
}
