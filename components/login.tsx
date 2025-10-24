"use client"

import type React from "react"
import { useState } from "react"
import Image from "next/image"

interface LoginProps {
  onLogin: () => void
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    // Simular un pequeño delay para mejor UX
    setTimeout(() => {
      const storedPassword = localStorage.getItem("shoronpo_password") || "obradorloco"

      if (password === storedPassword) {
        localStorage.setItem("shoronpo_authenticated", "true")
        onLogin()
      } else {
        setError("Contraseña incorrecta")
        setPassword("")
      }
      setIsLoading(false)
    }, 500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 ramen-pattern"></div>

      <div className="modern-card p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-32 h-32 bg-white rounded-full p-3 shadow-xl flex items-center justify-center border-4 border-[#3a4a9f]/20">
                <Image
                  src="/shoronpo-logo.png"
                  alt="Shoronpo"
                  width={128}
                  height={128}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Curved text around logo */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 200 200"
                style={{ transform: "scale(1.8)" }}
              >
                <defs>
                  <path id="loginCurve" d="M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0" />
                </defs>
                <text className="fill-[#3a4a9f] font-['Libre_Baskerville'] text-[10px] tracking-[0.3em] font-bold">
                  <textPath href="#loginCurve" startOffset="50%" textAnchor="middle">
                    SHORONPO • 小籠包 • RAMEN
                  </textPath>
                </text>
              </svg>
            </div>
          </div>

          <h1 className="font-['Libre_Baskerville'] text-3xl tracking-[0.2rem] text-[#1f2960] font-bold mb-2">
            SISTEMA DE PRODUCCIÓN
          </h1>
          <p className="text-gray-600 text-sm tracking-[0.1rem]">Ingresa tu contraseña para acceder</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-2 tracking-wide">
              CONTRASEÑA
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-[#3a4a9f] focus:ring-2 focus:ring-[#3a4a9f]/20 outline-none transition-all"
              placeholder="Ingresa tu contraseña"
              disabled={isLoading}
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600 font-medium">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white py-3 px-6 rounded-xl font-bold tracking-wider hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "VERIFICANDO..." : "INGRESAR"}
          </button>
        </form>
      </div>
    </div>
  )
}
