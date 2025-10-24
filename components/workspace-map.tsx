"use client"

import { useState, useEffect } from "react"
import { loadProductsFromStorage } from "@/lib/products"

type WorkspaceOccupancy = {
  zone: string
  occupiedBy: Array<{
    product: string
    startHour: number
    endHour: number
    icon: string
  }>
}

type StorageOccupancy = {
  name: string
  capacity: number
  used: number
  products: Array<{
    name: string
    batches: number
    icon: string
  }>
}

export default function WorkspaceMap() {
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [workspaceData, setWorkspaceData] = useState<WorkspaceOccupancy[]>([])
  const [storageData, setStorageData] = useState<StorageOccupancy[]>([])
  const [selectedHour, setSelectedHour] = useState<number | null>(null)

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
  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
  const hours = Array.from({ length: 16 }, (_, i) => i + 6) // 6 AM to 10 PM

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(weekDates[0])
    }
  }, [])

  useEffect(() => {
    if (selectedDate) {
      calculateOccupancy()
    }
  }, [selectedDate])

  const calculateOccupancy = () => {
    const weeklyPlan = localStorage.getItem("weekly-plan")
    if (!weeklyPlan) {
      setWorkspaceData([])
      setStorageData([])
      return
    }

    const plan = JSON.parse(weeklyPlan)
    const dayPlan = plan[selectedDate]

    if (!dayPlan || !dayPlan.products || dayPlan.products.length === 0) {
      setWorkspaceData([])
      setStorageData([])
      return
    }

    const products = loadProductsFromStorage()
    const zones: { [key: string]: WorkspaceOccupancy } = {}
    const storages: { [key: string]: StorageOccupancy } = {}

    // Simulate time allocation (simple sequential allocation)
    let currentHour = 6

    dayPlan.products.forEach((item: { productKey: string; quantity: number }) => {
      const product = products[item.productKey]
      if (!product) return

      // Workspace occupancy
      if (!zones[product.zone]) {
        zones[product.zone] = {
          zone: product.zone,
          occupiedBy: [],
        }
      }

      zones[product.zone].occupiedBy.push({
        product: product.name,
        startHour: currentHour,
        endHour: currentHour + product.duration,
        icon: product.icon,
      })

      // Storage occupancy
      if (!storages[product.storage.name]) {
        storages[product.storage.name] = {
          name: product.storage.name,
          capacity: product.storage.capacity,
          used: 0,
          products: [],
        }
      }

      const batches = Math.ceil(item.quantity / product.unitsPerBatch)
      storages[product.storage.name].used += batches
      storages[product.storage.name].products.push({
        name: product.name,
        batches,
        icon: product.icon,
      })

      currentHour += product.duration
    })

    setWorkspaceData(Object.values(zones))
    setStorageData(Object.values(storages))
  }

  const isZoneOccupiedAtHour = (zone: WorkspaceOccupancy, hour: number): boolean => {
    return zone.occupiedBy.some((occ) => hour >= occ.startHour && hour < occ.endHour)
  }

  const getOccupantAtHour = (zone: WorkspaceOccupancy, hour: number) => {
    return zone.occupiedBy.find((occ) => hour >= occ.startHour && hour < occ.endHour)
  }

  return (
    <div className="space-y-6">
      {/* Date selector */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          SELECCIONAR DÍA
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDates.map((date, index) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`p-4 rounded-xl border-2 transition-all ${
                selectedDate === date
                  ? "bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white border-[#3a4a9f] shadow-lg"
                  : "bg-white border-gray-300 text-gray-700 hover:border-[#3a4a9f] hover:shadow-md"
              }`}
            >
              <div className="font-bold text-sm">{dayNames[index]}</div>
              <div className="text-xs mt-1 opacity-80">{date.split("-").slice(1).join("/")}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Workspace zones timeline */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          MAPA DEL OBRADOR
        </h3>

        {workspaceData.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3 opacity-30">🏭</div>
            <p className="text-sm font-bold">No hay producciones planificadas para este día</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hour labels */}
            <div className="flex gap-2 pl-48">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex-1 text-center text-xs font-bold text-gray-600 cursor-pointer hover:text-[#3a4a9f]"
                  onClick={() => setSelectedHour(selectedHour === hour ? null : hour)}
                >
                  {hour}:00
                </div>
              ))}
            </div>

            {/* Zones */}
            {workspaceData.map((zone) => (
              <div key={zone.zone} className="flex gap-2 items-center">
                <div className="w-44 font-bold text-sm text-gray-700 truncate">{zone.zone}</div>
                <div className="flex-1 flex gap-1">
                  {hours.map((hour) => {
                    const occupant = getOccupantAtHour(zone, hour)
                    const isOccupied = isZoneOccupiedAtHour(zone, hour)
                    const isSelected = selectedHour === hour

                    return (
                      <div
                        key={hour}
                        className={`flex-1 h-16 rounded-lg border-2 transition-all ${
                          isOccupied
                            ? "bg-gradient-to-br from-[#3a4a9f] to-[#4555af] border-[#3a4a9f] text-white"
                            : "bg-gray-50 border-gray-200"
                        } ${isSelected ? "ring-2 ring-yellow-400" : ""} ${
                          occupant ? "cursor-pointer hover:scale-105" : ""
                        }`}
                        title={occupant ? `${occupant.icon} ${occupant.product}` : "Libre"}
                      >
                        {occupant && (
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-2xl">{occupant.icon}</span>
                            <span className="text-[10px] font-bold mt-1 truncate px-1">{occupant.product}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage capacity */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold mb-4">
          CAPACIDAD DE ALMACENAMIENTO
        </h3>

        {storageData.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3 opacity-30">📦</div>
            <p className="text-sm font-bold">No hay productos en almacenamiento para este día</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storageData.map((storage) => {
              const percentage = (storage.used / storage.capacity) * 100
              const isOverCapacity = storage.used > storage.capacity

              return (
                <div
                  key={storage.name}
                  className={`p-5 rounded-xl border-2 ${
                    isOverCapacity
                      ? "bg-red-50 border-red-300"
                      : percentage > 80
                        ? "bg-yellow-50 border-yellow-300"
                        : "bg-green-50 border-green-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-gray-800">{storage.name}</h4>
                    <span
                      className={`text-sm font-bold ${
                        isOverCapacity ? "text-red-600" : percentage > 80 ? "text-yellow-600" : "text-green-600"
                      }`}
                    >
                      {storage.used}/{storage.capacity}
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverCapacity
                          ? "bg-gradient-to-r from-red-500 to-red-600"
                          : percentage > 80
                            ? "bg-gradient-to-r from-yellow-500 to-yellow-600"
                            : "bg-gradient-to-r from-green-500 to-green-600"
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    {storage.products.map((prod, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-xl">{prod.icon}</span>
                        <span className="flex-1 font-medium text-gray-700">{prod.name}</span>
                        <span className="font-bold text-gray-600">{prod.batches} lotes</span>
                      </div>
                    ))}
                  </div>

                  {isOverCapacity && (
                    <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded-lg">
                      <p className="text-xs font-bold text-red-700">Capacidad excedida!</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="modern-card p-6">
        <h3 className="font-['Libre_Baskerville'] text-lg tracking-wider text-[#1f2960] font-bold mb-4">LEYENDA</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#3a4a9f] to-[#4555af] border-2 border-[#3a4a9f]" />
            <span className="text-sm font-bold text-gray-700">Zona ocupada</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gray-50 border-2 border-gray-200" />
            <span className="text-sm font-bold text-gray-700">Zona libre</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-50 border-2 border-green-300" />
            <span className="text-sm font-bold text-gray-700">Almacenamiento OK</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-red-50 border-2 border-red-300" />
            <span className="text-sm font-bold text-gray-700">Capacidad excedida</span>
          </div>
        </div>
      </div>
    </div>
  )
}
