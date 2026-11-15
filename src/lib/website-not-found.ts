// Branded 404 page for www.esmeraldapizza.dk: self-contained (inline CSS, same-origin logo, no scripts),
// so it works under the site's CSP and never depends on the pinned payload being readable.
export const WEBSITE_NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="da-DK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Siden findes ikke | Esmeralda Pizza &amp; Restaurant</title>
<link href="/_assets/31f776328347ab431379fbb8.jpg" rel="shortcut icon" type="image/x-icon">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:48px 16px;background:#0b0b0b;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-align:center}
img{display:block;width:140px;height:auto}
h1{margin:0;font-size:clamp(28px,6vw,44px);line-height:1.15}
p{margin:0;max-width:34rem;color:#d6d6d6;font-size:17px;line-height:1.6}
nav{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:40rem}
a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;border-radius:6px;border:1px solid #e8be63;color:#e8be63;font-weight:600;text-decoration:none}
a.primary{background:#e8be63;color:#111}
a:focus-visible{outline:3px solid #fff;outline-offset:3px}
.phone{color:#e8be63;border:0;min-height:0;padding:0;font-weight:600}
</style>
</head>
<body>
<a href="/" aria-label="Til forsiden" style="border:0;padding:0;min-height:0"><img src="/_assets/cbdfddea996fb10f5850db63.png" width="150" height="79" alt="Esmeralda Pizza &amp; Restaurant"></a>
<main>
<h1>Siden findes ikke</h1>
<p style="margin-top:12px">Siden er måske flyttet eller fjernet. Find vores menukort, book et bord eller gå til forsiden.</p>
</main>
<nav aria-label="Videre">
<a class="primary" href="/menu">Se menukortet</a>
<a href="/bordbooking">Book bord</a>
<a href="/">Forside</a>
<a href="/kontakt">Kontakt</a>
</nav>
<p>Har du spørgsmål? Ring på <a class="phone" href="tel:+4532505040">32 50 50 40</a></p>
</body>
</html>
`;
