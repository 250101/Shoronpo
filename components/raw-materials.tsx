"use client"

import { useState, useEffect } from "react"
import {
  loadRawMaterialsFromStorage,
  updateMaterialStock,
  addRawMaterial,
  calculateMaterialNeeds,
  type RawMaterial,
  type MaterialRequirement,
} from "@/lib/raw-materials"

export default function RawMaterials() {
  const [materials, setMaterials] = useState<Record<string, RawMaterial>>({})
  const [shoppingList, setShoppingList] = useState<MaterialRequirement[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const [newMaterial, setNewMaterial] = useState<Partial<RawMaterial>>({
    name: "",
    category: "otro",
    unit: "kg",
    currentStock: 0,
    minStock: 0,
    costPerUnit: 0,
    supplier: "",
    notes: "",
  })

  useEffect(() => {
    const loaded = loadRawMaterialsFromStorage()
    setMaterials(loaded)
  }, [])

  const calculateShoppingList = () => {
    const weeklyPlan = localStorage.getItem("shoronpo_weekly_plan")
    if (!weeklyPlan) {
      alert("No hay plan semanal guardado. Genera un plan primero en la sección Semanal.")
      return
    }

    const plan = JSON.parse(weeklyPlan)
    const production: { productKey: string; batches: number }[] = []

    // Extraer producción de cada día
    Object.values(plan).forEach((day: any) => {
      if (day.products) {
        day.products.forEach((p: any) => {
          const existing = production.find((prod) => prod.productKey === p.productKey)
          if (existing) {
            existing.batches += p.batches
          } else {
            production.push({ productKey: p.productKey, batches: p.batches })
          }
        })
      }
    })

    const needs = calculateMaterialNeeds(production)
    setShoppingList(needs)
  }

  const handleStockUpdate = (materialId: string, newStock: number) => {
    const updated = updateMaterialStock(materialId, newStock)
    setMaterials(updated)
  }

  const handleAddMaterial = () => {
    if (!newMaterial.name || !newMaterial.id) {
      alert("Por favor completa al menos el ID y nombre del material")
      return
    }

    const material: RawMaterial = {
      id: newMaterial.id!,
      name: newMaterial.name!,
      category: newMaterial.category as any,
      unit: newMaterial.unit as any,
      currentStock: newMaterial.currentStock || 0,
      minStock: newMaterial.minStock || 0,
      costPerUnit: newMaterial.costPerUnit || 0,
      supplier: newMaterial.supplier,
      notes: newMaterial.notes,
    }

    const updated = addRawMaterial(material)
    setMaterials(updated)
    setShowAddForm(false)
    setNewMaterial({
      name: "",
      category: "otro",
      unit: "kg",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
      supplier: "",
      notes: "",
    })
  }

  const categories = ["all", "proteina", "vegetal", "condimento", "masa", "liquido", "otro"]
  const filteredMaterials = Object.values(materials).filter(
    (m) => selectedCategory === "all" || m.category === selectedCategory,
  )

  const totalCost = shoppingList.reduce((sum, item) => sum + item.estimatedCost, 0)
  const criticalMaterials = Object.values(materials).filter((m) => m.currentStock < m.minStock)

  return (
    <div className="space-y-6">
      {criticalMaterials.length > 0 && (
        <div className="modern-card p-6 border-l-4 border-red-500 bg-red-50">
          <h3 className="font-bold text-red-800 mb-2">⚠️ Materiales con Stock Crítico</h3>
          <div className="space-y-1">
            {criticalMaterials.map((m) => (
              <div key={m.id} className="text-sm text-red-700">
                <span className="font-bold">{m.name}</span>: {m.currentStock} {m.unit} (mínimo: {m.minStock} {m.unit})
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="modern-card p-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={calculateShoppingList}
            className="px-6 py-3 bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white rounded-xl font-bold hover:shadow-lg transition-all"
          >
            📋 Calcular Lista de Compras
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-white border-2 border-[#3a4a9f] text-[#3a4a9f] rounded-xl font-bold hover:bg-[#3a4a9f] hover:text-white transition-all"
          >
            ➕ Agregar Material
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="modern-card p-6">
          <h3 className="font-['Libre_Baskerville'] text-xl text-[#1f2960] mb-4 font-bold">Nuevo Material</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="ID (ej: harina_trigo)"
              value={newMaterial.id || ""}
              onChange={(e) => setNewMaterial({ ...newMaterial, id: e.target.value })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
            <input
              type="text"
              placeholder="Nombre"
              value={newMaterial.name}
              onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
            <select
              value={newMaterial.category}
              onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value as any })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            >
              <option value="proteina">Proteína</option>
              <option value="vegetal">Vegetal</option>
              <option value="condimento">Condimento</option>
              <option value="masa">Masa</option>
              <option value="liquido">Líquido</option>
              <option value="otro">Otro</option>
            </select>
            <select
              value={newMaterial.unit}
              onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value as any })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            >
              <option value="kg">Kilogramos</option>
              <option value="litros">Litros</option>
              <option value="unidades">Unidades</option>
              <option value="gramos">Gramos</option>
            </select>
            <input
              type="number"
              placeholder="Stock actual"
              value={newMaterial.currentStock}
              onChange={(e) => setNewMaterial({ ...newMaterial, currentStock: Number.parseFloat(e.target.value) })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
            <input
              type="number"
              placeholder="Stock mínimo"
              value={newMaterial.minStock}
              onChange={(e) => setNewMaterial({ ...newMaterial, minStock: Number.parseFloat(e.target.value) })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
            <input
              type="number"
              placeholder="Costo por unidad (€)"
              value={newMaterial.costPerUnit}
              onChange={(e) => setNewMaterial({ ...newMaterial, costPerUnit: Number.parseFloat(e.target.value) })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
            <input
              type="text"
              placeholder="Proveedor"
              value={newMaterial.supplier}
              onChange={(e) => setNewMaterial({ ...newMaterial, supplier: e.target.value })}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] outline-none"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAddMaterial}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
            >
              Guardar
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {shoppingList.length > 0 && (
        <div className="modern-card p-6">
          <h3 className="font-['Libre_Baskerville'] text-xl text-[#1f2960] mb-4 font-bold">
            📋 LISTA DE COMPRAS SEMANAL
          </h3>
          <div className="space-y-3">
            {shoppingList.map((item) => (
              <div
                key={item.materialId}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-white rounded-lg border border-blue-200"
              >
                <div className="flex-1">
                  <div className="font-bold text-gray-800">{item.materialName}</div>
                  <div className="text-sm text-gray-600">
                    Necesario: {item.quantityNeeded.toFixed(2)} {item.unit} | Stock actual: {item.currentStock}{" "}
                    {item.unit}
                  </div>
                </div>
                {item.toBuy > 0 && (
                  <div className="text-right">
                    <div className="font-bold text-red-600">
                      Comprar: {item.toBuy} {item.unit}
                    </div>
                    <div className="text-sm text-gray-600">€{item.estimatedCost.toFixed(2)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t-2 border-gray-300">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">COSTO TOTAL ESTIMADO:</span>
              <span className="font-bold text-2xl text-[#3a4a9f]">€{totalCost.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="modern-card p-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                selectedCategory === cat ? "bg-[#3a4a9f] text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {cat === "all" ? "Todos" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl text-[#1f2960] mb-4 font-bold">
          📦 INVENTARIO DE MATERIA PRIMA
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((material) => {
            const stockPercentage = (material.currentStock / material.minStock) * 100
            const isLow = material.currentStock < material.minStock
            const isCritical = material.currentStock < material.minStock * 0.5

            return (
              <div
                key={material.id}
                className={`p-4 rounded-xl border-2 ${
                  isCritical
                    ? "border-red-500 bg-red-50"
                    : isLow
                      ? "border-yellow-500 bg-yellow-50"
                      : "border-green-500 bg-green-50"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{material.name}</div>
                    <div className="text-xs text-gray-600 capitalize">{material.category}</div>
                  </div>
                  <div
                    className={`text-2xl ${isCritical ? "text-red-600" : isLow ? "text-yellow-600" : "text-green-600"}`}
                  >
                    {isCritical ? "🔴" : isLow ? "🟡" : "🟢"}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Stock actual</span>
                    <span className="font-bold">
                      {material.currentStock} {material.unit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isCritical ? "bg-red-500" : isLow ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Mínimo: {material.minStock} {material.unit}
                  </div>
                </div>

                <div className="space-y-1 text-xs text-gray-600 mb-3">
                  <div>
                    Costo: €{material.costPerUnit}/{material.unit}
                  </div>
                  {material.supplier && <div>Proveedor: {material.supplier}</div>}
                </div>

                <input
                  type="number"
                  value={material.currentStock}
                  onChange={(e) => handleStockUpdate(material.id, Number.parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-[#3a4a9f] outline-none"
                  placeholder="Actualizar stock"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
