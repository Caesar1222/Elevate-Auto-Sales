/* ==========================================================================
   Dealership details. Edit these here; every page reads from this file.
   ========================================================================== */
window.ELEVATE_CONFIG = {
  name: 'Elevate Auto Sales',
  legalName: 'Elevate Auto Sales LLC',
  owner: 'Axel Munoz', // shown on the About page
  tagline: 'Drive Higher. Drive Better.', // as written on the banner

  phoneDisplay: '(773) 373-5448',
  phoneE164: '+17733735448',
  email: 'elevatellc47@gmail.com', // shown on the site; form emails go here too (leadEndpoint)

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

  // Where form submissions (leads) go. FormSubmit (formsubmit.co, free, no
  // account) emails each one to the address at the end of this URL. The first
  // submission from the live site sends an "Activate Form" email to that inbox;
  // click it once (FormSubmit holds anything sent before then and delivers it
  // after activation). Once activated, FormSubmit also sends a random string
  // that can replace the address here, so the address isn't in the page code.
  // Nothing sends from the chat preview, a file, or localhost (see README,
  // "Form emails"). null turns sending off everywhere.
  leadEndpoint: 'https://formsubmit.co/ajax/elevatellc47@gmail.com',
};
