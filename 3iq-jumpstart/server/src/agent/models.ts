import type { ModelCatalog, ModelInfo } from '@3iq/shared'

/**
 * Approved model deployments, from MODEL_DEPLOYMENTS="deployment[:Label],..."
 * The deployment named by MODEL_DEPLOYMENT_NAME is always included and is the default.
 */
export function getDefaultModel(): string {
  return process.env.MODEL_DEPLOYMENT_NAME!
}

export function getModelCatalog(): ModelCatalog {
  const models: ModelInfo[] = []
  const add = (id: string, label?: string) => {
    if (id && !models.some(m => m.id === id)) models.push({ id, label: label || id })
  }

  const def = getDefaultModel()
  for (const entry of (process.env.MODEL_DEPLOYMENTS ?? '').split(',')) {
    const [id, ...rest] = entry.split(':')
    add(id.trim(), rest.join(':').trim())
  }
  add(def)

  return { default: def, models }
}

export function isApprovedModel(id: string): boolean {
  return getModelCatalog().models.some(m => m.id === id)
}
