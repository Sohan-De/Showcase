/** Shop tab: contact info, opening hours, social links, promo banner. */
import { getSetting, saveSetting } from './adminApi.js';
import { el, field, withBusy, toast } from './ui.js';
import { SHOP_DEFAULTS, DAYS } from '../config.js';

const DAY_FR = { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' };
const isUrl = (s) => !s || /^https?:\/\/\S+$/i.test(s);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function initSettings(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  let shop, promo;
  try {
    [shop, promo] = await Promise.all([getSetting('shop'), getSetting('promo')]);
  } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement.' })); return; }
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
    const from = el('input', { class: 'input', type: 'time', value: slot?.[0] || '10:00', 'aria-label': `${DAY_FR[d]} : ouverture` });
    const to = el('input', { class: 'input', type: 'time', value: slot?.[1] || '19:00', 'aria-label': `${DAY_FR[d]} : fermeture` });
    const sync = () => { from.disabled = to.disabled = closed.checked; };
    closed.addEventListener('change', sync); sync();
    return { d, closed, from, to, node: el('div', { class: 'hours-row' }, el('strong', { text: DAY_FR[d] }), el('label', { class: 'switch' }, closed, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Fermé' })), from, el('span', { 'aria-hidden': 'true', text: '→' }), to) };
  });

  const pEnabled = el('input', { type: 'checkbox', checked: promo.enabled });
  const pFr = text(promo.text_fr, { maxlength: 160 });
  const pEn = text(promo.text_en, { maxlength: 160 });
  const pLink = text(promo.link, { type: 'url', maxlength: 300, placeholder: 'https://… (facultatif)' });

  const saveBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Enregistrer les informations', onclick: (e) => withBusy(e.currentTarget, async () => {
    if (!phone.value.trim()) throw new Error('Le numéro de téléphone est obligatoire.');
    if (![facebook.value, review.value, pLink.value].every((v) => isUrl(v.trim()))) throw new Error('Les liens doivent commencer par https://');
    const hours = {};
    for (const r of hourRows) {
      if (r.closed.checked) { hours[r.d] = []; continue; }
      if (!TIME.test(r.from.value) || !TIME.test(r.to.value) || r.from.value >= r.to.value) throw new Error(`Horaires invalides pour ${DAY_FR[r.d]} (l’ouverture doit précéder la fermeture).`);
      hours[r.d] = [[r.from.value, r.to.value]];
    }
    await saveSetting('shop', {
      phone: phone.value.trim(), whatsapp: wa.value.replace(/\D/g, ''), email: email.value.trim(), address: address.value.trim(),
      facebook: facebook.value.trim(), google_review_url: review.value.trim(), hours,
    });
    await saveSetting('promo', { enabled: pEnabled.checked, text_fr: pFr.value.trim(), text_en: pEn.value.trim(), link: pLink.value.trim() });
  }, 'Informations enregistrées ✔') });

  container.replaceChildren(
    el('section', { class: 'card tool' }, el('h2', { text: 'Coordonnées' }),
      el('div', { class: 'grid-form' },
        field('Téléphone', phone), field('WhatsApp (chiffres, sans le +)', wa, 'Ex. 33774000074'),
        field('E-mail', email), field('Adresse', address),
        field('Lien Facebook', facebook), field('Lien « Laisser un avis Google »', review, 'Copiez le lien depuis votre fiche Google Business Profile.'))),
    el('section', { class: 'card tool' }, el('h2', { text: 'Horaires d’ouverture' }), el('div', { class: 'hours-grid' }, hourRows.map((r) => r.node))),
    el('section', { class: 'card tool' }, el('h2', { text: 'Bandeau promo (page d’accueil)' }),
      el('label', { class: 'switch' }, pEnabled, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Afficher le bandeau' })),
      el('div', { class: 'grid-form' }, field('Texte en français', pFr), field('Texte en anglais', pEn), field('Lien (facultatif)', pLink))),
    el('div', { class: 'btn-row' }, saveBtn));
  void toast;
}
