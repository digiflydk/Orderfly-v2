
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function POST(req: Request) {
  const token = process.env.DEBUG_TOKEN;
  const auth = (req.headers.get("x-debug-token") || "").trim();
  if (!token || auth !== token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();

  // find brand "esmeralda"
  let brandRef = null as any;
  const b = await db.collection("brands").where("slug", "==", "esmeralda").limit(1).get();
  brandRef = b.empty ? db.collection("brands").doc() : b.docs[0].ref;
  if (b.empty) {
    await brandRef.set({ slug: "esmeralda", name: "ESMERALDA", createdAt: new Date(), updatedAt: new Date() });
  }

  // create one category
  const catRef = db.collection("categories").doc();
  await catRef.set({
    brandId: brandRef.id,
    categoryName: "Signature Pizzas", // Use categoryName to match schema
    sortOrder: 1, // Use sortOrder instead of order
    isActive: true,
    locationIds: [], // Assume global for brand for now
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // create one product in that category
  const prodRef = db.collection("products").doc();
  await prodRef.set({
    brandId: brandRef.id,
    categoryId: catRef.id,
    productName: "Margherita", // Use productName
    price: 79,
    sortOrder: 1, // use sortOrder
    isActive: true,
    locationIds: [], // Assume global for brand for now
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true, brandId: brandRef.id, categoryId: catRef.id, productId: prodRef.id });
}
