/* Esmeralda Club homepage promotion. No customer data, signup or membership writes. */
(function () {
  'use strict';
  if (location.pathname !== '/' || window.__esmeraldaClubPromo499) return;
  window.__esmeraldaClubPromo499 = true;
  var GA = 'G-F9XCDW2586'; // Existing website property; never the Orderfly commerce property.
  var BASE = 'https://esmeralda.orderfly.dk';
  var DISMISS = 'esmeralda-club-promo-dismissed-v1';
  var slots = ['hero', 'hero_login', 'popup', 'nav', 'mobile_nav', 'footer'];
  var dialog, previousFocus, showing = false, measured = new Set();
  function cookie(name) {
    var found = document.cookie.split('; ').find(function (p) { return p.indexOf(name + '=') === 0; });
    return found ? found.slice(name.length + 1) : null;
  }
  function stats() {
    return (location.hostname === 'www.esmeraldapizza.dk' || location.hostname === 'esmeraldapizza.dk') &&
      cookie('fa-consent-analytics_storage') === 'true';
  }
  function event(name, slot) {
    if (!stats() || slots.indexOf(slot) < 0 || document.visibilityState !== 'visible') return;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('event', name, {send_to: GA, promotion_id:'esmeralda_pizza_club', promotion_name:'Esmeralda Pizza Club',
      creative_slot:slot, page_location:'https://www.esmeraldapizza.dk/', page_referrer:''});
    return true;
  }
  function visible(el) {
    if (!el || el.hidden || getComputedStyle(el).visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  }
  function busy() {
    return Array.from(document.querySelectorAll('[flowappz-cookie-popup],[flowappz-cookie-settings-wrapper],dialog[open],[role="dialog"][aria-modal="true"]'))
      .some(function (el) { return el !== dialog && visible(el); });
  }
  function dismissed() { try { return sessionStorage.getItem(DISMISS) === '1'; } catch (_) { return showing; } }
  function dismiss() {
    if (!dialog || !dialog.open) return;
    try { sessionStorage.setItem(DISMISS, '1'); } catch (_) { /* One page view still stays dismissed. */ }
    showing = true;
    dialog.close();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function measureHero() {
    var hero = document.getElementById('pizza-club');
    if (!hero || !stats() || measured.has('hero') || !visible(hero)) return;
    var r = hero.getBoundingClientRect();
    var seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    var seenWidth = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    if (seenWidth < Math.min(r.width, innerWidth) / 2) return;
    if (seen < Math.min(r.height, innerHeight) / 2) return;
    if (event('view_promotion', 'hero')) measured.add('hero');
  }
  function start() {
    if (!document.querySelector('[data-club-view="hero"]')) return;
    // Keep the approved native Club markup, links and consent behavior in the
    // existing rotation. CMS slides retain their order (including brunch).
    var hero = document.getElementById('pizza-club');
    var section = document.querySelector('.section_home-hero');
    var container = section && section.querySelector('.swiper-container');
    var slides = container && container.querySelector('.swiper-wrapper');
    var presentation = hero && hero.closest('.es-club-presentation');
    if (hero && slides && presentation) {
      hero.classList.add('swiper-slide');
      slides.insertBefore(hero, slides.firstElementChild);
      section.insertAdjacentElement('afterend', presentation);
      // The normal site initializer is deferred; also support a loaded instance.
      if (container.swiper) {
        container.swiper.update();
        container.swiper.slideTo(0, 0);
      }
      container.addEventListener('transitionend', measureHero);
    }
    dialog = document.createElement('dialog');
    dialog.className = 'es-club-popup';
    dialog.setAttribute('aria-labelledby', 'es-club-popup-title');
    dialog.setAttribute('aria-describedby', 'es-club-popup-text');
    dialog.innerHTML = '<button class="es-club-popup__close" type="button" aria-label="Luk Club-tilbud">×</button>' +
      '<div class="es-club-popup__grid"><img class="es-club-popup__image" src="https://cdn.prod.website-files.com/6a6c7110638d57d95365ad1c/6ad9d07056ceecce9f266398_esmeralda-club-hero-20261022.webp" alt="" width="1536" height="1024" loading="lazy">' +
      '<div class="es-club-popup__copy"><p class="es-club-eyebrow">ESMERALDA PIZZA CLUB</p>' +
      '<h2 class="heading-style-h2" id="es-club-popup-title">DIT FØRSTE STEMPEL ER PÅ HUSET</h2>' +
      '<p class="text-size-regular es-club-popup__text" id="es-club-popup-text">Bliv medlem gratis og få ét velkomststempel. Saml 8 stempler og glæd dig til en gratis pizza.</p>' +
      '<a class="button es-club-button" href="' + BASE + '/club/tilmeld" data-club-placement="popup">JA TAK, BLIV MEDLEM <span aria-hidden="true">↗</span></a>' +
      '<button class="es-club-popup__later" type="button">Måske senere</button>' +
      '<p class="text-size-regular es-club-fineprint">Fra 15 år. Medlemskab kræver tilmelding til nyhedsbrevet. Velkomstbonussen gives én gang. <a href="' + BASE + '/club/vilkaar">Se vilkårene</a>.</p></div></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.es-club-popup__close').addEventListener('click', dismiss);
    dialog.querySelector('.es-club-popup__later').addEventListener('click', dismiss);
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); dismiss(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dismiss(); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-club-placement]');
      if (!a) return;
      var slot = a.getAttribute('data-club-placement');
      var url;
      try { url = new URL(a.href); } catch (_) { return; }
      if (url.origin !== BASE || slots.indexOf(slot) < 0) return;
      event('select_promotion', slot);
      if (stats()) {
        url.searchParams.set('utm_source', 'esmeraldapizza');
        url.searchParams.set('utm_medium', 'website');
        url.searchParams.set('utm_campaign', 'pizza_club');
        url.searchParams.set('utm_content', slot);
        a.href = url.href;
      } else { a.href = url.origin + url.pathname; }
      if (slot === 'popup') dismiss();
    });
    var started = Date.now();
    var timer = setInterval(function () {
      measureHero();
      if (showing || dismissed() || Date.now() - started > 120000) { clearInterval(timer); return; }
      // Respect cookie choices before showing another panel. Never require optional consent.
      if (Date.now() - started < 12000 || cookie('fa-consent-security_storage') === null || busy() || document.visibilityState !== 'visible') return;
      if (typeof dialog.showModal !== 'function') { clearInterval(timer); return; }
      previousFocus = document.activeElement;
      dialog.showModal();
      showing = true;
      event('view_promotion', 'popup');
      clearInterval(timer);
    }, 1000);
    addEventListener('scroll', measureHero, {passive:true});
    document.addEventListener('visibilitychange', measureHero);
    document.addEventListener('click', function (e) {
      if (e.target.closest('[flowappz-cookie-command]')) setTimeout(measureHero, 0);
    });
    measureHero();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
