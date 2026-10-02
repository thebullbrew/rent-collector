/* Rent Collector — util.js : formatting, dates, dom helpers, toast, modal */
'use strict';

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---- money: integer cents internally ---- */
function toCents(dollars) {
  const n = Number(String(dollars).replace(/[$,]/g, ''));
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}
function fmtMoney(cents, currency) {
  const cur = currency || (Store.get().settings.currency || 'USD');
  const v = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(v);
  } catch (e) {
    return (cur === 'USD' ? '$' : cur + ' ') + v.toFixed(2);
  }
}

/* ---- dates: YYYY-MM-DD strings, local time ---- */
function todayStr(d) {
  const t = d || new Date();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return t.getFullYear() + '-' + m + '-' + day;
}
function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}
function validDate(s) { return parseYMD(s) !== null; }
function monthKeyOf(ymd) { return String(ymd || '').slice(0, 7); } // YYYY-MM
function monthLabel(ym) {
  const d = parseYMD(ym + '-01');
  if (!d) return ym;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function shortDate(ymd) {
  const d = parseYMD(ymd);
  if (!d) return ymd || '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function addDays(ymd, n) {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function lastDayOfMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}
function dueDateForMonth(ym, dueDay) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const day = Math.min(Number(dueDay) || 1, lastDayOfMonth(y, m));
  return ym + '-' + String(day).padStart(2, '0');
}
function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

/* First name for greetings — strips the "SAMPLE — " prefix used by demo data */
function displayFirstName(name) {
  const clean = String(name || '').replace(/^SAMPLE\s*[—–-]\s*/i, '');
  const first = clean.split(' ')[0];
  return first || clean || 'there';
}

/* ---- toast ---- */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---- modal ---- */
function openModal(title, bodyHTML, opts) {
  opts = opts || {};
  closeModal();
  const ov = document.createElement('div');
  ov.id = 'modal-overlay';
  ov.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + esc(title) + '</h2>' +
      '<button class="icon-btn" id="modal-close" aria-label="Close">&times;</button></div>' +
      '<form id="modal-form" ' + (opts.noSubmit ? '' : '') + '>' +
        '<div class="modal-body">' + bodyHTML + '</div>' +
        (opts.hideFooter ? '' :
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>' +
            '<button type="submit" class="btn btn-gold" id="modal-ok">' + esc(opts.okLabel || 'Save') + '</button>' +
          '</div>') +
      '</form>' +
    '</div>';
  document.body.appendChild(ov);
  const done = () => closeModal();
  ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
  ov.querySelector('#modal-close').addEventListener('click', done);
  const cancel = ov.querySelector('#modal-cancel');
  if (cancel) cancel.addEventListener('click', done);
  const form = ov.querySelector('#modal-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (opts.hideFooter) return;
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
    // checkboxes: FormData only includes checked ones
    form.querySelectorAll('input[type=checkbox]').forEach(cb => { data[cb.name] = cb.checked; });
    if (opts.onSubmit) opts.onSubmit(data, form);
  });
  const first = ov.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return ov;
}
function closeModal() {
  const ov = document.getElementById('modal-overlay');
  if (ov) ov.remove();
}
function confirmModal(title, message, okLabel, onYes) {
  openModal(title, '<p class="confirm-msg">' + esc(message) + '</p>', {
    okLabel: okLabel || 'Delete',
    onSubmit: () => { closeModal(); onYes(); }
  });
}

/* ---- form field builders ---- */
function field(label, inner, hint) {
  return '<label class="field"><span class="field-label">' + esc(label) + '</span>' + inner +
    (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>';
}
function input(name, value, attrs) {
  return '<input class="input" name="' + esc(name) + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '>';
}
function select(name, options, value, attrs) {
  const opts = options.map(o =>
    '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + esc(o.label) + '</option>'
  ).join('');
  return '<select class="input" name="' + esc(name) + '" ' + (attrs || '') + '>' + opts + '</select>';
}
function textarea(name, value, attrs) {
  return '<textarea class="input" name="' + esc(name) + '" ' + (attrs || '') + '>' + esc(value == null ? '' : value) + '</textarea>';
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg || 'Copied to clipboard');
    return true;
  } catch (e) {
    // fallback for non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg || 'Copied to clipboard'); }
    catch (e2) { toast('Copy failed — select the text manually'); }
    ta.remove();
    return false;
  }
}

window.RC = window.RC || {};
Object.assign(window.RC, { uid, esc, toCents, fmtMoney, todayStr, parseYMD, validDate, monthKeyOf, monthLabel, shortDate, addDays, lastDayOfMonth, dueDateForMonth, digitsOnly, displayFirstName, toast, openModal, closeModal, confirmModal, field, input, select, textarea, copyText });
