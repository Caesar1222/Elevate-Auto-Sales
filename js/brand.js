/* ==========================================================================
   Brand pieces and placeholders
   The logo here is a flat recreation of the dealership's mark; swap in the
   original artwork when it's available. Photo and map placeholders are plain
   grey boxes until real images exist.
   ========================================================================== */
(function () {
  'use strict';

  function emblem(className = 'logo-mark') {
    return `<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">`
      + '<path class="logo-ring" d="M31.5 7.55A19 19 0 1 0 31.5 40.45" fill="none" stroke-width="4.6" stroke-linecap="round"/>'
      + '<path class="logo-e" d="M18.4 13L40.4 13L39.2 19L23.2 19L22.8 21L34.8 21L33.6 27L21.6 27L21.2 29L37.2 29L36 35L14 35Z"/>'
      + '</svg>';
  }

  function chevronA() {
    return '<svg class="logo-a" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M71 0L100 100L66 100L57.6 64L34 100L0 100Z"/></svg>';
  }

  function logo() {
    return `<span class="logo">${emblem()}<span class="logo-type"><span class="logo-name">ELEV${chevronA()}TE</span><span class="logo-sub">Auto Sales</span></span></span>`;
  }

  const CAMERA = '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>';
  const PIN = '<path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>';
  const glyph = (paths, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

  /* Grey photo box. size: "" | "lg" | "sm" | "portrait" */
  function photoPlaceholder({ label = 'Photo coming soon', size = '', decorative = false } = {}) {
    const a11y = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${label || 'Photo placeholder'}"`;
    return `<div class="ph${size ? ` ph--${size}` : ''}" ${a11y}>${glyph(CAMERA, 'ph-icon')}${label ? `<span class="ph-label">${label}</span>` : ''}</div>`;
  }

  const VIDEO = '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M10.2 9.4v5.2l4.6-2.6z"/>';

  /* Dark grey box filling the home page hero until a video is added. */
  function heroPlaceholder(label = 'Hero video goes here') {
    return `<div class="hero-ph" aria-hidden="true">${glyph(VIDEO, 'ph-icon')}<span class="ph-label">${label}</span></div>`;
  }

  /* Grey map box with a directions link (swap for a map embed at launch). */
  function mapPlaceholder(addressLine, directionsUrl, linkLabel = 'Open in Google Maps') {
    return `<div class="ph ph--map">${glyph(PIN, 'ph-icon')}<span class="ph-label">${addressLine}</span>`
      + `<a class="ph-link" href="${directionsUrl}" target="_blank" rel="noopener">${linkLabel}</a></div>`;
  }

  window.ElevateBrand = { logo, emblem, photoPlaceholder, mapPlaceholder, heroPlaceholder };
})();
