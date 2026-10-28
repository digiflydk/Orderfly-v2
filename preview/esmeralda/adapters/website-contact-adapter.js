/* Captured /kontakt adapter; load before Webflow. Disabled until owned widget
   configuration and backend acceptance are deliberately activated. */
(() => {
  'use strict';
  const selector = 'form[data-website-contact]';
  const endpoint = 'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/website-contact';
  const fields = { name: 'First-name', phone: 'Last-name', email: 'Email', message: 'Besked' };
  const handlers = new WeakMap();
  // Stop Webflow/native handlers even before DOMContentLoaded/mount finishes.
  document.addEventListener('submit', event => {
    if (event.target.matches(selector)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const handle = handlers.get(event.target); if (handle) void handle(event);
    }
  }, true);
  function mount(form) {
    if (form.dataset.websiteContactMounted) return;
    form.dataset.websiteContactMounted = 'true'; form.method = 'post'; form.removeAttribute('action');
    const button = form.querySelector('[type="submit"]'); if (!button) return;
    button.disabled = true;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    form.append(status);
    const values = {};
    for (const [key, name] of Object.entries(fields)) {
      values[key] = form.elements.namedItem(name);
      if (!values[key]) { status.textContent = 'Kontaktformularen er ikke tilgængelig. Kontakt os venligst på telefon.'; return; }
      values[key].maxLength = {name:160,email:254,phone:40,message:4000}[key];
    }
    const sitekey = form.dataset.websiteContactSitekey;
    if (form.dataset.websiteContactEnabled !== 'true' || !sitekey ||
      !['https://esmeraldapizza.dk','https://www.esmeraldapizza.dk','https://web.orderfly.dk'].includes(location.origin)) {
      status.textContent = 'Kontaktformularen er ikke tilgængelig. Kontakt os venligst på telefon.'; return;
    }
    const challenge = document.createElement('div'); form.insertBefore(challenge, button);
    let token = '', widget, pending = false, key = '', fingerprint = '';
    const reset = () => { token = ''; button.disabled = true; if (widget !== undefined) window.turnstile.reset(widget); };
    const submit = async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (pending || !token || !form.reportValidity()) return;
      const payload = Object.fromEntries(Object.entries(values).map(([name, field]) => [name, field.value.trim()]));
      const next = JSON.stringify(payload);
      if (next !== fingerprint || !key) { key = crypto.randomUUID(); fingerprint = next; }
      pending = true; button.disabled = true;
      Object.values(values).forEach(field => { field.readOnly = true; });
      status.textContent = 'Sender beskeden…';
      try {
        const response = await fetch(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-idempotency-key': key },
          body: JSON.stringify({ ...payload, captcha: token, website: '' }), signal: AbortSignal.timeout(15000) });
        let result; try { result = await response.json(); } catch { result = {}; }
        if (response.status === 202 && result.ok === true && result.code === 'queued') {
          status.textContent = 'Tak. Din besked er modtaget til behandling.';
          Object.values(values).forEach(field => { field.value = ''; }); key = ''; fingerprint = '';
        } else if (response.status === 429) {
          status.textContent = 'Der er sendt for mange beskeder. Prøv igen senere.';
        } else if (response.status === 403) {
          status.textContent = 'Bekræft sikkerhedskontrollen igen, og prøv derefter.';
        } else if (response.status === 409) {
          // Never silently replace a conflicting key and submit a second message.
          status.textContent = 'Beskeden kunne ikke bekræftes. Kontakt os venligst på telefon.';
        } else {
          status.textContent = 'Vi kunne ikke bekræfte modtagelsen. Prøv igen med samme besked eller kontakt os på telefon.';
        }
      } catch {
        status.textContent = 'Vi kunne ikke bekræfte modtagelsen. Prøv igen med samme besked eller kontakt os på telefon.';
      } finally {
        pending = false; Object.values(values).forEach(field => { field.readOnly = false; }); reset();
      }
    };
    handlers.set(form, submit);
    const ready = () => {
      if (!window.turnstile || widget !== undefined) return;
      widget = window.turnstile.render(challenge, { sitekey, action: 'website_contact',
        callback: value => { token = typeof value === 'string' ? value : ''; button.disabled = !token || pending; },
        'expired-callback': () => { token = ''; button.disabled = true; },
        'error-callback': () => { token = ''; button.disabled = true; status.textContent = 'Sikkerhedskontrollen kunne ikke indlæses. Prøv igen senere.'; } });
    };
    if (window.turnstile) ready();
    else {
      const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.addEventListener('load', ready);
      script.addEventListener('error', () => { status.textContent = 'Sikkerhedskontrollen kunne ikke indlæses. Prøv igen senere.'; });
      document.head.append(script);
    }
  }
  const boot = () => document.querySelectorAll(selector).forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
