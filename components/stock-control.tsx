"use client"

import { useState, useEffect } from "react"
import { loadProductsFromStorage, type Product } from "@/lib/products"

type StockLevel = {
  productKey: string
  product: Product
  currentStock: number
  stockMin: number
  status: "critical" | "low" | "ok"
}

type Order = {
  id: string
  productKey: string
  quantity: number
  date: string
  notes: string
  fulfilled: boolean
}

export default function StockControl() {
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [stockAmount, setStockAmount] = useState<string>("")
  const [orderProduct, setOrderProduct] = useState<string>("")
  const [orderQuantity, setOrderQuantity] = useState<string>("")
  const [orderDate, setOrderDate] = useState<string>("")
  const [orderNotes, setOrderNotes] = useState<string>("")
  const [showAddStock, setShowAddStock] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)

  useEffect(() => {
    loadStockData()
    loadOrders()
  }, [])

  const loadStockData = () => {
    const products = loadProductsFromStorage()
    const savedStock = localStorage.getItem("stock_levels")
    const stockData = savedStock ? JSON.parse(savedStock) : {}

    const levels: StockLevel[] = Object.entries(products).map(([key, product]) => {
      const currentStock = stockData[key] || 0
      const percentage = (currentStock / product.stockMin) * 100

      let status: "critical" | "low" | "ok" = "ok"
      if (percentage < 50) status = "critical"
      else if (percentage < 100) status = "low"

      return {
        productKey: key,
        product,
        currentStock,
        stockMin: product.stockMin,
        status,
      }
    })

    setStockLevels(levels)
  }

  const loadOrders = () => {
    const savedOrders = localStorage.getItem("orders")
    if (savedOrders) {
      setOrders(JSON.parse(savedOrders))
    }
  }

  const saveStockData = (stockData: { [key: string]: number }) => {
    localStorage.setItem("stock_levels", JSON.stringify(stockData))
    loadStockData()
  }

  const saveOrders = (newOrders: Order[]) => {
    localStorage.setItem("orders", JSON.stringify(newOrders))
    setOrders(newOrders)
  }

  const updateStock = (productKey: string, amount: number) => {
    const savedStock = localStorage.getItem("stock_levels")
    const stockData = savedStock ? JSON.parse(savedStock) : {}
    stockData[productKey] = (stockData[productKey] || 0) + amount
    saveStockData(stockData)
  }

  const setStock = (productKey: string, amount: number) => {
    const savedStock = localStorage.getItem("stock_levels")
    const stockData = savedStock ? JSON.parse(savedStock) : {}
    stockData[productKey] = amount
    saveStockData(stockData)
  }

  const handleAddStock = () => {
    if (!selectedProduct || !stockAmount) {
      alert("Completa todos los campos")
      return
    }

    const amount = Number.parseInt(stockAmount)
    if (isNaN(amount)) {
      alert("Ingresa una cantidad válida")
      return
    }

    setStock(selectedProduct, amount)
    setSelectedProduct("")
    setStockAmount("")
    setShowAddStock(false)
    alert("Stock actualizado!")
  }

  const handleAddOrder = () => {
    if (!orderProduct || !orderQuantity || !orderDate) {
      alert("Completa todos los campos obligatorios")
      return
    }

    const quantity = Number.parseInt(orderQuantity)
    if (isNaN(quantity) || quantity <= 0) {
      alert("Ingresa una cantidad válida")
      return
    }

    const newOrder: Order = {
      id: Date.now().toString(),
      productKey: orderProduct,
      quantity,
      date: orderDate,
      notes: orderNotes,
      fulfilled: false,
    }

    saveOrders([...orders, newOrder])
    setOrderProduct("")
    setOrderQuantity("")
    setOrderDate("")
    setOrderNotes("")
    setShowAddOrder(false)
    alert("Pedido agregado!")
  }

  const fulfillOrder = (orderId: string) => {
    const updatedOrders = orders.map((order) => (order.id === orderId ? { ...order, fulfilled: true } : order))
    saveOrders(updatedOrders)
  }

  const deleteOrder = (orderId: string) => {
    if (confirm("¿Estás seguro de eliminar este pedido?")) {
      saveOrders(orders.filter((order) => order.id !== orderId))
    }
  }

  const getProductionSuggestions = () => {
    return stockLevels
      .filter((level) => level.status === "critical" || level.status === "low")
      .map((level) => ({
        ...level,
        suggestedProduction: Math.max(level.stockMin * 2 - level.currentStock, level.product.unitsPerBatch),
      }))
  }

  const suggestions = getProductionSuggestions()
  const pendingOrders = orders.filter((o) => !o.fulfilled)
  const products = loadProductsFromStorage()

  return (
    <div className="space-y-6">
      {/* Stock overview */}
      <div className="modern-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold">
            NIVELES DE STOCK
          </h3>
          <button
            onClick={() => setShowAddStock(!showAddStock)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3a4a9f] to-[#4555af] text-white font-bold hover:shadow-lg transition-all"
          >
            {showAddStock ? "Cancelar" : "Ajustar Stock"}
          </button>
        </div>

        {showAddStock && (
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Producto</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
                >
                  <option value="">Selecciona un producto</option>
                  {Object.entries(products).map(([key, product]) => (
                    <option key={key} value={key}>
                      {product.icon} {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Cantidad actual</label>
                <input
                  type="number"
                  value={stockAmount}
                  onChange={(e) => setStockAmount(e.target.value)}
                  placeholder="Ej: 150"
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-[#3a4a9f] focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddStock}
                  className="w-full px-4 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all"
                >
                  Actualizar Stock
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockLevels.map((level) => {
            const percentage = (level.currentStock / level.stockMin) * 100

            return (
              <div
                key={level.productKey}
                className={`p-5 rounded-xl border-2 ${
                  level.status === "critical"
                    ? "bg-red-50 border-red-300"
                    : level.status === "low"
                      ? "bg-yellow-50 border-yellow-300"
                      : "bg-green-50 border-green-300"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{level.product.icon}</span>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800">{level.product.name}</h4>
                    <p className="text-xs text-gray-600">
                      Stock mínimo: {level.stockMin} {level.product.frequency}
                    </p>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm font-bold mb-1">
                    <span className="text-gray-700">Stock actual</span>
                    <span
                      className={
                        level.status === "critical"
                          ? "text-red-600"
                          : level.status === "low"
                            ? "text-yellow-600"
                            : "text-green-600"
                      }
                    >
                      {level.currentStock} uds
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        level.status === "critical"
                          ? "bg-gradient-to-r from-red-500 to-red-600"
                          : level.status === "low"
                            ? "bg-gradient-to-r from-yellow-500 to-yellow-600"
                            : "bg-gradient-to-r from-green-500 to-green-600"
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>

                {level.status !== "ok" && (
                  <div
                    className={`p-2 rounded-lg text-xs font-bold ${
                      level.status === "critical"
                        ? "bg-red-100 text-red-700 border border-red-300"
                        : "bg-yellow-100 text-yellow-700 border border-yellow-300"
                    }`}
                  >
                    {level.status === "critical" ? "Stock crítico!" : "Stock bajo"}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Production suggestions */}
      {suggestions.length > 0 && (
        <div className="modern-card p-6 bg-orange-50 border-2 border-orange-200">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-orange-900 font-bold mb-4">
            SUGERENCIAS DE PRODUCCIÓN
          </h3>
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.productKey}
                className="flex items-center justify-between p-4 bg-white rounded-xl border-2 border-orange-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{suggestion.product.icon}</span>
                  <div>
                    <div className="font-bold text-gray-800">{suggestion.product.name}</div>
                    <div className="text-sm text-gray-600">
                      Stock actual: {suggestion.currentStock} / Mínimo: {suggestion.stockMin}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Producir</div>
                  <div className="text-2xl font-bold text-orange-600">{suggestion.suggestedProduction} uds</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      <div className="modern-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Libre_Baskerville'] text-xl tracking-wider text-[#1f2960] font-bold">
            PEDIDOS FUTUROS
          </h3>
          <button
            onClick={() => setShowAddOrder(!showAddOrder)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-bold hover:shadow-lg transition-all"
          >
            {showAddOrder ? "Cancelar" : "Nuevo Pedido"}
          </button>
        </div>

        {showAddOrder && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Producto</label>
                <select
                  value={orderProduct}
                  onChange={(e) => setOrderProduct(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-green-600 focus:outline-none"
                >
                  <option value="">Selecciona un producto</option>
                  {Object.entries(products).map(([key, product]) => (
                    <option key={key} value={key}>
                      {product.icon} {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Cantidad</label>
                <input
                  type="number"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                  placeholder="Ej: 500"
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-green-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Fecha de entrega</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-green-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Notas (opcional)</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ej: Evento especial"
                  className="w-full p-3 rounded-xl border-2 border-gray-300 focus:border-green-600 focus:outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleAddOrder}
              className="w-full px-4 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all"
            >
              Agregar Pedido
            </button>
          </div>
        )}

        {pendingOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3 opacity-30">📦</div>
            <p className="text-sm font-bold">No hay pedidos pendientes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => {
              const product = products[order.productKey]
              if (!product) return null

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border-2 border-gray-200"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{product.icon}</span>
                    <div>
                      <div className="font-bold text-gray-800">{product.name}</div>
                      <div className="text-sm text-gray-600">
                        {order.quantity} uds • {order.date}
                      </div>
                      {order.notes && <div className="text-xs text-gray-500 mt-1">{order.notes}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fulfillOrder(order.id)}
                      className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-all"
                    >
                      Completar
                    </button>
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-all"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
