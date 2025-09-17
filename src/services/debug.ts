
"use server"

import { db } from "@/lib/firebase"
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore"
import { DEBUG_COLLECTIONS, DEBUG_MAX_DOCS } from "@/config/debug"

type CollSample = {
  path: string
  count: number
  sample: any[]
  orderedByCreatedAt: boolean
}

type DebugSnapshot = {
  ok: boolean
  env: {
    nodeEnv: string
    appVersion: string
  }
  firestore: {
    collections: CollSample[]
  }
}

async function fetchSample(path: string): Promise<CollSample> {
  const col = collection(db, path)
  let orderedByCreatedAt = true
  let q = query(col, orderBy("createdAt", "desc"), limit(DEBUG_MAX_DOCS))
  try {
    const snap = await getDocs(q)
    const sample: any[] = []
    snap.forEach(d => sample.push({ id: d.id, ...d.data() }))
    return { path, count: sample.length, sample, orderedByCreatedAt }
  } catch {
    orderedByCreatedAt = false
    const q2 = query(col, limit(DEBUG_MAX_DOCS))
    const snap2 = await getDocs(q2)
    const sample2: any[] = []
    snap2.forEach(d => sample2.push({ id: d.id, ...d.data() }))
    return { path, count: sample2.length, sample: sample2, orderedByCreatedAt }
  }
}

export async function getDebugSnapshotServer(): Promise<DebugSnapshot> {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || ""
  const nodeEnv = process.env.NODE_ENV || ""
  const results: CollSample[] = []
  for (const path of DEBUG_COLLECTIONS) {
    try {
      const data = await fetchSample(path)
      results.push(data)
    } catch {
      results.push({ path, count: 0, sample: [], orderedByCreatedAt: false })
    }
  }
  return {
    ok: true,
    env: { nodeEnv, appVersion },
    firestore: { collections: results }
  }
}
