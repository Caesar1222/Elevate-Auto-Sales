/* ==========================================================================
   Elevate Auto Sales: site app
   Hash-routed single page: #home, #inventory, #v-<stock>, #financing,
   #about, #contact, #saved. Reads dealership details from
   config.js, vehicles from inventory-source.js, and all text from i18n.js.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.ELEVATE_CONFIG;
  const Brand = window.ElevateBrand;
  const I = window.ElevateI18n;
  const t = I.t;
  const view = document.getElementById('view');

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = new Intl.NumberFormat('en-US');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (n) => usd.format(Math.round(n || 0));
  const parseNum = (s) => Number(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
  const uniq = (arr) => Array.from(new Set(arr));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const telHref = `tel:${C.phoneE164}`;
  const smsHref = (body) => `sms:${C.phoneE164}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;
  const mailHref = (subject) => `mailto:${C.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  const addr = C.address;
  const addressLine = `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`;

  const ICON_PATHS = {
    phone: '<path d="M6.6 3.5h2.6l1.6 4.3-2.1 1.3a11.5 11.5 0 0 0 6.2 6.2l1.3-2.1 4.3 1.6v2.6a2 2 0 0 1-2.1 2A16.6 16.6 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"/>',
    chat: '<path d="M4.5 5.5h15v10.5H10l-4.5 3.5V16h-1z"/>',
    pin: '<path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l4.5 4.5"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1"/>',
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;

  const BODY_ORDER = ['Sedan', 'SUV', 'Truck', 'Minivan', 'Coupe'];
  const PRICE_STEPS = [10000, 15000, 20000, 25000];
  const MILE_STEPS = [75000, 100000, 125000, 150000];
  const bodyName = (b) => I.pack.body[b] || b;
  const bodyPlural = (b) => I.pack.bodyPlural[b] || b;
  const driveName = (d) => I.pack.drive[d] || d;

  /* ---------- State ---------- */
  const blankFilters = () => ({ q: '', make: '', model: '', body: '', maxPrice: '', minYear: '', maxMiles: '', drive: '' });
  const state = {
    inventory: [],
    loadError: null,
    filters: blankFilters(),
    sort: 'newest',
    saved: readSaved(),
    routeKey: '',
  };

  function readSaved() {
    try { return new Set(JSON.parse(localStorage.getItem('elevate:saved') || '[]')); } catch (e) { return new Set(); }
  }
  function writeSaved() {
    try { localStorage.setItem('elevate:saved', JSON.stringify(Array.from(state.saved))); } catch (e) { /* storage unavailable */ }
  }

  const available = () => state.inventory.filter((v) => v.status === 'available');
  const byId = (id) => state.inventory.find((v) => v.id === id);

  /* ---------- Hours (Chicago time) ---------- */
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60) + m; };
  const fmtTime = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return I.pack.time(h, m); };
  const fmtTimeEn = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const dayName = (key) => I.pack.days[key];
  function chicagoNow() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: C.timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (k) => (parts.find((p) => p.type === k) || {}).value || '0';
    const day = DAY_KEYS.indexOf(get('weekday').slice(0, 3).toLowerCase());
    return { day, key: DAY_KEYS[day], minutes: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
  }
  function openStatus() {
    const now = chicagoNow();
    const today = C.hours[now.key];
    if (today && now.minutes >= toMin(today[0]) && now.minutes < toMin(today[1])) {
      return { open: true, text: t('openUntil', { time: fmtTime(today[1]) }) };
    }
    if (today && now.minutes < toMin(today[0])) return { open: false, text: t('opensToday', { time: fmtTime(today[0]) }) };
    for (let i = 1; i <= 7; i += 1) {
      const key = DAY_KEYS[(now.day + i) % 7];
      const h = C.hours[key];
      if (h) {
        return {
          open: false,
          text: i === 1 ? t('opensTomorrow', { time: fmtTime(h[0]) }) : t('opensDay', { day: dayName(key), time: fmtTime(h[0]) }),
        };
      }
    }
    return { open: false, text: t('closed') };
  }
  function hoursGroups() {
    const groups = [];
    WEEK.forEach((d) => {
      const h = C.hours[d];
      const value = h ? `${fmtTime(h[0])} – ${fmtTime(h[1])}` : t('closed');
      const last = groups[groups.length - 1];
      if (last && last.value === value) last.days.push(d); else groups.push({ days: [d], value, open: !!h, hours: h });
    });
    return groups.map((g) => {
      const first = g.days[0];
      const lastDay = g.days[g.days.length - 1];
      const multi = g.days.length > 1;
      return {
        label: multi ? I.pack.rangeLabel(dayName(first), dayName(lastDay)) : I.pack.dayLabel(dayName(first)),
        phrase: I.pack.daysPhrase(dayName(first), multi ? dayName(lastDay) : null),
        value: g.value,
        open: g.open,
        hours: g.hours,
      };
    });
  }
  const openDaysPhrase = () => hoursGroups().filter((g) => g.open).map((g) => g.phrase).join(` ${I.pack.joinWord} `);
  const hoursSentence = () => hoursGroups().filter((g) => g.open)
    .map((g) => t('hoursSentence', { days: g.phrase, open: fmtTime(g.hours[0]), close: fmtTime(g.hours[1]) })).join(' ');
  // "Monday–Saturday | 10 AM–6 PM", one line per group of days with the same hours.
  const heroHoursLines = () => hoursGroups().filter((g) => g.open)
    .map((g) => t('heroHours', { days: g.label, open: fmtTime(g.hours[0]), close: fmtTime(g.hours[1]) }));
  const statusMarkup = () => {
    const s = openStatus();
    return `<span class="status${s.open ? ' is-open' : ''}" data-status>${esc(s.text)}</span>`;
  };
  function refreshStatus() {
    const s = openStatus();
    $$('[data-status]').forEach((el) => { el.textContent = s.text; el.classList.toggle('is-open', s.open); });
  }

  /* ---------- Shared pieces ---------- */
  const hasPhotos = (v) => Array.isArray(v.photos) && v.photos.length > 0;

  function cardMedia(v) {
    if (hasPhotos(v)) return `<img src="${esc(v.photos[0])}" alt="" loading="lazy" decoding="async">`;
    return Brand.photoPlaceholder({ label: esc(t('photoSoon')), decorative: true });
  }

  function badgeFor(v) {
    if (v.status === 'pending') return `<span class="badge badge--pending">${esc(t('salePending'))}</span>`;
    if (v.badge) return `<span class="badge">${esc(I.value('badge', v.badge))}</span>`;
    return '';
  }

  const saveLabel = (v, on) => (on ? t('removeVehicle', { title: v.title }) : t('saveVehicle', { title: v.title }));
  function saveButton(v) {
    const on = state.saved.has(v.id);
    return `<button class="save-btn" type="button" data-save="${esc(v.id)}" aria-pressed="${on}" aria-label="${esc(saveLabel(v, on))}">${icon('heart')}</button>`;
  }

  const nameMarkup = (v) => `${v.year} ${esc(v.make)} <span class="nowrap">${esc(v.model)}</span>`;

  function card(v) {
    return `<article class="card${v.status === 'pending' ? ' is-pending' : ''}">
      <div class="card-media">${cardMedia(v)}${badgeFor(v)}</div>
      ${saveButton(v)}
      <div class="card-body">
        <h3 class="card-title"><a href="#v-${esc(v.id)}">${nameMarkup(v)}</a></h3>
        <p class="card-trim">${esc(v.trim)}</p>
        <p class="card-price">${money(v.price)}</p>
        <dl class="card-specs">
          <div><dt>${esc(t('mileage'))}</dt><dd>${num.format(v.mileage)}</dd></div>
          <div><dt>${esc(t('drivetrain'))}</dt><dd>${esc(v.drivetrain)}</dd></div>
          <div><dt>${esc(t('transmission'))}</dt><dd>${esc(I.value('transmission', v.transmission))}</dd></div>
        </dl>
      </div>
    </article>`;
  }

  function hoursList() {
    return `<dl class="hours-list">${hoursGroups().map((g) => `<div><dt>${esc(g.label)}</dt><dd>${esc(g.value)}</dd></div>`).join('')}</dl>`;
  }

  const mapBox = () => Brand.mapPlaceholder(esc(addressLine), C.directionsUrl, esc(t('openMaps')));

  function visitBlock() {
    return `<div class="visit">
      <div class="visit-info">
        <h2 class="section-title">${esc(t('hoursLocation'))}</h2>
        <address class="visit-address">${esc(addr.street)}<br>${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.zip)}</address>
        <p class="visit-status">${statusMarkup()}</p>
        ${hoursList()}
        <div class="btn-row">
          <a class="btn btn--primary" href="${C.directionsUrl}" target="_blank" rel="noopener">${esc(t('directions'))}</a>
          <a class="btn btn--outline" href="${telHref}">${esc(t('callN', { phone: C.phoneDisplay }))}</a>
        </div>
      </div>
      <div class="visit-map">${mapBox()}</div>
    </div>`;
  }

  function pageTop(title, sub = '') {
    return `<section class="page-top">
      <div class="wrap">
        <h1 class="page-title" tabindex="-1">${esc(title)}</h1>
        ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}
      </div>
    </section>`;
  }

  function options(values, current, labelFn = (v) => v) {
    return values.map((v) => `<option value="${esc(v)}"${String(v) === String(current) ? ' selected' : ''}>${esc(labelFn(v))}</option>`).join('');
  }

  function chips(name, values, current, labelFn = (v) => v || t('any')) {
    return values.map((v) => `<label class="chip"><input type="radio" name="${name}" value="${esc(v)}"${v === current ? ' checked' : ''}><span>${esc(labelFn(v))}</span></label>`).join('');
  }

  /* ---------- Search matching ---------- */
  // Accent-insensitive, any word order, with Spanish body-style words and
  // punctuation-free model names ("f150", "crv").
  const norm = (str) => String(str ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const compact = (str) => norm(str).replace(/[^a-z0-9]/g, '');
  const BODY_WORDS = { Sedan: 'sedan', SUV: 'suv', Truck: 'truck pickup camioneta troca', Minivan: 'minivan van', Coupe: 'coupe' };
  const buildIndex = (v) => norm([v.year, v.make, v.model, v.trim, v.bodyType, BODY_WORDS[v.bodyType] || '',
    v.exteriorColor, v.stockNumber, v.drivetrain, compact(v.model), compact(`${v.make}${v.model}`)].join(' '));
  function matchesQuery(v, q) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const index = v.searchIndex || (v.searchIndex = buildIndex(v));
    return terms.every((term) => index.includes(term));
  }

  const makesOf = (list) => uniq(list.map((v) => v.make)).sort();
  const modelsOf = (list, make) => uniq(list.filter((v) => !make || v.make === make).map((v) => v.model)).sort();

  /* ---------- Language switch ---------- */
  function langSwitch(short) {
    const cur = I.lang;
    const btn = (code, full, abbr) => `<button type="button" data-lang="${code}" lang="${code}" aria-pressed="${cur === code}"`
      + `${short ? ` aria-label="${full}"` : ''}>${short ? abbr : full}</button>`;
    return `<div class="lang-switch${short ? ' lang-switch--header' : ''}" role="group" aria-label="${esc(t('language'))}">`
      + btn('en', 'English', 'EN') + btn('es', 'Español', 'ES') + '</div>';
  }

  function applyLanguage(focusCode, inHeader) {
    document.documentElement.lang = I.lang;
    const skip = $('.skip-link');
    if (skip) skip.textContent = t('skip');
    const keep = window.scrollY;
    renderShell();
    route({ keepScroll: true, quiet: true });
    window.scrollTo(0, keep);
    const target = $(`${inHeader ? '.lang-switch--header' : '.topbar .lang-switch'} [data-lang="${focusCode}"]`);
    if (target) target.focus({ preventScroll: true });
  }

  /* ---------- Shell: header, footer, action bar ---------- */
  function renderShell() {
    $('#shell-top').innerHTML = `
      <div class="topbar">
        <div class="wrap topbar-inner">
          <a href="${C.directionsUrl}" target="_blank" rel="noopener">${esc(addressLine)}</a>
          ${statusMarkup()}
          <div class="topbar-right">
            ${langSwitch(false)}
            <a class="topbar-phone" href="${telHref}">${esc(C.phoneDisplay)}</a>
          </div>
        </div>
      </div>
      <header class="site-header">
        <div class="wrap header-inner">
          <a class="brand" href="#home" aria-label="${esc(t('brandHome', { name: C.name }))}">${Brand.logo()}</a>
          <nav class="nav" id="site-nav" aria-label="${esc(t('navMain'))}">
            <a href="#inventory" data-nav="inventory">${esc(t('navInventory'))}</a>
            <a href="#financing" data-nav="financing">${esc(t('navFinancing'))}</a>
            <a href="#about" data-nav="about">${esc(t('navAbout'))}</a>
            <a href="#contact" data-nav="contact">${esc(t('navContact'))}</a>
            <a class="nav-saved" href="#saved" data-nav="saved">${esc(t('saved'))}<span class="saved-count" data-saved-count>${state.saved.size || ''}</span></a>
          </nav>
          <div class="header-actions">
            ${langSwitch(true)}
            <button class="search-toggle" type="button" aria-expanded="false" aria-controls="search-panel" aria-label="${esc(t('searchOpen'))}">${icon('search')}</button>
            <a class="saved-link" href="#saved" data-nav="saved" aria-label="${esc(t('saved'))}">${icon('heart')}<span class="saved-count" data-saved-count>${state.saved.size || ''}</span></a>
            <a class="btn btn--primary btn--sm header-call" href="${telHref}">${icon('phone')}<span>${esc(C.phoneDisplay)}</span></a>
            <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="${esc(t('openMenu'))}">${icon('menu')}</button>
          </div>
        </div>
      </header>
      <div class="search-panel" id="search-panel" hidden>
        <div class="wrap search-panel-inner">
          <form class="search-panel-form" id="site-search" role="search">
            <label class="sr-only" for="site-search-input">${esc(t('searchLabel'))}</label>
            <input class="search-panel-input" id="site-search-input" type="search" name="q" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="${esc(t('searchPanelPh'))}">
            <button class="btn btn--primary search-panel-submit" type="submit">${esc(t('searchSubmit'))}</button>
            <button class="icon-btn" type="button" data-search-close aria-label="${esc(t('searchClose'))}">${icon('close')}</button>
          </form>
          <p class="sr-only" aria-live="polite" id="search-status"></p>
          <div class="search-results" id="search-results"></div>
        </div>
      </div>`;

    const groups = hoursGroups();
    $('#shell-bottom').innerHTML = `
      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div class="footer-brand">
            <a class="brand" href="#home" aria-label="${esc(t('brandHome', { name: C.name }))}">${Brand.logo()}</a>
            <p class="footer-tagline" lang="en">${esc(C.tagline)}</p>
          </div>
          <div>
            <h2 class="footer-h">${esc(t('footerVisit'))}</h2>
            <address class="footer-list">${esc(addr.street)}<br>${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.zip)}</address>
            <a class="footer-link" href="${C.directionsUrl}" target="_blank" rel="noopener">${esc(t('directions'))}</a>
          </div>
          <div>
            <h2 class="footer-h">${esc(t('footerHours'))}</h2>
            <ul class="footer-list">${groups.map((g) => `<li>${esc(g.label)}<br><span class="footer-dim">${esc(g.value)}</span></li>`).join('')}</ul>
          </div>
          <div>
            <h2 class="footer-h">${esc(t('footerContact'))}</h2>
            <ul class="footer-list">
              <li><a href="${telHref}">${esc(C.phoneDisplay)}</a></li>
              <li><a class="footer-email" href="${mailHref()}">${esc(C.email).replace('@', '<wbr>@')}</a></li>
            </ul>
          </div>
          <nav aria-label="${esc(t('footerNav'))}">
            <h2 class="footer-h">${esc(t('footerShop'))}</h2>
            <ul class="footer-list">
              <li><a href="#inventory">${esc(t('navInventory'))}</a></li>
              <li><a href="#financing">${esc(t('navFinancing'))}</a></li>
              <li><a href="#about">${esc(t('navAbout'))}</a></li>
            </ul>
          </nav>
        </div>
        <div class="wrap footer-legal">
          <p>© ${new Date().getFullYear()} ${esc(C.legalName)}</p>
          <p>${esc(t('legal'))}</p>
        </div>
      </footer>
      <div class="search-scrim" data-search-close hidden></div>
      <nav class="action-bar" aria-label="${esc(t('quickContact'))}">
        <a href="${telHref}">${icon('phone')}<span>${esc(t('call'))}</span></a>
        <a href="${smsHref()}">${icon('chat')}<span>${esc(t('text'))}</span></a>
        <a href="${C.directionsUrl}" target="_blank" rel="noopener">${icon('pin')}<span>${esc(t('directionsShort'))}</span></a>
      </nav>`;
    wireSearch();
  }

  /* ---------- Header search ---------- */
  function searchItem(v) {
    const thumb = hasPhotos(v) ? `<img src="${esc(v.photos[0])}" alt="" loading="lazy">` : Brand.photoPlaceholder({ label: '', size: 'sm', decorative: true });
    return `<li><a class="sr-item" href="#v-${esc(v.id)}"><span class="sr-thumb">${thumb}</span>`
      + `<span class="sr-text"><span class="sr-title">${nameMarkup(v)}</span><span class="sr-sub">${esc(v.trim)}</span></span>`
      + `<span class="sr-price">${money(v.price)}</span></a></li>`;
  }

  function renderSearch() {
    const input = $('#site-search-input');
    const box = $('#search-results');
    const status = $('#search-status');
    if (!input || !box) return;
    const q = input.value.trim();
    if (!q) {
      const avail = available();
      box.innerHTML = `<p class="sr-hint">${esc(t('browseByBody'))}</p>`
        + `<nav class="type-links" aria-label="${esc(t('browseByBody'))}">${BODY_ORDER.map((b) => `<a href="#inventory" data-body="${b}">${esc(bodyPlural(b))}<span class="type-count">${avail.filter((v) => v.bodyType === b).length}</span></a>`).join('')}</nav>`;
      status.textContent = '';
      return;
    }
    const list = sortList(state.inventory.filter((v) => matchesQuery(v, q)), 'newest');
    status.textContent = t('searchCount', { n: list.length });
    if (!list.length) {
      box.innerHTML = `<div class="sr-empty"><p>${esc(t('searchNone', { q }))}</p><p class="sr-hint">${esc(t('searchNoneHint'))}</p></div>`;
      return;
    }
    box.innerHTML = `<ul class="sr-list">${list.slice(0, 6).map(searchItem).join('')}</ul>`
      + `<a class="text-link sr-all" href="#inventory" data-search-all>${esc(t('searchSeeAll', { n: list.length, q }))}</a>`;
  }

  const searchIsOpen = () => { const panel = $('#search-panel'); return !!panel && !panel.hidden; };

  function openSearch() {
    const panel = $('#search-panel');
    if (!panel || !panel.hidden) return;
    closeMenu();
    panel.hidden = false;
    $('.search-scrim').hidden = false;
    $('.search-toggle').setAttribute('aria-expanded', 'true');
    renderSearch();
    const input = $('#site-search-input');
    input.focus();
    input.select();
  }

  function closeSearch(returnFocus = true) {
    if (!searchIsOpen()) return;
    $('#search-panel').hidden = true;
    $('.search-scrim').hidden = true;
    const toggle = $('.search-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }

  function searchAll(q) {
    state.filters = { ...blankFilters(), q };
    closeSearch(false);
    go('inventory');
  }

  let searchRenderTimer = 0;
  function wireSearch() {
    const form = $('#site-search');
    const input = $('#site-search-input');
    if (!form || !input) return;
    input.addEventListener('input', () => { clearTimeout(searchRenderTimer); searchRenderTimer = setTimeout(renderSearch, 80); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) searchAll(q); else input.focus();
    });
  }

  function updateSavedCount() {
    $$('[data-saved-count]').forEach((el) => { el.textContent = state.saved.size || ''; });
  }

  /* ---------- Home ---------- */
  const heroSources = () => ((C.heroVideo && Array.isArray(C.heroVideo.sources)) ? C.heroVideo.sources.filter((src) => src && src.src) : []);
  const heroPhoto = () => ((C.heroImage && C.heroImage.src) ? C.heroImage : null);

  function heroMarkup() {
    const sources = heroSources();
    const photo = heroPhoto();
    const poster = (C.heroVideo && C.heroVideo.poster) || (photo ? photo.src : '');
    let media = Brand.heroPlaceholder(esc(t('heroVideoPh')));
    let mode = '';
    if (sources.length) {
      mode = ' has-video';
      media = `<video class="hero-video" muted loop playsinline preload="metadata" disablepictureinpicture disableremoteplayback aria-hidden="true"${poster ? ` poster="${esc(poster)}"` : ''}>`
        + sources.map((src) => `<source src="${esc(src.src)}"${src.type ? ` type="${esc(src.type)}"` : ''}>`).join('')
        + '</video>';
    } else if (photo) {
      mode = ' has-photo';
      media = `<img class="hero-photo" src="${esc(photo.src)}" alt="" decoding="async" fetchpriority="high">`;
    }
    return `<section class="hero${mode}" aria-labelledby="hero-title">
      <div class="hero-media">${media}</div>
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="wrap hero-content">
        <h1 class="hero-title" id="hero-title">${esc(t('heroTitle'))}</h1>
        <p class="hero-text">${esc(t('heroText', { name: C.name }))}</p>
        <ul class="hero-facts">
          <li><a href="${C.directionsUrl}" target="_blank" rel="noopener">${icon('pin')}<span>${esc(addressLine)}</span></a></li>
          ${heroHoursLines().map((line) => `<li>${icon('clock')}<span>${esc(line)}</span></li>`).join('')}
        </ul>
        <p class="hero-tagline" lang="en">${esc(C.tagline)}</p>
        <div class="btn-row hero-actions">
          <a class="btn btn--primary btn--lg" href="#inventory">${esc(t('browse'))}</a>
          <a class="btn btn--light btn--lg" href="#financing">${esc(t('prequal'))}</a>
        </div>
        <p class="hero-status">${statusMarkup()}</p>
      </div>
      ${sources.length ? `<button class="hero-toggle" type="button" data-hero-toggle>${icon('pause')}<span>${esc(t('pauseVideo'))}</span></button>` : ''}
    </section>`;
  }

  let heroObserver = null;
  function teardownHero() {
    if (heroObserver) { heroObserver.disconnect(); heroObserver = null; }
  }

  // Hero photo: apply the crop position; if it can't load, show the placeholder.
  function setupHeroPhoto() {
    const img = $('.hero-photo');
    if (!img) return;
    const photo = heroPhoto();
    if (photo && photo.position) img.style.objectPosition = photo.position;
    const fallBack = () => {
      const hero = $('.hero');
      if (!hero || !hero.contains(img)) return;
      $('.hero-media').innerHTML = Brand.heroPlaceholder(esc(t('heroVideoPh')));
      hero.classList.remove('has-photo');
    };
    if (img.complete && img.naturalWidth === 0) fallBack();
    else img.addEventListener('error', fallBack, { once: true });
  }

  // Muted, looping, pausable. No autoplay with reduced motion or data saver;
  // pauses off screen; falls back to the placeholder if the file won't load.
  function setupHeroVideo() {
    teardownHero();
    const video = $('.hero-video');
    const toggle = $('[data-hero-toggle]');
    if (!video || !toggle) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    let held = reduceMotion || saveData;
    const setToggle = (playing) => {
      toggle.innerHTML = `${icon(playing ? 'pause' : 'play')}<span>${esc(t(playing ? 'pauseVideo' : 'playVideo'))}</span>`;
    };
    const play = () => video.play().then(() => setToggle(true)).catch(() => setToggle(false));
    const lastSource = $('source:last-of-type', video);
    if (lastSource) {
      lastSource.addEventListener('error', () => {
        teardownHero();
        $('.hero-media').innerHTML = Brand.heroPlaceholder(esc(t('heroVideoPh')));
        $('.hero').classList.remove('has-video');
        toggle.remove();
      });
    }
    setToggle(false);
    if (!held) play();
    toggle.addEventListener('click', () => {
      if (video.paused) { held = false; play(); } else { held = true; video.pause(); setToggle(false); }
    });
    if ('IntersectionObserver' in window) {
      heroObserver = new IntersectionObserver(([entry]) => {
        if (held) return;
        if (entry.isIntersecting) play(); else { video.pause(); }
      }, { threshold: 0.15 });
      heroObserver.observe(video);
    }
  }

  function quickSearchCount(f) { return applyFilters(state.inventory, { ...blankFilters(), ...f }).length; }

  function viewHome() {
    const avail = available();
    const recent = avail.slice().sort((a, b) => b.dateInStock.localeCompare(a.dateInStock)).slice(0, 8);
    const count = (b) => avail.filter((v) => v.bodyType === b).length;
    const total = state.inventory.length;
    return `
    ${heroMarkup()}

    <section class="intro" aria-labelledby="search-title">
      <div class="wrap intro-grid">
        <div class="intro-main">
          <h2 class="section-title" id="search-title">${esc(t('searchTitle'))}</h2>
          <form class="search" id="quick-search" role="search" aria-label="${esc(t('searchAria'))}">
            <label class="field"><span class="field-label">${esc(t('make'))}</span>
              <select name="make"><option value="">${esc(t('anyMake'))}</option>${options(makesOf(state.inventory), '')}</select></label>
            <label class="field"><span class="field-label">${esc(t('model'))}</span>
              <select name="model" disabled><option value="">${esc(t('anyModel'))}</option></select></label>
            <label class="field"><span class="field-label">${esc(t('price'))}</span>
              <select name="maxPrice"><option value="">${esc(t('anyPrice'))}</option>${options(PRICE_STEPS, '', (p) => t('under', { price: money(p) }))}</select></label>
            <button class="btn btn--primary search-btn" type="submit" data-quick-count>${esc(t('showVehicles', { n: total }))}</button>
          </form>
          <nav class="type-links" aria-label="${esc(t('browseByBody'))}">
            ${BODY_ORDER.map((b) => `<a href="#inventory" data-body="${b}">${esc(bodyPlural(b))}<span class="type-count">${count(b)}</span></a>`).join('')}
          </nav>
        </div>
        <aside class="visit-card" aria-label="${esc(t('hoursLocation'))}">
          <p class="visit-card-status">${statusMarkup()}</p>
          <dl class="visit-card-list">
            <div><dt>${esc(t('address'))}</dt><dd>${esc(addr.street)}<br>${esc(addr.city)}, ${esc(addr.state)} ${esc(addr.zip)}</dd></div>
            <div><dt>${esc(t('hours'))}</dt><dd>${hoursGroups().map((g) => `${esc(g.label)}: ${esc(g.value)}`).join('<br>')}</dd></div>
            <div><dt>${esc(t('phone'))}</dt><dd><a href="${telHref}">${esc(C.phoneDisplay)}</a></dd></div>
          </dl>
          <a class="btn btn--outline btn--block" href="${C.directionsUrl}" target="_blank" rel="noopener">${esc(t('directions'))}</a>
        </aside>
      </div>
    </section>

    <section class="section" aria-labelledby="lot-title">
      <div class="wrap">
        <div class="section-head">
          <h2 class="section-title" id="lot-title">${esc(t('onLot'))}</h2>
          <a class="text-link" href="#inventory">${esc(t('viewAll', { n: total }))}</a>
        </div>
        <div class="grid">${recent.map(card).join('')}</div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap two-up">
        <div class="two-up-item">
          <h2 class="section-title">${esc(t('financing'))}</h2>
          <p>${esc(t('financingText'))}</p>
          <a class="btn btn--primary" href="#financing">${esc(t('prequal'))}</a>
        </div>
        <div class="two-up-item">
          <h2 class="section-title">${esc(t('bring'))}</h2>
          ${bringList('two-up-list')}
        </div>
      </div>
    </section>`;
  }

  function afterHome() {
    setupHeroPhoto();
    setupHeroVideo();
    const form = $('#quick-search');
    if (!form) return;
    const sync = () => {
      const make = form.make.value;
      const models = modelsOf(state.inventory, make);
      const prev = form.model.value;
      form.model.innerHTML = `<option value="">${esc(t('anyModel'))}</option>${options(models, models.includes(prev) ? prev : '')}`;
      form.model.disabled = !make;
      const n = quickSearchCount({ make, model: form.model.value, maxPrice: form.maxPrice.value });
      const btn = $('[data-quick-count]', form);
      btn.textContent = n ? t('showVehicles', { n }) : t('noMatches');
      btn.disabled = n === 0;
    };
    form.addEventListener('change', sync);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      state.filters = { ...blankFilters(), make: form.make.value, model: form.model.value, maxPrice: form.maxPrice.value };
      go('inventory');
    });
  }

  /* ---------- Inventory ---------- */
  function applyFilters(list, f) {
    return list.filter((v) => matchesQuery(v, f.q || '')
      && (!f.make || v.make === f.make)
      && (!f.model || v.model === f.model)
      && (!f.body || v.bodyType === f.body)
      && (!f.maxPrice || v.price <= Number(f.maxPrice))
      && (!f.minYear || v.year >= Number(f.minYear))
      && (!f.maxMiles || v.mileage <= Number(f.maxMiles))
      && (!f.drive || v.drivetrain === f.drive));
  }

  function sortList(list, sort) {
    const s = list.slice();
    const pendingLast = (a, b) => (a.status === 'pending') - (b.status === 'pending');
    const cmp = {
      newest: (a, b) => b.dateInStock.localeCompare(a.dateInStock),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      miles: (a, b) => a.mileage - b.mileage,
      year: (a, b) => b.year - a.year || a.mileage - b.mileage,
    }[sort] || (() => 0);
    return s.sort((a, b) => pendingLast(a, b) || cmp(a, b));
  }

  const filterLabel = (k, v) => ({
    q: () => `“${v}”`,
    make: () => v,
    model: () => v,
    body: () => bodyPlural(v),
    maxPrice: () => t('under', { price: money(v) }),
    minYear: () => t('orNewer', { y: v }),
    maxMiles: () => t('underMiles', { n: num.format(v) }),
    drive: () => v,
  }[k] || (() => v))();
  const activeFilters = () => Object.keys(state.filters).filter((k) => state.filters[k]);
  const SORTS = { newest: 'sortNewest', 'price-asc': 'sortPriceAsc', 'price-desc': 'sortPriceDesc', miles: 'sortMiles', year: 'sortYear' };

  function viewInventory() {
    const f = state.filters;
    const years = uniq(state.inventory.map((v) => v.year)).sort((a, b) => a - b);
    return `
    ${pageTop(t('invTitle'), t('invSub'))}
    <div class="wrap inv">
      <aside class="filters" id="filters" aria-label="${esc(t('filterAria'))}">
        <div class="filters-head">
          <h2 class="filters-title">${esc(t('filters'))}</h2>
          <button class="link-btn" type="button" data-action="clear-filters">${esc(t('clearAll'))}</button>
          <button class="icon-btn filters-close" type="button" data-action="close-filters" aria-label="${esc(t('closeFilters'))}">${icon('close')}</button>
        </div>
        <form class="filters-form" id="filter-form">
          <label class="field"><span class="field-label">${esc(t('search'))}</span>
            <input type="search" name="q" value="${esc(f.q)}" placeholder="${esc(t('searchPh'))}" autocomplete="off"></label>
          <label class="field"><span class="field-label">${esc(t('make'))}</span>
            <select name="make"><option value="">${esc(t('anyMake'))}</option>${options(makesOf(state.inventory), f.make)}</select></label>
          <label class="field"><span class="field-label">${esc(t('model'))}</span>
            <select name="model" data-model-select><option value="">${esc(t('anyModel'))}</option>${options(modelsOf(state.inventory, f.make), f.model)}</select></label>
          <fieldset class="field"><legend class="field-label">${esc(t('bodyStyle'))}</legend>
            <div class="chips">${chips('body', ['', ...BODY_ORDER], f.body, (v) => (v ? bodyName(v) : t('any')))}</div></fieldset>
          <label class="field"><span class="field-label">${esc(t('maxPrice'))}</span>
            <select name="maxPrice"><option value="">${esc(t('anyPrice'))}</option>${options(PRICE_STEPS, f.maxPrice, (p) => t('under', { price: money(p) }))}</select></label>
          <label class="field"><span class="field-label">${esc(t('year'))}</span>
            <select name="minYear"><option value="">${esc(t('anyYear'))}</option>${options(years, f.minYear, (y) => t('orNewer', { y }))}</select></label>
          <label class="field"><span class="field-label">${esc(t('mileage'))}</span>
            <select name="maxMiles"><option value="">${esc(t('anyMileage'))}</option>${options(MILE_STEPS, f.maxMiles, (m) => t('underMiles', { n: num.format(m) }))}</select></label>
          <fieldset class="field"><legend class="field-label">${esc(t('drivetrain'))}</legend>
            <div class="chips">${chips('drive', ['', 'FWD', 'AWD', '4WD', 'RWD'], f.drive)}</div></fieldset>
        </form>
        <div class="filters-foot"><button class="btn btn--primary btn--block" type="button" data-action="close-filters" data-results-btn>${esc(t('showResults'))}</button></div>
      </aside>
      <section class="results" aria-label="${esc(t('results'))}">
        <div class="results-bar">
          <p class="results-count" aria-live="polite" data-results-count></p>
          <button class="btn btn--outline btn--sm filters-open" type="button" data-action="open-filters" aria-controls="filters" aria-expanded="false">${icon('sliders')}<span>${esc(t('filters'))}</span><span data-filter-count></span></button>
          <label class="sort"><span class="sort-label">${esc(t('sortBy'))}</span>
            <select name="sort" id="sort">${options(Object.keys(SORTS), state.sort, (s) => t(SORTS[s]))}</select></label>
        </div>
        <div class="active-filters" data-active-filters></div>
        <div class="grid grid--inv" data-results-grid></div>
      </section>
    </div>
    <div class="scrim" data-action="close-filters" hidden></div>`;
  }

  function updateResults() {
    const grid = $('[data-results-grid]');
    if (!grid) return;
    const list = sortList(applyFilters(state.inventory, state.filters), state.sort);
    grid.innerHTML = list.length ? list.map(card).join('') : `
      <div class="empty">
        <h2 class="empty-title">${esc(t('emptyTitle'))}</h2>
        <p>${esc(t('emptyText'))}</p>
        <button class="btn btn--outline" type="button" data-action="clear-filters">${esc(t('clearFilters'))}</button>
      </div>`;
    const countText = t('vehicles', { n: list.length });
    const sp = countText.indexOf(' ');
    $('[data-results-count]').innerHTML = `<strong>${esc(countText.slice(0, sp))}</strong> ${esc(countText.slice(sp + 1))}`;
    const btn = $('[data-results-btn]');
    btn.textContent = list.length ? t('showVehicles', { n: list.length }) : t('noMatches');
    const active = activeFilters();
    $('[data-filter-count]').textContent = active.length ? ` (${active.length})` : '';
    $('[data-active-filters]').innerHTML = active.map((k) => {
      const label = filterLabel(k, state.filters[k]);
      return `<button class="filter-tag" type="button" data-remove="${k}" aria-label="${esc(t('removeFilter', { label }))}">${esc(label)}${icon('close')}</button>`;
    }).join('');
  }

  function syncModelSelect() {
    const sel = $('[data-model-select]');
    if (!sel) return;
    const models = modelsOf(state.inventory, state.filters.make);
    if (state.filters.model && !models.includes(state.filters.model)) state.filters.model = '';
    sel.innerHTML = `<option value="">${esc(t('anyModel'))}</option>${options(models, state.filters.model)}`;
  }

  let searchTimer = 0;
  function afterInventory() {
    const form = $('#filter-form');
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', (e) => {
      if (e.target.name !== 'q') return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.filters.q = e.target.value; updateResults(); }, 140);
    });
    form.addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (!(name in state.filters) || name === 'q') return;
      state.filters[name] = value;
      if (name === 'make') syncModelSelect();
      updateResults();
    });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; updateResults(); });
    updateResults();
  }

  function openFilters(open) {
    document.body.classList.toggle('filters-open', open);
    const scrim = $('.scrim');
    if (scrim) scrim.hidden = !open;
    const btn = $('[data-action="open-filters"]');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    const panel = $('#filters');
    if (open && panel) {
      const first = $('input, select', panel);
      if (first) first.focus({ preventScroll: true });
    } else if (btn && panel && panel.contains(document.activeElement)) {
      btn.focus();
    }
  }

  /* ---------- Vehicle detail ---------- */
  const KEEP_CASE = /^(Apple|Android|SYNC|Uconnect|LaneWatch|Wi-Fi|Bluetooth|Honda)/;
  const featureCase = (f) => (KEEP_CASE.test(f) ? f : f.charAt(0).toLowerCase() + f.slice(1));
  function describe(v) {
    if (v.description) return v.description;
    const highlights = v.features.slice(0, 3).map((f) => featureCase(I.value('feature', f)));
    return I.pack.describe(v, {
      drive: driveName(v.drivetrain).toLowerCase(),
      features: I.pack.list(highlights),
      street: addr.street,
      phone: C.phoneDisplay,
    });
  }

  function upcomingOpenDays(n = 6) {
    const out = [];
    const now = chicagoNow();
    const fmt = new Intl.DateTimeFormat(I.pack.locale, { timeZone: C.timeZone, weekday: 'short', month: 'short', day: 'numeric' });
    const fmtEn = new Intl.DateTimeFormat('en-US', { timeZone: C.timeZone, weekday: 'short', month: 'short', day: 'numeric' });
    const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: C.timeZone, weekday: 'short' });
    for (let i = 0; out.length < n && i < 21; i += 1) {
      const d = new Date(Date.now() + (i * 86400000));
      const key = wdFmt.format(d).slice(0, 3).toLowerCase();
      const h = C.hours[key];
      if (!h) continue;
      if (i === 0 && now.minutes >= toMin(h[1]) - 60) continue;
      const date = fmt.format(d);
      out.push({ value: fmtEn.format(d), date, label: i === 0 ? t('todayDate', { date }) : (i === 1 ? t('tomorrowDate', { date }) : date) });
    }
    return out;
  }
  function timeSlots() {
    const h = C.hours.mon || ['10:00', '18:00'];
    const slots = [];
    for (let m = toMin(h[0]); m <= toMin(h[1]) - 60; m += 60) {
      const hhmm = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
      slots.push({ value: fmtTimeEn(hhmm), label: fmtTime(hhmm) });
    }
    return slots;
  }

  // English reference stays fixed in lead data so the dealer's records match.
  const vehicleRefEn = (v) => `${v.year} ${v.make} ${v.model} ${v.trim} (stock ${v.stockNumber})`;
  const vehicleRef = (v) => t('ref', { year: v.year, make: v.make, model: v.model, trim: v.trim, stock: v.stockNumber });
  const INTENT_KEY = { availability: 'msgAvail', 'test-drive': 'msgTest', financing: 'msgFin' };
  const intentMessage = (intent, v) => t(INTENT_KEY[intent], { ref: vehicleRef(v) });

  function leadForm(v) {
    const pending = v.status === 'pending';
    const opt = t('optional');
    return `<form class="lead-form" data-lead="availability" data-vehicle="${esc(v.id)}">
      <h2 class="lead-title">${esc(t(pending ? 'askVehicle' : 'checkAvail'))}</h2>
      <div class="seg" role="radiogroup" aria-label="${esc(t('intentAria'))}">
        <label class="seg-opt"><input type="radio" name="intent" value="availability" checked><span>${esc(t('availability'))}</span></label>
        <label class="seg-opt"><input type="radio" name="intent" value="test-drive"><span>${esc(t('testDrive'))}</span></label>
        <label class="seg-opt"><input type="radio" name="intent" value="financing"><span>${esc(t('financing'))}</span></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field-label">${esc(t('firstName'))}</span><input name="firstName" required autocomplete="given-name"></label>
        <label class="field"><span class="field-label">${esc(t('lastName'))}</span><input name="lastName" autocomplete="family-name"></label>
      </div>
      <label class="field"><span class="field-label">${esc(t('phone'))}</span><input name="phone" type="tel" required autocomplete="tel" inputmode="tel"></label>
      <label class="field"><span class="field-label">${esc(t('email'))} <span class="optional">${esc(opt)}</span></span><input name="email" type="email" autocomplete="email"></label>
      <div class="field-row" data-when="test-drive" hidden>
        <label class="field"><span class="field-label">${esc(t('day'))}</span><select name="day">${upcomingOpenDays().map((d) => `<option value="${esc(d.value)}">${esc(d.label)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">${esc(t('time'))}</span><select name="time">${timeSlots().map((s) => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="field-label">${esc(t('message'))}</span><textarea name="message" rows="3">${esc(intentMessage('availability', v))}</textarea></label>
      ${honeypot()}
      <p class="form-error" data-form-error hidden></p>
      <button class="btn btn--primary btn--block" type="submit">${esc(t('sendMessage'))}</button>
      <p class="fine">${esc(t('consentVehicle', { name: C.name }))}</p>
    </form>`;
  }

  function calculator(price) {
    return `<div class="calc" data-calc>
      <div class="calc-inputs">
        <label class="field field--wide"><span class="field-label">${esc(t('vehiclePrice'))}</span>
          <span class="input-affix"><span aria-hidden="true">$</span><input name="price" inputmode="numeric" value="${num.format(price)}" aria-label="${esc(t('priceAria'))}"></span></label>
        <label class="field"><span class="field-label">${esc(t('downPayment'))}</span>
          <span class="input-affix"><span aria-hidden="true">$</span><input name="down" inputmode="numeric" value="2,000" aria-label="${esc(t('downAria'))}"></span></label>
        <label class="field"><span class="field-label">${esc(t('apr'))}</span>
          <span class="input-affix"><input name="apr" inputmode="decimal" value="9.9" aria-label="${esc(t('aprAria'))}"><span aria-hidden="true">%</span></span></label>
        <fieldset class="field field--wide"><legend class="field-label">${esc(t('loanLength'))}</legend>
          <div class="seg">${['36', '48', '60', '72'].map((m) => `<label class="seg-opt"><input type="radio" name="term" value="${m}"${m === '60' ? ' checked' : ''}><span>${m}</span></label>`).join('')}</div></fieldset>
      </div>
      <div class="calc-result">
        <p class="calc-label">${esc(t('estPayment'))}</p>
        <p class="calc-amount" aria-live="polite"><span data-calc-out>$0</span><span class="calc-per">${esc(t('perMonth'))}</span></p>
        <dl class="calc-breakdown">
          <div><dt>${esc(t('financed'))}</dt><dd data-calc-financed>$0</dd></div>
          <div><dt>${esc(t('totalInterest'))}</dt><dd data-calc-interest>$0</dd></div>
        </dl>
        <p class="fine">${esc(t('calcFine'))}</p>
      </div>
    </div>`;
  }

  function computeCalc(root) {
    const val = (n) => parseNum($(`[name="${n}"]`, root).value);
    const principal = Math.max(0, val('price') - val('down'));
    const rate = val('apr') / 100 / 12;
    const term = Number(($('[name="term"]:checked', root) || {}).value || 60);
    const payment = principal === 0 ? 0 : (rate === 0 ? principal / term : (principal * rate) / (1 - ((1 + rate) ** -term)));
    $('[data-calc-out]', root).textContent = money(payment);
    $('[data-calc-financed]', root).textContent = money(principal);
    $('[data-calc-interest]', root).textContent = money(Math.max(0, (payment * term) - principal));
  }

  function wireCalcs() {
    $$('[data-calc]').forEach((root) => {
      computeCalc(root);
      root.addEventListener('input', () => computeCalc(root));
      root.addEventListener('change', () => computeCalc(root));
      $$('.input-affix input:not([name="apr"])', root).forEach((input) => {
        input.addEventListener('blur', () => { const n = parseNum(input.value); input.value = n ? num.format(n) : '0'; });
      });
    });
  }

  function similar(v) {
    return available()
      .filter((o) => o.id !== v.id)
      .map((o) => ({ o, score: (o.bodyType === v.bodyType ? 0 : 50000) + Math.abs(o.price - v.price) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map((x) => x.o);
  }

  function gallery(v) {
    if (hasPhotos(v)) {
      const shots = v.photos.slice(0, 12);
      return `<div class="gallery-stage"><img data-gallery-main src="${esc(shots[0])}" alt="${esc(`${v.year} ${v.make} ${v.model}`)}">${badgeFor(v)}</div>
        <div class="gallery-thumbs" role="group" aria-label="${esc(t('choosePhoto'))}">
          ${shots.map((src, i) => `<button class="thumb${i === 0 ? ' is-active' : ''}" type="button" data-thumb="${i}" aria-pressed="${i === 0}" aria-label="${esc(t('photoN', { n: i + 1 }))}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}
        </div>`;
    }
    return `<div class="gallery-stage">${Brand.photoPlaceholder({ label: esc(t('photosSoon')), size: 'lg' })}${badgeFor(v)}</div>
      <div class="gallery-thumbs" aria-hidden="true">${Array.from({ length: 5 }, () => `<div class="thumb">${Brand.photoPlaceholder({ label: '', size: 'sm', decorative: true })}</div>`).join('')}</div>`;
  }

  function viewVehicle(v) {
    const mpg = v.mpgCity && v.mpgHighway ? t('mpg', { c: v.mpgCity, h: v.mpgHighway }) : '';
    const specs = [
      [t('mileage'), t('milesN', { n: num.format(v.mileage) })],
      [t('engine'), v.engine],
      [t('transmission'), I.value('transmission', v.transmission)],
      [t('drivetrain'), driveName(v.drivetrain)],
      [t('fuelEconomy'), mpg],
      [t('fuelType'), I.value('fuel', v.fuelType)],
      [t('exterior'), v.exteriorColor],
      [t('interior'), v.interiorColor],
      [t('bodyStyle'), bodyName(v.bodyType)],
      [t('stockNumber'), v.stockNumber],
      [t('vin'), v.vin],
    ].filter(([, val]) => val);
    return `
    <div class="wrap crumbs"><a class="back-link" href="#inventory">${icon('back')}<span>${esc(t('back'))}</span></a></div>
    <div class="wrap vdp">
      <div class="vdp-gallery">${gallery(v)}</div>
      <aside class="vdp-side">
        <div class="buy-box">
          <div class="buy-head">
            <h1 class="vdp-title" tabindex="-1"><span class="vdp-name">${nameMarkup(v)}</span><span class="vdp-trim">${esc(v.trim)}</span></h1>
            ${saveButton(v)}
          </div>
          <p class="vdp-meta"><span>${esc(t('milesN', { n: num.format(v.mileage) }))}</span><span>${esc(t('stockN', { s: v.stockNumber }))}</span></p>
          <p class="vdp-price">${money(v.price)}</p>
          <p class="fine">${esc(t('plusFees'))}</p>
          <div class="buy-actions">
            <a class="btn btn--primary" href="${telHref}">${icon('phone')}<span>${esc(t('call'))}</span></a>
            <a class="btn btn--outline" href="${smsHref(intentMessage('availability', v))}">${icon('chat')}<span>${esc(t('text'))}</span></a>
          </div>
          ${leadForm(v)}
        </div>
      </aside>
      <div class="vdp-details">
        <section class="vdp-section" aria-labelledby="ov-title">
          <h2 class="vdp-h" id="ov-title">${esc(t('overview'))}</h2>
          <dl class="specs">${specs.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
        </section>
        <section class="vdp-section" aria-labelledby="ft-title">
          <h2 class="vdp-h" id="ft-title">${esc(t('features'))}</h2>
          <ul class="feature-list">${v.features.map((f) => `<li>${esc(I.value('feature', f))}</li>`).join('')}</ul>
        </section>
        <section class="vdp-section" aria-labelledby="ab-title">
          <h2 class="vdp-h" id="ab-title">${esc(t('description'))}</h2>
          <p class="vdp-desc">${esc(describe(v))}</p>
        </section>
        <section class="vdp-section" aria-labelledby="calc-title">
          <h2 class="vdp-h" id="calc-title">${esc(t('estimate'))}</h2>
          ${calculator(v.price)}
        </section>
      </div>
    </div>
    <section class="section section--alt" aria-labelledby="sim-title">
      <div class="wrap">
        <h2 class="section-title" id="sim-title">${esc(t('similar'))}</h2>
        <div class="grid">${similar(v).map(card).join('')}</div>
      </div>
    </section>`;
  }

  function afterVehicle(v) {
    const main = $('[data-gallery-main]');
    if (main) {
      $$('[data-thumb]').forEach((btn) => {
        btn.addEventListener('click', () => {
          main.src = v.photos[Number(btn.dataset.thumb)];
          $$('[data-thumb]').forEach((b) => { const on = b === btn; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        });
      });
    }
    const form = $('.lead-form[data-vehicle]');
    const msg = form.message;
    msg.addEventListener('input', () => { msg.dataset.edited = '1'; });
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'intent') return;
      const intent = e.target.value;
      $('[data-when="test-drive"]', form).hidden = intent !== 'test-drive';
      if (!msg.dataset.edited) msg.value = intentMessage(intent, v);
      form.dataset.lead = intent;
    });
    wireCalcs();
  }

  /* ---------- Financing ---------- */
  // Credit choices and the range shown under each (also used in lead emails).
  const CREDIT = [['Excellent', '720 and up'], ['Good', '660 to 719'], ['Fair', '600 to 659'], ['Rebuilding', 'Below 600'], ['Not sure', 'That’s fine']];
  const bringList = (cls = '') => `<ul class="plain-list${cls ? ` ${cls}` : ''}">${[1, 2, 3, 4].map((i) => `<li>${esc(t(`bring${i}`))}</li>`).join('')}</ul>`;
  const choiceCards = (name, items, requiredFirst = true) => items.map(([value, sub], i) => `<label class="choice"><input type="radio" name="${name}" value="${esc(value)}"${i === 0 && requiredFirst ? ' required' : ''}><span><strong>${esc(I.opt(value))}</strong><small>${esc(I.opt(sub))}</small></span></label>`).join('');

  function viewFinancing() {
    const vehicles = available().slice().sort((a, b) => a.title.localeCompare(b.title));
    const opt = t('optional');
    return `
    ${pageTop(t('finTitle'), t('finSub'))}
    <div class="wrap fin">
      <div class="fin-main">
        <form class="panel stepper" data-lead="prequal" data-stepper novalidate>
          <ol class="stepper-progress" aria-label="${esc(t('progress'))}">
            <li class="is-current" data-progress="1">${esc(t('stepAbout'))}</li>
            <li data-progress="2">${esc(t('stepBudget'))}</li>
            <li data-progress="3">${esc(t('stepVehicle'))}</li>
          </ol>
          <fieldset class="step-panel" data-step="1">
            <legend class="step-legend">${esc(t('legendAbout'))}</legend>
            <div class="field-row">
              <label class="field"><span class="field-label">${esc(t('firstName'))}</span><input name="firstName" required autocomplete="given-name"></label>
              <label class="field"><span class="field-label">${esc(t('lastName'))}</span><input name="lastName" required autocomplete="family-name"></label>
            </div>
            <div class="field-row">
              <label class="field"><span class="field-label">${esc(t('phone'))}</span><input name="phone" type="tel" required autocomplete="tel" inputmode="tel"></label>
              <label class="field"><span class="field-label">${esc(t('email'))}</span><input name="email" type="email" required autocomplete="email"></label>
            </div>
            <label class="field field--short"><span class="field-label">${esc(t('zip'))}</span><input name="zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="postal-code"></label>
          </fieldset>
          <fieldset class="step-panel" data-step="2" hidden>
            <legend class="step-legend">${esc(t('legendBudget'))}</legend>
            <div class="field-row">
              <label class="field"><span class="field-label">${esc(t('employment'))}</span>
                <select name="employment" required><option value="">${esc(t('chooseOne'))}</option>${options(['Employed full-time', 'Employed part-time', 'Self-employed', 'Retired', 'Other'], '', I.opt)}</select></label>
              <label class="field"><span class="field-label">${esc(t('income'))}</span>
                <select name="income" required><option value="">${esc(t('chooseRange'))}</option>${options(['Under $2,000', '$2,000 to $3,000', '$3,000 to $4,500', '$4,500 to $6,000', 'Over $6,000'], '', I.opt)}</select></label>
            </div>
            <fieldset class="field"><legend class="field-label">${esc(t('creditQ'))}</legend>
              <div class="choice-grid">${choiceCards('credit', CREDIT)}</div></fieldset>
            <label class="field field--short"><span class="field-label">${esc(t('downPayment'))}</span>
              <select name="down"><option value="">${esc(t('notSure'))}</option>${options(['Under $500', '$500 to $1,500', '$1,500 to $3,000', 'Over $3,000'], '', I.opt)}</select></label>
          </fieldset>
          <fieldset class="step-panel" data-step="3" hidden>
            <legend class="step-legend">${esc(t('legendVehicle'))}</legend>
            <label class="field"><span class="field-label">${esc(t('vehicleInterest'))}</span>
              <select name="vehicle"><option value="">${esc(t('notSure'))}</option>${vehicles.map((v) => `<option value="${esc(v.stockNumber)}">${esc(`${v.title} ${v.trim}, ${money(v.price)}`)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">${esc(t('anythingElse'))} <span class="optional">${esc(opt)}</span></span><textarea name="notes" rows="3"></textarea></label>
            <label class="check"><input type="checkbox" name="consent" required><span>${esc(t('consentFin', { name: C.name }))}</span></label>
          </fieldset>
          ${honeypot()}
          <p class="form-error" data-form-error hidden></p>
          <div class="step-nav">
            <button class="btn btn--outline" type="button" data-step-back hidden>${esc(t('stepBack'))}</button>
            <button class="btn btn--primary" type="button" data-step-next>${esc(t('continue'))}</button>
            <button class="btn btn--primary" type="submit" data-step-submit hidden>${esc(t('sendInfo'))}</button>
          </div>
        </form>
      </div>
      <aside class="fin-aside">
        <h2 class="aside-h">${esc(t('bring'))}</h2>
        ${bringList()}
        <h2 class="aside-h">${esc(t('questions'))}</h2>
        <div class="faq">
          ${[1, 2, 3].map((i) => `<details><summary>${esc(t(`faq${i}q`))}</summary><p>${esc(t(`faq${i}a`))}</p></details>`).join('')}
        </div>
      </aside>
    </div>
    <section class="section section--alt" aria-labelledby="fin-calc-title">
      <div class="wrap">
        <h2 class="section-title" id="fin-calc-title">${esc(t('estimate'))}</h2>
        <p class="lede">${esc(t('calcLede'))}</p>
        <div class="calc-wrap">${calculator(15000)}</div>
      </div>
    </section>`;
  }

  function afterFinancing() {
    const form = $('[data-stepper]');
    let step = 1;
    const panels = $$('[data-step]', form);
    const show = (n) => {
      step = n;
      panels.forEach((p) => { p.hidden = Number(p.dataset.step) !== n; });
      $$('[data-progress]', form).forEach((li) => {
        const k = Number(li.dataset.progress);
        li.classList.toggle('is-current', k === n);
        li.classList.toggle('is-done', k < n);
        if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      $('[data-step-back]', form).hidden = n === 1;
      $('[data-step-next]', form).hidden = n === panels.length;
      $('[data-step-submit]', form).hidden = n !== panels.length;
      const first = $(`[data-step="${n}"] input, [data-step="${n}"] select`, form);
      if (first) first.focus({ preventScroll: true });
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const valid = (n) => {
      const fields = $$(`[data-step="${n}"] input, [data-step="${n}"] select, [data-step="${n}"] textarea`, form);
      const bad = fields.find((f) => !f.checkValidity());
      if (bad) { bad.reportValidity(); return false; }
      return true;
    };
    $('[data-step-next]', form).addEventListener('click', () => { if (valid(step)) show(step + 1); });
    $('[data-step-back]', form).addEventListener('click', () => show(step - 1));
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < panels.length) {
        e.preventDefault();
        if (valid(step)) show(step + 1);
      }
    });
    wireCalcs();
  }

  /* ---------- About ---------- */
  function viewAbout() {
    return `
    ${pageTop(t('aboutTitle'))}
    <section class="section">
      <div class="wrap about-grid">
        <div class="about-text">
          <p class="about-lead">${esc(t('aboutLead', { name: C.name, street: addr.street, city: addr.city }))}</p>
          <p>${esc(t('aboutP2'))}</p>
          <p>${t('aboutP3', { days: esc(openDaysPhrase()), phone: `<a class="text-link" href="${telHref}">${esc(C.phoneDisplay)}</a>` })}</p>
        </div>
        <figure class="owner">
          ${Brand.photoPlaceholder({ label: esc(t('ownerPhoto')), size: 'portrait' })}
          <figcaption><strong class="owner-name">${esc(C.owner || t('ownerName'))}</strong><span class="owner-role">${esc(t('ownerRole'))}</span></figcaption>
        </figure>
      </div>
    </section>
    <section class="section section--alt">
      <div class="wrap">${visitBlock()}</div>
    </section>`;
  }

  /* ---------- Contact ---------- */
  function viewContact() {
    const today = chicagoNow().key;
    const opt = t('optional');
    return `
    ${pageTop(t('contactTitle'), t('contactSub', { hours: hoursSentence() }))}
    <section class="section">
      <div class="wrap contact-grid">
        <div class="contact-main">
          <dl class="contact-list">
            <div><dt>${esc(t('callOrText'))}</dt><dd><a href="${telHref}">${esc(C.phoneDisplay)}</a></dd></div>
            <div><dt>${esc(t('email'))}</dt><dd><a href="${mailHref(t('mailSubject', { name: C.name }))}">${esc(C.email)}</a></dd></div>
            <div><dt>${esc(t('address'))}</dt><dd><a href="${C.directionsUrl}" target="_blank" rel="noopener">${esc(addressLine)}</a></dd></div>
          </dl>
          <form class="panel form-stack" data-lead="contact">
            <h2 class="form-h">${esc(t('sendAMessage'))}</h2>
            <div class="field-row">
              <label class="field"><span class="field-label">${esc(t('firstName'))}</span><input name="firstName" required autocomplete="given-name"></label>
              <label class="field"><span class="field-label">${esc(t('lastName'))}</span><input name="lastName" autocomplete="family-name"></label>
            </div>
            <div class="field-row">
              <label class="field"><span class="field-label">${esc(t('phone'))}</span><input name="phone" type="tel" required autocomplete="tel" inputmode="tel"></label>
              <label class="field"><span class="field-label">${esc(t('email'))} <span class="optional">${esc(opt)}</span></span><input name="email" type="email" autocomplete="email"></label>
            </div>
            <fieldset class="field"><legend class="field-label">${esc(t('bestWay'))}</legend>
              <div class="seg" role="radiogroup">
                ${['Call', 'Text', 'Email'].map((m, i) => `<label class="seg-opt"><input type="radio" name="contactBy" value="${m}"${i === 0 ? ' checked' : ''}><span>${esc(I.opt(m))}</span></label>`).join('')}
              </div></fieldset>
            <label class="field"><span class="field-label">${esc(t('message'))}</span><textarea name="message" rows="4" required></textarea></label>
            ${honeypot()}
            <p class="form-error" data-form-error hidden></p>
            <button class="btn btn--primary btn--lg" type="submit">${esc(t('sendMessage'))}</button>
            <p class="fine">${esc(t('consentContact', { name: C.name }))}</p>
          </form>
        </div>
        <div class="contact-side">
          <h2 class="form-h">${esc(t('hours'))}</h2>
          <p class="visit-status">${statusMarkup()}</p>
          <table class="hours-table">
            <caption class="sr-only">${esc(t('hoursCaption'))}</caption>
            <tbody>${WEEK.map((d) => {
              const h = C.hours[d];
              const isToday = d === today;
              return `<tr${isToday ? ' class="is-today"' : ''}><th scope="row">${esc(I.pack.dayLabel(dayName(d)))}${isToday ? ` <span class="today-tag">${esc(t('today'))}</span>` : ''}</th><td>${h ? `${fmtTime(h[0])} – ${fmtTime(h[1])}` : esc(t('closed'))}</td></tr>`;
            }).join('')}</tbody>
          </table>
          ${mapBox()}
        </div>
      </div>
    </section>`;
  }

  /* ---------- Saved ---------- */
  function viewSaved() {
    const list = state.inventory.filter((v) => state.saved.has(v.id));
    return `
    ${pageTop(t('savedTitle'), t('savedSub'))}
    <section class="section">
      <div class="wrap">
        ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `
        <div class="empty">
          <h2 class="empty-title">${esc(t('savedEmptyTitle'))}</h2>
          <p>${esc(t('savedEmptyText'))}</p>
          <a class="btn btn--primary" href="#inventory">${esc(t('browse'))}</a>
        </div>`}
      </div>
    </section>`;
  }

  /* ---------- Fallback views ---------- */
  function viewMissing() {
    return `${pageTop(t('missingTitle'), t('missingText'))}
    <section class="section"><div class="wrap"><a class="btn btn--primary" href="#inventory">${esc(t('browse'))}</a></div></section>`;
  }

  function viewLoadError() {
    const local = location.protocol === 'file:';
    return `${pageTop(t('errorTitle'), t('errorText', { phone: C.phoneDisplay }))}
    <section class="section"><div class="wrap">
      ${local ? '<p class="dev-note" lang="en">Opened from a file? Browsers block loading data/inventory.json that way. Run <code>python3 -m http.server</code> in the project folder and open http://localhost:8000, or use the single-file build in dist/.</p>' : ''}
      <a class="btn btn--primary" href="${telHref}">${esc(t('callN', { phone: C.phoneDisplay }))}</a>
    </div></section>`;
  }

  /* ---------- Forms (leads) ---------- */
  // Every form is emailed to the dealership through FormSubmit (config.js
  // leadEndpoint; README, "Form emails"). The email is a table of labeled rows
  // in English, whichever language the visitor used.

  // Nothing is sent from the chat preview build, from a page opened as a file,
  // or from a local test server, so testing never emails the dealership by
  // accident. Add ?send=1 to a local address to send for real.
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const forceSend = /[?&]send=1(&|$)/.test(location.search);
  const previewMode = () => !C.leadEndpoint || !!window.ELEVATE_PREVIEW || (isLocal && !forceSend);

  // Hidden from people and screen readers. Bots that fill in every field fill
  // this too, and those submissions are dropped without sending.
  const honeypot = () => '<input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true">';

  const FORM_NAMES = {
    prequal: 'Financing application',
    availability: 'Vehicle question',
    'test-drive': 'Test drive request',
    financing: 'Financing question',
    contact: 'Contact message',
  };
  const sentAt = () => `${new Intl.DateTimeFormat('en-US', { timeZone: C.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date())} (Chicago time)`;

  function leadVehicle(kind, data, form) {
    if (form.dataset.vehicle) return byId(form.dataset.vehicle) || null;
    if (kind === 'prequal' && data.vehicle) return state.inventory.find((v) => v.stockNumber === data.vehicle) || null;
    return null;
  }

  // The email: FormSubmit settings (underscored) first, then one row per answer.
  function leadEmail(kind, data, form) {
    const name = [data.firstName, data.lastName].map((x) => (x || '').trim()).filter(Boolean).join(' ');
    const v = leadVehicle(kind, data, form);
    const car = v ? `${v.year} ${v.make} ${v.model}` : '';
    const subject = {
      prequal: `Financing application from ${name}${car ? ` (${car})` : ''}`,
      availability: `${name} asked about the ${car}`,
      'test-drive': `Test drive request: ${car}, ${data.day} at ${data.time}`,
      financing: `${name} asked about financing the ${car}`,
      contact: `Website message from ${name}`,
    }[kind] || `Website form from ${name}`;

    const mail = {
      _subject: `${subject}${I.lang === 'es' ? ' (en español)' : ''}`,
      _template: 'table',
      _captcha: 'false',
      _url: location.href,
    };
    const row = (label, value) => { if (value !== undefined && value !== null && String(value).trim() !== '') mail[label] = String(value).trim(); };
    const vehicleLine = v ? `${vehicleRefEn(v)}, ${money(v.price)}` : '';

    row('Form', FORM_NAMES[kind] || kind);
    row('Name', name);
    row('Phone', data.phone);
    // FormSubmit sets Reply-To from a field named "email", so Reply answers the customer.
    if (data.email) { mail._replyto = data.email.trim(); row('email', data.email); }

    if (kind === 'prequal') {
      const credit = CREDIT.find(([value]) => value === data.credit);
      row('ZIP code', data.zip);
      row('Employment', data.employment);
      row('Monthly income', data.income);
      row('Credit', credit && credit[0] !== 'Not sure' ? `${credit[0]} (${credit[1]})` : data.credit);
      row('Down payment', data.down || 'Not sure yet');
      row('Vehicle', vehicleLine || 'Not sure yet');
      if (v) row('VIN', v.vin);
      row('Notes', data.notes);
      row('Agreed to be contacted', data.consent ? 'Yes' : '');
    } else if (kind === 'contact') {
      row('Best way to reach', data.contactBy);
      row('Message', data.message);
    } else {
      row('Vehicle', vehicleLine);
      if (v) row('VIN', v.vin);
      if (kind === 'test-drive') { row('Preferred day', data.day); row('Preferred time', data.time); }
      row('Message', data.message);
    }
    row('Language', I.lang === 'es' ? 'Spanish' : 'English');
    row('Page', location.href);
    row('Sent', sentAt());
    return mail;
  }

  async function sendLead(kind, data, form) {
    const mail = leadEmail(kind, data, form);
    if (previewMode()) {
      console.info('[Preview] Nothing was sent. On the live site, this email goes to the dealership:', mail);
      await wait(450);
      return { preview: true };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(C.leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(mail),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const reply = await res.json().catch(() => ({}));
    // Until the inbox owner clicks "Activate Form" in FormSubmit's first email,
    // it answers success "false" but keeps the submission and sends it after
    // activation, so the visitor still sees that it went through.
    const awaitingActivation = /activat/i.test(String(reply.message || ''));
    if (!res.ok || (String(reply.success) === 'false' && !awaitingActivation)) {
      throw new Error(`Form service didn't accept the lead (${res.status}): ${reply.message || 'no message'}`);
    }
    if (awaitingActivation) console.warn('[Leads] FormSubmit:', reply.message);
    return { preview: false };
  }

  const METHOD_KEY = { Call: 'methodPhone', Text: 'methodText', Email: 'methodEmail' };
  function doneMessage(kind, data, form) {
    const name = data.firstName || '';
    const v = form.dataset.vehicle ? byId(form.dataset.vehicle) : null;
    const vehicle = v ? v.title : t('theVehicle');
    const timeLabel = data.time ? (timeSlots().find((s) => s.value === data.time) || { label: data.time }).label : t('yourTime');
    const dayLabel = data.day ? ((upcomingOpenDays().find((d) => d.value === data.day) || { date: data.day }).date) : t('yourDay');
    const map = {
      availability: ['sentAvailT', 'sentAvailB', { name, vehicle }],
      'test-drive': ['sentTestT', 'sentTestB', { name, day: dayLabel, time: timeLabel }],
      financing: ['sentFinT', 'sentFinB', { name, vehicle }],
      contact: ['sentContactT', 'sentContactB', { name, method: t(METHOD_KEY[data.contactBy] || 'methodPhone') }],
      prequal: ['sentPrequalT', 'sentPrequalB', { name, phone: data.phone || '' }],
    }[kind] || ['sentDefaultT', 'sentDefaultB', {}];
    return [t(map[0]), t(map[1], map[2])];
  }

  async function handleLeadSubmit(e) {
    const form = e.target.closest('form[data-lead]');
    if (!form) return;
    e.preventDefault();
    if (!form.checkValidity()) {
      const bad = $$('input, select, textarea', form).find((f) => !f.checkValidity());
      if (bad) bad.reportValidity();
      return;
    }
    const kind = form.dataset.lead;
    const data = Object.fromEntries(new FormData(form).entries());
    const trapped = !!data._honey;
    delete data._honey;
    const submit = $('[type="submit"]:not([hidden])', form);
    const err = $('[data-form-error]', form);
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = t('sending');
    if (err) err.hidden = true;
    try {
      const result = trapped ? { preview: false } : await sendLead(kind, data, form);
      const [title, body] = doneMessage(kind, data, form);
      form.innerHTML = `<div class="form-done" role="status" tabindex="-1">
        <span class="done-icon">${icon('check')}</span>
        <h2 class="form-h">${esc(title)}</h2>
        <p>${esc(body)}</p>
        ${result.preview ? `<p class="preview-note">${esc(t('previewNote', { email: C.email }))}</p>` : ''}
        <a class="btn btn--outline" href="#inventory">${esc(t('browse'))}</a>
      </div>`;
      form.classList.add('is-done');
      $('.form-done', form).focus();
    } catch (ex) {
      submit.disabled = false;
      submit.textContent = label;
      if (err) { err.textContent = t('sendError', { phone: C.phoneDisplay }); err.hidden = false; }
      console.error(ex);
    }
  }

  /* ---------- Router ---------- */
  const ROUTES = {
    home: { title: () => '', render: viewHome, after: afterHome },
    inventory: { title: () => t('invTitle'), render: viewInventory, after: afterInventory },
    financing: { title: () => t('finTitle'), render: viewFinancing, after: afterFinancing },
    about: { title: () => t('aboutTitle'), render: viewAbout },
    contact: { title: () => t('contactTitle'), render: viewContact },
    saved: { title: () => t('savedTitle'), render: viewSaved },
  };

  function go(name) {
    if (location.hash === `#${name}`) route(); else location.hash = name;
  }

  function setNav(key) {
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function closeMenu() {
    document.body.classList.remove('menu-open');
    const m = $('.menu-toggle');
    if (m) { m.setAttribute('aria-expanded', 'false'); m.setAttribute('aria-label', t('openMenu')); m.innerHTML = icon('menu'); }
  }

  function route({ initial = false, keepScroll = false, quiet = false } = {}) {
    const name = decodeURIComponent(location.hash.replace(/^#/, '')) || 'home';
    teardownHero();
    closeMenu();
    closeSearch(false);
    openFilters(false);
    let key = name;
    let title = '';
    if (state.loadError) {
      view.innerHTML = viewLoadError();
      key = 'error';
    } else if (name.startsWith('v-')) {
      const v = byId(name.slice(2));
      if (v) {
        view.innerHTML = viewVehicle(v);
        afterVehicle(v);
        title = `${v.title} ${v.trim}`;
        key = 'inventory';
      } else {
        view.innerHTML = viewMissing();
        title = t('missingTitle');
      }
    } else {
      const r = ROUTES[name] || ROUTES.home;
      key = ROUTES[name] ? name : 'home';
      view.innerHTML = r.render();
      if (r.after) r.after();
      title = r.title();
    }
    state.routeKey = key;
    setNav(key);
    document.title = title ? `${title} | ${C.name}` : t('titleHome', { name: C.name });
    if (!keepScroll) window.scrollTo(0, 0);
    if (!initial && !quiet) {
      const h1 = $('h1', view);
      if (h1) { if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }

  /* ---------- Global events ---------- */
  document.addEventListener('click', (e) => {
    const target = e.target;

    const langBtn = target.closest('[data-lang]');
    if (langBtn) {
      const code = langBtn.dataset.lang;
      const inHeader = !!langBtn.closest('.lang-switch--header');
      if (I.setLang(code)) applyLanguage(code, inHeader);
      return;
    }

    if (target.closest('.search-toggle')) {
      if (searchIsOpen()) closeSearch(); else openSearch();
      return;
    }
    if (target.closest('[data-search-close]')) { closeSearch(); return; }
    if (target.closest('[data-search-all]')) {
      e.preventDefault();
      searchAll($('#site-search-input').value.trim());
      return;
    }
    if (target.closest('.sr-item')) closeSearch(false);

    const saveBtn = target.closest('[data-save]');
    if (saveBtn) {
      e.preventDefault();
      const id = saveBtn.dataset.save;
      if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
      writeSaved();
      updateSavedCount();
      const v = byId(id);
      $$(`[data-save="${CSS.escape(id)}"]`).forEach((b) => {
        const on = state.saved.has(id);
        b.setAttribute('aria-pressed', String(on));
        if (v) b.setAttribute('aria-label', saveLabel(v, on));
      });
      if (state.routeKey === 'saved') route({ keepScroll: true });
      return;
    }

    const body = target.closest('[data-body]');
    if (body) {
      e.preventDefault();
      state.filters = { ...blankFilters(), body: body.dataset.body };
      go('inventory');
      return;
    }

    const remove = target.closest('[data-remove]');
    if (remove) {
      const k = remove.dataset.remove;
      state.filters[k] = '';
      if (k === 'make') state.filters.model = '';
      const keep = window.scrollY;
      route({ keepScroll: true });
      window.scrollTo(0, keep);
      return;
    }

    const action = target.closest('[data-action]');
    if (action) {
      const a = action.dataset.action;
      if (a === 'clear-filters') {
        state.filters = blankFilters();
        const keep = window.scrollY;
        route({ keepScroll: true });
        window.scrollTo(0, keep);
      }
      if (a === 'open-filters') openFilters(true);
      if (a === 'close-filters') openFilters(false);
      return;
    }

    const menu = target.closest('.menu-toggle');
    if (menu) {
      const open = !document.body.classList.contains('menu-open');
      if (open) closeSearch(false);
      document.body.classList.toggle('menu-open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', t(open ? 'closeMenu' : 'openMenu'));
      menu.innerHTML = icon(open ? 'close' : 'menu');
      return;
    }

    if (target.closest('.skip-link')) {
      e.preventDefault();
      const main = $('#main');
      main.focus();
      main.scrollIntoView();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.matches('form[data-lead]')) handleLeadSubmit(e);
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (e.key === 'Escape') {
      if (searchIsOpen()) { closeSearch(); return; }
      if (document.body.classList.contains('filters-open')) openFilters(false);
      if (document.body.classList.contains('menu-open')) closeMenu();
      return;
    }
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (searchIsOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = $$('#search-results .sr-item');
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') (items[i + 1] || items[0]).focus();
      else if (i <= 0) $('#site-search-input').focus();
      else items[i - 1].focus();
    }
  });

  /* ---------- Start ---------- */
  async function init() {
    document.documentElement.lang = I.lang;
    const skip = $('.skip-link');
    if (skip) skip.textContent = t('skip');
    renderShell();
    try {
      state.inventory = await window.InventorySource.load();
      state.inventory.forEach((v) => { v.searchIndex = buildIndex(v); });
      const ids = new Set(state.inventory.map((v) => v.id));
      Array.from(state.saved).forEach((id) => { if (!ids.has(id)) state.saved.delete(id); });
      updateSavedCount();
    } catch (err) {
      state.loadError = err;
      console.error(err);
    }
    route({ initial: true });
    window.addEventListener('hashchange', () => route());
    setInterval(refreshStatus, 60000);
  }

  init();
})();
