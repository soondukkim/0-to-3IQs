import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setupObservability } from './observability/tracer.js'

// .env lives at the monorepo root
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') })
setupObservability()
