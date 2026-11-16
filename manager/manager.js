/* ==========================================================================
   Elevate Auto Sales: manager page (/manager/)

   The dealership's admin signs in here to add, edit, sell, and delete cars.
   Cars and photos live in Supabase (see supabase/setup.sql and the README,
   "Manager page"); the public site reads them through js/inventory-source.js.
   Database rules, not this page, decide who may change anything: only logins
   listed in the admins table can write.
   ========================================================================== */

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.1/+esm';
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/';
const BUCKET = 'vehicle-photos';
const MAX_PHOTOS = 30;
const FULL_PX = 1600; // longest side of the photo shoppers see
const THUMB_PX = 640; // longest side of the small copy used in lists

const BODY_TYPES = ['Sedan', 'SUV', 'Truck', 'Minivan', 'Coupe'];
const DRIVETRAINS = [['FWD', 'Front-wheel drive (FWD)'], ['AWD', 'All-wheel drive (AWD)'], ['4WD', 'Four-wheel drive (4WD)'], ['RWD', 'Rear-wheel drive (RWD)']];
const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT'];
const FUELS = ['Gasoline', 'Hybrid', 'Electric', 'Diesel'];
const STATUSES = [['available', 'For sale'], ['pending', 'Sale pending'], ['sold', 'Sold (hidden from the website)']];
const BADGES = [['', 'None'], ['Just arrived', 'Just arrived'], ['Low miles', 'Low miles'], ['Price drop', 'Price drop']];

const C = window.ELEVATE_CONFIG || {};
const Brand = window.ElevateBrand;
const app = document.getElementById('app');
const DB_URL = String(C.supabaseUrl || '').trim().replace(/\/+$/, '');
const DB_KEY = String(C.supabaseKey || '').trim();

let sb = null;
const state = {
  screen: 'loading', // setup | error | login | forgot | new-password | not-admin | list | edit
  session: null,
  cars: [],
  tab: 'sale',
  flash: '',
  editing: null, // the car row being edited, or null when adding
  photos: [], // { url, thumb, path, thumbPath } for saved photos, { full, thumb, preview } for new ones
  removed: [], // storage paths to delete once the car is saved
  stockTouched: false,
  lastLookup: '',
  dirty: false,
  busy: false,
};

/* ---------- Helpers ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const miles = (n) => `${new Intl.NumberFormat('en-US').format(n || 0)} miles`;
const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
const $ = (sel, root = app) => root.querySelector(sel);
const logo = () => `<a class="mgr-logo" href="../" aria-label="${esc(C.name || 'Elevate Auto Sales')} website">${Brand ? Brand.logo() : esc(C.name || 'Elevate Auto Sales')}</a>`;
const options = (items, selected) => items.map((item) => {
  const [value, label] = Array.isArray(item) ? item : [item, item];
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');
const title = (car) => [car.year, car.make, car.model, car.trim].filter(Boolean).join(' ');

function friendlyError(error) {
  const msg = String((error && (error.message || error.error_description)) || error || '');
  const code = error && (error.code || error.statusCode);
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them and try again.';
  if (/email not confirmed/i.test(msg)) return 'This login hasn’t been confirmed yet. Ask Cesar to confirm it in Supabase.';
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Another car already uses that stock number. Change the stock number and save again.';
  if (code === '42501' || /row-level security|permission denied|not authorized|unauthorized/i.test(msg)) return 'This login isn’t allowed to make changes. Ask Cesar to add it as a manager.';
  if (/failed to fetch|network|load failed|timeout|aborted/i.test(msg)) return 'Couldn’t reach the database. Check your internet connection and try again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many tries in a short time. Wait a few minutes and try again.';
  return msg || 'Something went wrong. Try again.';
}

function setFlash(text) { state.flash = text; }

/* ---------- Screens ---------- */
function render() {
  const screens = {
    setup: viewSetup, error: viewError, login: viewLogin, forgot: viewForgot,
    'new-password': viewNewPassword, 'not-admin': viewNotAdmin, list: viewList, edit: viewEdit,
  };
  app.innerHTML = (screens[state.screen] || (() => '<p class="mgr-loading">Loading…</p>'))();
  if (state.screen === 'edit') afterEdit();
  const focusTarget = $('[data-autofocus]') || $('h1');
  if (focusTarget) {
    if (focusTarget.tagName === 'H1') focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: state.screen !== 'edit' });
  }
}

function card(inner) {
  return `<main class="mgr-auth"><div class="mgr-card">${logo()}${inner}</div></main>`;
}

function viewSetup() {
  return card(`<h1 class="mgr-h1">Manager page</h1>
    <p>This page isn’t connected to the inventory database yet. Add <code>supabaseUrl</code> and <code>supabaseKey</code> in <code>js/config.js</code>, then reload. The README’s “Manager page” section walks through it.</p>`);
}

function viewError() {
  return card(`<h1 class="mgr-h1">Manager page</h1>
    <p class="form-error">${esc(state.flash)}</p>
    <button class="btn btn--primary btn--block" type="button" data-action="reload">Try again</button>`);
}

function viewLogin() {
  return `<main class="mgr-auth"><form class="mgr-card" data-form="login" novalidate>
    ${logo()}
    <h1 class="mgr-h1">Manager sign in</h1>
    ${state.flash ? `<p class="mgr-ok" role="status">${esc(state.flash)}</p>` : ''}
    <label class="field"><span class="field-label">Email</span>
      <input name="email" type="email" autocomplete="username" inputmode="email" required data-autofocus></label>
    <label class="field"><span class="field-label">Password</span>
      <input name="password" type="password" autocomplete="current-password" required></label>
    <p class="form-error" data-error hidden></p>
    <button class="btn btn--primary btn--lg btn--block" type="submit">Sign in</button>
    <button class="link-btn" type="button" data-action="forgot">Forgot your password?</button>
  </form></main>`;
}

function viewForgot() {
  return `<main class="mgr-auth"><form class="mgr-card" data-form="forgot" novalidate>
    ${logo()}
    <h1 class="mgr-h1">Reset your password</h1>
    <p class="mgr-help">Enter the email you sign in with. We’ll send a link to choose a new password.</p>
    <label class="field"><span class="field-label">Email</span>
      <input name="email" type="email" autocomplete="username" inputmode="email" required data-autofocus></label>
    <p class="form-error" data-error hidden></p>
    <button class="btn btn--primary btn--lg btn--block" type="submit">Email me a link</button>
    <button class="link-btn" type="button" data-action="to-login">Back to sign in</button>
  </form></main>`;
}

function viewNewPassword() {
  return `<main class="mgr-auth"><form class="mgr-card" data-form="new-password" novalidate>
    ${logo()}
    <h1 class="mgr-h1">Choose a new password</h1>
    <p class="mgr-help">Use at least 8 characters.</p>
    <label class="field"><span class="field-label">New password</span>
      <input name="password" type="password" autocomplete="new-password" minlength="8" required data-autofocus></label>
    <label class="field"><span class="field-label">Type it again</span>
      <input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="form-error" data-error hidden></p>
    <button class="btn btn--primary btn--lg btn--block" type="submit">Save password</button>
  </form></main>`;
}

function viewNotAdmin() {
  const email = (state.session && state.session.user && state.session.user.email) || 'This login';
  return card(`<h1 class="mgr-h1">Not set up as a manager</h1>
    <p>${esc(email)} can sign in, but it isn’t on the list of managers yet, so it can’t change the inventory. Ask Cesar to add it (README, “Manager page”, step 4).</p>
    <button class="btn btn--outline btn--block" type="button" data-action="sign-out">Sign out</button>`);
}

function topBar() {
  return `<header class="mgr-top"><div class="wrap mgr-top-in">
    ${logo()}<span class="mgr-top-title">Manager</span>
    <button class="btn btn--outline btn--sm" type="button" data-action="sign-out">Sign out</button>
  </div></header>`;
}

function viewList() {
  const onSite = state.cars.filter((c) => c.status !== 'sold');
  const sold = state.cars.filter((c) => c.status === 'sold');
  const list = state.tab === 'sold' ? sold : onSite;
  const rows = list.map((car) => {
    const shot = Array.isArray(car.photos) && car.photos[0];
    const img = shot ? `<img class="mgr-car-img" src="${esc(shot.thumb || shot.url)}" alt="" loading="lazy">` : '<span class="mgr-car-noimg">No photos yet</span>';
    const flip = car.status === 'sold'
      ? `<button class="btn btn--outline btn--sm" type="button" data-action="status" data-status="available" data-id="${esc(car.id)}">Put back on sale</button>`
      : `<button class="btn btn--outline btn--sm" type="button" data-action="status" data-status="sold" data-id="${esc(car.id)}">Mark sold</button>`;
    return `<li class="mgr-car">
      ${img}
      <div class="mgr-car-body">
        <p class="mgr-car-title">${esc(title(car))}</p>
        <p class="mgr-car-meta"><span>${esc(money(car.price))}</span><span>${esc(miles(car.mileage))}</span><span>Stock ${esc(car.stock_number)}</span></p>
        ${car.status === 'pending' ? '<span class="badge badge--pending">Sale pending</span>' : ''}
      </div>
      <div class="mgr-car-actions">
        <button class="btn btn--primary btn--sm" type="button" data-action="edit" data-id="${esc(car.id)}">Edit</button>
        ${flip}
      </div>
    </li>`;
  }).join('');
  const empty = state.tab === 'sold'
    ? '<div class="mgr-empty">No sold cars yet. When you mark a car sold, it leaves the website and shows up here.</div>'
    : '<div class="mgr-empty">No cars on the website yet. Tap “Add a car” to list your first one.</div>';
  return `${topBar()}
  <main class="wrap mgr-main">
    <div class="mgr-flash" role="status" aria-live="polite">${esc(state.flash)}</div>
    <div class="mgr-head">
      <h1 class="mgr-h1">Your cars</h1>
      <button class="btn btn--primary btn--lg" type="button" data-action="add">Add a car</button>
    </div>
    <div class="mgr-tabs" role="tablist" aria-label="Which cars to show">
      <button class="mgr-tab" type="button" role="tab" data-tab="sale" aria-selected="${state.tab !== 'sold'}">On the website (${onSite.length})</button>
      <button class="mgr-tab" type="button" role="tab" data-tab="sold" aria-selected="${state.tab === 'sold'}">Sold (${sold.length})</button>
    </div>
    ${list.length ? `<ul class="mgr-list">${rows}</ul>` : empty}
    <p class="mgr-foot"><a class="text-link" href="../" target="_blank" rel="noopener">Open the website</a> to see what shoppers see.</p>
  </main>`;
}

function field(label, control, { wide = false, optional = false } = {}) {
  return `<label class="field${wide ? ' field--wide' : ''}"><span class="field-label">${esc(label)}${optional ? ' <span class="mgr-opt">(optional)</span>' : ''}</span>${control}</label>`;
}

function viewEdit() {
  const car = state.editing || {};
  const val = (k) => esc(car[k] ?? '');
  const isNew = !state.editing;
  return `${topBar()}
  <main class="wrap mgr-main">
    <button class="link-btn mgr-back" type="button" data-action="back">← Back to your cars</button>
    <h1 class="mgr-h1">${isNew ? 'Add a car' : `Edit ${esc(title(car))}`}</h1>
    <form class="mgr-form" data-form="car" novalidate>
      <section class="mgr-sec" aria-labelledby="sec-vin">
        <h2 class="mgr-h2" id="sec-vin">VIN</h2>
        <p class="mgr-help">Type or paste the 17-character VIN. The year, make, model, and more fill in by themselves.</p>
        <div class="mgr-vin">
          ${field('VIN', `<input name="vin" value="${val('vin')}" maxlength="17" autocomplete="off" autocapitalize="characters" spellcheck="false" required${isNew ? ' data-autofocus' : ''}>`)}
          <button class="btn btn--outline" type="button" data-action="lookup">Look up</button>
        </div>
        <p class="mgr-note" data-vin-note role="status" aria-live="polite"></p>
      </section>

      <section class="mgr-sec" aria-labelledby="sec-basics">
        <h2 class="mgr-h2" id="sec-basics">The basics</h2>
        <div class="mgr-grid">
          ${field('Year', `<input name="year" value="${val('year')}" inputmode="numeric" maxlength="4" autocomplete="off" required>`)}
          ${field('Make', `<input name="make" value="${val('make')}" autocomplete="off" required>`)}
          ${field('Model', `<input name="model" value="${val('model')}" autocomplete="off" required>`)}
          ${field('Trim', `<input name="trim" value="${val('trim')}" autocomplete="off">`, { optional: true })}
          ${field('Price', `<span class="input-affix"><span aria-hidden="true">$</span><input name="price" value="${car.price ? esc(new Intl.NumberFormat('en-US').format(car.price)) : ''}" inputmode="numeric" autocomplete="off" required aria-label="Price in dollars"></span>`)}
          ${field('Mileage', `<input name="mileage" value="${car.mileage != null ? esc(new Intl.NumberFormat('en-US').format(car.mileage)) : ''}" inputmode="numeric" autocomplete="off" required>`)}
        </div>
      </section>

      <section class="mgr-sec" aria-labelledby="sec-photos">
        <h2 class="mgr-h2" id="sec-photos">Photos</h2>
        <p class="mgr-help">Shoppers see the main photo first. Add up to ${MAX_PHOTOS}; they’re shrunk before uploading so the site stays fast.</p>
        <div class="mgr-photos" data-photos></div>
        <label class="btn btn--outline mgr-add-photo">Add photos<input type="file" accept="image/*" multiple data-photo-input aria-label="Add photos"></label>
        <p class="mgr-note" data-photo-note role="status" aria-live="polite"></p>
      </section>

      <section class="mgr-sec" aria-labelledby="sec-details">
        <h2 class="mgr-h2" id="sec-details">Details</h2>
        <div class="mgr-grid">
          ${field('Exterior color', `<input name="exterior_color" value="${val('exterior_color')}" autocomplete="off" placeholder="White">`)}
          ${field('Interior color', `<input name="interior_color" value="${val('interior_color')}" autocomplete="off" placeholder="Black cloth">`, { optional: true })}
          ${field('Body style', `<select name="body_type"><option value="">Choose…</option>${options(BODY_TYPES, car.body_type || '')}</select>`)}
          ${field('Drivetrain', `<select name="drivetrain"><option value="">Choose…</option>${options(DRIVETRAINS, car.drivetrain || '')}</select>`)}
          ${field('Transmission', `<select name="transmission"><option value="">Choose…</option>${options(TRANSMISSIONS, car.transmission || '')}</select>`)}
          ${field('Fuel', `<select name="fuel_type"><option value="">Choose…</option>${options(FUELS, car.fuel_type || '')}</select>`)}
          ${field('Engine', `<input name="engine" value="${val('engine')}" autocomplete="off" placeholder="2.5L I4">`, { wide: true, optional: true })}
          ${field('City MPG', `<input name="mpg_city" value="${val('mpg_city')}" inputmode="numeric" maxlength="3" autocomplete="off">`, { optional: true })}
          ${field('Highway MPG', `<input name="mpg_highway" value="${val('mpg_highway')}" inputmode="numeric" maxlength="3" autocomplete="off">`, { optional: true })}
          ${field('Features (one per line)', `<textarea name="features" rows="5" placeholder="Backup camera&#10;Bluetooth&#10;Heated seats">${esc((car.features || []).join('\n'))}</textarea>`, { wide: true, optional: true })}
          ${field('Description', `<textarea name="description" rows="5" maxlength="4000" placeholder="Anything a shopper should know: condition, recent work, why it’s a good buy.">${val('description')}</textarea>`, { wide: true, optional: true })}
        </div>
      </section>

      <section class="mgr-sec" aria-labelledby="sec-listing">
        <h2 class="mgr-h2" id="sec-listing">Listing</h2>
        <div class="mgr-grid">
          ${field('Status', `<select name="status">${options(STATUSES, car.status || 'available')}</select>`)}
          ${field('Label on the photo', `<select name="badge">${options(BADGES, car.badge || '')}</select>`)}
          ${field('Stock number', `<input name="stock_number" value="${val('stock_number')}" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false">`, { wide: true })}
        </div>
        <p class="mgr-help">The stock number fills in from the last 6 characters of the VIN and becomes part of the car’s web address. You can change it.</p>
      </section>

      <div class="mgr-save">
        <p class="form-error" data-error hidden></p>
        <p class="mgr-progress" data-progress role="status" aria-live="polite"></p>
        <div class="mgr-save-row">
          <button class="btn btn--primary btn--lg" type="submit">${isNew ? 'Save and publish' : 'Save changes'}</button>
          <button class="btn btn--outline btn--lg" type="button" data-action="back">Cancel</button>
        </div>
      </div>
      ${isNew ? '' : `<div class="mgr-danger">
        <button class="btn btn--outline mgr-delete" type="button" data-action="delete">Delete this car</button>
        <p class="mgr-help">Deleting removes the car and its photos for good. To keep a record, mark it sold instead.</p>
      </div>`}
    </form>
  </main>`;
}

function afterEdit() {
  renderPhotos();
}

function renderPhotos() {
  const box = $('[data-photos]');
  if (!box) return;
  box.innerHTML = state.photos.map((p, i) => `<div class="mgr-photo">
      <img src="${esc(p.preview || p.thumb || p.url)}" alt="Photo ${i + 1}">
      ${i === 0 ? '<span class="mgr-photo-main">Main photo</span>' : ''}
      <div class="mgr-photo-actions">
        ${i > 0 ? `<button class="mgr-photo-btn" type="button" data-action="photo-main" data-i="${i}" aria-label="Make photo ${i + 1} the main photo">Make main</button>` : ''}
        <button class="mgr-photo-btn" type="button" data-action="photo-remove" data-i="${i}" aria-label="Remove photo ${i + 1}">Remove</button>
      </div>
    </div>`).join('');
}

/* ---------- Data ---------- */
async function loadCars() {
  const { data, error } = await sb.from('vehicles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  state.cars = data || [];
}

async function checkAdmin() {
  const { data, error } = await sb.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

async function enterApp() {
  try {
    if (!(await checkAdmin())) { state.screen = 'not-admin'; return render(); }
    await loadCars();
    state.screen = 'list';
  } catch (err) {
    console.error(err);
    state.flash = friendlyError(err);
    state.screen = 'error';
  }
  render();
}

/* ---------- VIN lookup (NHTSA's free decoder) ---------- */
const BRAND_CASE = { BMW: 'BMW', GMC: 'GMC', MINI: 'MINI', FIAT: 'FIAT', RAM: 'Ram', 'MERCEDES-BENZ': 'Mercedes-Benz', 'LAND ROVER': 'Land Rover', 'ALFA ROMEO': 'Alfa Romeo', 'ROLLS-ROYCE': 'Rolls-Royce' };
function brandCase(s) {
  const raw = String(s || '').trim();
  if (!raw) return '';
  return BRAND_CASE[raw.toUpperCase()] || raw.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, sep, ch) => sep + ch.toUpperCase());
}
function mapBody(s) {
  const v = String(s || '').toLowerCase();
  if (/pickup/.test(v)) return 'Truck';
  if (/sport utility|crossover|suv|mpv/.test(v)) return 'SUV';
  if (/minivan|\bvan\b/.test(v)) return 'Minivan';
  if (/coupe|convertible|cabriolet|roadster/.test(v)) return 'Coupe';
  if (/sedan|saloon|hatchback|wagon|liftback/.test(v)) return 'Sedan';
  return '';
}
function mapDrive(s) {
  const v = String(s || '').toLowerCase();
  if (/awd|all[- ]wheel/.test(v)) return 'AWD';
  if (/4wd|4x4|four[- ]wheel|4-wheel/.test(v)) return '4WD';
  if (/fwd|front[- ]wheel/.test(v)) return 'FWD';
  if (/rwd|rear[- ]wheel|4x2/.test(v)) return 'RWD';
  return '';
}
function mapTransmission(s) {
  const v = String(s || '').toLowerCase();
  if (/cvt|continuously/.test(v)) return 'CVT';
  if (/manual|standard/.test(v)) return 'Manual';
  if (/automatic|dual[- ]clutch|dct/.test(v)) return 'Automatic';
  return '';
}
function mapFuel(r) {
  const level = String(r.ElectrificationLevel || '');
  const fuel = String(r.FuelTypePrimary || '').toLowerCase();
  if (/\bbev\b|battery electric/i.test(level) || fuel === 'electric') return 'Electric';
  if (/hev|hybrid/i.test(level)) return 'Hybrid';
  if (/diesel/.test(fuel)) return 'Diesel';
  if (/gasoline|flexible|ethanol|e85/.test(fuel)) return 'Gasoline';
  return '';
}
function engineText(r) {
  const disp = parseFloat(r.DisplacementL);
  const cyl = parseInt(r.EngineCylinders, 10);
  const cfg = String(r.EngineConfiguration || '').toLowerCase();
  const letter = /v-shaped/.test(cfg) ? 'V' : /in-line|inline|straight/.test(cfg) ? 'I' : /horizontal|flat|boxer/.test(cfg) ? 'H' : /w-shaped/.test(cfg) ? 'W' : '';
  const parts = [];
  if (disp) parts.push(`${disp.toFixed(1)}L`);
  if (cyl) parts.push(letter ? `${letter}${cyl}` : `${cyl}-cylinder`);
  if (/yes/i.test(String(r.Turbo || ''))) parts.push('Turbo');
  if (!parts.length && /electric/i.test(String(r.FuelTypePrimary || ''))) return 'Electric motor';
  return parts.join(' ');
}

async function decodeVin(vin) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${VPIC}${encodeURIComponent(vin)}?format=json`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`VIN lookup responded with ${res.status}`);
    const r = ((await res.json()).Results || [])[0] || {};
    if (!r.Make || !r.ModelYear) return null;
    return {
      year: r.ModelYear,
      make: brandCase(r.Make),
      model: String(r.Model || '').trim(),
      trim: String(r.Trim || r.Series || '').trim(),
      body_type: mapBody(r.BodyClass),
      drivetrain: mapDrive(r.DriveType),
      transmission: mapTransmission(r.TransmissionStyle),
      fuel_type: mapFuel(r),
      engine: engineText(r),
      clean: String(r.ErrorCode || '0').split(',')[0].trim() === '0',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function lookup(form, { auto = false } = {}) {
  const note = $('[data-vin-note]');
  const vin = form.vin.value.trim().toUpperCase();
  if (vin.length !== 17) {
    if (!auto) { note.textContent = 'A VIN has 17 characters. Check it and try again.'; note.classList.add('is-warn'); }
    return;
  }
  state.lastLookup = vin;
  note.classList.remove('is-warn');
  note.textContent = 'Looking up this VIN…';
  try {
    const found = await decodeVin(vin);
    if (form.vin.value.trim().toUpperCase() !== vin) return; // VIN changed while looking up
    if (!found) {
      note.textContent = 'Couldn’t find this VIN. Check it for typos, or fill in the details yourself.';
      note.classList.add('is-warn');
      return;
    }
    ['year', 'make', 'model', 'trim', 'body_type', 'drivetrain', 'transmission', 'fuel_type', 'engine'].forEach((k) => {
      if (found[k] && form[k]) form[k].value = found[k];
    });
    state.dirty = true;
    note.textContent = found.clean
      ? `Found a ${[found.year, found.make, found.model].join(' ')}. Check the details below and add the rest.`
      : `Filled in what we found for a ${[found.year, found.make, found.model].join(' ')}. Double-check the details below.`;
  } catch (err) {
    console.warn(err);
    note.textContent = 'The VIN lookup isn’t responding right now. Fill in the details yourself, or tap Look up again in a minute.';
    note.classList.add('is-warn');
  }
}

/* ---------- Photos ---------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

function toJpeg(img, maxSide, quality) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode photo'))), 'image/jpeg', quality));
}

async function prepPhoto(file) {
  const { img, url } = await loadImage(file);
  try {
    const full = await toJpeg(img, FULL_PX, 0.82);
    const thumb = await toJpeg(img, THUMB_PX, 0.75);
    return { full, thumb, preview: URL.createObjectURL(thumb) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addPhotos(files) {
  const note = $('[data-photo-note]');
  const room = MAX_PHOTOS - state.photos.length;
  const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)).slice(0, Math.max(0, room));
  if (!list.length) {
    note.textContent = room <= 0 ? `That’s the limit of ${MAX_PHOTOS} photos. Remove one to add another.` : 'Those files aren’t photos.';
    return;
  }
  let failed = 0;
  for (let i = 0; i < list.length; i += 1) {
    note.textContent = `Getting photos ready… ${i + 1} of ${list.length}`;
    try {
      state.photos.push(await prepPhoto(list[i]));
      state.dirty = true;
      renderPhotos();
    } catch (err) {
      console.warn(err);
      failed += 1;
    }
  }
  note.textContent = failed
    ? `${failed} photo${failed > 1 ? 's' : ''} couldn’t be opened. Try taking ${failed > 1 ? 'them' : 'it'} again with the camera, or use a JPEG.`
    : '';
}

function releasePhoto(p) {
  if (p && p.preview) URL.revokeObjectURL(p.preview);
}

async function uploadBlob(path, blob) {
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(list);
  if (error) console.warn('Could not delete some photos:', error);
}

const photoPaths = (photos) => (photos || []).flatMap((p) => [p.path, p.thumbPath]).filter(Boolean);

/* ---------- Save, sell, delete ---------- */
function readForm(form) {
  const text = (name) => String(form[name].value || '').trim();
  const number = (name) => { const d = digits(form[name].value); return d ? Number(d) : null; };
  const features = Array.from(new Set(String(form.features.value || '').split(/\n|,/).map((s) => s.trim()).filter(Boolean)))
    .slice(0, 60).map((s) => s.slice(0, 80));
  return {
    vin: text('vin').toUpperCase(),
    year: number('year'),
    make: text('make'),
    model: text('model'),
    trim: text('trim'),
    price: number('price'),
    mileage: number('mileage'),
    exterior_color: text('exterior_color'),
    interior_color: text('interior_color'),
    body_type: text('body_type'),
    drivetrain: text('drivetrain'),
    transmission: text('transmission'),
    fuel_type: text('fuel_type'),
    engine: text('engine'),
    mpg_city: number('mpg_city'),
    mpg_highway: number('mpg_highway'),
    features,
    description: text('description').slice(0, 4000),
    status: text('status') || 'available',
    badge: text('badge'),
    stock_number: text('stock_number').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20),
  };
}

function validate(form, row) {
  const maxYear = new Date().getFullYear() + 2;
  const problems = [];
  const mark = (name, bad, label) => {
    form[name].setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad) problems.push({ name, label });
  };
  mark('vin', row.vin.length < 5, 'VIN');
  mark('year', !row.year || row.year < 1950 || row.year > maxYear, 'Year');
  mark('make', !row.make, 'Make');
  mark('model', !row.model, 'Model');
  mark('price', !row.price, 'Price');
  mark('mileage', row.mileage === null, 'Mileage');
  return problems;
}

function uniqueStock(wanted, vin) {
  const base = (wanted || vin.slice(-6) || 'CAR').toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'CAR';
  const taken = new Set(state.cars.filter((c) => !state.editing || c.id !== state.editing.id).map((c) => String(c.stock_number).toUpperCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

async function saveCar(form) {
  const errorBox = $('[data-error]');
  const progress = $('[data-progress]');
  errorBox.hidden = true;
  const row = readForm(form);
  const problems = validate(form, row);
  if (problems.length) {
    errorBox.textContent = `Please fill in: ${problems.map((p) => p.label).join(', ')}.`;
    errorBox.hidden = false;
    form[problems[0].name].focus();
    return;
  }
  if (!state.photos.length && row.status !== 'sold' && !window.confirm('This car has no photos yet. Save it anyway? It will show “Photo coming soon” on the website.')) return;
  row.stock_number = uniqueStock(row.stock_number, row.vin);

  state.busy = true;
  form.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = true; });
  const uploaded = [];
  try {
    const newOnes = state.photos.filter((p) => p.full);
    const stamp = Date.now();
    let done = 0;
    const photos = [];
    for (const p of state.photos) {
      if (!p.full) { photos.push({ url: p.url, thumb: p.thumb, path: p.path, thumbPath: p.thumbPath }); continue; }
      done += 1;
      progress.textContent = `Uploading photo ${done} of ${newOnes.length}…`;
      const id = `${stamp}-${done}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${row.stock_number}/${id}.jpg`;
      const thumbPath = `${row.stock_number}/${id}-small.jpg`;
      const url = await uploadBlob(path, p.full);
      uploaded.push(path);
      const thumb = await uploadBlob(thumbPath, p.thumb);
      uploaded.push(thumbPath);
      photos.push({ url, thumb, path, thumbPath });
    }
    row.photos = photos;
    progress.textContent = 'Saving…';
    const query = state.editing
      ? sb.from('vehicles').update(row).eq('id', state.editing.id).select().single()
      : sb.from('vehicles').insert(row).select().single();
    const { error } = await query;
    if (error) throw error;
    await removeFiles(state.removed);
    state.photos.forEach(releasePhoto);
    await loadCars();
    setFlash(row.status === 'sold'
      ? `Saved. The ${row.year} ${row.make} ${row.model} is marked sold, so it’s hidden from the website.`
      : `Saved. The ${row.year} ${row.make} ${row.model} is on the website now.`);
    state.tab = row.status === 'sold' ? 'sold' : 'sale';
    state.screen = 'list';
    state.dirty = false;
    state.busy = false;
    render();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    await removeFiles(uploaded);
    state.busy = false;
    form.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = false; });
    progress.textContent = '';
    errorBox.textContent = `${friendlyError(err)} Nothing was changed on the website.`;
    errorBox.hidden = false;
  }
}

async function setStatus(id, status) {
  const car = state.cars.find((c) => c.id === id);
  if (!car) return;
  const { error } = await sb.from('vehicles').update({ status }).eq('id', id);
  if (error) {
    setFlash(friendlyError(error));
  } else {
    await loadCars();
    setFlash(status === 'sold'
      ? `${title(car)} is marked sold and hidden from the website. It’s under “Sold” if you need it back.`
      : `${title(car)} is back on the website.`);
  }
  render();
}

async function deleteCar() {
  const car = state.editing;
  if (!car || !window.confirm(`Delete the ${title(car)} and its photos for good? This can’t be undone.`)) return;
  const { error } = await sb.from('vehicles').delete().eq('id', car.id);
  if (error) {
    const box = $('[data-error]');
    box.textContent = friendlyError(error);
    box.hidden = false;
    return;
  }
  await removeFiles(photoPaths(car.photos).concat(state.removed));
  state.photos.forEach(releasePhoto);
  await loadCars();
  setFlash(`Deleted the ${title(car)}.`);
  state.screen = 'list';
  state.dirty = false;
  render();
}

/* ---------- Opening the form ---------- */
function openEditor(car) {
  state.editing = car || null;
  state.photos = car ? (car.photos || []).map((p) => ({ ...p })) : [];
  state.removed = [];
  state.stockTouched = !!car;
  state.lastLookup = car ? car.vin : '';
  state.dirty = false;
  state.flash = '';
  state.screen = 'edit';
  render();
  window.scrollTo(0, 0);
}

function leaveEditor() {
  if (state.busy) return;
  if (state.dirty && !window.confirm('Leave without saving? Your changes to this car will be lost.')) return;
  state.photos.filter((p) => p.full).forEach(releasePhoto);
  state.screen = 'list';
  state.dirty = false;
  render();
}

/* ---------- Events ---------- */
app.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; state.flash = ''; render(); return; }
  const btn = e.target.closest('[data-action]');
  if (!btn || state.busy) return;
  const action = btn.dataset.action;
  if (action === 'reload') { window.location.reload(); return; }
  if (action === 'forgot') { state.flash = ''; state.screen = 'forgot'; render(); return; }
  if (action === 'to-login') { state.flash = ''; state.screen = 'login'; render(); return; }
  if (action === 'sign-out') { await sb.auth.signOut(); state.cars = []; state.flash = 'You’re signed out.'; state.screen = 'login'; render(); return; }
  if (action === 'add') { openEditor(null); return; }
  if (action === 'edit') { openEditor(state.cars.find((c) => c.id === btn.dataset.id)); return; }
  if (action === 'status') { btn.disabled = true; await setStatus(btn.dataset.id, btn.dataset.status); return; }
  if (action === 'back') { leaveEditor(); return; }
  if (action === 'delete') { await deleteCar(); return; }
  if (action === 'lookup') { await lookup($('[data-form="car"]')); return; }
  if (action === 'photo-main' || action === 'photo-remove') {
    const i = Number(btn.dataset.i);
    const [p] = state.photos.splice(i, 1);
    if (action === 'photo-main') state.photos.unshift(p);
    else if (p.full) releasePhoto(p);
    else state.removed.push(...photoPaths([p]));
    state.dirty = true;
    renderPhotos();
  }
});

app.addEventListener('input', (e) => {
  const form = e.target.form;
  if (!form || form.dataset.form !== 'car') return;
  state.dirty = true;
  const name = e.target.name;
  if (name === 'stock_number') state.stockTouched = true;
  if (name === 'price' || name === 'mileage') {
    const d = digits(e.target.value);
    e.target.value = d ? new Intl.NumberFormat('en-US').format(Number(d)) : '';
  }
  if (name === 'vin') {
    const vin = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
    if (e.target.value !== vin) e.target.value = vin;
    const note = $('[data-vin-note]');
    if (/[IOQ]/.test(vin)) {
      note.textContent = 'VINs never use the letters I, O, or Q. Check for the numbers 1 or 0.';
      note.classList.add('is-warn');
    } else if (note.classList.contains('is-warn') && vin.length < 17) {
      note.textContent = '';
      note.classList.remove('is-warn');
    }
    if (!state.stockTouched) form.stock_number.value = vin.slice(-6);
    if (vin.length === 17 && vin !== state.lastLookup && !/[IOQ]/.test(vin)) lookup(form, { auto: true });
  }
});

app.addEventListener('change', async (e) => {
  if (e.target.matches('[data-photo-input]')) {
    const files = e.target.files;
    await addPhotos(files);
    e.target.value = '';
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (state.busy) return;
  const kind = form.dataset.form;
  if (kind === 'car') { await saveCar(form); return; }
  const errorBox = $('[data-error]', form);
  const submit = form.querySelector('[type="submit"]');
  const showError = (text) => { errorBox.textContent = text; errorBox.hidden = false; };
  errorBox.hidden = true;
  submit.disabled = true;
  try {
    if (kind === 'login') {
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) { showError('Enter your email and password.'); return; }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { showError(friendlyError(error)); return; }
      state.session = data.session;
      state.flash = '';
      await enterApp();
    } else if (kind === 'forgot') {
      const email = form.email.value.trim();
      if (!email) { showError('Enter your email.'); return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}` });
      if (error) { showError(friendlyError(error)); return; }
      state.flash = 'If that email has a manager login, a reset link is on its way. Check the spam folder too.';
      state.screen = 'login';
      render();
    } else if (kind === 'new-password') {
      const password = form.password.value;
      if (password.length < 8) { showError('Use at least 8 characters.'); return; }
      if (password !== form.confirm.value) { showError('The two passwords don’t match.'); return; }
      const { error } = await sb.auth.updateUser({ password });
      if (error) { showError(friendlyError(error)); return; }
      history.replaceState(null, '', window.location.pathname);
      setFlash('Your new password is saved.');
      await enterApp();
    }
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
});

window.addEventListener('beforeunload', (e) => {
  if (state.screen === 'edit' && (state.dirty || state.busy)) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- Start ---------- */
async function start() {
  if (!DB_URL || !DB_KEY) { state.screen = 'setup'; render(); return; }
  let createClient;
  try {
    ({ createClient } = await import(SUPABASE_JS));
  } catch (err) {
    console.error(err);
    state.flash = 'Couldn’t load the sign-in service. Check your internet connection and try again.';
    state.screen = 'error';
    render();
    return;
  }
  sb = createClient(DB_URL, DB_KEY);
  const recovering = /type=recovery/.test(window.location.hash);
  sb.auth.onAuthStateChange((event, session) => {
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') {
      // Opened from a reset email: ask for a new password before anything else.
      setTimeout(() => { state.screen = 'new-password'; render(); }, 0);
    }
  });
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (recovering && state.session) { state.screen = 'new-password'; render(); return; }
  if (!state.session) { state.screen = 'login'; render(); return; }
  await enterApp();
}

start();
