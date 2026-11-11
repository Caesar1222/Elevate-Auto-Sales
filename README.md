# Elevate Auto Sales website (prototype)

A visual prototype of the dealership site with sample inventory, grey photo
placeholders, and placeholder copy. It's plain HTML, CSS, and JavaScript: no framework, no dependencies, no
build step required to run it.

## Run it

- **Quickest:** open `dist/elevate-auto-sales.html` in a browser. It's a
  single self-contained file (fonts load from Google Fonts when online).
- **While editing:** from this folder run `python3 -m http.server 8000` and open
  http://localhost:8000. A server is needed because browsers block
  `fetch('data/inventory.json')` from `file://` pages.
- **Rebuild the single file** after edits: `python3 build.py`.

## Where things live

| File | What it does |
| --- | --- |
| `js/config.js` | Name, phone, email, address, hours, and where form leads go. Edit dealership details here only. |
| `js/inventory-source.js` | The only file that knows where vehicles come from. Swap the data source here. |
| `data/inventory.json` | 20 sample vehicles, shaped like a typical dealer inventory feed. |
| `js/app.js` | Pages (hash routes), filters, vehicle pages, forms, calculator, saved vehicles. |
| `js/brand.js` | The logo and the grey photo and map placeholders. |
| `js/i18n.js` | Every visible string in English and Spanish, plus translations for vehicle features. |
| `css/styles.css` | All styles, with light and dark themes. |
| `build.py` | Bundles everything into `dist/elevate-auto-sales.html`. |

Routes: `#home`, `#inventory`, `#v-<stock number>`, `#financing`,
`#trade-in`, `#about`, `#contact`, `#saved`.

## Header and search

On desktop, the black top bar (address, hours, language switch, phone) and the
header stay pinned together as visitors scroll. On phones the header stays
pinned and the bottom bar handles call, text, and directions. If you change the
header or top bar height, update `--sticky-h` in `css/styles.css` so the sticky
filters and price box sit below it.

The magnifying glass opens a search that matches year, make, model, trim, and
stock number in any order ("2017 honda", "ford truck"). It ignores accents and
punctuation, so "f150" finds an F-150 and "crv" finds a CR-V, and Spanish words
like "camioneta" or "troca" find trucks. Results update as you type; Enter shows
every match on the inventory page. Press "/" anywhere on desktop to open it.
Search words for body styles live in `BODY_WORDS` in `js/app.js`.

## English and Spanish

The **English | Español** switch sits in the top bar on desktop and as
**EN | ES** in the header on phones. The site picks the language in this order:
a `?lang=es` or `?lang=en` link, the visitor's last choice, then their browser
language. So a Spanish-language phone gets Spanish automatically.

- **Editing text:** every string lives in `js/i18n.js`, in an English block and a
  matching Spanish block. Change wording there, never in `app.js`.
- **New vehicle features:** features from the inventory feed show in English
  until their translation is added to the `feature` list in the Spanish block.
  Trims and colors stay as the feed provides them.
- **Spanish ads and posts:** link to `yourdomain.com/?lang=es` so visitors land in
  Spanish.
- **Leads** include `language: "es"` when sent from the Spanish site, so you know
  to reply in Spanish. Dropdown answers are sent in English so records stay
  consistent.
- The tagline "Drive higher, drive better." stays in English as a brand line.

## Connecting the real inventory system

1. Ask the inventory/DMS provider for a **website inventory feed** (usually a
   CSV or XML file updated on a schedule, or an API).
2. In `js/inventory-source.js`, point `load()` at it and map its column names in
   `normalize()`. The rest of the site uses the normalized fields, so nothing
   else changes.
3. Photos: see "Adding vehicle photos" below.
4. If the feed can't be fetched from the browser (CORS, or it's a file on an
   FTP server), have a small scheduled job convert it to `inventory.json`.

## Adding vehicle photos

Every listing shows grey "Photo coming soon" boxes until it has photos. To add
them, list the image URLs in that vehicle's `photos` array in
`data/inventory.json` (or let the inventory feed supply them). The first photo
becomes the main image on cards and the vehicle page, and up to 12 appear in the
vehicle page gallery. Landscape 4:3 photos at least 1600px wide work best;
compress them so pages load quickly on phones.

## Hero photo (placeholder until the video)

The hero currently shows a free Unsplash photo by Erik Mclean
(https://unsplash.com/photos/4N_iP-NmaQg), saved at `assets/hero-photo.jpg`
(resized to 2000px wide). The Unsplash License allows free commercial use, and
credit isn't required.

- **To swap it:** replace `assets/hero-photo.jpg` with another landscape photo
  about 2000px wide (200–400 KB). `build.py` embeds local photos in the
  single-file version automatically.
- **Cropping:** `heroImage.position` picks which part stays visible when the
  photo is cropped, for example `'right center'` to keep a car on the right.
- If the photo can't load, the grey placeholder shows instead. Once a hero
  video is added, the video takes over and the photo becomes its still frame.

## Adding a hero video

The home page opens with a full-width video behind the headline. Until a clip
is added it shows a dark grey placeholder.

1. **Prepare the clip:** 10 to 20 seconds that loops cleanly, landscape 16:9
   (1920×1080 or 1280×720), H.264 MP4 with no audio, ideally under 8 MB. Keep
   the important part of the shot near the center, since phones crop the sides,
   and favor darker footage so the white headline stays readable.
2. **Save it** as `assets/hero.mp4`, plus a still frame as
   `assets/hero-poster.jpg`. The still shows while the video loads and for
   visitors who have reduced motion or data saver turned on.
3. **Turn it on** in `js/config.js`:

   ```js
   heroVideo: {
     sources: [{ src: 'assets/hero.mp4', type: 'video/mp4' }],
     poster: 'assets/hero-poster.jpg',
   },
   ```

With ffmpeg, from a phone video (trims to 15 seconds, drops audio, compresses):

```
ffmpeg -i input.mov -t 15 -vf "scale=1920:-2" -an -c:v libx264 -crf 26 -preset slow -movflags +faststart assets/hero.mp4
ffmpeg -i assets/hero.mp4 -frames:v 1 -q:v 3 assets/hero-poster.jpg
```

The video plays muted on a loop, has a Pause button, pauses when scrolled out
of view, and doesn't autoplay for visitors with reduced motion or data saver
turned on. If the file can't be loaded, the placeholder comes back.

## Sending form leads somewhere

Forms run in preview mode while `leadEndpoint` in `js/config.js` is `null`: they
show a confirmation, log the lead to the browser console, and send nothing.
Set it to a form service URL or the CRM's endpoint to go live. Many dealer
CRMs take leads by email in ADF/XML format; a small serverless function can
translate the JSON this site posts.

## Deploying

Any static host works: Netlify or Cloudflare Pages (drag the folder in) or
GitHub Pages. Point the dealership's domain at it.

## Before launch: placeholders and things to confirm

- [ ] **Logo:** the header logo is a vector recreation. Swap in the original
      files from whoever designed the banner (`logo()` and `emblem()` in `js/brand.js`).
- [ ] **Photos:** vehicle photos, plus a photo of the owner for the About page.
- [ ] **Hero:** swap the stock placeholder photo for the dealership's own video or photo of the lot.
- [ ] **About page:** the story is placeholder text. The owner's name is set in `js/config.js` (`owner`).
- [ ] **Claims to confirm with the owner:** "a price on every car," "history
      reports on request," financing wording, and response-time language.
- [ ] **Consent text** on forms (phone/text/email contact) should be reviewed.
- [ ] **Credit applications:** this site never asks for an SSN or birth date.
      For full applications, link to the lender's or DMS's secure application
      rather than collecting that data here.
- [ ] **Advertising rules:** the calculator is an estimate tool with a
      disclaimer. Avoid showing monthly payments on listings without the
      required financing disclosures, and confirm the fee disclaimer wording
      meets Illinois requirements.
- [ ] **Map:** replace the grey map box with a Google Maps embed once the
      Google Business Profile is live, and add a review link.
- [ ] **Privacy policy page** (the forms collect personal information).
- [ ] Replace the sample inventory with the real feed.
- [ ] **Spanish:** have a native speaker read through `js/i18n.js` (and decide whether to translate the tagline).

## Suggested next step

Once the inventory system is chosen, move to Astro so each vehicle gets its own
pre-rendered page that search engines index well, with separate `/es/` pages so
Spanish searches find the site too. The CSS and most of the
markup carry over directly.
