export const runtime = 'nodejs';

export async function GET() {
  const html = `<!doctype html>
  <meta charset="utf-8">
  <title>Home • OF-298</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:16px}</style>
  <h1>Home OK • OF-298</h1>
  <p>Forsiden vises via route handler (udenom React/layout), så vi undgår “Internal Server Error”.</p>
  <small>Version 1.0.120 • OF-298</small>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }});
}
