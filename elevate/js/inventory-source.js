/* ==========================================================================
   Inventory source: the ONLY file that knows where vehicles come from.

   Today it reads the sample file data/inventory.json (or a copy embedded in
   the page by build.py). When the dealership picks an inventory system, change
   load() to read that system's feed or API, and adjust normalize() so each
   record maps to the fields below. Nothing else in the site needs to change.

   Vehicle shape used by the site:
     id, stockNumber, vin, year, make, model, trim, bodyType, price, mileage,
     exteriorColor, exteriorColorHex, interiorColor, transmission, drivetrain,
     engine, fuelType, mpgCity, mpgHighway, features[], description, photos[],
     dateInStock (YYYY-MM-DD), status ("available" | "pending" | "sold"), badge
   ========================================================================== */
(function () {
  'use strict';

  const SOURCE_URL = 'data/inventory.json';

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
      dateInStock: String(r.dateInStock ?? r.DateInStock ?? ''),
      status: String(r.status ?? 'available').toLowerCase(),
      badge: String(r.badge ?? ''),
    };
    v.title = `${v.year} ${v.make} ${v.model}`;
    v.searchText = [v.year, v.make, v.model, v.trim, v.bodyType, v.exteriorColor, v.stockNumber, v.drivetrain]
      .join(' ').toLowerCase();
    return v;
  }

  async function readRaw() {
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

  window.InventorySource = { load, normalize };
})();
