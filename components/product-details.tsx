"use client"

import { productsDB } from "@/lib/products"

export default function ProductDetails() {
  return (
    <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-6">
      <h2 className="font-['Special_Elite'] text-2xl tracking-wider mb-6 pb-4 border-b-2 border-[#4455bb]/30">
        DETALLES DE PRODUCTOS
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {Object.entries(productsDB).map(([key, product]) => (
          <div
            key={key}
            className="p-6 rounded-lg border-3 border-black bg-gradient-to-br from-white to-gray-50 shadow-[3px_3px_0_#1a1a1a]"
          >
            <div className="flex items-center gap-4 mb-5 pb-4 border-b-2 border-gray-200">
              <div className="w-20 h-20 flex items-center justify-center bg-gradient-to-br from-[#4455bb]/10 to-[#5566cc]/10 rounded-xl border-2 border-[#4455bb]/30">
                <span className="text-5xl">{product.icon}</span>
              </div>
              <div>
                <h3 className="font-['Special_Elite'] text-xl text-[#4455bb]">{product.name}</h3>
                <p className="text-sm text-gray-600 mt-1">Código: {key.toUpperCase()}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-white border-2 border-gray-200">
                <div className="font-bold text-gray-700 mb-1">Duración por lote</div>
                <div className="font-['Courier_Prime'] text-lg text-[#4455bb]">{product.duration} horas</div>
              </div>

              <div className="p-3 rounded-lg bg-white border-2 border-gray-200">
                <div className="font-bold text-gray-700 mb-1">Unidades por lote</div>
                <div className="font-['Courier_Prime'] text-lg text-[#4455bb]">{product.unitsPerBatch} unidades</div>
              </div>

              <div className="p-3 rounded-lg bg-white border-2 border-gray-200">
                <div className="font-bold text-gray-700 mb-1">Zona de trabajo</div>
                <div>{product.zone}</div>
              </div>

              <div className="p-3 rounded-lg bg-white border-2 border-gray-200">
                <div className="font-bold text-gray-700 mb-2">Herramientas necesarias</div>
                <div className="flex flex-wrap gap-2">
                  {product.tools.map((tool) => (
                    <span key={tool} className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border-2 border-gray-200">
                <div className="font-bold text-gray-700 mb-1">Almacenamiento</div>
                <div>
                  {product.storage.name} ({product.storage.capacity}% por lote)
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
