"use client"

import type React from "react"

import { useState } from "react"
import { productsDB, saveProductsToStorage, loadProductsFromStorage, type Product } from "@/lib/products"

export default function ImportExport() {
  const [importing, setImporting] = useState(false)
  const [importedData, setImportedData] = useState<Record<string, Product> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)

    try {
      // For now, we'll use a simple CSV parser
      // In production, you'd use a library like 'xlsx' for Excel files
      const text = await file.text()
      const lines = text.split("\n")
      const headers = lines[0].split(",").map((h) => h.trim())

      const products: Record<string, Product> = {}

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const values = line.split(",").map((v) => v.trim())
        const productKey = values[0]?.toLowerCase().replace(/\s+/g, "_")

        if (!productKey) continue

        products[productKey] = {
          name: values[0] || "",
          icon: values[1] || "🍜",
          duration: Number.parseFloat(values[2]) || 2,
          zone: values[3] || "Zona de Cocción",
          tools: values[4]?.split(";").map((t) => t.trim()) || [],
          storage: {
            name: values[5] || "Heladera",
            capacity: Number.parseInt(values[6]) || 20,
            conditions: values[7] || undefined,
          },
          unitsPerBatch: Number.parseInt(values[8]) || 10,
          stockMin: Number.parseInt(values[9]) || 5,
          shelfLife: Number.parseInt(values[10]) || 7,
          frequency: (values[11] as any) || "weekly",
          preferredDay: values[12] || undefined,
          ingredients: values[13]?.split(";").map((i) => i.trim()) || [],
          notes: values[14] || undefined,
        }
      }

      setImportedData(products)
    } catch (err) {
      setError("Error al procesar el archivo. Verifica el formato.")
      console.error(err)
    } finally {
      setImporting(false)
    }
  }

  const handleImport = () => {
    if (importedData) {
      saveProductsToStorage(importedData)
      alert("Productos importados exitosamente!")
      setImportedData(null)
    }
  }

  const handleExport = () => {
    const products = loadProductsFromStorage()
    const headers = [
      "Nombre",
      "Icono",
      "Duración (h)",
      "Zona",
      "Herramientas",
      "Almacenamiento",
      "Capacidad",
      "Condiciones",
      "Unidades/Lote",
      "Stock Mínimo",
      "Vida Útil (días)",
      "Frecuencia",
      "Día Preferido",
      "Ingredientes",
      "Notas",
    ]

    const rows = Object.values(products).map((p) => [
      p.name,
      p.icon,
      p.duration,
      p.zone,
      p.tools.join(";"),
      p.storage.name,
      p.storage.capacity,
      p.storage.conditions || "",
      p.unitsPerBatch,
      p.stockMin,
      p.shelfLife,
      p.frequency,
      p.preferredDay || "",
      p.ingredients?.join(";") || "",
      p.notes || "",
    ])

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "shoronpo_productos.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    if (confirm("¿Estás seguro de que quieres restaurar los productos por defecto?")) {
      saveProductsToStorage(productsDB)
      alert("Productos restaurados!")
    }
  }

  return (
    <div className="space-y-6">
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          IMPORTAR PRODUCTOS
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Sube un archivo CSV con tus productos. El formato debe incluir: Nombre, Icono, Duración, Zona, Herramientas,
          Almacenamiento, Capacidad, Condiciones, Unidades/Lote, Stock Mínimo, Vida Útil, Frecuencia, Día Preferido,
          Ingredientes, Notas.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block mb-2">
              <span className="bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white px-6 py-3 rounded-xl cursor-pointer inline-block hover:shadow-lg transition-all">
                {importing ? "Procesando..." : "Seleccionar archivo CSV"}
              </span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={importing}
              />
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          {importedData && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-800 font-bold mb-2">
                {Object.keys(importedData).length} productos listos para importar
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(importedData).map(([key, product]) => (
                  <div key={key} className="bg-white p-3 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{product.icon}</span>
                      <div>
                        <div className="font-bold text-sm">{product.name}</div>
                        <div className="text-xs text-gray-600">
                          {product.duration}h • {product.zone} • Stock mín: {product.stockMin}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleImport}
                className="mt-4 w-full bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 transition-colors font-bold"
              >
                Confirmar Importación
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          EXPORTAR PRODUCTOS
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Descarga tus productos actuales en formato CSV para editarlos o hacer backup.
        </p>
        <button
          onClick={handleExport}
          className="bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all font-bold"
        >
          Descargar CSV
        </button>
      </div>

      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          RESTAURAR PRODUCTOS
        </h3>
        <p className="text-sm text-gray-600 mb-4">Vuelve a los productos por defecto del sistema.</p>
        <button
          onClick={handleReset}
          className="bg-gray-600 text-white px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors font-bold"
        >
          Restaurar Productos por Defecto
        </button>
      </div>

      <div className="modern-card p-6 bg-blue-50 border-2 border-blue-200">
        <h4 className="font-bold text-blue-900 mb-2">Formato del archivo CSV</h4>
        <p className="text-sm text-blue-800 mb-3">Tu archivo debe tener estas columnas en este orden:</p>
        <div className="bg-white p-3 rounded-lg border border-blue-200 text-xs font-mono overflow-x-auto">
          <div className="whitespace-nowrap">
            Nombre,Icono,Duración (h),Zona,Herramientas,Almacenamiento,Capacidad,Condiciones,Unidades/Lote,Stock
            Mínimo,Vida Útil (días),Frecuencia,Día Preferido,Ingredientes,Notas
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Nota: Separa múltiples herramientas o ingredientes con punto y coma (;)
        </p>
      </div>
    </div>
  )
}
