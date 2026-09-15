import { TspoonlabError } from './tspoonlab-client.ts'

type UnknownRecord = Record<string, unknown>

const object = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  }
  return value as UnknownRecord
}

const requiredText = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  }
  return value.trim()
}

const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

const optionalNumber = (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  return parsed
}

export function mapStockRow(storeInput: unknown, itemInput: unknown, runId: string, capturedAt: string) {
  const store = object(storeInput, 'almacen')
  const item = object(itemInput, 'existencia')
  const inventory = optionalNumber(item.quantityInventory, 'quantityInventory')
  const input = optionalNumber(item.quantityInput, 'quantityInput')
  const output = optionalNumber(item.quantityOutput, 'quantityOutput')

  return {
    run_id: runId,
    captured_at: capturedAt,
    store_external_id: requiredText(item.idStore ?? store.id, 'idStore'),
    store_name: requiredText(item.store ?? store.descr, 'store'),
    component_external_id: requiredText(item.idComponent, 'idComponent'),
    component_name: requiredText(item.descr, 'descr'),
    unit_external_id: optionalText(item.idUnit),
    unit_name: optionalText(item.unit),
    quantity_inventory: inventory,
    quantity_input: input,
    quantity_output: output,
    quantity_total: (inventory ?? 0) + (input ?? 0) + (output ?? 0),
    min_stock: optionalNumber(item.minStock, 'minStock'),
    max_stock: optionalNumber(item.maxStock, 'maxStock'),
    cost: optionalNumber(item.cost, 'cost'),
  }
}

