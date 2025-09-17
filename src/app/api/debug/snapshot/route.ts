
import { NextResponse } from "next/server"
import { getDebugSnapshotServer } from "@/services/debug"
import { getDebugToken } from "@/config/debug"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token") || ""
  if (!getDebugToken() || token !== getDebugToken()) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const data = await getDebugSnapshotServer()
  return NextResponse.json(data)
}
