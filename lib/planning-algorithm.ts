import { loadProductsFromStorage, type Product } from "./products"

export type PlannedProduction = {
  productKey: string
  product: Product
  quantity: number
  day: string
  startHour: number
  endHour: number
  conflicts: string[]
}

export type WeeklySchedule = {
  [date: string]: PlannedProduction[]
}

export type PlanningOptions = {
  startDate: Date
  maxHoursPerDay: number
  considerStockMin: boolean
  respectPreferredDays: boolean
}

const DAYS_OF_WEEK = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function getWeekDates(startDate: Date): string[] {
  const dates: string[] = []
  const monday = new Date(startDate)
  const currentDay = monday.getDay()
  monday.setDate(monday.getDate() - currentDay + (currentDay === 0 ? -6 : 1))

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    dates.push(date.toISOString().split("T")[0])
  }
  return dates
}

function getDayName(date: string): string {
  const d = new Date(date)
  return DAYS_OF_WEEK[d.getDay()]
}

function shouldProduceThisWeek(product: Product, dayName: string): boolean {
  switch (product.frequency) {
    case "daily":
      return true
    case "weekly":
      return product.preferredDay ? product.preferredDay.toLowerCase() === dayName : true
    case "biweekly":
      return product.preferredDay ? product.preferredDay.toLowerCase() === dayName : true
    case "monthly":
      return false
    case "on-demand":
      return false
    default:
      return false
  }
}

function detectConflicts(
  production: PlannedProduction,
  existingProductions: PlannedProduction[],
  allProductions: PlannedProduction[],
): string[] {
  const conflicts: string[] = []

  // Check zone conflicts (same zone at overlapping times)
  const zoneConflicts = existingProductions.filter(
    (p) =>
      p.product.zone === production.product.zone &&
      ((production.startHour >= p.startHour && production.startHour < p.endHour) ||
        (production.endHour > p.startHour && production.endHour <= p.endHour) ||
        (production.startHour <= p.startHour && production.endHour >= p.endHour)),
  )

  if (zoneConflicts.length > 0) {
    conflicts.push(
      `Conflicto de zona: ${production.product.zone} ocupada por ${zoneConflicts.map((p) => p.product.name).join(", ")}`,
    )
  }

  // Check tool conflicts
  for (const tool of production.product.tools) {
    const toolConflicts = existingProductions.filter(
      (p) =>
        p.product.tools.includes(tool) &&
        ((production.startHour >= p.startHour && production.startHour < p.endHour) ||
          (production.endHour > p.startHour && production.endHour <= p.endHour) ||
          (production.startHour <= p.startHour && production.endHour >= p.endHour)),
    )

    if (toolConflicts.length > 0) {
      conflicts.push(
        `Conflicto de herramienta: ${tool} en uso por ${toolConflicts.map((p) => p.product.name).join(", ")}`,
      )
    }
  }

  // Check storage capacity for the day
  const sameStorageProductions = allProductions.filter(
    (p) => p.product.storage.name === production.product.storage.name,
  )

  const totalCapacityUsed = sameStorageProductions.reduce((sum, p) => {
    const batches = Math.ceil(p.quantity / p.product.unitsPerBatch)
    return sum + batches
  }, 0)

  const newBatches = Math.ceil(production.quantity / production.product.unitsPerBatch)
  if (totalCapacityUsed + newBatches > production.product.storage.capacity) {
    conflicts.push(
      `Capacidad de almacenamiento excedida: ${production.product.storage.name} (${totalCapacityUsed + newBatches}/${production.product.storage.capacity})`,
    )
  }

  return conflicts
}

export function generateAutomaticPlan(options: PlanningOptions): WeeklySchedule {
  const products = loadProductsFromStorage()
  const weekDates = getWeekDates(options.startDate)
  const schedule: WeeklySchedule = {}

  // Initialize schedule
  weekDates.forEach((date) => {
    schedule[date] = []
  })

  // Generate productions based on frequency
  const productionsToSchedule: Array<{
    productKey: string
    product: Product
    quantity: number
    preferredDate: string | null
  }> = []

  Object.entries(products).forEach(([key, product]) => {
    weekDates.forEach((date) => {
      const dayName = getDayName(date)

      if (shouldProduceThisWeek(product, dayName)) {
        const quantity = options.considerStockMin ? product.stockMin * 2 : product.unitsPerBatch

        const preferredDate =
          options.respectPreferredDays && product.preferredDay
            ? weekDates.find((d) => getDayName(d) === product.preferredDay?.toLowerCase())
            : null

        productionsToSchedule.push({
          productKey: key,
          product,
          quantity,
          preferredDate: preferredDate || date,
        })
      }
    })
  })

  // Remove duplicates (products that appear multiple times in the week)
  const uniqueProductions = productionsToSchedule.filter(
    (prod, index, self) => index === self.findIndex((p) => p.productKey === prod.productKey),
  )

  // Sort by priority: preferred day, then duration (longer first)
  uniqueProductions.sort((a, b) => {
    if (a.preferredDate && !b.preferredDate) return -1
    if (!a.preferredDate && b.preferredDate) return 1
    return b.product.duration - a.product.duration
  })

  // Assign productions to time slots
  uniqueProductions.forEach((prod) => {
    const targetDate = prod.preferredDate || weekDates[0]
    let assigned = false

    // Try to assign to preferred date first
    for (const date of [targetDate, ...weekDates.filter((d) => d !== targetDate)]) {
      const dayProductions = schedule[date]
      let currentHour = 6 // Start at 6 AM

      // Find available time slot
      const sortedProductions = [...dayProductions].sort((a, b) => a.startHour - b.startHour)

      for (const existing of sortedProductions) {
        if (currentHour + prod.product.duration <= existing.startHour) {
          // Found a gap
          break
        }
        currentHour = existing.endHour
      }

      // Check if we can fit it before max hours
      if (currentHour + prod.product.duration <= 6 + options.maxHoursPerDay) {
        const plannedProd: PlannedProduction = {
          productKey: prod.productKey,
          product: prod.product,
          quantity: prod.quantity,
          day: date,
          startHour: currentHour,
          endHour: currentHour + prod.product.duration,
          conflicts: [],
        }

        // Detect conflicts
        plannedProd.conflicts = detectConflicts(plannedProd, dayProductions, schedule[date])

        schedule[date].push(plannedProd)
        assigned = true
        break
      }
    }

    if (!assigned) {
      console.warn(`No se pudo asignar ${prod.product.name} a ningún día`)
    }
  })

  return schedule
}

export function convertScheduleToWeeklyPlan(schedule: WeeklySchedule): {
  [date: string]: { products: { productKey: string; quantity: number }[] }
} {
  const weeklyPlan: { [date: string]: { products: { productKey: string; quantity: number }[] } } = {}

  Object.entries(schedule).forEach(([date, productions]) => {
    weeklyPlan[date] = {
      products: productions.map((p) => ({
        productKey: p.productKey,
        quantity: p.quantity,
      })),
    }
  })

  return weeklyPlan
}
