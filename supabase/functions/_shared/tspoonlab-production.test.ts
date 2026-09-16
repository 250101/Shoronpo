import assert from 'node:assert/strict'
import test from 'node:test'
import { mapProduction, mapProductionIngredients } from './tspoonlab-production.ts'

const detail = { id:'p1', idComponent:'c1', descr:'Salsa', date:1789510000000, closed:true, status:{started:true,done:true}, listComponentService:[{idUnit:'u1',unit:'kg',quantity:10,quantityReal:9}], listComponentDetail:[{id:'l1',idComponent:'i1',descr:'Tomate',quantity:5,quantityReal:4.5,idStore:'s1',store:'Materia Prima',quantityStore:20}] }

test('normaliza cabecera y cantidades de produccion', () => {
  const row=mapProduction(detail,'run1')
  assert.equal(row.external_id,'p1'); assert.equal(row.actual_quantity,9); assert.equal(row.is_done,true)
})

test('normaliza ingredientes consumidos', () => {
  const rows=mapProductionIngredients(detail,'run1')
  assert.equal(rows.length,1); assert.equal(rows[0].actual_quantity,4.5); assert.equal(rows[0].store_name,'Materia Prima')
})

test('rechaza formas incompletas', () => {
  assert.throws(()=>mapProduction({...detail,id:null},'run1'),/id invalido/)
  assert.throws(()=>mapProductionIngredients({...detail,listComponentDetail:null},'run1'),/ingredientes/)
})

