(() => {
  'use strict';
  function start() {
    const root = document.getElementById('esmeralda-direct-booking');
    if (!root || root.dataset.bookingReady) return;
    root.dataset.bookingReady = '1';
    const $ = id => root.querySelector('#' + id);
    const API = root.dataset.bookingApi;
    const base = { organization_slug: root.dataset.organization, location_slug: root.dataset.location };
    const party = $('eb-party'), date = $('eb-date'), availability = $('eb-availability');
    const details = $('eb-details-form'), confirm = $('eb-confirm'), back = $('eb-back');
    const STORAGE = 'esmeralda_booking_attribution_v2', SESSION = 'esmeralda_booking_session_v2', DEDUPE = 'esmeralda_booking_provider_events_v2';
    const memory = new Map();
    const safeRead = (store, key) => { try { return store.getItem(key); } catch { return memory.get(key) || null; } };
    const safeWrite = (store, key, value) => { memory.set(key, value); try { store.setItem(key, value); } catch {} };
    const safeRemove = (store, key) => { memory.delete(key); try { store.removeItem(key); } catch {} };
    let sessionId;
    try { sessionId = safeRead(sessionStorage, SESSION); } catch {}
    if (!sessionId || !/^[A-Za-z0-9._:-]{8,160}$/.test(sessionId)) {
      sessionId = crypto.randomUUID();
      try { safeWrite(sessionStorage, SESSION, sessionId); } catch {}
    }
    const clean = (value, max = 200) => String(value || '').trim().slice(0, max) || null;
    const cookie = name => document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
    const granted = value => /^(granted|true|1|yes)$/i.test(value);
    function consent() {
      const analytics = granted(cookie('fa-consent-analytics_storage') || cookie('fa-consent-analytics'));
      const ads = granted(cookie('fa-consent-ad_storage') || cookie('fa-consent-marketing'));
      const query = new URLSearchParams(location.search), test = query.get('_booking_test') === '1';
      return { analytics_storage: analytics ? 'granted' : 'denied', ad_storage: ads ? 'granted' : 'denied', ad_user_data: ads ? 'granted' : 'denied', ad_personalization: ads ? 'granted' : 'denied', functionality_storage: 'granted', security_storage: 'granted', captured_at: new Date().toISOString(), version: 'webflow-fa-v2', test_mode: test, test_run_id: test ? clean(query.get('_booking_test_run'), 100) || 'issue-11-' + sessionId : null };
    }
    function context() {
      const state = consent();
      if (state.analytics_storage !== 'granted' && state.ad_storage !== 'granted') {
        try { safeRemove(localStorage, STORAGE); } catch {}
        return { session_id: sessionId, consent_state: state };
      }
      const params = new URLSearchParams(location.search);
      const touch = { utm_source: clean(params.get('utm_source'), 120), utm_medium: clean(params.get('utm_medium'), 120), utm_campaign: clean(params.get('utm_campaign')), utm_content: clean(params.get('utm_content')), utm_term: clean(params.get('utm_term')), ad_set: clean(params.get('ad_set')), ad_variant: clean(params.get('ad_variant')), gclid: state.ad_storage === 'granted' ? clean(params.get('gclid')) : null, fbclid: state.ad_storage === 'granted' ? clean(params.get('fbclid')) : null, landing_page: clean(location.href, 2048), referrer: clean(document.referrer, 2048), visited_at: new Date().toISOString(), direct: false };
      let internal = true;
      try { internal = !touch.referrer || new URL(touch.referrer).origin === location.origin; } catch {}
      touch.direct = !['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ad_set','ad_variant','gclid','fbclid'].some(key => touch[key]) && internal;
      let stored = null;
      try {
        stored = JSON.parse(safeRead(localStorage, STORAGE) || 'null');
        const age = Date.now() - Date.parse(stored?.first_touch?.visited_at || stored?.saved_at || '');
        if (!Number.isFinite(age) || age > 30 * 24 * 60 * 60 * 1000 || age < -300000) stored = null;
      } catch {}
      const next = { first_touch: stored?.first_touch || touch, last_non_direct: touch.direct ? stored?.last_non_direct || null : touch, saved_at: new Date().toISOString() };
      if (state.ad_storage !== 'granted') {
        for (const value of [next.first_touch, next.last_non_direct]) if (value) { value.gclid = null; value.fbclid = null; }
      }
      try { safeWrite(localStorage, STORAGE, JSON.stringify(next)); } catch {}
      return { ...touch, ...next, session_id: sessionId, consent_state: state };
    }
    async function api(payload, key, externalSignal) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (externalSignal?.aborted) controller.abort();
      externalSignal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 15000);
      try {
        const headers = { 'content-type': 'application/json' };
        if (key) headers['x-idempotency-key'] = key;
        const response = await fetch(API, { method: 'POST', headers, credentials: 'omit', signal: controller.signal, body: JSON.stringify({ ...payload, ...base }) });
        const text = await response.text();
        let data;
        try { if (text.length > 1000000) throw new Error(); data = JSON.parse(text); } catch {
          const error = new Error('Vi kunne ikke læse svaret. Prøv igen.'); error.uncertain = true; throw error;
        }
        if (!response.ok) {
          const error = new Error(clean(data.error, 300) || 'Der opstod en fejl. Prøv igen.');
          error.status = response.status; error.code = data.code; error.uncertain = response.status >= 500; throw error;
        }
        return data;
      } catch (error) {
        if (!error.status) error.uncertain = true;
        if (error.name === 'AbortError') error.message = 'Forbindelsen tog for lang tid. Prøv igen.';
        throw error;
      } finally {
        clearTimeout(timeout); externalSignal?.removeEventListener('abort', abort);
      }
    }
    const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
    function notice(id, text, focus = false) {
      const target = $(id); target.textContent = text || ''; target.hidden = !text;
      if (text && focus) target.focus();
    }
    const clearNotice = () => { notice('eb-error', ''); notice('eb-status', ''); };
    const day = value => new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' }).format(new Date(value + 'T12:00:00Z'));
    const localDate = value => {
      const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Copenhagen' }).formatToParts(value);
      const part = kind => parts.find(x => x.type === kind).value;
      return part('year') + '-' + part('month') + '-' + part('day');
    };
    const today = localDate(new Date()); date.min = today; date.value = today;
    let fields = [], systemFields = [], fieldControls = new Map(), fieldsReady = false, fieldTask = null;
    let selected = null, searchController = null, searchVersion = 0, sending = false, uncertain = false, draft = null, key = null;
    let step = 1, viewTracked = false, infoTracked = false, restoring = false;
    const FLOW = 'esmeralda_booking_flow_v3';
    const paths = ['/bordbooking', '/bordbooking/informationer', '/bordbooking/bekræftelse'];
    const vipValue = 'vip_room_kr_ver_minimum_6_personers_booking';
    let restoreValues = null, completed = null;
    function currentValues() {
      return { name: $('eb-name').value, phone: $('eb-phone').value, email: $('eb-email').value, note: $('eb-note').value,
        custom: [...fieldControls.keys()].map(id => ({ id, values: values(id) })) };
    }
    function remember(phase, mustPersist = false) {
      if (!selected || !key) return;
      const record = { version: 3, organization: base.organization_slug, location: base.location_slug,
        updatedAt: Date.now(), phase, key, selected,
        values: phase === 'complete' ? null : currentValues(),
        payload: phase === 'pending' ? draft : null,
        confirmation: phase === 'complete' ? completed : null };
      const text = JSON.stringify(record);
      try {
        if (text.length > 256000) throw new Error();
        sessionStorage.setItem(FLOW, text);
        if (sessionStorage.getItem(FLOW) !== text) throw new Error();
      } catch {
        if (mustPersist) throw new Error('Browseren kunne ikke gemme bookingforløbet. Tillad lagring i denne fane, og prøv igen. Bookingen er ikke sendt.');
      }
    }
    function forget() { try { sessionStorage.removeItem(FLOW); } catch {} }
    function savedFlow() {
      try {
        const text = sessionStorage.getItem(FLOW);
        if (!text || text.length > 256000) return null;
        const r = JSON.parse(text), age = Date.now() - r.updatedAt;
        if (r.version !== 3 || r.organization !== base.organization_slug || r.location !== base.location_slug ||
            !['details','pending','complete'].includes(r.phase) || !Number.isFinite(age) || age < -300000 ||
            age > (r.phase === 'pending' ? 32 : 1) * 86400000 ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.key) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(r.selected?.date) || !Number.isInteger(r.selected?.party_size) ||
            r.selected.party_size < 1 || r.selected.party_size > 8 || !Number.isFinite(Date.parse(r.selected.starts_at)) ||
            !/^\d{2}:\d{2}$/.test(r.selected.local_time)) return null;
        if (r.phase === 'pending' && (r.payload?.action !== 'confirm' || r.payload.idempotency_key !== r.key ||
            r.payload.starts_at !== r.selected.starts_at || r.payload.party_size !== r.selected.party_size)) return null;
        return r;
      } catch { return null; }
    }
    function navigateStep(next, mode = 'push') {
      const target = new URL(paths[next - 1], location.origin);
      target.search = location.search; target.hash = location.hash;
      if (location.pathname !== target.pathname) history[mode === 'replace' ? 'replaceState' : 'pushState']({ bookingStep: next }, '', target);
    }
    function fillSavedValues(saved) {
      if (!saved) return;
      for (const id of ['name','phone','email','note']) if (typeof saved[id] === 'string') $('eb-' + id).value = saved[id];
      restoreValues = new Map((Array.isArray(saved.custom) ? saved.custom : []).filter(x => x && typeof x.id === 'string' && Array.isArray(x.values)).map(x => [x.id, x.values]));
    }
    function validConfirmation(data) {
      return data?.ok === true && typeof data.booking_id === 'string' && typeof data.booking_reference === 'string' &&
        Number.isFinite(Date.parse(data.starts_at)) && Number.isInteger(data.party_size);
    }
    function acknowledge(data, recovered = false) {
      if (!validConfirmation(data)) { const error = new Error('Bookingens bekræftelse kunne ikke læses.'); error.uncertain = true; throw error; }
      completed = { ok: true, booking_id: data.booking_id, booking_reference: data.booking_reference, starts_at: data.starts_at,
        party_size: data.party_size, status: data.status, tracking_event_id: data.tracking_event_id, is_test: data.is_test === true };
      const acknowledged = { date:localDate(new Date(data.starts_at)), local_time:new Intl.DateTimeFormat('da-DK',
        {hour:'2-digit',minute:'2-digit',timeZone:'Europe/Copenhagen'}).format(new Date(data.starts_at)).replace('.',':'), party_size:data.party_size };
      summary($('eb-confirmation'), acknowledged, data.booking_reference);
      uncertain = false; draft = null; remember('complete'); showStep(3, true, recovered ? 'replace' : 'push');
      if (data.status === 'cancelled' || data.status === 'no_show') {
        $('eb-success-step').querySelector('.eb-eyebrow').textContent = 'Bookingstatus';
        $('eb-success-heading').textContent = data.status === 'cancelled' ? 'Din booking er aflyst' : 'Besøget er registreret som udeblevet';
      } else completion(data);
      if (!$('eb-new-booking')) {
        const button = node('button', 'Lav en ny booking', 'button eb-secondary'); button.id = 'eb-new-booking'; button.type = 'button';
        button.addEventListener('click', () => { forget(); location.assign(new URL('/bordbooking' + location.search, location.origin)); });
        $('eb-success-step').appendChild(button);
      }
    }

    function showStep(next, focus = true, navigation = 'push') {
      step = next;
      navigateStep(next, navigation);
      for (const [index, id] of ['eb-search-step','eb-details-step','eb-success-step'].entries()) $(id).hidden = next !== index + 1;
      root.querySelectorAll('[data-booking-step]').forEach(n => {
        if (Number(n.dataset.bookingStep) === next) n.setAttribute('aria-current', 'step'); else n.removeAttribute('aria-current');
      });
      if (focus) $(['eb-search-heading','eb-details-heading','eb-success-heading'][next - 1]).focus();
    }
    function summary(target, data, reference) {
      target.replaceChildren();
      if (reference) { const p = node('p', 'Bookingreference'); const strong = node('strong', reference, 'eb-reference'); p.appendChild(node('br')); p.appendChild(strong); target.appendChild(p); }
      const dl = node('dl');
      for (const [label, value] of [['Dato', day(data.date)], ['Tidspunkt', data.local_time], ['Gæster', String(data.party_size)], ['Adresse', 'Albaniensgade 6, 2300 København S']]) {
        const row = node('div'); row.append(node('dt', label), node('dd', value)); dl.appendChild(row);
      }
      target.appendChild(dl);
    }
    function track(event, metadata = {}) {
      const attribution = context();
      if (attribution.consent_state.analytics_storage !== 'granted') return;
      const event_id = crypto.randomUUID();
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'booking_' + event, ...metadata, event_id });
      api({ action: 'track', event_id, session_id: sessionId, event_name: event, metadata, attribution }).catch(() => {});
    }
    function trackView() {
      context();
      if (!viewTracked && consent().analytics_storage === 'granted') { viewTracked = true; track('widget_view'); }
    }
    function completion(data) {
      const state = consent(), analytics = state.analytics_storage === 'granted', advertising = state.ad_storage === 'granted' && state.ad_user_data === 'granted';
      if (data.is_test === true || (!analytics && !advertising) || !data.tracking_event_id) return;
      let seen = [];
      try { seen = JSON.parse(safeRead(sessionStorage, DEDUPE) || '[]'); } catch {}
      if (!Array.isArray(seen)) seen = [];
      if (seen.includes(data.tracking_event_id)) return;
      try { safeWrite(sessionStorage, DEDUPE, JSON.stringify([...seen.slice(-99), data.tracking_event_id])); } catch {}
      const detail = { booking_id: data.booking_id, booking_reference: data.booking_reference, party_size: data.party_size, starts_at: data.starts_at, event_id: data.tracking_event_id, transaction_id: data.tracking_event_id };
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'booking_completed', ...detail });
      if (analytics && typeof window.gtag === 'function') window.gtag('event', 'booking_completed', detail);
      if (advertising && typeof window.fbq === 'function') window.fbq('track', 'Lead', detail, { eventID: data.tracking_event_id });
    }
    const systemMap = { guest_name: ['name','Navn'], guest_phone: ['phone','Telefon'], guest_email: ['email','E-mail'], guest_note: ['note','Kommentar'] };
    function applySystemFields() {
      for (const [field, [id, label]] of Object.entries(systemMap)) {
        const config = systemFields.find(x => x.field_key === field) || { is_active: true, is_required: field !== 'guest_note', label };
        const active = config.is_active !== false, input = $('eb-' + id);
        $('eb-wrap-' + id).hidden = !active;
        input.disabled = !active || sending || uncertain;
        input.required = active && config.is_required === true;
        $('eb-label-' + id).textContent = (config.label || label) + (input.required ? ' *' : '');
      }
    }
    function values(id) {
      const item = fieldControls.get(id);
      if (!item) return [];
      if (item.field.field_type === 'checkbox') return item.inputs.filter(x => x.checked && x.value).map(x => x.value);
      return item.inputs[0].value.trim() ? [item.inputs[0].value.trim()] : [];
    }
    function conditions() {
      for (const field of fields) {
        const item = fieldControls.get(field.id), parent = fieldControls.get(field.parent_field_id);
        if (!item) continue;
        const visible = !field.parent_field_id || (!!parent && !parent.wrap.hidden && (field.condition_option_values || []).some(value => values(field.parent_field_id).includes(value)));
        item.wrap.hidden = !visible;
        for (const input of item.inputs) {
          const guestCount = selected?.party_size || Number(party.value);
          const editable = !sending && !uncertain && !restoring;
          const ineligible = Number(input.dataset.minParty || 0) > guestCount;
          if (input.tagName === 'SELECT') {
            for (const option of input.options) option.disabled = Number(option.dataset.minParty || 0) > guestCount;
            if (editable && input.selectedOptions[0]?.disabled) input.value = '';
          } else if (editable && ineligible) input.checked = false;
          input.disabled = !visible || !editable || ineligible;
          input.required = visible && field.is_required === true && field.field_type !== 'checkbox';
          input.setAttribute('aria-required', String(visible && field.is_required === true));
        }
      }
    }
    function renderFields() {
      const previous = new Map([...fieldControls.keys()].map(id => [id, values(id)]));
      const custom = $('eb-custom-fields'); custom.replaceChildren(); fieldControls = new Map();
      for (const field of fields) {
        const options = Array.isArray(field.options) ? field.options : [], inputs = [];
        const isOptions = field.field_type === 'checkbox', wrap = node(isOptions ? 'fieldset' : 'div', undefined, isOptions ? 'eb-options' : 'eb-field');
        const label = node(isOptions ? 'legend' : 'label', field.label + (field.is_required ? ' *' : ''));
        const id = 'eb-custom-' + field.id;
        if (!isOptions) label.htmlFor = id;
        wrap.appendChild(label);
        if (isOptions) {
          if (!field.allow_multiple && !field.is_required) {
            const row = node('label', undefined, 'eb-option'), input = node('input');
            input.type = 'radio'; input.name = id; input.id = id + '-none'; input.value = '';
            row.append(input,node('span','Ingen af ovenstående')); wrap.appendChild(row); inputs.push(input);
          }
          for (const [index, option] of options.entries()) {
            const row = node('label', undefined, 'eb-option'), input = node('input');
            input.type = field.allow_multiple ? 'checkbox' : 'radio'; input.name = id; input.id = id + '-' + index; input.value = option.option_value;
            row.append(input, node('span', option.option_label)); wrap.appendChild(row); inputs.push(input);
          }
        } else {
          const input = node(field.field_type === 'select' ? 'select' : 'input', undefined, 'eb-input');
          input.id = id; input.name = id;
          if (field.field_type === 'select') {
            const initial = node('option', 'Vælg…'); initial.value = ''; input.appendChild(initial);
            for (const option of options) { const n = node('option', option.option_label); n.value = option.option_value; input.appendChild(n); }
          } else { input.type = 'text'; input.maxLength = 1000; input.placeholder = field.placeholder || ''; }
          wrap.appendChild(input); inputs.push(input);
        }
        if (field.help_text) { const help = node('p', field.help_text, 'eb-help'); help.id = id + '-help'; wrap.appendChild(help); inputs.forEach(n => n.setAttribute('aria-describedby', help.id)); }
        const choices = isOptions ? inputs : field.field_type === 'select' ? [...inputs[0].options] : [];
        for (const choice of choices) {
          const option = options.find(x => x.option_value === choice.value);
          const vip = base.organization_slug === 'esmeralda' && base.location_slug === 'amager' && choice.value === vipValue;
          choice.dataset.minParty = String(option?.min_party_size || (vip ? 6 : 0));
          if (vip || option?.requires_staff_confirmation) {
            const label = isOptions ? choice.parentElement.querySelector('span') : choice;
            label.textContent = 'Ønske om VIP-rum (mindst 6 gæster, bekræftes af personalet)';
          }
        }
        for (const input of inputs) {
          const old = restoreValues?.get(field.id) || previous.get(field.id) || [];
          if (isOptions) input.checked = old.includes(input.value) || (!old.length && input.value === ''); else input.value = old[0] || '';
          input.addEventListener('change', conditions);
        }
        fieldControls.set(field.id, { field, wrap, inputs }); custom.appendChild(wrap);
      }
      restoreValues = null;
      conditions();
    }
    async function loadFields(force = false) {
      if (fieldTask) return fieldTask;
      if (fieldsReady && !force) return true;
      fieldsReady = false; confirm.disabled = true;
      fieldTask = (async () => {
        try {
          const data = await api({ action: 'fields' });
          if (!Array.isArray(data.system_fields) || !Array.isArray(data.fields)) throw new Error('Bookingfelterne kunne ikke indlæses.');
          systemFields = data.system_fields;
          fields = [...data.fields].sort((a, b) => (a.depth || 1) - (b.depth || 1) || (a.sort_order || 0) - (b.sort_order || 0));
          applySystemFields(); renderFields(); fieldsReady = true;
          confirm.disabled = sending || restoring; return true;
        } catch {
          if (step === 2) {
            notice('eb-error', 'Vi kunne ikke hente bookingfelterne. Prøv igen, før du bekræfter.');
            const retry = node('button', 'Hent bookingfelterne igen', 'button eb-secondary'); retry.type = 'button';
            retry.addEventListener('click', async () => { retry.disabled = true; if (await loadFields(true)) notice('eb-error',''); else retry.disabled = false; });
            $('eb-custom-fields').replaceChildren(retry);
          }
          return false;
        } finally { fieldTask = null; }
      })();
      return fieldTask;
    }
    function customResponses() {
      conditions(); const responses = [];
      for (const field of fields) {
        const item = fieldControls.get(field.id); if (!item || item.wrap.hidden) continue;
        const selectedValues = values(field.id);
        for (const input of item.inputs) if (selectedValues.includes(input.value) && Number(input.dataset.minParty || 0) > selected.party_size)
          throw new Error('VIP-rum kan kun ønskes ved mindst 6 gæster. Rummet bekræftes særskilt af personalet.');
        const missing = !selectedValues.length;
        if (field.is_required && missing) { item.inputs[0]?.focus(); throw new Error('Udfyld feltet: ' + field.label); }
        if (!missing) responses.push({ field_id: field.id, value: field.field_type === 'checkbox' ? selectedValues : selectedValues[0] });
      }
      return responses;
    }
    function lock(locked) {
      applySystemFields(); conditions(); back.disabled = locked;
      party.disabled = locked; date.disabled = locked; $('eb-find').disabled = locked;
    }
    async function choose(slot, searchSnapshot) {
      if (sending || uncertain || restoring || completed) return;
      selected = { ...slot, ...searchSnapshot }; key = crypto.randomUUID(); draft = null; infoTracked = false;
      clearNotice(); summary($('eb-selection'), selected); showStep(2);
      track('details_started', { party_size: selected.party_size, date: selected.date, local_time: selected.local_time });
      await loadFields(true);
      remember('details');
    }
    function renderSlots(slots, snapshot) {
      availability.replaceChildren();
      if (!slots.length) {
        availability.appendChild(node('p', 'Ingen ledige tider på den valgte dato. Vælg en anden dag, eller ring til os på 32 50 50 40.'));
        const next = node('button', 'Se næste dag', 'button eb-secondary'); next.type = 'button';
        next.onclick = () => { const n = new Date(snapshot.date + 'T12:00:00Z'); n.setUTCDate(n.getUTCDate() + 1); date.value = n.toISOString().slice(0, 10); loadSlots(); };
        availability.appendChild(next); return;
      }
      availability.appendChild(node('p', 'Ledige tider · ' + day(snapshot.date)));
      const categories = [ ['Formiddag og frokost', slot => slot.local_time < '15:00'], ['Eftermiddag', slot => slot.local_time >= '15:00' && slot.local_time < '17:00'], ['Aften', slot => slot.local_time >= '17:00'] ];
      for (const [label, filter] of categories) {
        const groupSlots = slots.filter(filter); if (!groupSlots.length) continue;
        const group = node('fieldset', undefined, 'eb-time-group'); group.appendChild(node('legend', label));
        const grid = node('div', undefined, 'eb-times');
        for (const slot of groupSlots) {
          const button = node('button', slot.local_time, 'eb-time'); button.type = 'button';
          button.setAttribute('aria-label', 'Vælg kl. ' + slot.local_time); button.dataset.bookingTime = slot.local_time;
          button.onclick = () => choose(slot, snapshot); grid.appendChild(button);
        }
        group.appendChild(grid); availability.appendChild(group);
      }
    }
    async function loadSlots(preserveError = false) {
      if (sending || uncertain || restoring || completed || step !== 1) return;
      searchController?.abort(); const current = ++searchVersion;
      if (!preserveError) clearNotice();
      forget(); selected = null; key = null; draft = null;
      const group = party.value === 'group'; $('eb-group').hidden = !group; availability.hidden = group; $('eb-find').hidden = group;
      if (group) { availability.setAttribute('aria-busy', 'false'); return; }
      if (!date.value || !date.checkValidity()) { availability.replaceChildren(); notice('eb-error','Vælg en gyldig dato fra i dag og frem.'); return; }
      const snapshot = { date: date.value, party_size: Number(party.value) };
      searchController = new AbortController(); availability.setAttribute('aria-busy','true'); availability.replaceChildren(node('p','Finder ledige tider…'));
      $('eb-find').disabled = true;
      try {
        const data = await api({ action: 'availability', ...snapshot }, null, searchController.signal);
        if (current !== searchVersion || step !== 1) return;
        if (!Array.isArray(data.slots)) throw new Error('Ledige tider kunne ikke hentes.');
        const slots = data.slots.filter(s => /^\d{2}:\d{2}$/.test(s.local_time) && Number.isFinite(Date.parse(s.starts_at)));
        renderSlots(slots, snapshot);
      } catch (error) {
        if (current !== searchVersion) return;
        availability.replaceChildren(node('p','Vi kunne ikke hente tiderne. Tryk på “Find ledige tider” for at prøve igen.'));
        notice('eb-error',error.message || 'Der opstod en forbindelsesfejl. Prøv igen.');
      } finally {
        if (current === searchVersion) { availability.setAttribute('aria-busy','false'); $('eb-find').disabled = false; }
      }
    }
    async function submit(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (sending || restoring || completed || !selected || (!fieldsReady && !uncertain) || step !== 2) return;
      if (uncertain && !draft) { await restore(); return; }
      if (!uncertain) {
        if (!details.reportValidity()) return;
        let responses;
        try { responses = customResponses(); } catch (error) { notice('eb-error',error.message); return; }
        const attribution = context();
        draft = { action:'confirm', party_size:selected.party_size, starts_at:selected.starts_at, guest_name:$('eb-name').value.trim(), guest_phone:$('eb-phone').value.trim(), guest_email:$('eb-email').value.trim() || null, guest_note:$('eb-note').value.trim() || null, custom_responses:responses, idempotency_key:key, attribution, session_id:sessionId };
        track('confirm_clicked',{party_size:selected.party_size,starts_at:selected.starts_at});
      } else {
        // Only consent/evidence may change on a retry; reservation and guest values stay frozen.
        draft.attribution = context();
      }
      try { remember('pending', true); } catch (error) { notice('eb-error', error.message, true); return; }
      sending = true; clearNotice(); lock(true); confirm.disabled = true; confirm.textContent = 'Bekræfter…';
      try {
        const data = await api(draft, key);
        acknowledge(data);
      } catch (error) {
        if (error.status === 409) {
          uncertain = false; sending = false; draft = null; forget(); lock(false); showStep(1);
          notice('eb-error', error.message || 'Tiden blev netop optaget. Vælg en anden tid.', true);
          await loadSlots(true);
        } else if (error.uncertain || !error.status) {
          uncertain = true;
          notice('eb-error','Vi har endnu ikke fået en sikker bekræftelse. Tryk på “Hent bekræftelse igen”. Vi genbruger samme booking, så du undgår en ekstra reservation.',true);
        } else {
          uncertain = false; draft = null; remember('details'); notice('eb-error',error.message,true);
        }
      } finally {
        sending = false; lock(uncertain); confirm.disabled = !fieldsReady && !uncertain;
        confirm.textContent = uncertain ? 'Hent bekræftelse igen' : 'Bekræft booking';
      }
    }
    $('eb-search-form').addEventListener('submit',event => { event.preventDefault(); event.stopImmediatePropagation(); loadSlots(); },true);
    party.addEventListener('change',() => loadSlots()); date.addEventListener('change',() => loadSlots());
    back.addEventListener('click',() => { if (sending || uncertain) return; clearNotice(); showStep(1); loadSlots(); });
    details.addEventListener('submit',submit,true);
    details.addEventListener('input',() => { if (!sending && !uncertain && !restoring) remember('details'); if (!infoTracked) { infoTracked = true; track('info_started'); } });
    window.dataLayer = window.dataLayer || [];
    const oldPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = (...items) => { const result = oldPush(...items); if (items.some(x => x?.event === 'gtm_consent_update')) queueMicrotask(trackView); return result; };
    addEventListener('esmeralda:consent-updated',trackView);
    addEventListener('pageshow',event => { if (event.persisted && step === 1) { date.min = localDate(new Date()); loadSlots(); } });
    details.addEventListener('change', () => { if (!sending && !uncertain && !restoring) remember('details'); });
    addEventListener('popstate', () => {
      if (completed) { showStep(3, false, 'replace'); return; }
      if (sending || uncertain || restoring) { showStep(2, false, 'replace'); return; }
      let requested = '';
      try { requested = decodeURIComponent(location.pathname).toLowerCase().replace(/\/$/, ''); } catch {}
      if (requested === paths[1] && selected) { showStep(2, true, 'replace'); return; }
      showStep(1, true, 'replace'); loadSlots();
    });
    async function restore() {
      if (restoring) return;
      const saved = savedFlow();
      trackView();
      if (!saved) { forget(); loadFields(); showStep(1,false,'replace'); loadSlots(); return; }
      selected = saved.selected; key = saved.key; party.value = String(selected.party_size); date.value = selected.date;
      fillSavedValues(saved.values); summary($('eb-selection'), selected);
      if (saved.phase === 'details') {
        showStep(2,false,'replace'); await loadFields(); remember('details'); return;
      }
      // Read-only recovery must resolve the old request before another reservation can start.
      restoring = true; uncertain = true; draft = saved.payload; showStep(2,false,'replace'); lock(true);
      confirm.disabled = true; notice('eb-status', 'Henter din bookingbekræftelse…');
      try {
        const data = await api({ action:'recover', idempotency_key:key }, key);
        if (data.found === true) { acknowledge(data, true); clearNotice(); }
        else if (saved.phase === 'pending' && draft) {
          notice('eb-status','Bookingen er endnu ikke bekræftet. Prøv igen med samme booking.');
          confirm.textContent = 'Hent bekræftelse igen';
        } else {
          throw new Error('Vi kunne ikke finde din tidligere bekræftelse. Prøv igen, eller ring på 32 50 50 40.');
        }
      } catch {
        notice('eb-error','Vi kunne ikke hente en sikker bekræftelse. Prøv igen, eller ring på 32 50 50 40.');
        if (!draft) {
          confirm.textContent = 'Hent bekræftelse igen';
          confirm.onclick = event => { event.preventDefault(); restore(); };
        }
      } finally {
        restoring = false; lock(uncertain);
        if (!completed) { if (draft) await loadFields(); confirm.disabled = false; confirm.textContent = 'Hent bekræftelse igen'; }
      }
    }
    restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
