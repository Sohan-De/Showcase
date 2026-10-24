/** Opening hours logic. Always evaluated in Europe/Paris, whatever the visitor's timezone. */
import { DAYS, TIMEZONE } from './config.js';
import { getLang, t } from './i18n.js';

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Current weekday key + minutes since midnight in Paris. */
export function parisNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = get('weekday').slice(0, 3).toLowerCase(); // mon, tue...
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':');
  return getLang() === 'fr' ? `${Number(h)} h${m === '00' ? '' : m}` : `${Number(h) % 12 || 12}${m === '00' ? '' : ':' + m} ${Number(h) < 12 ? 'am' : 'pm'}`;
};

/** { open: boolean, text: string } for the badge. */
export function getStatus(hours, date = new Date()) {
  const { day, minutes } = parisNow(date);
  const idx = DAYS.indexOf(day);
  for (const [from, to] of hours[day] || []) {
    if (minutes >= toMin(from) && minutes < toMin(to)) {
      return { open: true, text: `${t('st.open')} · ${t('st.closesAt', { time: fmtTime(to) })}` };
    }
  }
  // Later today?
  for (const [from] of hours[day] || []) {
    if (minutes < toMin(from)) return { open: false, text: `${t('st.closed')} · ${t('st.opensAt', { time: fmtTime(from) })}` };
  }
  // Next opening day
  for (let i = 1; i <= 7; i++) {
    const key = DAYS[(idx + i) % 7];
    const slot = (hours[key] || [])[0];
    if (slot) {
      const when = i === 1
        ? t('st.opensTomorrow', { time: fmtTime(slot[0]) })
        : t('st.opensDay', { day: t(`day.${key}`).toLowerCase(), time: fmtTime(slot[0]) });
      return { open: false, text: `${t('st.closed')} · ${when}` };
    }
  }
  return { open: false, text: t('st.closed') };
}

/** "10:00 – 19:00" style label for a day, or null when closed. */
export const dayRanges = (hours, key) => (hours[key] || []).map(([a, b]) => `${a.replace(':', 'h')}–${b.replace(':', 'h')}`).join(' · ');

export function renderHoursTable(tbody, hours) {
  const { day } = parisNow();
  tbody.replaceChildren(...DAYS.map((key) => {
    const tr = document.createElement('tr');
    if (key === day) tr.className = 'is-today';
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = t(`day.${key}`);
    const td = document.createElement('td');
    const label = dayRanges(hours, key);
    if (label) td.textContent = label; else { td.className = 'closed'; td.textContent = t('hours.closed'); }
    tr.append(th, td);
    return tr;
  }));
}

export function updateStatusBadges(hours) {
  const s = getStatus(hours);
  document.querySelectorAll('[data-status]').forEach((b) => {
    b.dataset.open = String(s.open);
    b.querySelector('span').textContent = s.text;
  });
}
