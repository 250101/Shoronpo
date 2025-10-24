"use client"

import { useState, useEffect } from "react"

type Note = {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("general")
  const [selectedNote, setSelectedNote] = useState<string | null>(null)

  const categories = ["general", "producción", "proveedores", "recetas", "importante"]

  useEffect(() => {
    const saved = localStorage.getItem("notes")
    if (saved) {
      setNotes(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("notes", JSON.stringify(notes))
  }, [notes])

  const addNote = () => {
    if (!title.trim() || !content.trim()) {
      alert("Completa título y contenido")
      return
    }

    const newNote: Note = {
      id: Date.now().toString(),
      title,
      content,
      category,
      createdAt: new Date().toISOString(),
    }

    setNotes([newNote, ...notes])
    setTitle("")
    setContent("")
    setCategory("general")
  }

  const deleteNote = (id: string) => {
    if (confirm("¿Eliminar esta nota?")) {
      setNotes(notes.filter((n) => n.id !== id))
      if (selectedNote === id) setSelectedNote(null)
    }
  }

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: "bg-gray-100 text-gray-700 border-gray-300",
      producción: "bg-blue-100 text-blue-700 border-blue-300",
      proveedores: "bg-green-100 text-green-700 border-green-300",
      recetas: "bg-orange-100 text-orange-700 border-orange-300",
      importante: "bg-red-100 text-red-700 border-red-300",
    }
    return colors[cat] || colors.general
  }

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-5">
          <h2 className="font-['Special_Elite'] text-xl tracking-wider mb-4 pb-3 border-b-2 border-[#4455bb]/30">
            NUEVA NOTA
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">Título:</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título de la nota"
                className="w-full p-3 rounded-lg border-3 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">Categoría:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 rounded-lg border-3 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb] transition-colors"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">Contenido:</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escribe tu nota aquí..."
                rows={8}
                className="w-full p-3 rounded-lg border-3 border-black font-['Courier_Prime'] focus:outline-none focus:border-[#4455bb] transition-colors resize-none"
              />
            </div>

            <button
              onClick={addNote}
              className="w-full p-3 rounded-lg border-3 border-black font-['Special_Elite'] bg-gradient-to-br from-[#4caf50] to-[#66bb6a] text-white shadow-[3px_3px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#1a1a1a] transition-all duration-200"
            >
              + GUARDAR NOTA
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border-3 border-black shadow-[4px_4px_0_#1a1a1a] p-6">
        <h2 className="font-['Special_Elite'] text-2xl tracking-wider mb-6 pb-4 border-b-2 border-[#4455bb]/30">
          MIS NOTAS
        </h2>

        {notes.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <div className="text-7xl mb-4">📝</div>
            <p className="text-lg font-['Special_Elite']">No hay notas guardadas</p>
            <p className="text-sm mt-2 opacity-75">Crea tu primera nota</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-5 rounded-lg border-3 border-black bg-white shadow-[3px_3px_0_#1a1a1a] hover:shadow-[4px_4px_0_#1a1a1a] hover:translate-y-[-2px] transition-all duration-200 cursor-pointer"
                onClick={() => setSelectedNote(note.id)}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg flex-1">{note.title}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNote(note.id)
                    }}
                    className="text-red-500 hover:text-red-700 font-bold text-xl ml-2"
                  >
                    ×
                  </button>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-3 font-['Courier_Prime']">{note.content}</p>

                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded border-2 ${getCategoryColor(note.category)}`}>
                    {note.category}
                  </span>
                  <span className="text-gray-500">{new Date(note.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
