import assert from 'node:assert/strict'
import test from 'node:test'
import { mapStockRow } from './tspoonlab-stock.ts'

const store = { id: 'store-1', descr: 'Materia Prima' }
const base = { idStore: 'store-1', store: 'Materia Prima', idComponent: 'p-1', descr: 'Harina', unit: 'kg', idUnit: 'kg-id' }

test('calcula total conservando los componentes originales', () => {
  const row = mapStockRow(store, { ...base, quantityInventory: 10, quantityInput: 3, quantityOutput: -4 }, 'run-1', '2026-09-16T00:00:00Z')
  assert.equal(row.quantity_total, 9)
  assert.equal(row.quantity_inventory, 10)
  assert.equal(row.quantity_output, -4)
})

test('trata null como ausencia y totaliza con cero', () => {
  const row = mapStockRow(store, { ...base, quantityInventory: null, quantityInput: 2, quantityOutput: null }, 'run-1', '2026-09-16T00:00:00Z')
  assert.equal(row.quantity_total, 2)
  assert.equal(row.quantity_inventory, null)
})

test('rechaza identificadores, nombres y cantidades invalidas', () => {
  assert.throws(() => mapStockRow(store, { ...base, idComponent: null }, 'run-1', 'x'), /idComponent/)
  assert.throws(() => mapStockRow(store, { ...base, quantityInput: 'no-numero' }, 'run-1', 'x'), /quantityInput/)
})

