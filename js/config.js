/**
 * Single place for connection settings and shop defaults.
 * The anon key is PUBLIC by design: security comes from Row Level Security
 * policies + Supabase Auth. NEVER put a service_role key in this folder.
 */
export const SUPABASE_URL = 'https://whrcfwbbntdykvsrljsp.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndocmNmd2JibnRkeWt2c3JsanNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTg2MDAsImV4cCI6MjEwODQzNDYwMH0.wCly8FDjPpg0hw56SCJ8Tv7QcjY4D9xS_Z7R8u1c_Ss';

/** Pinned supabase-js build, loaded lazily from jsDelivr (ESM). */
export const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const TIMEZONE = 'Europe/Paris';
export const LANGS = ['fr', 'en'];
export const DEFAULT_LANG = 'fr';

/** Defaults used until (or if) site_settings can be loaded. */
export const SHOP_DEFAULTS = {
  phone: '+33 7 74 00 00 74',
  whatsapp: '33774000074',
  address: '11 Av. Maréchal Foch, 34500 Béziers',
  facebook: 'https://www.facebook.com/',
  google_review_url:
    'https://www.google.com/maps/search/?api=1&query=Prophone+B%C3%A9ziers+11+Av.+Mar%C3%A9chal+Foch+34500+B%C3%A9ziers',
  hours: {
    mon: [['14:00', '19:00']],
    tue: [['10:00', '19:00']],
    wed: [['10:00', '19:00']],
    thu: [['10:00', '19:00']],
    fri: [['10:00', '19:00']],
    sat: [['10:00', '19:00']],
    sun: [],
  },
};

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Min seconds between two contact submissions from the same browser. */
export const CONTACT_COOLDOWN_S = 60;
