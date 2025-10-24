"use client"

import { useState, useEffect } from "react"
import { productsDB, type ProductKey, type ProductionTask } from "@/lib/products"

export default function DailyPlanner() {
  const [tasks, setTasks] = useState<ProductionTask[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductKey | null>(null)
  const [quantity, setQuantity] = useState<string>("")
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])

  useEffect(() => {
    const saved = localStorage.getItem(`daily-plan-${selectedDate}`)
    if (saved) {
      setTasks(JSON.parse(saved))
    } else {
      setTasks([])
    }
  }, [selectedDate])

  useEffect(() => {
    if (tasks.length > 0) {
      localStorage.setItem(`daily-plan-${selectedDate}`, JSON.stringify(tasks))
    }
  }, [tasks, selectedDate])

  const formatTime = (decimalTime: number): string => {
    const hours = Math.floor(decimalTime)
    const minutes = Math.round((decimalTime - hours) * 60)
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  }

  const addTask = () => {
    if (!selectedProduct) return

    const qty = Number.parseInt(quantity)
    if (!qty || qty <= 0) {
      alert("Ingresa una cantidad válida")
      return
    }

    const product = productsDB[selectedProduct]
    const batches = Math.ceil(qty / product.unitsPerBatch)
    const totalDuration = product.duration * batches

    let startTime = 8
    if (tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1]
      startTime = lastTask.endTime
    }

    const newTask: ProductionTask = {
      id: Date.now().toString(),
      productKey: selectedProduct,
      product,
      quantity: qty,
      batches,
      startTime,
      endTime: startTime + totalDuration,
      totalDuration,
    }

    setTasks([...tasks, newTask])
    setQuantity("")
    setSelectedProduct(null)
  }

  const removeTask = (id: string) => {
    const newTasks = tasks.filter((t) => t.id !== id)
    let currentTime = 8
    const updatedTasks = newTasks.map((task) => {
      const updated = { ...task, startTime: currentTime, endTime: currentTime + task.totalDuration }
      currentTime = updated.endTime
      return updated
    })
    setTasks(updatedTasks)
    if (selectedTask === id) setSelectedTask(null)
  }

  const clearAll = () => {
    if (tasks.length === 0) return
    if (confirm("¿Limpiar todo el plan?")) {
      setTasks([])
      setSelectedTask(null)
      localStorage.removeItem(`daily-plan-${selectedDate}`)
    }
  }

  const calculateResources = () => {
    const storageUsage: Record<string, number> = {}
    const zoneUsage: Record<string, number> = {}

    tasks.forEach((task) => {
      const storageName = task.product.storage.name
      const storageAmount = task.product.storage.capacity * task.batches
      storageUsage[storageName] = (storageUsage[storageName] || 0) + storageAmount

      zoneUsage[task.product.zone] = (zoneUsage[task.product.zone] || 0) + 1
    })

    return { storageUsage, zoneUsage }
  }

  const { storageUsage, zoneUsage } = calculateResources()
  const totalDuration = tasks.length > 0 ? tasks[tasks.length - 1].endTime - 8 : 0
  const endTime = tasks.length > 0 ? formatTime(tasks[tasks.length - 1].endTime) : "--:--"
  const timelineHours = Array.from({ length: 15 }, (_, i) => 8 + i)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-bold mb-2 text-gray-700">Fecha de producción:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-3 rounded-lg border-3 border-black font-['Courier_Prime'] text-lg focus:outline-none focus:border-[#4455bb] transition-colors"
            />
          </div>
          <div className="flex gap-6">
            <div className="text-center px-6 py-3 bg-gradient-to-br from-[#4455bb]/10 to-[#5566cc]/10 rounded-lg border-2 border-[#4455bb]/30">
              <div className="font-['Special_Elite'] text-2xl text-[#4455bb]">{endTime}</div>
              <div className="text-xs tracking-wider text-gray-600 mt-1">Hora Fin</div>
            </div>
            <div className="text-center px-6 py-3 bg-gradient-to-br from-[#4455bb]/10 to-[#5566cc]/10 rounded-lg border-2 border-[#4455bb]/30">
              <div className="font-['Special_Elite'] text-2xl text-[#4455bb]">{totalDuration.toFixed(1)}h</div>
              <div className="text-xs tracking-wider text-gray-600 mt-1">Duración Total</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr_340px] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
            <h2 className="font-['Special_Elite'] text-xl tracking-wider mb-4 pb-3 border-b-2 border-[#4455bb]/30">
              CATÁLOGO DE PRODUCTOS
            </h2>
            <div className="space-y-3">
              {Object.entries(productsDB).map(([key, product]) => (
                <button
                  key={key}
                  onClick={() => setSelectedProduct(key as ProductKey)}
                  className={`w-full p-4 rounded-lg border-3 border-black text-left transition-all duration-200 ${
                    selectedProduct === key
                      ? "bg-gradient-to-br from-[#4455bb] to-[#5566cc] text-white shadow-[3px_3px_0_#1a1a1a] translate-x-[1px] translate-y-[1px]"
                      : "bg-white hover:bg-[#f8f9fa] shadow-[3px_3px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1a1a1a]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{product.icon}</span>
                    <div className="flex-1">
                      <div className="font-bold text-sm mb-1">{product.name}</div>
                      <div className={`text-xs ${selectedProduct === key ? "opacity-90" : "opacity-60"}`}>
                        {product.duration}h · {product.unitsPerBatch} unidades/lote
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedProduct && (
            <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
              <h3 className="font-['Special_Elite'] text-lg mb-4">NUEVA TAREA</h3>
              <div className="mb-4">
                <label className="block text-sm font-bold mb-2 text-gray-700">Cantidad de unidades:</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ej: 300"
                  className="w-full p-3 rounded-lg border-3 border-black font-['Courier_Prime'] text-lg focus:outline-none focus:border-[#4455bb] transition-colors"
                />
              </div>
              <button
                onClick={addTask}
                className="w-full p-3 rounded-lg border-3 border-black font-['Special_Elite'] bg-gradient-to-br from-[#4caf50] to-[#66bb6a] text-white shadow-[3px_3px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1a1a1a] transition-all duration-200"
              >
                + AGREGAR AL PLAN
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
            <h3 className="font-['Special_Elite'] text-lg mb-4 pb-3 border-b-2 border-[#4455bb]/30">
              ESTADO DE RECURSOS
            </h3>

            <div className="mb-5">
              <div className="text-xs font-bold mb-3 tracking-wider text-gray-600">ALMACENAMIENTO:</div>
              {Object.keys(storageUsage).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(storageUsage).map(([storage, usage]) => (
                    <div key={storage}>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="font-medium">{storage}</span>
                        <span
                          className={`font-bold ${usage > 100 ? "text-red-600" : usage > 80 ? "text-orange-600" : "text-[#4455bb]"}`}
                        >
                          {usage}%
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full border-2 border-black overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${usage > 100 ? "bg-gradient-to-r from-red-500 to-red-600" : usage > 80 ? "bg-gradient-to-r from-orange-400 to-orange-500" : "bg-gradient-to-r from-[#4455bb] to-[#5566cc]"}`}
                          style={{ width: `${Math.min(usage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-3">Sin uso actualmente</div>
              )}
            </div>

            <div>
              <div className="text-xs font-bold mb-3 tracking-wider text-gray-600">ZONAS DE TRABAJO:</div>
              {Object.keys(zoneUsage).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(zoneUsage).map(([zone, count]) => (
                    <div
                      key={zone}
                      className="flex justify-between items-center text-xs p-2 rounded-lg bg-gray-50 border-2 border-gray-200"
                    >
                      <span className="font-medium">{zone}</span>
                      <span
                        className={`font-bold px-2 py-1 rounded ${count > 1 ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-[#4455bb]"}`}
                      >
                        {count} tarea{count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-3">Sin uso actualmente</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-6">
          <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-[#4455bb]/30">
            <h2 className="font-['Special_Elite'] text-2xl tracking-wider">LÍNEA DE TIEMPO</h2>
            {tasks.length > 0 && (
              <button
                onClick={clearAll}
                className="px-4 py-2 rounded-lg border-2 border-black bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1a1a1a]"
              >
                LIMPIAR TODO
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <div className="text-7xl mb-4">📋</div>
              <p className="text-lg font-['Special_Elite']">Agrega productos para comenzar</p>
              <p className="text-sm mt-2 opacity-75">Selecciona un producto del catálogo</p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex border-b-2 border-gray-300 mb-6 pb-3">
                {timelineHours.map((hour) => (
                  <div key={hour} className="flex-1 text-center">
                    <div className="text-xs font-bold text-gray-600">{hour}:00</div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {tasks.map((task) => {
                  const startPercent = ((task.startTime - 8) / 14) * 100
                  const widthPercent = (task.totalDuration / 14) * 100

                  return (
                    <div key={task.id} className="relative h-24">
                      <div
                        className={`absolute h-full rounded-lg border-3 border-black p-3 cursor-pointer transition-all duration-200 ${
                          selectedTask === task.id
                            ? "bg-gradient-to-br from-[#4455bb] to-[#5566cc] text-white shadow-[4px_4px_0_#1a1a1a] z-10"
                            : "bg-white hover:bg-[#f8f9fa] shadow-[3px_3px_0_#1a1a1a] hover:shadow-[4px_4px_0_#1a1a1a] hover:translate-y-[-2px]"
                        }`}
                        style={{
                          left: `${startPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        onClick={() => setSelectedTask(task.id)}
                      >
                        <div className="flex items-center gap-3 h-full">
                          <span className="text-3xl">{task.product.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm mb-1 truncate">{task.product.name}</div>
                            <div className={`text-xs ${selectedTask === task.id ? "opacity-90" : "opacity-60"}`}>
                              {formatTime(task.startTime)} - {formatTime(task.endTime)}
                            </div>
                            <div className={`text-xs ${selectedTask === task.id ? "opacity-90" : "opacity-60"}`}>
                              {task.quantity} unidades · {task.batches} lotes
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {selectedTask && tasks.find((t) => t.id === selectedTask) ? (
            <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
              {(() => {
                const task = tasks.find((t) => t.id === selectedTask)!
                return (
                  <>
                    <div className="flex justify-between items-start mb-5">
                      <h3 className="font-['Special_Elite'] text-lg">DETALLES DE TAREA</h3>
                      <button
                        onClick={() => removeTask(task.id)}
                        className="px-3 py-1 rounded-lg border-2 border-black bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1a1a1a]"
                      >
                        ELIMINAR
                      </button>
                    </div>

                    <div className="flex items-center gap-4 mb-5 pb-5 border-b-2 border-gray-200">
                      <div className="w-16 h-16 flex items-center justify-center bg-gradient-to-br from-[#4455bb]/10 to-[#5566cc]/10 rounded-xl border-2 border-[#4455bb]/30">
                        <span className="text-4xl">{task.product.icon}</span>
                      </div>
                      <div>
                        <div className="font-bold text-lg">{task.product.name}</div>
                        <div className="text-sm text-gray-600">{task.quantity} unidades</div>
                      </div>
                    </div>

                    <div className="space-y-4 text-sm">
                      <div className="p-3 rounded-lg bg-[#4455bb]/5 border-l-4 border-[#4455bb]">
                        <div className="font-bold text-[#4455bb] mb-1">Horario de Producción</div>
                        <div className="font-['Courier_Prime'] text-lg">
                          {formatTime(task.startTime)} - {formatTime(task.endTime)}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50">
                        <div className="font-bold text-gray-700 mb-1">Duración Total</div>
                        <div>
                          {task.totalDuration}h ({task.batches} lotes de {task.product.unitsPerBatch} unidades)
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50">
                        <div className="font-bold text-gray-700 mb-1">Zona de Trabajo</div>
                        <div>{task.product.zone}</div>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50">
                        <div className="font-bold text-gray-700 mb-2">Almacenamiento Requerido</div>
                        <div>
                          {task.product.storage.name} ({task.product.storage.capacity * task.batches}% de capacidad)
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50">
                        <div className="font-bold text-gray-700 mb-2">Herramientas Necesarias</div>
                        <div className="flex flex-wrap gap-2">
                          {task.product.tools.map((tool) => (
                            <span
                              key={tool}
                              className="px-2 py-1 bg-white border-2 border-gray-300 rounded text-xs font-medium"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
              <div className="text-center py-12 text-gray-400">
                <div className="text-5xl mb-3">👆</div>
                <p className="text-sm font-['Special_Elite']">Selecciona una tarea</p>
                <p className="text-xs mt-2 opacity-75">Haz click en el timeline</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
            <h3 className="font-['Special_Elite'] text-lg mb-4 pb-3 border-b-2 border-[#4455bb]/30">
              ALERTAS Y NOTIFICACIONES
            </h3>
            <div className="space-y-3 text-sm">
              {totalDuration > 10 && (
                <div className="p-3 rounded-lg bg-orange-50 border-l-4 border-orange-500 text-orange-800">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <div className="font-bold mb-1">Jornada extendida</div>
                      <div className="text-xs">
                        Duración de {totalDuration.toFixed(1)}h. Considera dividir en 2 días.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {Object.entries(storageUsage).map(([storage, usage]) =>
                usage > 100 ? (
                  <div key={storage} className="p-3 rounded-lg bg-red-50 border-l-4 border-red-500 text-red-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">❌</span>
                      <div>
                        <div className="font-bold mb-1">Capacidad excedida</div>
                        <div className="text-xs">
                          {storage} sobrecargada al {usage}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : usage > 80 ? (
                  <div
                    key={storage}
                    className="p-3 rounded-lg bg-orange-50 border-l-4 border-orange-500 text-orange-800"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <div className="font-bold mb-1">Capacidad alta</div>
                        <div className="text-xs">
                          {storage} al {usage}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null,
              )}
              {Object.entries(zoneUsage).map(([zone, count]) =>
                count > 1 ? (
                  <div key={zone} className="p-3 rounded-lg bg-orange-50 border-l-4 border-orange-500 text-orange-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <div className="font-bold mb-1">Conflicto de zona</div>
                        <div className="text-xs">
                          {count} tareas simultáneas en {zone}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null,
              )}
              {tasks.length > 0 &&
                totalDuration <= 10 &&
                !Object.values(storageUsage).some((u) => u > 80) &&
                !Object.values(zoneUsage).some((c) => c > 1) && (
                  <div className="p-3 rounded-lg bg-green-50 border-l-4 border-green-500 text-green-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">✅</span>
                      <div>
                        <div className="font-bold mb-1">Plan óptimo</div>
                        <div className="text-xs">Sin conflictos detectados</div>
                      </div>
                    </div>
                  </div>
                )}
              {tasks.length === 0 && (
                <div className="text-gray-400 text-center py-6">
                  <div className="text-3xl mb-2">🔔</div>
                  <p className="text-xs">Sin alertas actualmente</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
