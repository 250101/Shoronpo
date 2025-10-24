export type Product = {
  name: string
  icon: string
  duration: number // hours
  zone: string
  tools: string[]
  storage: {
    name: string
    capacity: number
    conditions?: string // e.g., "preenfriado", "temperatura ambiente"
  }
  unitsPerBatch: number
  stockMin: number // minimum stock required
  shelfLife: number // days
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "on-demand"
  preferredDay?: string // e.g., "lunes", "martes"
  ingredients?: string[]
  notes?: string
}

export const productsDB: Record<string, Product> = {
  gyozas: {
    name: "Gyozas Yasai",
    icon: "🥟",
    duration: 2,
    zone: "Zona de Armado",
    tools: ["Batidora", "Mesada de trabajo", "Rodillo"],
    storage: { name: "Cámara de frío", capacity: 30, conditions: "preenfriado" },
    unitsPerBatch: 300,
    stockMin: 100,
    shelfLife: 7,
    frequency: "weekly",
    preferredDay: "lunes",
    ingredients: ["Masa", "Vegetales", "Salsa soja"],
    notes: "Requiere preenfriado antes de almacenar",
  },
  nikumiso: {
    name: "Nikumiso",
    icon: "🍜",
    duration: 3,
    zone: "Zona de Cocción",
    tools: ["Olla grande", "Hornalla 1", "Hornalla 2"],
    storage: { name: "Heladera A", capacity: 20 },
    unitsPerBatch: 5,
    stockMin: 2,
    shelfLife: 5,
    frequency: "weekly",
    preferredDay: "martes",
    ingredients: ["Carne picada", "Miso", "Cebolla", "Ajo"],
  },
  chashu: {
    name: "Chashu",
    icon: "🥩",
    duration: 4,
    zone: "Zona de Cocción",
    tools: ["Olla mediana", "Hornalla 3"],
    storage: { name: "Cámara de frío", capacity: 25 },
    unitsPerBatch: 3,
    stockMin: 1,
    shelfLife: 7,
    frequency: "weekly",
    preferredDay: "miércoles",
    ingredients: ["Panceta de cerdo", "Salsa soja", "Mirin", "Sake"],
  },
  tantanmen: {
    name: "Tantanmen Veggie Aburasoba",
    icon: "🍜",
    duration: 2.5,
    zone: "Zona de Cocción",
    tools: ["Olla grande", "Hornalla 4", "Procesadora"],
    storage: { name: "Heladera B", capacity: 35 },
    unitsPerBatch: 50,
    stockMin: 20,
    shelfLife: 3,
    frequency: "biweekly",
    preferredDay: "jueves",
    ingredients: ["Pasta de sésamo", "Aceite de chile", "Vegetales"],
  },
  shoronpos: {
    name: "Shoronpos Classic",
    icon: "🥟",
    duration: 3,
    zone: "Zona de Armado + Vapor",
    tools: ["Mesada de trabajo", "Vaporera", "Rodillo"],
    storage: { name: "Cámara de frío", capacity: 40 },
    unitsPerBatch: 200,
    stockMin: 80,
    shelfLife: 5,
    frequency: "weekly",
    preferredDay: "viernes",
    ingredients: ["Masa", "Cerdo", "Caldo", "Gelatina"],
  },
  ramen: {
    name: "Ramen Especial",
    icon: "🍜",
    duration: 3.5,
    zone: "Zona de Cocción",
    tools: ["Olla grande", "Hornalla 1", "Hornalla 2"],
    storage: { name: "Heladera A", capacity: 30 },
    unitsPerBatch: 40,
    stockMin: 15,
    shelfLife: 4,
    frequency: "weekly",
    preferredDay: "lunes",
    ingredients: ["Caldo de huesos", "Fideos", "Chashu", "Huevo"],
  },
}

export type ProductKey = keyof typeof productsDB

export type ProductionTask = {
  id: string
  productKey: ProductKey
  product: Product
  quantity: number
  batches: number
  startTime: number
  endTime: number
  totalDuration: number
}

export function saveProductsToStorage(products: Record<string, Product>) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shoronpo_products", JSON.stringify(products))
  }
}

export function loadProductsFromStorage(): Record<string, Product> {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("shoronpo_products")
    if (stored) {
      return JSON.parse(stored)
    }
  }
  return productsDB
}

export function addProduct(key: string, product: Product) {
  const products = loadProductsFromStorage()
  products[key] = product
  saveProductsToStorage(products)
  return products
}

export function deleteProduct(key: string) {
  const products = loadProductsFromStorage()
  delete products[key]
  saveProductsToStorage(products)
  return products
}
