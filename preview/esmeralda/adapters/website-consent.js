/* Website #47. Basic consent mode: optional providers are not requested before choice. */
(() => {
  'use strict';
  if (window.__esmeraldaConsent47) return;
  window.__esmeraldaConsent47 = true;
  const names = ['ad_personalization','ad_storage','ad_user_data','analytics_storage','functionality_storage','personalization_storage','security_storage'];
  const denied = () => Object.fromEntries(names.map(n => [n, ['functionality_storage','security_storage'].includes(n) ? 'granted' : 'denied']));
  let state = denied();
  const loaded = new Set();
  const failed = new Set();
  const pending = new Map();
  let reloading = false;
  let newsletterTimer = null, newsletterTimedOut = false;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  const consent = (command, value) => { gtag('consent',command,value); };
  consent('default', {...state});
  const cookie = name => {
    const entry = document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith(name+'='));
    return entry ? entry.slice(name.length+1) : null;
  };
  const stored = () => cookie('fa-consent-security_storage') === 'true';
  const read = () => {
    const value = denied();
    if (stored()) for (const name of names) if (!['functionality_storage','security_storage'].includes(name)) value[name] = cookie('fa-consent-'+name) === 'true' ? 'granted' : 'denied';
    // Marketing is one explicit category, not three independently stale cookies.
    value.ad_personalization = value.ad_user_data = value.ad_storage;
    return value;
  };
  const save = value => names.forEach(name => {
    document.cookie = 'fa-consent-'+name+'='+(value[name] === 'granted' ? 'true' : 'false')+'; Max-Age=15552000; Path=/; SameSite=Lax; Secure';
  });
  const script = (provider, src) => { const el = document.createElement('script'); el.async = true; el.src = src; el.onerror = () => { failed.add(provider); newsletter(); }; document.head.append(el); };
  const allowedHost = ['https://www.esmeraldapizza.dk','https://esmeraldapizza.dk'].includes(location.origin);
  // Published GTM also initializes Google Ads. Until its categories are split,
  // loading it for analytics-only would request marketing resources too.
  const granted = category => state[category] === 'granted' && (category !== 'analytics_storage' || state.ad_storage === 'granted');
  const schedule = (provider, category, load) => {
    if (!allowedHost || reloading || !granted(category) || loaded.has(provider) || pending.has(provider)) return;
    pending.set(provider, setTimeout(() => {
      pending.delete(provider);
      if (reloading || !granted(category) || loaded.has(provider)) return;
      loaded.add(provider); load();
    }, 0));
  };
  const services = () => {
    schedule('google','analytics_storage',() => {
      window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
      script('google','https://www.googletagmanager.com/gtm.js?id=GTM-52G3QF76');
    });
    schedule('meta','ad_storage',() => {
      const fbq = function() { fbq.callMethod ? fbq.callMethod.apply(fbq,arguments) : fbq.queue.push(arguments); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      window.fbq = window._fbq = fbq;
      fbq('consent','grant'); fbq('init','773544982454626'); fbq('track','PageView');
      script('meta','https://connect.facebook.net/en_US/fbevents.js');
    });
    schedule('omnisend','ad_storage',() => {
      window.omnisend = window.omnisend || [];
      window.omnisend.push(['brandID','69618ede8284682be9bb5290'],['track','$pageViewed']);
      script('omnisend','https://omnisnippet1.com/inshop/launcher-v2.js');
    });
  };
  const find = selector => document.querySelector(selector);
  const popup = () => find('[flowappz-cookie-popup]');
  const settings = () => find('[flowappz-cookie-settings-wrapper]');
  const sticky = () => find('[flowappz-cookie-consent-sticky-cookie-button]');
  const hide = el => { if (el) { el.classList.add('flowappz-hide-popup'); el.setAttribute('aria-hidden','true'); } };
  const show = el => { if (el) { el.classList.remove('flowappz-hide-popup'); el.style.removeProperty('display'); el.setAttribute('aria-hidden','false'); } };
  const sync = () => document.querySelectorAll('[flowappz-cookie-choice]').forEach(el => {
    const key = {marketing:'ad_storage',analytics:'analytics_storage',personalization:'personalization_storage'}[el.getAttribute('flowappz-cookie-choice')];
    el.checked = state[key] === 'granted';
  });
  const newsletter = () => {
    const el = find('[data-newsletter-consent-fallback]');
    if (!el) return;
    const permitted = allowedHost && state.ad_storage === 'granted';
    const mount = find('#omnisend-embedded-v2-69676d920d7f53dc4d707a29');
    const field = mount && mount.querySelector('input[type="email"]');
    // A downloaded launcher is not proof that its downstream form rendered.
    const ready = permitted && field && !field.disabled && field.getClientRects().length > 0;
    el.hidden = !!ready;
    if ((!permitted || ready) && newsletterTimer !== null) { clearTimeout(newsletterTimer); newsletterTimer = null; }
    if (permitted && !ready && !newsletterTimedOut && newsletterTimer === null) {
      newsletterTimer = setTimeout(() => { newsletterTimer = null; newsletterTimedOut = true; newsletter(); }, 10000);
    }
    const message = find('[data-newsletter-consent-message]');
    const text = !permitted ? 'Tilmeldingsformularen er ikke indlæst uden marketingcookies.'
      : failed.has('omnisend') || newsletterTimedOut ? 'Tilmeldingsformularen kunne ikke indlæses. Prøv igen senere.'
      : 'Tilmeldingsformularen indlæses. Vent venligst.';
    if (message && message.textContent !== text) message.textContent = text;
  };
  const selected = all => {
    const value = denied();
    const choices = {marketing:all === true,analytics:all === true,personalization:all === true};
    if (all === null) document.querySelectorAll('[flowappz-cookie-choice]').forEach(el => { choices[el.getAttribute('flowappz-cookie-choice')] = el.checked; });
    value.ad_storage = value.ad_user_data = value.ad_personalization = choices.marketing ? 'granted' : 'denied';
    value.analytics_storage = choices.analytics ? 'granted' : 'denied';
    value.personalization_storage = choices.personalization ? 'granted' : 'denied';
    return value;
  };
  const apply = (value, persist) => {
    const previous = state;
    state = value;
    if (persist) save(state);
    consent('update', {...state});
    // Cancel work queued by a preceding accept, including accept/reject in one turn.
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    const revokedLoaded = (previous.ad_storage === 'granted' && state.ad_storage !== 'granted' && (loaded.has('meta') || loaded.has('omnisend') || loaded.has('google'))) || (previous.analytics_storage === 'granted' && state.analytics_storage !== 'granted' && loaded.has('google')) || (previous.personalization_storage === 'granted' && state.personalization_storage !== 'granted' && loaded.size > 0);
    if (previous.ad_storage === 'granted' && state.ad_storage !== 'granted' && typeof window.fbq === 'function') window.fbq('consent','revoke');
    sync(); newsletter();
    if (revokedLoaded) {
      // Third-party runtimes cannot safely be unloaded. Reload after persisting
      // denial; the new document never requests a denied provider.
      reloading = true; location.reload(); return;
    }
    services();
  };
  const boot = () => {
    if (!find('[flowappz-cookie-consent-container]')) return;
    const mount = find('#omnisend-embedded-v2-69676d920d7f53dc4d707a29');
    if (mount && typeof MutationObserver === 'function') {
      new MutationObserver(newsletter).observe(mount, { childList:true, subtree:true, attributes:true });
    }
    const fallback = find('[data-newsletter-consent-fallback]');
    if (fallback) { fallback.setAttribute('role','status'); fallback.setAttribute('aria-live','polite'); }
    apply(read(), false);
    if (stored()) { hide(popup()); show(sticky()); } else { hide(sticky()); show(popup()); }
    document.addEventListener('click', event => {
      const button = event.target.closest('[flowappz-cookie-command]');
      if (!button) return;
      const command = button.getAttribute('flowappz-cookie-command');
      if (!['accept-all','reject-all','accept-selected','manage-settings','close-settings','close-cookie-popup'].includes(command)) return;
      event.preventDefault();
      if (['accept-all','reject-all','accept-selected'].includes(command)) {
        apply(selected(command === 'accept-all' ? true : command === 'reject-all' ? false : null), true);
        hide(popup()); const panel = settings(); if (panel) { panel.style.display = 'none'; panel.setAttribute('aria-hidden','true'); } show(sticky());
      } else if (command === 'manage-settings') {
        hide(popup()); sync(); const panel = settings(); if (panel) { panel.style.display = 'flex'; panel.setAttribute('aria-hidden','false'); }
      } else if (command === 'close-settings') {
        const panel = settings(); if (panel) { panel.style.display = 'none'; panel.setAttribute('aria-hidden','true'); }
        if (stored()) show(sticky()); else show(popup());
      } else hide(popup());
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
