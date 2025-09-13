import { ReadonlyURLSearchParams } from "next/navigation"
import type { SACommonFilters } from "@/types/superadmin"

/**
 * Konverterer filter-objekt til querystring.
 * Beskytter mod undefined felter og undgår tomme parametre.
 */
export function toQuery(f: SACommonFilters) {
  const q = new URLSearchParams()

  if (f.dateFrom) q.set("from", f.dateFrom)
  if (f.dateTo) q.set("to", f.dateTo)
  if (f.brandId && f.brandId !== "all") q.set("brand", f.brandId)
  if (f.locationIds?.length) q.set("loc", f.locationIds.join(","))

  return q.toString()
}

/**
 * Læser querystring og giver komplette defaults.
 */
export function fromQuery(sp: ReadonlyURLSearchParams): SACommonFilters {
  const today = new Date().toISOString().slice(0, 10)
  const loc = sp.get("loc")?.split(",").filter(Boolean) || undefined

  return {
    dateFrom: sp.get("from") ?? today,
    dateTo: sp.get("to") ?? today,
    brandId: sp.get("brand") ?? "all",
    locationIds: loc,
  }
}
