/** Shop tab: contact info, opening hours, social links, promo banner. */
import { getSetting, saveSetting } from './adminApi.js';
import { el, field, withBusy, toast } from './ui.js';
import { SHOP_DEFAULTS, DAYS } from '../config.js';

const DAY_FR = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const isUrl = (s) => !s || /^https?:\/\/\S+$/i.test(s);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function initSettings(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  let shop, promo;
  try {
    [shop, promo] = await Promise.all([getSetting('shop'), getSetting('promo')]);
  } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Loading error.' })); return; }
  shop = { ...SHOP_DEFAULTS, ...shop };
  promo = { enabled: false, text_fr: '', text_en: '', link: '', ...promo };

  const text = (v, extra = {}) => el('input', { class: 'input input--lg', value: v ?? '', ...extra });
  const phone = text(shop.phone, { type: 'tel', maxlength: 30 });
  const wa = text(shop.whatsapp, { inputmode: 'numeric', maxlength: 20 });
  const email = text(shop.email, { type: 'email', maxlength: 150 });
  const address = text(shop.address, { maxlength: 200 });
  const facebook = text(shop.facebook, { type: 'url', maxlength: 300 });
  const review = text(shop.google_review_url, { type: 'url', maxlength: 500 });

  // Hours: one line per day, "closed" switch + opening/closing time (single slot per day)
  const hourRows = DAYS.map((d) => {
    const slot = (shop.hours?.[d] || [])[0];
    const closed = el('input', { type: 'checkbox', checked: !slot });
    const from = el('input', { class: 'input', type: 'time', value: slot?.[0] || '10:00', 'aria-label': `${DAY_FR[d]} : opens` });
    const to = el('input', { class: 'input', type: 'time', value: slot?.[1] || '19:00', 'aria-label': `${DAY_FR[d]} : closes` });
    const sync = () => { from.disabled = to.disabled = closed.checked; };
    closed.addEventListener('change', sync); sync();
    return { d, closed, from, to, node: el('div', { class: 'hours-row' }, el('strong', { text: DAY_FR[d] }), el('label', { class: 'switch' }, closed, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Closed' })), from, el('span', { 'aria-hidden': 'true', text: '→' }), to) };
  });

  const pEnabled = el('input', { type: 'checkbox', checked: promo.enabled });
  const pFr = text(promo.text_fr, { maxlength: 160 });
  const pEn = text(promo.text_en, { maxlength: 160 });
  const pLink = text(promo.link, { type: 'url', maxlength: 300, placeholder: 'https://… (optional)' });

  const saveBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Save information', onclick: (e) => withBusy(e.currentTarget, async () => {
    if (!phone.value.trim()) throw new Error('The phone number is required.');
    if (![facebook.value, review.value, pLink.value].every((v) => isUrl(v.trim()))) throw new Error('Links must start with https://');
    const hours = {};
    for (const r of hourRows) {
      if (r.closed.checked) { hours[r.d] = []; continue; }
      if (!TIME.test(r.from.value) || !TIME.test(r.to.value) || r.from.value >= r.to.value) throw new Error(`Invalid hours for ${DAY_FR[r.d]} (opening must be before closing).`);
      hours[r.d] = [[r.from.value, r.to.value]];
    }
    await saveSetting('shop', {
      phone: phone.value.trim(), whatsapp: wa.value.replace(/\D/g, ''), email: email.value.trim(), address: address.value.trim(),
      facebook: facebook.value.trim(), google_review_url: review.value.trim(), hours,
    });
    await saveSetting('promo', { enabled: pEnabled.checked, text_fr: pFr.value.trim(), text_en: pEn.value.trim(), link: pLink.value.trim() });
  }, 'Information saved ✔') });

  container.replaceChildren(
    el('section', { class: 'card tool' }, el('h2', { text: 'Contact details' }),
      el('div', { class: 'grid-form' },
        field('Phone', phone), field('WhatsApp (digits only, without the +)', wa, 'e.g. 33774000074'),
        field('Email', email), field('Address', address),
        field('Facebook link', facebook), field('Link for “Leave a Google review”', review, 'Copy the link from your Google Business Profile.'))),
    el('section', { class: 'card tool' }, el('h2', { text: 'Opening hours' }), el('div', { class: 'hours-grid' }, hourRows.map((r) => r.node))),
    el('section', { class: 'card tool' }, el('h2', { text: 'Promo banner (home page)' }),
      el('label', { class: 'switch' }, pEnabled, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Show the banner' })),
      el('div', { class: 'grid-form' }, field('Text in French', pFr), field('Text in English', pEn), field('Link (optional)', pLink))),
    el('div', { class: 'btn-row' }, saveBtn));
  void toast;
}
