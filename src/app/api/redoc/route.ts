import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Orderfly API — Redoc</title>
  <script src="https://cdn.redoc.ly/redoc/v2.4.0/bundles/redoc.standalone.js"></script>
  <style> body { margin:0; padding:0; } </style>
</head>
<body>
  <redoc spec-url="${base}/openapi.json"></redoc>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
