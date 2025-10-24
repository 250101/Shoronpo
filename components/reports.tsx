"use client"

import { useState, useEffect } from "react"
import { loadProductsFromStorage } from "@/lib/products"

type ProductionRecord = {
  id: string
  date: string
  productKey: string
  productName: string
  quantity: number
  duration: number
  zone: string
}

type PeriodStats = {
  totalProductions: number
  totalUnits: number
  totalHours: number
  productBreakdown: { [key: string]: { name: string; quantity: number; count: number } }
  zoneUsage: { [key: string]: number }
}

export default function Reports() {
  const [period, setPeriod] = useState<"week" | "month">("week")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [history, setHistory] = useState<ProductionRecord[]>([])
  const [stats, setStats] = useState<PeriodStats | null>(null)

  useEffect(() => {
    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(today.getDate() - 7)

    setStartDate(weekAgo.toISOString().split("T")[0])
    setEndDate(today.toISOString().split("T")[0])
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      loadHistory()
    }
  }, [startDate, endDate])

  const loadHistory = () => {
    const savedHistory = localStorage.getItem("production_history")
    const allHistory: ProductionRecord[] = savedHistory ? JSON.parse(savedHistory) : []

    const filtered = allHistory.filter((record) => {
      const recordDate = new Date(record.date)
      const start = new Date(startDate)
      const end = new Date(endDate)
      return recordDate >= start && recordDate <= end
    })

    setHistory(filtered)
    calculateStats(filtered)
  }

  const calculateStats = (records: ProductionRecord[]) => {
    const stats: PeriodStats = {
      totalProductions: records.length,
      totalUnits: 0,
      totalHours: 0,
      productBreakdown: {},
      zoneUsage: {},
    }

    records.forEach((record) => {
      stats.totalUnits += record.quantity
      stats.totalHours += record.duration

      if (!stats.productBreakdown[record.productKey]) {
        stats.productBreakdown[record.productKey] = {
          name: record.productName,
          quantity: 0,
          count: 0,
        }
      }
      stats.productBreakdown[record.productKey].quantity += record.quantity
      stats.productBreakdown[record.productKey].count += 1

      if (!stats.zoneUsage[record.zone]) {
        stats.zoneUsage[record.zone] = 0
      }
      stats.zoneUsage[record.zone] += record.duration
    })

    setStats(stats)
  }

  const setPeriodDates = (newPeriod: "week" | "month") => {
    setPeriod(newPeriod)
    const today = new Date()
    const start = new Date(today)

    if (newPeriod === "week") {
      start.setDate(today.getDate() - 7)
    } else {
      start.setMonth(today.getMonth() - 1)
    }

    setStartDate(start.toISOString().split("T")[0])
    setEndDate(today.toISOString().split("T")[0])
  }

  const exportToCSV = () => {
    if (history.length === 0) {
      alert("No hay datos para exportar")
      return
    }

    const headers = ["Fecha", "Producto", "Cantidad", "Duración (h)", "Zona"]
    const rows = history.map((record) => [
      record.date,
      record.productName,
      record.quantity,
      record.duration,
      record.zone,
    ])

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `reporte_produccion_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addSampleData = () => {
    const products = loadProductsFromStorage()
    const sampleRecords: ProductionRecord[] = []

    const dates = []
    for (let i = 0; i < 14; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split("T")[0])
    }

    Object.entries(products).forEach(([key, product], index) => {
      const date = dates[index % dates.length]
      sampleRecords.push({
        id: `${Date.now()}-${index}`,
        date,
        productKey: key,
        productName: product.name,
        quantity: Math.floor(Math.random() * 200) + 50,
        duration: product.duration,
        zone: product.zone,
      })
    })

    const savedHistory = localStorage.getItem("production_history")
    const existingHistory: ProductionRecord[] = savedHistory ? JSON.parse(savedHistory) : []
    const newHistory = [...existingHistory, ...sampleRecords]

    localStorage.setItem("production_history", JSON.stringify(newHistory))
    loadHistory()
    alert("Datos de ejemplo agregados!")
  }

  const clearHistory = () => {
    if (confirm("¿Estás seguro de eliminar todo el historial?")) {
      localStorage.removeItem("production_history")
      setHistory([])
      setStats(null)
      alert("Historial eliminado")
    }
  }

  const topProducts = stats
    ? Object.entries(stats.productBreakdown)
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 5)
    : []

  const topZones = stats
    ? Object.entries(stats.zoneUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : []

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          SELECCIONAR PERÍODO
        </h3>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <button
            onClick={() => setPeriodDates("week")}
            className={`p-4 rounded-xl border-2 transition-all ${
              period === "week"
                ? "bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white border-[#3a4a9f] shadow-lg"
                : "bg-white border-gray-300 text-gray-700 hover:border-[#3a4a9f]"
            }`}
          >
            <div className="font-bold">Última Semana</div>
            <div className="text-xs mt-1 opacity-80">Últimos 7 días</div>
          </button>

          <button
            onClick={() => setPeriodDates("month")}
            className={`p-4 rounded-xl border-2 transition-all ${
              period === "month"
                ? "bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white border-[#3a4a9f] shadow-lg"
                : "bg-white border-gray-300 text-gray-700 hover:border-[#3a4a9f]"
            }`}
          >
            <div className="font-bold">Último Mes</div>
            <div className="text-xs mt-1 opacity-80">Últimos 30 días</div>
          </button>

          <div>
            <label className="block text-xs font-bold mb-2 text-gray-600">Fecha inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-2 text-gray-600">Fecha fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={exportToCSV}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-bold hover:shadow-lg transition-all"
          >
            Exportar CSV
          </button>
          <button
            onClick={addSampleData}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold hover:shadow-lg transition-all"
          >
            Agregar Datos de Ejemplo
          </button>
          <button
            onClick={clearHistory}
            className="px-6 py-3 rounded-xl bg-gray-600 text-white font-bold hover:bg-gray-700 transition-all"
          >
            Limpiar Historial
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="modern-card p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
            <div className="text-sm font-bold text-blue-700 mb-2">Total Producciones</div>
            <div className="text-4xl font-bold text-blue-900">{stats.totalProductions}</div>
          </div>

          <div className="modern-card p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
            <div className="text-sm font-bold text-green-700 mb-2">Unidades Producidas</div>
            <div className="text-4xl font-bold text-green-900">{stats.totalUnits.toLocaleString()}</div>
          </div>

          <div className="modern-card p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
            <div className="text-sm font-bold text-purple-700 mb-2">Horas Totales</div>
            <div className="text-4xl font-bold text-purple-900">{stats.totalHours.toFixed(1)}h</div>
          </div>

          <div className="modern-card p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200">
            <div className="text-sm font-bold text-orange-700 mb-2">Promedio Diario</div>
            <div className="text-4xl font-bold text-orange-900">
              {Math.round(stats.totalUnits / Math.max(history.length, 1))}
            </div>
          </div>
        </div>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="modern-card p-6">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
            PRODUCTOS MÁS PRODUCIDOS
          </h3>
          <div className="space-y-3">
            {topProducts.map(([key, data], index) => {
              const maxQuantity = topProducts[0][1].quantity
              const percentage = (data.quantity / maxQuantity) * 100

              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-8 text-center font-bold text-gray-500">#{index + 1}</div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-gray-800">{data.name}</span>
                      <span className="text-sm font-bold text-gray-600">
                        {data.quantity} uds ({data.count} veces)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#3a4a9f] to-[#4555af] rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Zone usage */}
      {topZones.length > 0 && (
        <div className="modern-card p-6">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
            USO DE ZONAS
          </h3>
          <div className="space-y-3">
            {topZones.map(([zone, hours], index) => {
              const maxHours = topZones[0][1]
              const percentage = (hours / maxHours) * 100

              return (
                <div key={zone} className="flex items-center gap-4">
                  <div className="w-8 text-center font-bold text-gray-500">#{index + 1}</div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-gray-800">{zone}</span>
                      <span className="text-sm font-bold text-gray-600">{hours.toFixed(1)}h</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Production history */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          HISTORIAL DE PRODUCCIÓN
        </h3>

        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3 opacity-30">📊</div>
            <p className="text-sm font-bold">No hay registros de producción en este período</p>
            <p className="text-xs mt-2">Agrega datos de ejemplo para ver el reporte</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left p-3 font-bold text-gray-700">Fecha</th>
                  <th className="text-left p-3 font-bold text-gray-700">Producto</th>
                  <th className="text-right p-3 font-bold text-gray-700">Cantidad</th>
                  <th className="text-right p-3 font-bold text-gray-700">Duración</th>
                  <th className="text-left p-3 font-bold text-gray-700">Zona</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-3 text-sm">{record.date}</td>
                    <td className="p-3 font-bold text-sm">{record.productName}</td>
                    <td className="p-3 text-right text-sm">{record.quantity} uds</td>
                    <td className="p-3 text-right text-sm">{record.duration}h</td>
                    <td className="p-3 text-sm text-gray-600">{record.zone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
