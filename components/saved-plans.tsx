"use client"

import { useState, useEffect } from "react"
import { loadProductsFromStorage, type ProductKey } from "@/lib/products"

type WeeklyPlan = {
  [date: string]: {
    products: { productKey: ProductKey; quantity: number }[]
  }
}

type SavedPlan = {
  id: string
  name: string
  note: string
  plan: WeeklyPlan
  createdAt: string
  weekDates: string[]
}

export default function SavedPlans() {
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<SavedPlan | null>(null)

  useEffect(() => {
    loadSavedPlans()
  }, [])

  const loadSavedPlans = () => {
    const plans = JSON.parse(localStorage.getItem("saved-plans") || "[]")
    setSavedPlans(
      plans.sort((a: SavedPlan, b: SavedPlan) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    )
  }

  const deletePlan = (id: string) => {
    if (confirm("¿Estás seguro de que quieres eliminar este plan?")) {
      const plans = savedPlans.filter((p) => p.id !== id)
      localStorage.setItem("saved-plans", JSON.stringify(plans))
      setSavedPlans(plans)
      if (selectedPlan?.id === id) {
        setSelectedPlan(null)
      }
    }
  }

  const loadPlanToWeekly = (plan: SavedPlan) => {
    if (confirm("¿Cargar este plan en la planificación semanal? Esto reemplazará el plan actual.")) {
      localStorage.setItem("weekly-plan", JSON.stringify(plan.plan))
      alert("Plan cargado exitosamente! Ve a la sección Semanal para verlo.")
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTotalProducts = (plan: WeeklyPlan) => {
    return Object.values(plan).reduce((total, day) => {
      return total + day.products.reduce((sum, p) => sum + p.quantity, 0)
    }, 0)
  }

  const getDaysWithProduction = (plan: WeeklyPlan) => {
    return Object.values(plan).filter((day) => day.products.length > 0).length
  }

  return (
    <div className="space-y-6">
      <div className="modern-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold">
              PLANES GUARDADOS
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {savedPlans.length} {savedPlans.length === 1 ? "plan guardado" : "planes guardados"}
            </p>
          </div>
          <button
            onClick={loadSavedPlans}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white font-bold hover:shadow-lg transition-all"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {savedPlans.length === 0 ? (
        <div className="modern-card p-12 text-center">
          <div className="text-6xl mb-4 opacity-30">📋</div>
          <h3 className="font-['Libre_Baskerville'] text-xl text-gray-600 mb-2">No hay planes guardados</h3>
          <p className="text-sm text-gray-500">Guarda tus planes semanales desde la sección de Planificación Semanal</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {savedPlans.map((plan) => (
              <div
                key={plan.id}
                className={`modern-card p-5 cursor-pointer transition-all ${
                  selectedPlan?.id === plan.id
                    ? "ring-2 ring-[#3a4a9f] shadow-lg"
                    : "hover:shadow-lg hover:scale-[1.02]"
                }`}
                onClick={() => setSelectedPlan(plan)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-['Libre_Baskerville'] text-lg text-[#1f2960] font-bold mb-1">{plan.name}</h4>
                    <p className="text-xs text-gray-500">{formatDate(plan.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        loadPlanToWeekly(plan)
                      }}
                      className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors"
                    >
                      Cargar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deletePlan(plan.id)
                      }}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {plan.note && (
                  <p className="text-sm text-gray-700 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {plan.note}
                  </p>
                )}

                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">📅</span>
                    <span className="font-bold text-gray-700">{getDaysWithProduction(plan.plan)} días</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">🥟</span>
                    <span className="font-bold text-gray-700">{getTotalProducts(plan.plan)} unidades</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="modern-card p-6 sticky top-4 h-fit">
            {selectedPlan ? (
              <div>
                <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
                  DETALLES DEL PLAN
                </h3>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 font-bold">NOMBRE</label>
                    <p className="text-lg font-bold text-gray-800">{selectedPlan.name}</p>
                  </div>

                  {selectedPlan.note && (
                    <div>
                      <label className="text-xs text-gray-500 font-bold">NOTAS</label>
                      <p className="text-sm text-gray-700 p-3 bg-gray-50 rounded-lg border border-gray-200 mt-1">
                        {selectedPlan.note}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-500 font-bold">FECHA DE CREACIÓN</label>
                    <p className="text-sm text-gray-700">{formatDate(selectedPlan.createdAt)}</p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-bold text-sm text-gray-700 mb-3">PRODUCCIÓN POR DÍA</h4>
                  <div className="space-y-3">
                    {selectedPlan.weekDates.map((date, index) => {
                      const dayPlan = selectedPlan.plan[date]
                      const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]

                      if (!dayPlan || dayPlan.products.length === 0) return null

                      return (
                        <div key={date} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="font-bold text-sm text-[#3a4a9f] mb-2">
                            {dayNames[index]} - {date}
                          </div>
                          <div className="space-y-1">
                            {dayPlan.products.map((item, idx) => {
                              const products = loadProductsFromStorage()
                              const product = products[item.productKey]
                              if (!product) return null

                              return (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700">
                                    {product.icon} {product.name}
                                  </span>
                                  <span className="font-bold text-gray-800">{item.quantity} uds</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <div className="text-5xl mb-3 opacity-30">👈</div>
                <p className="text-sm font-bold">Selecciona un plan para ver los detalles</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
