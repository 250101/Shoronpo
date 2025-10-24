"use client"

import { useState, useEffect } from "react"
import { productsDB, loadProductsFromStorage, type ProductKey } from "@/lib/products"
import { generateAutomaticPlan, convertScheduleToWeeklyPlan, type PlanningOptions } from "@/lib/planning-algorithm"

type WeeklyPlan = {
  [date: string]: {
    products: { productKey: ProductKey; quantity: number }[]
  }
}

export default function WeeklyPlanner() {
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>({})
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<ProductKey | null>(null)
  const [quantity, setQuantity] = useState<string>("")
  const [showAutoPlanner, setShowAutoPlanner] = useState(false)
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(8)
  const [considerStockMin, setConsiderStockMin] = useState(true)
  const [respectPreferredDays, setRespectPreferredDays] = useState(true)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [planName, setPlanName] = useState("")
  const [planNote, setPlanNote] = useState("")

  const getWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1))

    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      dates.push(date.toISOString().split("T")[0])
    }
    return dates
  }

  const weekDates = getWeekDates()
  const dayNames = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"]

  useEffect(() => {
    const saved = localStorage.getItem("weekly-plan")
    if (saved) {
      setWeeklyPlan(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("weekly-plan", JSON.stringify(weeklyPlan))
  }, [weeklyPlan])

  const addToDay = () => {
    if (!selectedDate || !selectedProduct || !quantity) {
      alert("Completa todos los campos")
      return
    }

    const qty = Number.parseInt(quantity)
    if (!qty || qty <= 0) {
      alert("Ingresa una cantidad válida")
      return
    }

    setWeeklyPlan((prev) => ({
      ...prev,
      [selectedDate]: {
        products: [...(prev[selectedDate]?.products || []), { productKey: selectedProduct, quantity: qty }],
      },
    }))

    setQuantity("")
    setSelectedProduct(null)
  }

  const removeFromDay = (date: string, index: number) => {
    setWeeklyPlan((prev) => ({
      ...prev,
      [date]: {
        products: prev[date].products.filter((_, i) => i !== index),
      },
    }))
  }

  const copyToDaily = (date: string) => {
    const dayPlan = weeklyPlan[date]
    if (!dayPlan || dayPlan.products.length === 0) {
      alert("No hay productos para copiar")
      return
    }

    alert(`Plan copiado a la planificación diaria del ${date}`)
  }

  const generateAutomaticWeeklyPlan = () => {
    const options: PlanningOptions = {
      startDate: new Date(weekDates[0]),
      maxHoursPerDay,
      considerStockMin,
      respectPreferredDays,
    }

    const schedule = generateAutomaticPlan(options)
    const plan = convertScheduleToWeeklyPlan(schedule)

    setWeeklyPlan(plan)
    setShowAutoPlanner(false)
    alert("Plan semanal generado automáticamente!")
  }

  const clearWeeklyPlan = () => {
    if (confirm("¿Estás seguro de que quieres limpiar todo el plan semanal?")) {
      setWeeklyPlan({})
    }
  }

  const savePlan = () => {
    if (!planName.trim()) {
      alert("Por favor ingresa un nombre para el plan")
      return
    }

    const hasProducts = Object.values(weeklyPlan).some((day) => day.products.length > 0)
    if (!hasProducts) {
      alert("No hay productos en el plan para guardar")
      return
    }

    const savedPlans = JSON.parse(localStorage.getItem("saved-plans") || "[]")
    const newPlan = {
      id: Date.now().toString(),
      name: planName,
      note: planNote,
      plan: weeklyPlan,
      createdAt: new Date().toISOString(),
      weekDates: weekDates,
    }

    savedPlans.push(newPlan)
    localStorage.setItem("saved-plans", JSON.stringify(savedPlans))

    alert(`Plan "${planName}" guardado exitosamente!`)
    setShowSaveModal(false)
    setPlanName("")
    setPlanNote("")
  }

  return (
    <div className="space-y-6">
      <div className="modern-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold">
            PLANIFICACIÓN AUTOMÁTICA
          </h3>
          <button
            onClick={() => setShowAutoPlanner(!showAutoPlanner)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white font-bold hover:shadow-lg transition-all"
          >
            {showAutoPlanner ? "Ocultar" : "Configurar"}
          </button>
        </div>

        {showAutoPlanner && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Horas máximas por día</label>
                <input
                  type="number"
                  value={maxHoursPerDay}
                  onChange={(e) => setMaxHoursPerDay(Number.parseInt(e.target.value))}
                  min="4"
                  max="12"
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="considerStock"
                  checked={considerStockMin}
                  onChange={(e) => setConsiderStockMin(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300"
                />
                <label htmlFor="considerStock" className="text-sm font-bold text-gray-700">
                  Considerar stock mínimo
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="respectDays"
                  checked={respectPreferredDays}
                  onChange={(e) => setRespectPreferredDays(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300"
                />
                <label htmlFor="respectDays" className="text-sm font-bold text-gray-700">
                  Respetar días preferidos
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={generateAutomaticWeeklyPlan}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-bold hover:shadow-lg transition-all"
              >
                Generar Plan Automático
              </button>
              <button
                onClick={clearWeeklyPlan}
                className="px-6 py-3 rounded-xl bg-gray-600 text-white font-bold hover:bg-gray-700 transition-all"
              >
                Limpiar Todo
              </button>
              <button
                onClick={() => setShowSaveModal(true)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white font-bold hover:shadow-lg transition-all"
              >
                💾 Guardar Plan
              </button>
            </div>
          </div>
        )}
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="modern-card p-8 max-w-md w-full">
            <h3 className="font-['Libre_Baskerville'] text-2xl tracking-wider text-[#1f2960] font-bold mb-6">
              GUARDAR PLAN
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Nombre del Plan *</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="Ej: Plan Semana 1 - Enero"
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Notas (opcional)</label>
                <textarea
                  value={planNote}
                  onChange={(e) => setPlanNote(e.target.value)}
                  placeholder="Ej: Plan para evento especial, producción aumentada..."
                  rows={4}
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={savePlan}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-bold hover:shadow-lg transition-all"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setShowSaveModal(false)
                    setPlanName("")
                    setPlanNote("")
                  }}
                  className="px-6 py-3 rounded-xl bg-gray-600 text-white font-bold hover:bg-gray-700 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl stamp-border p-8">
        <h3 className="font-['Special_Elite'] text-xl tracking-[0.15rem] text-[#4455bb] mb-6 pb-4 border-b-3 border-[#4455bb]/20">
          AGREGAR PRODUCCIÓN
        </h3>

        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700 tracking-wide">DÍA DE LA SEMANA</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-4 rounded-xl border-3 border-[#1a1a1a] font-['Courier_Prime'] text-base focus:outline-none focus:border-[#4455bb] transition-all shadow-[2px_2px_0_#1a1a1a] focus:shadow-[3px_3px_0_#4455bb]"
            >
              <option value="">Selecciona un día</option>
              {weekDates.map((date, index) => (
                <option key={date} value={date}>
                  {dayNames[index]} - {date}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700 tracking-wide">PRODUCTO</label>
            <select
              value={selectedProduct || ""}
              onChange={(e) => setSelectedProduct(e.target.value as ProductKey)}
              className="w-full p-4 rounded-xl border-3 border-[#1a1a1a] font-['Courier_Prime'] text-base focus:outline-none focus:border-[#4455bb] transition-all shadow-[2px_2px_0_#1a1a1a] focus:shadow-[3px_3px_0_#4455bb]"
            >
              <option value="">Selecciona un producto</option>
              {Object.entries(productsDB).map(([key, product]) => (
                <option key={key} value={key}>
                  {product.icon} {product.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700 tracking-wide">CANTIDAD</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ej: 300"
              className="w-full p-4 rounded-xl border-3 border-[#1a1a1a] font-['Courier_Prime'] text-base focus:outline-none focus:border-[#4455bb] transition-all shadow-[2px_2px_0_#1a1a1a] focus:shadow-[3px_3px_0_#4455bb]"
            />
          </div>
        </div>

        <button
          onClick={addToDay}
          className="w-full md:w-auto px-8 py-4 rounded-xl border-3 border-[#1a1a1a] font-['Special_Elite'] text-lg tracking-wider bg-gradient-to-br from-[#4caf50] to-[#66bb6a] text-white shadow-[4px_4px_0_#1a1a1a] hover:shadow-[5px_5px_0_#1a1a1a] hover:-translate-y-[1px] transition-all duration-200"
        >
          + AGREGAR AL DÍA
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {weekDates.map((date, index) => {
          const dayPlan = weeklyPlan[date]
          const hasProducts = dayPlan && dayPlan.products.length > 0
          const totalProducts = hasProducts ? dayPlan.products.reduce((sum, p) => sum + p.quantity, 0) : 0

          return (
            <div key={date} className="modern-card p-6 hover:shadow-lg transition-all">
              <div className="mb-5 pb-4 border-b-2 border-gray-200">
                <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold">
                  {dayNames[index]}
                </h3>
                <p className="text-xs text-gray-600 mt-1 font-bold">{date}</p>
                {hasProducts && (
                  <div className="mt-2 inline-block px-3 py-1 bg-[#3a4a9f]/10 rounded-lg border-2 border-[#3a4a9f]/30">
                    <span className="text-xs font-bold text-[#3a4a9f]">{totalProducts} unidades</span>
                  </div>
                )}
              </div>

              {hasProducts ? (
                <>
                  <div className="space-y-3 mb-5">
                    {dayPlan.products.map((item, idx) => {
                      const products = loadProductsFromStorage()
                      const product = products[item.productKey]
                      if (!product) return null

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border-2 border-gray-200 hover:border-[#3a4a9f] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{product.icon}</span>
                            <div>
                              <div className="font-bold text-sm">{product.name}</div>
                              <div className="text-xs text-gray-600 font-bold">{item.quantity} uds</div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromDay(date, idx)}
                            className="w-8 h-8 rounded-lg bg-red-500 text-white font-bold text-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => copyToDaily(date)}
                    className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white text-sm font-bold hover:shadow-lg transition-all"
                  >
                    COPIAR A DIARIO →
                  </button>
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-5xl mb-3 opacity-30">🍜</div>
                  <p className="text-xs font-bold tracking-wide">SIN PRODUCCIÓN</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
