"use client"

import { useState, useEffect } from "react"

type Supplier = {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  products: string
  notes: string
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    products: "",
    notes: "",
  })

  useEffect(() => {
    const saved = localStorage.getItem("suppliers")
    if (saved) {
      setSuppliers(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  const addSupplier = () => {
    if (!formData.name.trim() || !formData.contact.trim()) {
      alert("Completa al menos nombre y contacto")
      return
    }

    const newSupplier: Supplier = {
      id: Date.now().toString(),
      ...formData,
    }

    setSuppliers([...suppliers, newSupplier])
    setFormData({ name: "", contact: "", phone: "", email: "", products: "", notes: "" })
    setIsAdding(false)
  }

  const deleteSupplier = (id: string) => {
    if (confirm("¿Eliminar este proveedor?")) {
      setSuppliers(suppliers.filter((s) => s.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-6">
        <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-[#4455bb]/30">
          <h2 className="font-['Special_Elite'] text-2xl tracking-wider">PROVEEDORES</h2>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-6 py-3 rounded-lg border-3 border-black font-['Special_Elite'] bg-gradient-to-br from-[#4caf50] to-[#66bb6a] text-white shadow-[3px_3px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1a1a1a] transition-all duration-200"
          >
            {isAdding ? "CANCELAR" : "+ NUEVO PROVEEDOR"}
          </button>
        </div>

        {isAdding && (
          <div className="mb-6 p-6 rounded-lg border-3 border-[#4455bb] bg-[#4455bb]/5">
            <h3 className="font-['Special_Elite'] text-lg mb-4">AGREGAR PROVEEDOR</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Nombre del proveedor:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Persona de contacto:</label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Teléfono:</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Email:</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold mb-2 text-gray-700">Productos que suministra:</label>
                <input
                  type="text"
                  value={formData.products}
                  onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                  placeholder="Ej: Carne de cerdo, verduras, especias"
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold mb-2 text-gray-700">Notas:</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full p-3 rounded-lg border-2 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb] resize-none"
                />
              </div>
            </div>
            <button
              onClick={addSupplier}
              className="mt-4 px-6 py-3 rounded-lg border-3 border-black font-['Special_Elite'] bg-gradient-to-br from-[#4455bb] to-[#5566cc] text-white shadow-[3px_3px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1a1a1a] transition-all duration-200"
            >
              GUARDAR PROVEEDOR
            </button>
          </div>
        )}

        {suppliers.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <div className="text-7xl mb-4">🚚</div>
            <p className="text-lg font-['Special_Elite']">No hay proveedores registrados</p>
            <p className="text-sm mt-2 opacity-75">Agrega tu primer proveedor</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="p-5 rounded-lg border-3 border-black bg-white shadow-[3px_3px_0_#1a1a1a] hover:shadow-[4px_4px_0_#1a1a1a] hover:translate-y-[-2px] transition-all duration-200"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-['Special_Elite'] text-lg text-[#4455bb]">{supplier.name}</h3>
                  <button
                    onClick={() => deleteSupplier(supplier.id)}
                    className="text-red-500 hover:text-red-700 font-bold text-xl"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50 border-2 border-gray-200">
                    <div className="font-bold text-gray-700 mb-1">Contacto</div>
                    <div>{supplier.contact}</div>
                  </div>

                  {supplier.phone && (
                    <div className="p-3 rounded-lg bg-gray-50 border-2 border-gray-200">
                      <div className="font-bold text-gray-700 mb-1">Teléfono</div>
                      <div className="font-['Courier_Prime']">{supplier.phone}</div>
                    </div>
                  )}

                  {supplier.email && (
                    <div className="p-3 rounded-lg bg-gray-50 border-2 border-gray-200">
                      <div className="font-bold text-gray-700 mb-1">Email</div>
                      <div className="font-['Courier_Prime'] text-xs break-all">{supplier.email}</div>
                    </div>
                  )}

                  {supplier.products && (
                    <div className="p-3 rounded-lg bg-gray-50 border-2 border-gray-200">
                      <div className="font-bold text-gray-700 mb-1">Productos</div>
                      <div>{supplier.products}</div>
                    </div>
                  )}

                  {supplier.notes && (
                    <div className="p-3 rounded-lg bg-gray-50 border-2 border-gray-200">
                      <div className="font-bold text-gray-700 mb-1">Notas</div>
                      <div className="text-xs">{supplier.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
