/* ==========================================================================
   Dealership details. Edit these here; every page reads from this file.
   ========================================================================== */
window.ELEVATE_CONFIG = {
  name: 'Elevate Auto Sales',
  legalName: 'Elevate Auto Sales LLC',
  tagline: 'Drive higher, drive better.',

  phoneDisplay: '(773) 373-5448',
  phoneE164: '+17733735448',
  email: 'elevatellc47@gmail.com',

  address: {
    street: '5247 W 47th St',
    city: 'Chicago',
    state: 'IL',
    zip: '60638',
  },
  directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=5247+W+47th+St%2C+Chicago%2C+IL+60638',

  // Business hours in Chicago time, 24-hour "HH:MM". null means closed.
  timeZone: 'America/Chicago',
  hours: {
    sun: null,
    mon: ['10:00', '18:00'],
    tue: ['10:00', '18:00'],
    wed: ['10:00', '18:00'],
    thu: ['10:00', '18:00'],
    fri: ['10:00', '18:00'],
    sat: ['10:00', '18:00'],
  },

  // Home page hero video. With no sources, a placeholder shows instead.
  // Once the clip is ready (see README, "Adding a hero video"):
  //   sources: [{ src: 'assets/hero.mp4', type: 'video/mp4' }],
  //   poster: 'assets/hero-poster.jpg',
  heroVideo: {
    sources: [],
    poster: '',
  },

  // Photo shown in the hero until a video is added (also used as the video's
  // still frame when no poster is set). Current placeholder: free Unsplash
  // photo by Erik Mclean, https://unsplash.com/photos/4N_iP-NmaQg, saved at
  // 2000px wide. build.py embeds local images into the single-file preview.
  // position: which part of the photo stays visible when it's cropped.
  heroImage: {
    src: 'assets/hero-photo.jpg',
    position: 'center',
  },

  // Where form submissions (leads) are sent. null keeps the site in preview
  // mode: forms show a confirmation but nothing leaves the browser.
  // Later: a form service URL, or the CRM/inventory system's lead endpoint.
  leadEndpoint: null,
};
