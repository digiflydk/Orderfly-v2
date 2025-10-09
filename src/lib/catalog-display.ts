
function valStr(x: any): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function getByPath(obj: any, path: string): any {
  try {
    return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  } catch {
    return undefined;
  }
}

function pickFirstString(obj: any, paths: string[]): string | null {
  for (const p of paths) {
    const v = getByPath(obj, p);
    const s = valStr(v);
    if (s) return s;
  }
  return null;
}

export function getDisplayName(p: any): string {
  const s =
    pickFirstString(p, [
      "name",
      "title",
      "label",
      "displayName",
      "display.name",
      "productName",
      "info.name",
      "content.name",
      "i18n.da.name",
      "i18n.en.name",
      "translations.da.name",
      "translations.name",
      "locale.da.name",
      "da.name",
    ]) ||
    Object.values(p || {})
      .map((v) => (typeof v === "string" && v.length >= 2 && v.length <= 80 ? v : null))
      .find(Boolean) ||
    "";
  return s;
}

export function getDisplayDescription(p: any): string {
  const s =
    pickFirstString(p, [
      "description",
      "desc",
      "text",
      "display.description",
      "i18n.da.description",
      "translations.da.description",
    ]) || "";
  return s;
}

export function getDisplayPrice(p: any): number | null {
  if (typeof p?.price === "number") return p.price;
  if (typeof p?.amount === "number") return p.amount;
  if (valStr(p?.price) && !isNaN(Number(p.price))) return Number(p.price);
  if (valStr(p?.amount) && !isNaN(Number(p.amount))) return Number(p.amount);
  return null;
}

export function formatDKK(value: number | null): string {
  if (value == null) return "";
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(
      value
    );
  } catch {
    return `${Math.round(value)} kr`;
  }
}
