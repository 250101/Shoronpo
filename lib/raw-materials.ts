export type RawMaterial = {
  id: string
  name: string
  category: "proteina" | "vegetal" | "condimento" | "masa" | "liquido" | "otro"
  unit: "kg" | "litros" | "unidades" | "gramos"
  currentStock: number
  minStock: number
  costPerUnit: number
  supplier?: string
  notes?: string
}

export type MaterialRequirement = {
  materialId: string
  materialName: string
  quantityNeeded: number
  unit: string
  currentStock: number
  toBuy: number
  estimatedCost: number
}

export type ProductRecipe = {
  productKey: string
  productName: string
  materials: {
    materialId: string
    quantityPerBatch: number
  }[]
}

export const rawMaterialsDB: Record<string, RawMaterial> = {
  masa_gyoza: {
    id: "masa_gyoza",
    name: "Masa para Gyoza",
    category: "masa",
    unit: "kg",
    currentStock: 10,
    minStock: 5,
    costPerUnit: 8.5,
    supplier: "Proveedor A",
    notes: "Masa fresca, usar dentro de 3 días",
  },
  vegetales_mix: {
    id: "vegetales_mix",
    name: "Mix de Vegetales",
    category: "vegetal",
    unit: "kg",
    currentStock: 15,
    minStock: 8,
    costPerUnit: 4.2,
    supplier: "Proveedor B",
  },
  salsa_soja: {
    id: "salsa_soja",
    name: "Salsa de Soja",
    category: "condimento",
    unit: "litros",
    currentStock: 5,
    minStock: 2,
    costPerUnit: 12.0,
    supplier: "Proveedor C",
  },
  carne_picada: {
    id: "carne_picada",
    name: "Carne Picada",
    category: "proteina",
    unit: "kg",
    currentStock: 8,
    minStock: 5,
    costPerUnit: 15.5,
    supplier: "Proveedor D",
  },
  miso: {
    id: "miso",
    name: "Pasta de Miso",
    category: "condimento",
    unit: "kg",
    currentStock: 3,
    minStock: 1,
    costPerUnit: 18.0,
    supplier: "Proveedor C",
  },
  cebolla: {
    id: "cebolla",
    name: "Cebolla",
    category: "vegetal",
    unit: "kg",
    currentStock: 12,
    minStock: 5,
    costPerUnit: 2.5,
    supplier: "Proveedor B",
  },
  ajo: {
    id: "ajo",
    name: "Ajo",
    category: "vegetal",
    unit: "kg",
    currentStock: 4,
    minStock: 2,
    costPerUnit: 6.0,
    supplier: "Proveedor B",
  },
  panceta_cerdo: {
    id: "panceta_cerdo",
    name: "Panceta de Cerdo",
    category: "proteina",
    unit: "kg",
    currentStock: 6,
    minStock: 3,
    costPerUnit: 18.5,
    supplier: "Proveedor D",
  },
  mirin: {
    id: "mirin",
    name: "Mirin",
    category: "condimento",
    unit: "litros",
    currentStock: 2,
    minStock: 1,
    costPerUnit: 14.0,
    supplier: "Proveedor C",
  },
  sake: {
    id: "sake",
    name: "Sake de Cocina",
    category: "liquido",
    unit: "litros",
    currentStock: 3,
    minStock: 1,
    costPerUnit: 16.0,
    supplier: "Proveedor C",
  },
  pasta_sesamo: {
    id: "pasta_sesamo",
    name: "Pasta de Sésamo",
    category: "condimento",
    unit: "kg",
    currentStock: 2,
    minStock: 1,
    costPerUnit: 22.0,
    supplier: "Proveedor C",
  },
  aceite_chile: {
    id: "aceite_chile",
    name: "Aceite de Chile",
    category: "condimento",
    unit: "litros",
    currentStock: 1.5,
    minStock: 0.5,
    costPerUnit: 25.0,
    supplier: "Proveedor C",
  },
  cerdo_molido: {
    id: "cerdo_molido",
    name: "Cerdo Molido",
    category: "proteina",
    unit: "kg",
    currentStock: 7,
    minStock: 4,
    costPerUnit: 16.0,
    supplier: "Proveedor D",
  },
  caldo_huesos: {
    id: "caldo_huesos",
    name: "Caldo de Huesos",
    category: "liquido",
    unit: "litros",
    currentStock: 10,
    minStock: 5,
    costPerUnit: 8.0,
    supplier: "Proveedor A",
  },
  gelatina: {
    id: "gelatina",
    name: "Gelatina",
    category: "otro",
    unit: "kg",
    currentStock: 1,
    minStock: 0.5,
    costPerUnit: 12.0,
    supplier: "Proveedor A",
  },
  fideos_ramen: {
    id: "fideos_ramen",
    name: "Fideos de Ramen",
    category: "masa",
    unit: "kg",
    currentStock: 8,
    minStock: 4,
    costPerUnit: 6.5,
    supplier: "Proveedor A",
  },
  huevos: {
    id: "huevos",
    name: "Huevos",
    category: "proteina",
    unit: "unidades",
    currentStock: 60,
    minStock: 30,
    costPerUnit: 0.35,
    supplier: "Proveedor B",
  },
}

export const productRecipes: Record<string, ProductRecipe> = {
  gyozas: {
    productKey: "gyozas",
    productName: "Gyozas Yasai",
    materials: [
      { materialId: "masa_gyoza", quantityPerBatch: 2.5 }, // 2.5 kg por lote de 300 unidades
      { materialId: "vegetales_mix", quantityPerBatch: 3.0 },
      { materialId: "salsa_soja", quantityPerBatch: 0.3 },
    ],
  },
  nikumiso: {
    productKey: "nikumiso",
    productName: "Nikumiso",
    materials: [
      { materialId: "carne_picada", quantityPerBatch: 2.0 },
      { materialId: "miso", quantityPerBatch: 0.5 },
      { materialId: "cebolla", quantityPerBatch: 1.0 },
      { materialId: "ajo", quantityPerBatch: 0.2 },
    ],
  },
  chashu: {
    productKey: "chashu",
    productName: "Chashu",
    materials: [
      { materialId: "panceta_cerdo", quantityPerBatch: 3.0 },
      { materialId: "salsa_soja", quantityPerBatch: 0.4 },
      { materialId: "mirin", quantityPerBatch: 0.2 },
      { materialId: "sake", quantityPerBatch: 0.2 },
    ],
  },
  tantanmen: {
    productKey: "tantanmen",
    productName: "Tantanmen Veggie Aburasoba",
    materials: [
      { materialId: "pasta_sesamo", quantityPerBatch: 0.8 },
      { materialId: "aceite_chile", quantityPerBatch: 0.3 },
      { materialId: "vegetales_mix", quantityPerBatch: 2.0 },
    ],
  },
  shoronpos: {
    productKey: "shoronpos",
    productName: "Shoronpos Classic",
    materials: [
      { materialId: "masa_gyoza", quantityPerBatch: 2.0 },
      { materialId: "cerdo_molido", quantityPerBatch: 2.5 },
      { materialId: "caldo_huesos", quantityPerBatch: 1.0 },
      { materialId: "gelatina", quantityPerBatch: 0.3 },
    ],
  },
  ramen: {
    productKey: "ramen",
    productName: "Ramen Especial",
    materials: [
      { materialId: "caldo_huesos", quantityPerBatch: 4.0 },
      { materialId: "fideos_ramen", quantityPerBatch: 2.0 },
      { materialId: "panceta_cerdo", quantityPerBatch: 1.5 },
      { materialId: "huevos", quantityPerBatch: 40 },
    ],
  },
}

export function calculateMaterialNeeds(
  weeklyProduction: { productKey: string; batches: number }[],
): MaterialRequirement[] {
  const materials = loadRawMaterialsFromStorage()
  const materialNeeds: Record<string, MaterialRequirement> = {}

  // Calcular necesidades por cada producción
  weeklyProduction.forEach(({ productKey, batches }) => {
    const recipe = productRecipes[productKey]
    if (!recipe) return

    recipe.materials.forEach(({ materialId, quantityPerBatch }) => {
      const material = materials[materialId]
      if (!material) return

      const totalNeeded = quantityPerBatch * batches

      if (!materialNeeds[materialId]) {
        materialNeeds[materialId] = {
          materialId,
          materialName: material.name,
          quantityNeeded: 0,
          unit: material.unit,
          currentStock: material.currentStock,
          toBuy: 0,
          estimatedCost: 0,
        }
      }

      materialNeeds[materialId].quantityNeeded += totalNeeded
    })
  })

  // Calcular cuánto comprar
  Object.values(materialNeeds).forEach((need) => {
    const material = materials[need.materialId]
    const deficit = need.quantityNeeded - need.currentStock

    if (deficit > 0) {
      need.toBuy = Math.ceil(deficit)
      need.estimatedCost = need.toBuy * material.costPerUnit
    }
  })

  return Object.values(materialNeeds).sort((a, b) => b.toBuy - a.toBuy)
}

export function saveRawMaterialsToStorage(materials: Record<string, RawMaterial>) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shoronpo_raw_materials", JSON.stringify(materials))
  }
}

export function loadRawMaterialsFromStorage(): Record<string, RawMaterial> {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("shoronpo_raw_materials")
    if (stored) {
      return JSON.parse(stored)
    }
  }
  return rawMaterialsDB
}

export function updateMaterialStock(materialId: string, newStock: number) {
  const materials = loadRawMaterialsFromStorage()
  if (materials[materialId]) {
    materials[materialId].currentStock = newStock
    saveRawMaterialsToStorage(materials)
  }
  return materials
}

export function addRawMaterial(material: RawMaterial) {
  const materials = loadRawMaterialsFromStorage()
  materials[material.id] = material
  saveRawMaterialsToStorage(materials)
  return materials
}
