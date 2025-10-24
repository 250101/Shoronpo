"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import DailyPlanner from "@/components/daily-planner"
import WeeklyPlanner from "@/components/weekly-planner"
import Notes from "@/components/notes"
import ProductDetails from "@/components/product-details"
import Suppliers from "@/components/suppliers"
import ImportExport from "@/components/import-export"
import WorkspaceMap from "@/components/workspace-map"
import StockControl from "@/components/stock-control"
import Reports from "@/components/reports"
import RawMaterials from "@/components/raw-materials"
import Login from "@/components/login"
import ChangePassword from "@/components/change-password"
import SavedPlans from "@/components/saved-plans"

type Section =
  | "weekly"
  | "daily"
  | "notes"
  | "details"
  | "suppliers"
  | "config"
  | "workspace"
  | "stock"
  | "reports"
  | "materials"
  | "saved-plans"

export default function ProductionPlanner() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<Section>("weekly")

  useEffect(() => {
    const authenticated = localStorage.getItem("shoronpo_authenticated") === "true"
    setIsAuthenticated(authenticated)
    setIsLoading(false)
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem("shoronpo_authenticated")
    setIsAuthenticated(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3a4a9f] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  const sections = [
    { id: "weekly" as Section, name: "Semanal", icon: "📅", fullName: "Planificación Semanal" },
    { id: "daily" as Section, name: "Diaria", icon: "📋", fullName: "Planificación Diaria" },
    { id: "saved-plans" as Section, name: "Planes Guardados", icon: "💾", fullName: "Planes Guardados" },
    { id: "workspace" as Section, name: "Mapa", icon: "🏭", fullName: "Mapa del Obrador" },
    { id: "stock" as Section, name: "Stock", icon: "📦", fullName: "Control de Stock y Pedidos" },
    { id: "materials" as Section, name: "Materia Prima", icon: "🥬", fullName: "Almacén de Materia Prima" },
    { id: "reports" as Section, name: "Reportes", icon: "📊", fullName: "Reportes y Estadísticas" },
    { id: "notes" as Section, name: "Notas", icon: "📝", fullName: "Notas y Recordatorios" },
    { id: "details" as Section, name: "Productos", icon: "🥟", fullName: "Detalles de Productos" },
    { id: "suppliers" as Section, name: "Proveedores", icon: "🚚", fullName: "Proveedores y Contactos" },
    { id: "config" as Section, name: "Configuración", icon: "⚙️", fullName: "Importar y Exportar Datos" },
  ]

  const currentSection = sections.find((s) => s.id === activeSection)

  return (
    <div className="min-h-screen relative">
      <header className="bg-gradient-to-r from-[#1f2960]/98 via-[#2a3570]/98 to-[#1f2960]/98 border-b-2 border-white/40 relative overflow-hidden backdrop-blur-xl shadow-2xl">
        <div className="absolute inset-0 opacity-10 ramen-pattern"></div>

        <div className="max-w-[1800px] mx-auto px-6 py-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 bg-white rounded-full p-2 shadow-xl flex items-center justify-center border-2 border-white/70">
                  <Image
                    src="/shoronpo-logo.png"
                    alt="Shoronpo"
                    width={96}
                    height={96}
                    className="w-full h-full object-contain"
                  />
                </div>

                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 200 200"
                  style={{ transform: "scale(1.6)" }}
                >
                  <defs>
                    <path id="curve" d="M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0" />
                  </defs>
                  <text className="fill-white/90 font-['Libre_Baskerville'] text-[12px] tracking-[0.25em] font-bold">
                    <textPath href="#curve" startOffset="50%" textAnchor="middle">
                      SHORONPO • 小籠包 • RAMEN
                    </textPath>
                  </text>
                </svg>
              </div>

              <div>
                <h1 className="font-['Libre_Baskerville'] text-3xl tracking-[0.2rem] text-white font-bold">
                  OBRADOR SHORONPO — SISTEMA DE PRODUCCIÓN
                </h1>
                <p className="text-white/80 text-sm tracking-[0.15rem] mt-1 font-light">
                  Planificación y Gestión • 酒場
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                <div className="text-white/70 text-xs font-light">Obrador</div>
                <div className="text-white font-bold text-sm mt-0.5">{currentSection?.name}</div>
              </div>
              <button
                onClick={handleLogout}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white text-sm font-bold transition-all"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1800px] mx-auto p-4 lg:p-6">
        <div className="grid lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
          <aside className="space-y-3">
            <div className="modern-card p-5 sticky top-4">
              <div className="mb-4 pb-3 border-b border-gray-200">
                <h2 className="font-['Libre_Baskerville'] text-lg tracking-[0.15rem] text-[#1f2960] font-bold">
                  NAVEGACIÓN
                </h2>
              </div>

              <nav className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full p-4 rounded-xl border text-left transition-all duration-300 ${
                      activeSection === section.id
                        ? "bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white shadow-lg border-[#3a4a9f] scale-[1.02]"
                        : "bg-white/70 hover:bg-white border-gray-200 hover:border-[#3a4a9f]/50 shadow-sm hover:shadow-md text-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{section.icon}</span>
                      <div className="flex-1">
                        <div className="font-bold text-base">{section.name}</div>
                        <div
                          className={`text-xs mt-0.5 ${activeSection === section.id ? "text-white/80" : "text-gray-500"}`}
                        >
                          {section.fullName}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </nav>

              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-center">
                <Image
                  src="/shoronpo-logo.png"
                  alt="Shoronpo"
                  width={60}
                  height={60}
                  className="w-16 h-16 object-contain opacity-60 hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </aside>

          <main className="relative">
            <div className="modern-card p-6 mb-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-[#3a4a9f] to-[#4555af] rounded-xl flex items-center justify-center text-4xl shadow-lg">
                  {currentSection?.icon}
                </div>
                <div className="flex-1">
                  <h2 className="font-['Libre_Baskerville'] text-2xl tracking-[0.2rem] text-[#1f2960] font-bold">
                    {currentSection?.fullName.toUpperCase()}
                  </h2>
                  <p className="text-sm text-gray-700 mt-1">
                    {activeSection === "weekly" && "Organiza la producción de toda la semana"}
                    {activeSection === "daily" && "Planifica las tareas del día con detalle"}
                    {activeSection === "saved-plans" && "Visualiza y gestiona planes guardados"}
                    {activeSection === "workspace" && "Visualiza el uso del obrador y almacenamiento"}
                    {activeSection === "stock" && "Monitorea stock y gestiona pedidos futuros"}
                    {activeSection === "materials" && "Gestiona inventario y calcula necesidades de compra"}
                    {activeSection === "reports" && "Analiza estadísticas y genera reportes"}
                    {activeSection === "notes" && "Guarda notas y recordatorios importantes"}
                    {activeSection === "details" && "Consulta información técnica de productos"}
                    {activeSection === "suppliers" && "Gestiona contactos de proveedores"}
                    {activeSection === "config" && "Importa y exporta datos de productos"}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              {activeSection === "weekly" && <WeeklyPlanner />}
              {activeSection === "daily" && <DailyPlanner />}
              {activeSection === "saved-plans" && <SavedPlans />}
              {activeSection === "workspace" && <WorkspaceMap />}
              {activeSection === "stock" && <StockControl />}
              {activeSection === "materials" && <RawMaterials />}
              {activeSection === "reports" && <Reports />}
              {activeSection === "notes" && <Notes />}
              {activeSection === "details" && <ProductDetails />}
              {activeSection === "suppliers" && <Suppliers />}
              {activeSection === "config" && (
                <div className="space-y-6">
                  <ImportExport />
                  <ChangePassword />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <footer className="bg-gradient-to-r from-[#151f45]/98 to-[#1f2960]/98 border-t-2 border-white/40 mt-8 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-6 py-8">
          <div className="grid md:grid-cols-3 gap-6 text-white/90 text-sm">
            <div>
              <h3 className="font-['Libre_Baskerville'] text-base tracking-wider text-white mb-3 font-bold">
                SHORONPO 小籠包
              </h3>
              <p className="text-xs leading-relaxed text-white/70">
                Obrador especializado en gastronomía japonesa y asiática.
                <br />
                Planificación y control de producción.
              </p>
            </div>
            <div>
              <h3 className="font-['Libre_Baskerville'] text-base tracking-wider text-white mb-3 font-bold">SISTEMA</h3>
              <p className="text-xs leading-relaxed text-white/70">
                Sistema de Planificación de Producción
                <br />
                Versión 1.0
                <br />© 2025 Martín Moore
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
