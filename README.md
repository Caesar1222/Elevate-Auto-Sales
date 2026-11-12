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
- **Rebuild the single file** after edits: `python3 build.py`. Its forms send
  real emails once it's online. `python3 build.py --preview` makes
  `dist/elevate-auto-sales-preview.html`, a copy whose forms never send, for
  sharing a look at the site (the chat preview link uses this one).

## Where things live

| File | What it does |
| --- | --- |
| `js/config.js` | Name, phone, email, address, hours, tagline, and where form emails go. Edit dealership details here only. |
| `js/inventory-source.js` | The only file that knows where vehicles come from. Swap the data source here. |
| `data/inventory.json` | 20 sample vehicles, shaped like a typical dealer inventory feed. |
| `js/app.js` | Pages (hash routes), filters, vehicle pages, forms, calculator, saved vehicles. |
| `js/brand.js` | The logo and the grey photo and map placeholders. |
| `js/i18n.js` | Every visible string in English and Spanish, plus translations for vehicle features. |
| `css/styles.css` | All styles, with light and dark themes. |
| `build.py` | Bundles everything into `dist/elevate-auto-sales.html`. |

Routes: `#home`, `#inventory`, `#v-<stock number>`, `#financing`,
`#about`, `#contact`, `#saved`. (There's no trade-in page: the dealership
doesn't take trade-ins. Old `#trade-in` links land on the home page.)

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
- The tagline "Drive Higher. Drive Better." stays in English as a brand line.

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

## Form emails

Every form (financing application, vehicle questions, test drives, contact)
is emailed to elevatellc47@gmail.com through [FormSubmit](https://formsubmit.co),
a free form-to-email service that needs no account. The address is in
`leadEndpoint` in `js/config.js`.

- **Activate it once.** The first form sent from the live site makes
  FormSubmit email an **Activate Form** button to that inbox. Click it.
  FormSubmit holds anything sent before activation (for 30 days) and delivers
  it afterward, and visitors see a normal confirmation either way. Check the
  spam folder the first time and mark the email "Not spam". Changing the
  address means activating again.
- **What arrives:** a table with one row per answer, in English even when the
  visitor used Spanish. Financing applications include name, phone, email,
  ZIP code, employment, monthly income, credit range, down payment, the
  vehicle with stock number, price, and VIN, notes, and contact consent. Every
  email also lists the language, the page, and the time sent (Chicago time).
  Subjects say what it is, like "Financing application from Jane Doe (2015
  Chevrolet Tahoe)", and Spanish ones end in "(en español)". Reply goes
  straight to the customer when they gave an email.
- **When nothing sends:** in the `--preview` build, in a file opened from the
  computer, and on a local test server (`localhost`), so testing never emails
  the dealership by accident. Those show "This is a preview, so nothing was
  sent" and log the email that would have gone out in the browser console.
  To send for real from a local server, add `?send=1` to the address, for
  example `http://localhost:8000/?send=1#financing`.
- **Spam:** each form has a hidden field that only bots fill in; those
  submissions are dropped.
- **If sending fails,** the form stays filled in and shows the phone number.
- **Hide the address (optional):** after activation FormSubmit sends a random
  string that can replace the email address in `leadEndpoint`.
- **Later:** to send leads to a CRM instead, change `leadEndpoint` and
  `leadEmail()` in `js/app.js`. Many dealer CRMs take leads by email in
  ADF/XML format.

The financing form is a pre-qualification: it never asks for a Social
Security number or birth date, which shouldn't travel by email. Full credit
applications belong on the lender's or DMS's secure application.

## Adding a car

Add an entry to the `vehicles` list in `data/inventory.json` (or let the
inventory feed supply it), then redeploy. Copy this and change the values:

```json
{
  "stockNumber": "EA1021",
  "vin": "1HGCV1F30KA012345",
  "year": 2019,
  "make": "Honda",
  "model": "Accord",
  "trim": "Sport 1.5T",
  "bodyType": "Sedan",
  "price": 18995,
  "mileage": 64210,
  "exteriorColor": "Platinum White Pearl",
  "interiorColor": "Black cloth",
  "transmission": "CVT",
  "drivetrain": "FWD",
  "engine": "1.5L Turbo I4",
  "fuelType": "Gasoline",
  "mpgCity": 30,
  "mpgHighway": 38,
  "features": ["Apple CarPlay", "Backup camera", "Heated front seats"],
  "photos": ["assets/cars/EA1021-1.jpg", "assets/cars/EA1021-2.jpg"],
  "dateInStock": "2026-11-20",
  "status": "available",
  "badge": "Just arrived"
}
```

- `stockNumber` must be unique; it becomes the page address (`#v-ea1021`).
- `bodyType`: Sedan, SUV, Truck, Minivan, or Coupe. `drivetrain`: FWD, AWD,
  4WD, or RWD. `transmission`: Automatic, Manual, or CVT. `fuelType`:
  Gasoline, Hybrid, Electric, or Diesel. Other values show as written and
  don't get Spanish translations.
- `status`: `available`, `pending` (shows "Sale pending"), or `sold` (hidden
  from the site). `badge` is optional.
- Photos: save them in `assets/cars/` and deploy the whole folder (the
  single-file build doesn't carry vehicle photos). See "Adding vehicle
  photos" below.

## Launch test

Once the site is online:

1. Add one real car (see "Adding a car") and redeploy.
2. Open its page on a phone and check the price, details, and photos.
3. Send a financing application from the Financing page, picking that car.
4. In elevatellc47@gmail.com (spam folder too), click **Activate Form** in
   FormSubmit's email. The application arrives right after.
5. Check every answer came through, and hit Reply to confirm it goes to the
   address typed in the form.
6. Send one more form (a test drive or contact message) to confirm emails
   arrive without any extra step.

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
- [ ] **Form emails:** activate FormSubmit (see "Form emails") and run the launch test.
- [ ] **Sample listings:** remove the 20 sample vehicles before the site is
      public, and the two "sample listings" notes in `js/i18n.js` (`invSub`
      and `legal`, in English and Spanish).
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
