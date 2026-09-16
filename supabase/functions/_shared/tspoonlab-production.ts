import { TspoonlabError } from './tspoonlab-client.ts'

type R = Record<string, unknown>
const obj = (v: unknown, label: string): R => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  return v as R
}
const text = (v: unknown, label: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  return v.trim()
}
const optText = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
const num = (v: unknown, label: string) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw new TspoonlabError(`${label} invalido`, 'INVALID_RESPONSE')
  return n
}
const date = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v as string | number)
  // tSpoonLab mezcla timestamps con textos localizados como "mié, 31-dic-2025".
  // Esos textos no son parseables de forma fiable: se conservan como ausencia.
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function mapProduction(detailInput: unknown, runId: string) {
  const d = obj(detailInput, 'produccion')
  const status = d.status && typeof d.status === 'object' ? d.status as R : {}
  const service = Array.isArray(d.listComponentService) ? obj(d.listComponentService[0] ?? {}, 'servicio') : {}
  return {
    external_id: text(d.id, 'id'), component_external_id: text(d.idComponent, 'idComponent'),
    description: text(d.descr, 'descr'), generated_at: date(d.date ?? d.dateGeneratedFlat), lot: optText(d.lot),
    store_external_id: optText(d.idStore), store_name: optText(d.store), unit_external_id: optText(service.idUnit ?? d.idUnit),
    unit_name: optText(service.unit ?? d.unit), planned_quantity: num(service.quantity, 'quantity'), actual_quantity: num(service.quantityReal, 'quantityReal'),
    is_started: status.started === true, is_done: status.done === true, is_closed: d.closed === true,
    source_updated_at: date(d.lastModified), last_run_id: runId, synced_at: new Date().toISOString(),
  }
}

export function mapProductionIngredients(detailInput: unknown, runId: string) {
  const d = obj(detailInput, 'produccion')
  const productionId = text(d.id, 'id')
  if (!Array.isArray(d.listComponentDetail)) throw new TspoonlabError('ingredientes invalidos', 'INVALID_RESPONSE')
  return d.listComponentDetail.map(value => {
    const x = obj(value, 'ingrediente')
    return {
      production_external_id: productionId, line_external_id: text(x.id, 'linea.id'), component_external_id: text(x.idComponent, 'linea.idComponent'),
      description: text(x.descr, 'linea.descr'), planned_quantity: num(x.quantity, 'linea.quantity'), actual_quantity: num(x.quantityReal, 'linea.quantityReal'),
      unit_external_id: optText(x.idUnit), unit_name: optText(x.unit), store_external_id: optText(x.idStore), store_name: optText(x.store),
      store_quantity: num(x.quantityStore, 'linea.quantityStore'), last_run_id: runId, synced_at: new Date().toISOString(),
    }
  })
}
