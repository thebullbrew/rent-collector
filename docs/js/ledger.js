/* Rent Collector — ledger.js : charges, payments, reports, settings */
'use strict';

const R2 = window.RC;
let chargeFilter = 'unpaid';

/* ================= CHARGES ================= */
function vCharges() {
  const all = Store.get().charges.slice().sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
  const list = all.filter(c => {
    if (chargeFilter === 'all') return true;
    if (chargeFilter === 'paid') return c.status === 'paid' || c.status === 'waived';
    if (chargeFilter === 'overdue') return Store.isOverdue(c);
    return c.status === 'unpaid' || c.status === 'partial';
  });
  const total = list.filter(c => c.status !== 'waived').reduce((s, c) => s + Store.chargeBalance(c), 0);

  let html = '<h1 class="page-title">Charges</h1>' +
    '<div class="toolbar">' +
      R2.select('f', [
        { value: 'unpaid', label: 'Open' }, { value: 'overdue', label: 'Overdue' },
        { value: 'paid', label: 'Paid / waived' }, { value: 'all', label: 'All' }
      ], chargeFilter, 'id="charge-filter" style="max-width:170px"') +
      '<button class="btn btn-gold btn-sm" id="btn-add-charge">+ Charge</button>' +
      '<button class="btn btn-ghost btn-sm" id="btn-fees2">Apply late fees</button>' +
    '</div>' +
    '<div class="card"><div class="muted">Showing ' + list.length + ' · open balance <b style="color:var(--oxblood)">' + R2.fmtMoney(total) + '</b></div></div>';

  if (!list.length) html += emptyState('🧾', 'Nothing here.');
  list.slice(0, 80).forEach(c => {
    const t = Store.tenant(c.tenantId);
    const bal = Store.chargeBalance(c);
    html += '<div class="list-item" data-charge="' + c.id + '" style="cursor:pointer">' +
      '<div class="grow"><div class="title">' + R2.esc(c.label) + '</div>' +
      '<div class="sub">' + R2.esc(t ? t.name : '—') + ' · due ' + R2.shortDate(c.dueDate) + '</div>' +
      '<div style="margin-top:4px">' + typeBadge(c.type) + ' ' + chargeBadge(c) + '</div></div>' +
      '<div class="amt">' + R2.fmtMoney(bal) + (bal !== c.amount && c.status !== 'waived' ? '<div class="sub">of ' + R2.fmtMoney(c.amount) + '</div>' : '') + '</div></div>';
  });
  if (list.length > 80) html += '<div class="card"><div class="muted">Showing first 80 — use filters to narrow.</div></div>';

  bind(html, () => {
    document.getElementById('charge-filter').onchange = (e) => { chargeFilter = e.target.value; App.rerender(); };
    document.getElementById('btn-add-charge').onclick = () => chargeForm(null);
    document.getElementById('btn-fees2').onclick = () => {
      const r = Store.applyLateFees();
      R2.toast(r.created ? r.created + ' late fee' + (r.created > 1 ? 's' : '') + ' applied' : 'No overdue charges needing fees');
      App.rerender();
    };
    document.querySelectorAll('[data-charge]').forEach(el => el.onclick = () => chargeDetail(el.getAttribute('data-charge')));
  });
  return html;
}

function chargeForm(c, presetTenantId) {
  const tenants = Store.get().tenants.filter(t => t.status === 'active');
  if (!tenants.length) { R2.toast('Add a tenant first'); return; }
  R2.openModal(c ? 'Edit charge' : 'New charge',
    R2.field('Tenant', R2.select('tenantId', tenants.map(t => ({ value: t.id, label: t.name })), c ? c.tenantId : (presetTenantId || ''))) +
    R2.field('Label', R2.input('label', c ? c.label : '', 'required maxlength="80" placeholder="October 2026 rent"')) +
    '<div class="form-row">' +
      R2.field('Amount', R2.input('amount', c ? (c.amount / 100).toFixed(2) : '', 'required inputmode="decimal"')) +
      R2.field('Due date', R2.input('dueDate', c ? c.dueDate : R2.todayStr(), 'required type="date"')) +
    '</div>' +
    R2.field('Type', R2.select('type', [
      { value: 'rent', label: 'Rent' }, { value: 'late_fee', label: 'Late fee' },
      { value: 'utility', label: 'Utility' }, { value: 'other', label: 'Other' }
    ], c ? c.type : 'rent')),
    {
      onSubmit: (d) => {
        const cents = R2.toCents(d.amount);
        if (!d.label) { R2.toast('Label is required'); return; }
        if (cents === null || cents <= 0) { R2.toast('Enter a valid amount'); return; }
        if (!R2.validDate(d.dueDate)) { R2.toast('Enter a valid due date'); return; }
        const t = Store.tenant(d.tenantId);
        if (!t) { R2.toast('Pick a tenant'); return; }
        const db = Store.get();
        if (c) Object.assign(c, { tenantId: d.tenantId, unitId: t.unitId, label: d.label, amount: cents, dueDate: d.dueDate, type: d.type });
        else db.charges.push({ id: R2.uid(), tenantId: d.tenantId, unitId: t.unitId, label: d.label, amount: cents, dueDate: d.dueDate, status: 'unpaid', type: d.type, createdAt: new Date().toISOString() });
        if (c) Store.refreshChargeStatus(c);
        Store.save(); R2.closeModal(); R2.toast('Charge saved'); App.rerender();
      }
    });
}

function chargeDetail(id) {
  const c = Store.charge(id);
  if (!c) return;
  const t = Store.tenant(c.tenantId);
  const pays = Store.paymentsOfCharge(c.id);
  const bal = Store.chargeBalance(c);
  let body = '<div class="card">' +
    kv('Tenant', t ? R2.esc(t.name) : '—') + kv('Label', R2.esc(c.label)) +
    kv('Amount', R2.fmtMoney(c.amount)) + kv('Due', R2.shortDate(c.dueDate)) +
    kv('Status', typeBadge(c.type) + ' ' + chargeBadge(c)) +
    kv('<b>Balance</b>', '<b>' + R2.fmtMoney(bal) + '</b>') + '</div>';
  body += '<div class="section-head"><h3>Payments (' + pays.length + ')</h3></div>';
  if (!pays.length) body += '<div class="card"><div class="muted">No payments recorded.</div></div>';
  pays.forEach(p => {
    body += '<div class="list-item" style="cursor:default"><div class="grow"><div class="title">' + R2.fmtMoney(p.amount) +
      ' <span class="badge method">' + R2.esc(methodLabel(p.method)) + '</span></div>' +
      '<div class="sub">' + R2.shortDate(p.date) + (p.reference ? ' · ref ' + R2.esc(p.reference) : '') + (p.note ? ' · ' + R2.esc(p.note) : '') + '</div></div>' +
      '<div><button class="btn btn-danger btn-sm" data-pay-del="' + p.id + '">✕</button></div></div>';
  });
  body += '<div class="row-actions" style="margin-top:12px">' +
    (bal > 0 && c.status !== 'waived' ? '<button class="btn btn-gold btn-sm" id="cd-pay">Record payment</button>' : '') +
    (c.status !== 'waived' && c.status !== 'paid' ? '<button class="btn btn-ghost btn-sm" id="cd-waive">Waive</button>' : '') +
    (Store.isOverdue(c) ? '<button class="btn btn-ghost btn-sm" id="cd-remind">Copy reminder text</button>' : '') +
    '<button class="btn btn-ghost btn-sm" id="cd-edit">Edit</button>' +
    '<button class="btn btn-danger btn-sm" id="cd-del">Delete</button></div>';

  R2.openModal(c.label, body, {
    hideFooter: true,
    onSubmit: null
  });
  document.querySelectorAll('[data-pay-del]').forEach(b => b.onclick = () => {
    R2.confirmModal('Delete payment?', 'The charge balance will be recalculated.', 'Delete', () => {
      Store.deletePayment(b.getAttribute('data-pay-del'));
      R2.closeModal(); R2.toast('Payment deleted'); App.rerender();
    });
  });
  const q = (id2) => document.getElementById(id2);
  if (q('cd-pay')) q('cd-pay').onclick = () => { R2.closeModal(); paymentForm(c.id, c.tenantId); };
  if (q('cd-edit')) q('cd-edit').onclick = () => chargeForm(c);
  if (q('cd-del')) q('cd-del').onclick = () => {
    R2.confirmModal('Delete charge?', 'Its payments become unallocated (kept).', 'Delete', () => {
      const db = Store.get();
      db.payments.forEach(p => { if (p.chargeId === c.id) p.chargeId = null; });
      db.charges = db.charges.filter(x => x.id !== c.id);
      Store.save(); R2.closeModal(); R2.toast('Charge deleted'); App.rerender();
    });
  };
  if (q('cd-waive')) q('cd-waive').onclick = () => {
    R2.confirmModal('Waive this charge?', 'The balance will be forgiven.', 'Waive', () => {
      c.status = 'waived'; Store.save(); R2.closeModal(); R2.toast('Charge waived'); App.rerender();
    });
  };
  if (q('cd-remind')) q('cd-remind').onclick = () => {
    R2.copyText(reminderText(c), 'Reminder copied — paste into SMS');
  };
}

function reminderText(c) {
  const t = Store.tenant(c.tenantId);
  const s = Store.get().settings;
  const bal = Store.chargeBalance(c);
  const biz = s.businessName || 'your landlord';
  let msg = 'Hi ' + R2.displayFirstName(t ? t.name : '') + ', this is ' + biz +
    '. Your ' + c.label + ' of ' + R2.fmtMoney(bal) + ' was due ' + R2.shortDate(c.dueDate) +
    ' and is now past due. Please pay as soon as possible to avoid further late fees.';
  if (t && t.stripeLink) msg += ' Pay here: ' + t.stripeLink;
  return msg;
}

/* ================= PAYMENTS ================= */
const METHOD_OPTIONS = [
  { value: 'stripe', label: 'Stripe' }, { value: 'apple_pay', label: 'Apple Pay' },
  { value: 'zelle', label: 'Zelle' }, { value: 'venmo', label: 'Venmo' },
  { value: 'cashapp', label: 'Cash App' }, { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' }, { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' }
];

function paymentForm(chargeId, presetTenantId) {
  const tenants = Store.get().tenants.filter(t => t.status === 'active');
  if (!tenants.length) { R2.toast('Add a tenant first'); return; }
  const c = chargeId ? Store.charge(chargeId) : null;
  const tenantId = c ? c.tenantId : (presetTenantId || tenants[0].id);
  const openCharges = Store.chargesOfTenant(tenantId).filter(x => x.status !== 'waived' && x.status !== 'paid');
  const bal = c ? Store.chargeBalance(c) : 0;
  R2.openModal(c ? 'Record payment — ' + c.label : 'Record payment',
    R2.field('Tenant', R2.select('tenantId', tenants.map(t => ({ value: t.id, label: t.name })), tenantId, 'id="pay-tenant"')) +
    R2.field('Apply to', R2.select('chargeId', [{ value: '', label: 'Unallocated (general credit)' }].concat(
      openCharges.map(x => ({ value: x.id, label: x.label + ' — ' + R2.fmtMoney(Store.chargeBalance(x)) + ' due' }))
    ), chargeId || '', 'id="pay-charge"')) +
    '<div class="form-row">' +
      R2.field('Amount', R2.input('amount', bal ? (bal / 100).toFixed(2) : '', 'required inputmode="decimal" id="pay-amount"')) +
      R2.field('Date', R2.input('date', R2.todayStr(), 'required type="date"')) +
    '</div>' +
    '<div class="form-row">' +
      R2.field('Method', R2.select('method', METHOD_OPTIONS, 'zelle')) +
      R2.field('Reference', R2.input('reference', '', 'maxlength="60" placeholder="Txn / check #"')) +
    '</div>' +
    R2.field('Note', R2.input('note', '', 'maxlength="140"')),
    {
      okLabel: 'Record',
      onSubmit: (d) => {
        const cents = R2.toCents(d.amount);
        if (cents === null || cents <= 0) { R2.toast('Enter a valid amount'); return; }
        if (!R2.validDate(d.date)) { R2.toast('Enter a valid date'); return; }
        const target = d.chargeId ? Store.charge(d.chargeId) : null;
        if (target) {
          const tb = Store.chargeBalance(target);
          if (cents > tb) { R2.toast('Overpay — max is ' + R2.fmtMoney(tb)); return; }
        }
        Store.recordPayment({ chargeId: d.chargeId || null, tenantId: d.tenantId, amount: cents, date: d.date, method: d.method, reference: d.reference, note: d.note });
        R2.closeModal(); R2.toast('Payment recorded: ' + R2.fmtMoney(cents)); App.rerender();
      }
    });
  // refresh charge dropdown when tenant changes
  const tSel = document.getElementById('pay-tenant');
  if (tSel) tSel.onchange = () => {
    const tid = tSel.value;
    const cs = Store.chargesOfTenant(tid).filter(x => x.status !== 'waived' && x.status !== 'paid');
    const cSel = document.getElementById('pay-charge');
    cSel.innerHTML = '<option value="">Unallocated (general credit)</option>' +
      cs.map(x => '<option value="' + x.id + '">' + R2.esc(x.label + ' — ' + R2.fmtMoney(Store.chargeBalance(x)) + ' due') + '</option>').join('');
  };
}

function vPayments() {
  const pays = Store.get().payments.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const ym = R2.monthKeyOf(R2.todayStr());
  const monthTotal = pays.filter(p => R2.monthKeyOf(p.date) === ym).reduce((s, p) => s + p.amount, 0);
  let html = '<h1 class="page-title">Payments</h1>' +
    '<div class="row-actions"><button class="btn btn-gold" id="btn-add-pay">+ Record payment</button></div>' +
    '<div class="card"><div class="muted">Collected in ' + R2.monthLabel(ym) + ': <b style="color:var(--ok)">' + R2.fmtMoney(monthTotal) + '</b> · ' + pays.length + ' payments total</div></div>';
  if (!pays.length) html += emptyState('💵', 'No payments recorded yet.');
  pays.slice(0, 60).forEach(p => {
    const t = Store.tenant(p.tenantId);
    const c = p.chargeId ? Store.charge(p.chargeId) : null;
    html += '<div class="list-item" style="cursor:default"><div class="grow">' +
      '<div class="title">' + R2.fmtMoney(p.amount) + ' <span class="badge method">' + R2.esc(methodLabel(p.method)) + '</span></div>' +
      '<div class="sub">' + R2.esc(t ? t.name : '—') + ' · ' + R2.shortDate(p.date) +
      (c ? ' · ' + R2.esc(c.label) : ' · unallocated') +
      (p.reference ? ' · ref ' + R2.esc(p.reference) : '') + (p.note ? ' · ' + R2.esc(p.note) : '') + '</div></div>' +
      '<div><button class="btn btn-danger btn-sm" data-pay-del2="' + p.id + '">✕</button></div></div>';
  });
  bind(html, () => {
    document.getElementById('btn-add-pay').onclick = () => paymentForm(null, null);
    document.querySelectorAll('[data-pay-del2]').forEach(b => b.onclick = () => {
      R2.confirmModal('Delete payment?', 'The charge balance will be recalculated.', 'Delete', () => {
        Store.deletePayment(b.getAttribute('data-pay-del2'));
        R2.toast('Payment deleted'); App.rerender();
      });
    });
  });
  return html;
}

/* ================= REPORTS ================= */
let reportMonth = R2.monthKeyOf(R2.todayStr());
function vReports() {
  const r = Store.monthlyReport(reportMonth);
  const props = Store.get().properties;
  let html = '<h1 class="page-title">Reports</h1>' +
    '<div class="toolbar"><input class="input" type="month" id="rep-month" value="' + reportMonth + '" style="max-width:200px">' +
    '<button class="btn btn-ghost btn-sm" id="btn-csv">Export CSV</button></div>';

  html += '<div class="card"><h3>' + R2.monthLabel(reportMonth) + ' — collections</h3>' +
    kv('Rent expected', R2.fmtMoney(r.expected)) +
    kv('Collected', '<b style="color:var(--ok)">' + R2.fmtMoney(r.collected) + '</b>') +
    kv('<b>Outstanding</b>', '<b style="color:var(--oxblood)">' + R2.fmtMoney(r.outstanding) + '</b>') +
    kv('Charges issued', String(r.chargeCount)) +
    kv('Collection rate', r.expected > 0 ? Math.round(Math.min(100, r.collected / r.expected * 100)) + '%' : '—') +
    '</div>';

  html += '<div class="card"><h3>Per-property P&amp;L — ' + R2.monthLabel(reportMonth) + '</h3>';
  if (!props.length) html += '<div class="muted">No properties.</div>';
  let tC = 0, tE = 0;
  props.forEach(p => {
    const pl = Store.propertyPL(p.id, reportMonth);
    tC += pl.collected; tE += pl.expenses;
    html += kv(R2.esc(p.name) + sampleTag(p),
      R2.fmtMoney(pl.collected) + ' − ' + R2.fmtMoney(pl.expenses) + ' = <b>' + R2.fmtMoney(pl.net) + '</b>');
  });
  html += '<hr class="divider">' + kv('<b>Portfolio net</b>', '<b>' + R2.fmtMoney(tC - tE) + '</b>') + '</div>';

  bind(html, () => {
    document.getElementById('rep-month').onchange = (e) => { reportMonth = e.target.value || reportMonth; App.rerender(); };
    document.getElementById('btn-csv').onclick = () => exportCSV(reportMonth);
  });
  return html;
}

function exportCSV(ym) {
  const db = Store.get();
  const rows = [['Type', 'Date', 'Tenant', 'Property/Unit', 'Label', 'Amount', 'Method/Status']];
  db.charges.filter(c => R2.monthKeyOf(c.dueDate) === ym).forEach(c => {
    const t = Store.tenant(c.tenantId);
    rows.push(['Charge', c.dueDate, t ? t.name : '', Store.unitLabel(c.unitId), c.label, (c.amount / 100).toFixed(2), c.status]);
  });
  db.payments.filter(p => R2.monthKeyOf(p.date) === ym).forEach(p => {
    const t = Store.tenant(p.tenantId);
    rows.push(['Payment', p.date, t ? t.name : '', '', p.note || '', (p.amount / 100).toFixed(2), methodLabel(p.method)]);
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rent-report-' + ym + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  R2.toast('CSV downloaded');
}

/* ================= SETTINGS ================= */
function vSettings() {
  const s = Store.get().settings;
  const hasSample = Store.get().properties.some(p => String(p.id).startsWith('sample-'));
  let html = '<h1 class="page-title">Settings</h1>' +
    '<div class="card"><h3>Business</h3>' +
    R2.field('Business name', R2.input('businessName', s.businessName, 'maxlength="80" placeholder="Demo Properties LLC"'), 'Used in reminder texts and the portal.') +
    R2.field('App title', R2.input('logoTitle', s.logoTitle, 'maxlength="40"'), 'Shown in the header.') +
    R2.field('Currency', R2.select('currency', [
      { value: 'USD', label: 'USD — US Dollar' }, { value: 'EUR', label: 'EUR — Euro' },
      { value: 'GBP', label: 'GBP — British Pound' }, { value: 'CAD', label: 'CAD — Canadian Dollar' }
    ], s.currency)) +
    '<button class="btn btn-green" id="btn-save-biz">Save</button></div>';

  html += '<div class="card"><h3>Late-fee policy</h3>' +
    '<div class="form-row">' +
    R2.field('Grace days', R2.input('graceDays', s.graceDays, 'inputmode="numeric" min="0" max="30"'), 'Days after due date before a charge counts as overdue.') +
    R2.field('Fee type', R2.select('lateFeeType', [{ value: 'flat', label: 'Flat amount' }, { value: 'percent', label: '% of balance' }], s.lateFeeType)) +
    '</div>' +
    R2.field('Fee amount', R2.input('lateFeeAmount', s.lateFeeAmount, 'inputmode="decimal"'), 'Dollars for flat (e.g. 50), or percent (e.g. 5).') +
    '<button class="btn btn-green" id="btn-save-fees">Save policy</button></div>';

  html += '<div class="card"><h3>Collecting online payments</h3>' +
    '<div class="muted" style="font-size:13.5px;line-height:1.6">' +
    'Rent Collector does not move money itself — it records what you collect. To let tenants pay online:<br><br>' +
    '1. Create a free account at <b>stripe.com</b>.<br>' +
    '2. In the Stripe dashboard go to <b>Payments → Payment Links → Create payment link</b>.<br>' +
    '3. Set the amount (one link per rent amount, e.g. one $1,450 link reused for every tenant paying $1,450).<br>' +
    '4. Copy the link and paste it into the tenant’s <b>Stripe payment link</b> field (Tenants → edit).<br><br>' +
    'The tenant’s portal “Pay rent” button then opens your Stripe checkout. Apple Pay works automatically on Stripe links for tenants on iPhone — no extra setup. ' +
    'When money lands in Stripe, record it here with method “Stripe”. Bank transfers (ACH) are cheaper than cards in Stripe — check their pricing for your volume.' +
    '</div></div>';

  html += '<div class="card"><h3>Data</h3><div class="row-actions">' +
    '<button class="btn btn-ghost btn-sm" id="btn-export">Export JSON</button>' +
    '<button class="btn btn-ghost btn-sm" id="btn-import">Import JSON</button>' +
    '<input type="file" id="import-file" accept="application/json" style="display:none">' +
    (hasSample ? '<button class="btn btn-ghost btn-sm" id="btn-desample">Remove sample data</button>' : '') +
    '</div><div class="muted" style="font-size:13px">All data lives on this device only. Export regularly as backup.</div></div>';

  html += '<div class="danger-zone"><h3>Danger zone</h3>' +
    '<div class="muted" style="margin-bottom:10px;font-size:13px">Reset wipes everything and starts fresh with sample data.</div>' +
    '<button class="btn btn-danger btn-sm" id="btn-reset">Reset all data</button></div>';

  bind(html, () => {
    document.getElementById('btn-save-biz').onclick = () => {
      const v = (n) => document.querySelector('[name=' + n + ']').value.trim();
      const st = Store.get().settings;
      st.businessName = v('businessName'); st.logoTitle = v('logoTitle') || 'Rent Collector'; st.currency = v('currency');
      Store.save(); R2.toast('Saved'); App.rerender();
    };
    document.getElementById('btn-save-fees').onclick = () => {
      const v = (n) => document.querySelector('[name=' + n + ']').value.trim();
      const st = Store.get().settings;
      const g = Math.max(0, Math.min(30, parseInt(v('graceDays'), 10) || 0));
      const amt = v('lateFeeAmount');
      if (R2.toCents(st.lateFeeType === 'flat' ? amt : '1') === null && st.lateFeeType === 'flat') { R2.toast('Enter a valid fee'); return; }
      if (isNaN(Number(amt)) || Number(amt) < 0) { R2.toast('Enter a valid fee'); return; }
      st.graceDays = g; st.lateFeeType = v('lateFeeType'); st.lateFeeAmount = amt;
      Store.save(); R2.toast('Policy saved'); App.rerender();
    };
    document.getElementById('btn-export').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rent-collector-backup-' + R2.todayStr() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      R2.toast('Backup downloaded');
    };
    document.getElementById('btn-import').onclick = () => document.getElementById('import-file').click();
    document.getElementById('import-file').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { Store.importJSON(rd.result); R2.toast('Backup imported'); App.rerender(); }
        catch (err) { R2.toast('Import failed: ' + err.message); }
      };
      rd.readAsText(f);
    };
    const ds = document.getElementById('btn-desample');
    if (ds) ds.onclick = () => {
      R2.confirmModal('Remove sample data?', 'All SAMPLE properties, tenants, charges and payments will be deleted.', 'Remove', () => {
        R2.removeSampleData(Store.get()); Store.save(); R2.toast('Sample data removed'); App.rerender();
      });
    };
    document.getElementById('btn-reset').onclick = () => {
      R2.confirmModal('Reset everything?', 'All data will be wiped and sample data restored. This cannot be undone.', 'Reset', () => {
        localStorage.removeItem(R2.DB_KEY); Store._db = null; Store.get();
        R2.toast('Reset complete'); location.hash = '#/'; App.rerender();
      });
    };
  });
  return html;
}
