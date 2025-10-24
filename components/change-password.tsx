"use client"

import type React from "react"

import { useState } from "react"

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const storedPassword = localStorage.getItem("shoronpo_password") || "obradorloco"

    if (currentPassword !== storedPassword) {
      setMessage({ type: "error", text: "La contraseña actual es incorrecta" })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "La nueva contraseña debe tener al menos 6 caracteres" })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden" })
      return
    }

    localStorage.setItem("shoronpo_password", newPassword)
    setMessage({ type: "success", text: "Contraseña actualizada correctamente" })
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
  }

  return (
    <div className="modern-card p-6">
      <h3 className="font-['Libre_Baskerville'] text-xl tracking-[0.15rem] text-[#1f2960] font-bold mb-6">
        CAMBIAR CONTRASEÑA
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña Actual</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] focus:ring-2 focus:ring-[#3a4a9f]/20 outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Nueva Contraseña</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] focus:ring-2 focus:ring-[#3a4a9f]/20 outline-none"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Confirmar Nueva Contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#3a4a9f] focus:ring-2 focus:ring-[#3a4a9f]/20 outline-none"
            required
            minLength={6}
          />
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          className="bg-gradient-to-br from-[#3a4a9f] to-[#4555af] text-white py-2 px-6 rounded-lg font-bold hover:shadow-lg transition-all"
        >
          Actualizar Contraseña
        </button>
      </form>
    </div>
  )
}
