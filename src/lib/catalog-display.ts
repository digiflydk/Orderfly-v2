
// src/lib/catalog-display.ts
// ⚠️ Ingen imports fra firebase-admin eller server-only filer her.

export function getDisplayName(p: any): string {
  return (
    (typeof p?.name === "string" && p.name) ||
    (typeof p?.title === "string" && p.title) ||
    (typeof p?.label === "string" && p.label) ||
    ""
  );
}

export function getDisplayPrice(p: any): number | null {
  if (typeof p?.price === "number") return p.price;
  if (typeof p?.amount === "number") return p.amount;
  if (typeof p?.price === "string" && p.price.trim() !== "" && !isNaN(Number(p.price))) return Number(p.price);
  if (typeof p?.amount === "string" && p.amount.trim() !== "" && !isNaN(Number(p.amount))) return Number(p.amount);
  return null;
}

export function formatDKK(value: number | null): string {
  if (value == null) return "";
  try { return new Intl.NumberFormat("da-DK", { style:"currency", currency:"DKK", maximumFractionDigits: 0 }).format(value); }
  catch { return `${Math.round(value)} kr`; }
}
