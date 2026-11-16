/* ==========================================================================
   Inventory source: the ONLY file that knows where vehicles come from.

   With supabaseUrl and supabaseKey set in js/config.js, cars come from the
   manager database (the manager page at /manager/ adds and edits them).
   Without them, it reads data/inventory.json (or the copy build.py embeds).
   To switch to another inventory system later, change load() and map its
   records in normalize(). Nothing else in the site needs to change.

   Vehicle shape used by the site:
     id, stockNumber, vin, year, make, model, trim, bodyType, price, mileage,
     exteriorColor, exteriorColorHex, interiorColor, transmission, drivetrain,
     engine, fuelType, mpgCity, mpgHighway, features[], description, photos[],
     dateInStock (YYYY-MM-DD), status ("available" | "pending" | "sold"), badge,
     thumbs[] (small copies of photos[], same order; optional)
   ========================================================================== */
(function () {
  'use strict';

  const SOURCE_URL = 'data/inventory.json';
  const C = window.ELEVATE_CONFIG || {};
  const DB_URL = String(C.supabaseUrl || '').trim().replace(/\/+$/, '');
  const DB_KEY = String(C.supabaseKey || '').trim();

  // Used when a feed gives a color name but no swatch (most feeds don't).
  const COLOR_RULES = [
    [/black|ebony|onyx|obsidian black|pitch/i, '#15171C'],
    [/blue|navy|caspian|patriot|cobalt/i, '#1F4A9E'],
    [/red|ruby|cherry|maroon|burgundy|cajun/i, '#A3121F'],
    [/green|jade|olive/i, '#2F5A3A'],
    [/brown|bronze|mocha|copper/i, '#5A4130'],
    [/gold/i, '#B8963E'],
    [/orange/i, '#D9601B'],
    [/yellow/i, '#E2B41B'],
    [/beige|tan|sand|champagne|cream/i, '#CBB89A'],
    [/silver|ingot|ice|platinum|lunar|aluminum/i, '#BFC5CC'],
    [/gray|grey|gun|steel|graphite|charcoal|granite|slate/i, '#5C636C'],
    [/white|pearl|ivory|snow/i, '#F2F3F1'],
  ];

  function colorHex(name) {
    const hit = COLOR_RULES.find(([re]) => re.test(name || ''));
    return hit ? hit[1] : '#8A929C';
  }

  const toNumber = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  // Map one raw record to the site's vehicle shape. Feed column names vary by
  // provider; add the provider's names to the fallbacks here.
  function normalize(r) {
    const stock = String(r.stockNumber ?? r.stock ?? r.StockNumber ?? r.vin ?? '').trim();
    const photos = Array.isArray(r.photos)
      ? r.photos
      : String(r.photoUrls ?? r.PhotoURLs ?? '').split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    const thumbs = Array.isArray(r.thumbs) && r.thumbs.length === photos.length ? r.thumbs : photos;
    const features = Array.isArray(r.features)
      ? r.features
      : String(r.options ?? r.Options ?? '').split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    const v = {
      id: stock.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      stockNumber: stock,
      vin: String(r.vin ?? r.VIN ?? ''),
      year: toNumber(r.year ?? r.Year),
      make: String(r.make ?? r.Make ?? ''),
      model: String(r.model ?? r.Model ?? ''),
      trim: String(r.trim ?? r.Trim ?? ''),
      bodyType: String(r.bodyType ?? r.body ?? r.Body ?? 'Sedan'),
      price: toNumber(r.price ?? r.Price),
      mileage: toNumber(r.mileage ?? r.miles ?? r.Miles),
      exteriorColor: String(r.exteriorColor ?? r.ExtColor ?? ''),
      exteriorColorHex: r.exteriorColorHex || colorHex(r.exteriorColor ?? r.ExtColor),
      interiorColor: String(r.interiorColor ?? r.IntColor ?? ''),
      transmission: String(r.transmission ?? r.Transmission ?? ''),
      drivetrain: String(r.drivetrain ?? r.Drivetrain ?? '').toUpperCase(),
      engine: String(r.engine ?? r.Engine ?? ''),
      fuelType: String(r.fuelType ?? r.Fuel ?? ''),
      mpgCity: toNumber(r.mpgCity ?? r.CityMPG) || null,
      mpgHighway: toNumber(r.mpgHighway ?? r.HwyMPG) || null,
      features,
      description: String(r.description ?? r.comments ?? r.Comments ?? ''),
      photos,
      thumbs,
      dateInStock: String(r.dateInStock ?? r.DateInStock ?? ''),
      status: String(r.status ?? 'available').toLowerCase(),
      badge: String(r.badge ?? ''),
    };
    v.title = `${v.year} ${v.make} ${v.model}`;
    v.searchText = [v.year, v.make, v.model, v.trim, v.bodyType, v.exteriorColor, v.stockNumber, v.drivetrain]
      .join(' ').toLowerCase();
    return v;
  }

  // A row from the manager database (snake_case columns, photos stored as
  // { url, thumb, path, thumbPath }) in the shape normalize() expects.
  const isWebUrl = (u) => /^https:\/\//i.test(String(u || ''));
  function fromDb(row) {
    const shots = (Array.isArray(row.photos) ? row.photos : []).filter((p) => p && isWebUrl(p.url));
    return {
      stockNumber: row.stock_number,
      vin: row.vin,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim,
      bodyType: row.body_type || 'Sedan',
      price: row.price,
      mileage: row.mileage,
      exteriorColor: row.exterior_color,
      interiorColor: row.interior_color,
      transmission: row.transmission,
      drivetrain: row.drivetrain,
      engine: row.engine,
      fuelType: row.fuel_type,
      mpgCity: row.mpg_city,
      mpgHighway: row.mpg_highway,
      features: Array.isArray(row.features) ? row.features : [],
      description: row.description,
      photos: shots.map((p) => p.url),
      thumbs: shots.map((p) => (isWebUrl(p.thumb) ? p.thumb : p.url)),
      dateInStock: row.date_in_stock || String(row.created_at || '').slice(0, 10),
      status: row.status,
      badge: row.badge,
    };
  }

  async function readDatabase() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${DB_URL}/rest/v1/vehicles?select=*&status=neq.sold&order=date_in_stock.desc,created_at.desc`, {
        headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` },
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Inventory database responded with status ${res.status}.`);
      return (await res.json()).map(fromDb);
    } finally {
      clearTimeout(timer);
    }
  }

  async function readRaw() {
    if (DB_URL && DB_KEY) return readDatabase();
    const embedded = document.getElementById('inventory-data');
    if (embedded) return JSON.parse(embedded.textContent);
    const res = await fetch(SOURCE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Inventory request failed with status ${res.status}.`);
    return res.json();
  }

  async function load() {
    const raw = await readRaw();
    const list = Array.isArray(raw) ? raw : raw.vehicles || [];
    return list.map(normalize).filter((v) => v.id && v.status !== 'sold');
  }

  window.InventorySource = { load, normalize, fromDb };
})();
