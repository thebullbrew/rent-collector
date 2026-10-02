/* Rent Collector — views.js : dashboard, properties, tenants */
'use strict';

const R = window.RC;

function chargeBadge(c) {
  if (Store.isOverdue(c)) return '<span class="badge overdue">Overdue</span>';
  return '<span class="badge ' + R.esc(c.status) + '">' + R.esc(c.status) + '</span>';
}
function typeBadge(t) {
  return '<span class="badge ' + R.esc(t) + '">' + R.esc(String(t).replace('_', ' ')) + '</span>';
}
function sampleTag(o) {
  return String(o.id || '').startsWith('sample-') ? ' <span class="sample-tag">Sample</span>' : '';
}
function backTo(hash, label) {
  return '<a class="back-link" href="' + hash + '">&larr; ' + R.esc(label) + '</a>';
}

/* ================= DASHBOARD ================= */
function vDashboard() {
  const d = Store.dashboard();
  const s = Store.get().settings;
  let html = '<h1 class="page-title">Dashboard</h1>';
  html += '<div class="stat-grid">' +
    statCard('Collected · ' + R.monthLabel(d.month), R.fmtMoney(d.collected), 'good') +
    statCard('Outstanding', R.fmtMoney(d.outstanding), d.outstanding > 0 ? 'alert' : '') +
    statCard('Overdue charges', String(d.overdueCount), d.overdueCount > 0 ? 'alert' : '') +
    statCard('Occupancy', d.occupancy + '%', '') +
  '</div>';

  html += '<div class="row-actions">' +
    '<button class="btn btn-gold" id="btn-gen">' + (d.month ? 'Generate ' + R.monthLabel(d.month) + ' rent' : 'Generate rent charges') + '</button>' +
    '<button class="btn btn-ghost" id="btn-fees">Apply late fees</button>' +
  '</div>';

  if (d.overdueTenants.length) {
    html += '<div class="section-head"><h3>Needs attention</h3></div>';
    d.overdueTenants.forEach(o => {
      const t = Store.tenant(o.tenantId);
      if (!t) return;
      const bal = Store.tenantBalance(o.tenantId);
      html += '<button class="list-item" data-go="#/tenants/' + t.id + '">' +
        '<div class="grow"><div class="title">' + R.esc(t.name) + sampleTag(t) + '</div>' +
        '<div class="sub">' + R.esc(Store.unitLabel(t.unitId)) + ' · overdue balance</div></div>' +
        '<div class="amt" style="color:var(--oxblood)">' + R.fmtMoney(bal) + '</div></button>';
    });
  } else {
    html += '<div class="card"><div class="muted" style="text-align:center">All caught up — no overdue charges. 🎉</div></div>';
  }

  const props = Store.get().properties;
  if (props.length) {
    html += '<div class="section-head"><h3>Properties</h3></div>';
    props.forEach(p => {
      const units = Store.unitsOf(p.id);
      const occ = units.filter(u => Store.tenantsOfUnit(u.id).length > 0).length;
      const pl = Store.propertyPL(p.id, d.month);
      html += '<button class="list-item" data-go="#/properties/' + p.id + '">' +
        '<div class="grow"><div class="title">' + R.esc(p.name) + sampleTag(p) + '</div>' +
        '<div class="sub">' + occ + '/' + units.length + ' occupied · collected ' + R.fmtMoney(pl.collected) + '</div></div>' +
        '<div class="amt">' + R.fmtMoney(pl.net) + '</div></button>';
    });
  }
  bind(html, () => {
    const g = document.getElementById('btn-gen');
    if (g) g.onclick = () => {
      const r = Store.generateMonthlyCharges();
      R.toast(r.created ? r.created + ' charge' + (r.created > 1 ? 's' : '') + ' created' : 'Already generated — nothing new');
      App.rerender();
    };
    const f = document.getElementById('btn-fees');
    if (f) f.onclick = () => {
      const r = Store.applyLateFees();
      R.toast(r.created ? r.created + ' late fee' + (r.created > 1 ? 's' : '') + ' applied' : 'No overdue charges needing fees');
      App.rerender();
    };
  });
  return html;
}
function statCard(k, v, cls) {
  return '<div class="stat ' + (cls || '') + '"><div class="k">' + R.esc(k) + '</div><div class="v">' + R.esc(v) + '</div></div>';
}
function bind(html, fn) { setTimeout(fn, 0); document.querySelectorAll('[data-go]').forEach(el => { el.onclick = () => location.hash = el.getAttribute('data-go'); }); return html; }

/* ================= PROPERTIES ================= */
function vProperties() {
  const props = Store.get().properties;
  let html = '<h1 class="page-title">Properties</h1>' +
    '<div class="row-actions"><button class="btn btn-gold" id="btn-add-prop">+ Add property</button></div>';
  if (!props.length) html += emptyState('🏠', 'No properties yet. Add your first one to start tracking rent.');
  props.forEach(p => {
    const units = Store.unitsOf(p.id);
    const occ = units.filter(u => Store.tenantsOfUnit(u.id).length > 0).length;
    html += '<button class="list-item" data-go="#/properties/' + p.id + '">' +
      '<div class="grow"><div class="title">' + R.esc(p.name) + sampleTag(p) + '</div>' +
      '<div class="sub">' + R.esc(p.address || 'No address') + ' · ' + units.length + ' unit' + (units.length === 1 ? '' : 's') + ' · ' + occ + ' occupied</div></div>' +
      '<div class="amt">›</div></button>';
  });
  bind(html, () => {
    document.getElementById('btn-add-prop').onclick = () => propertyForm(null);
  });
  return html;
}

function propertyForm(p) {
  R.openModal(p ? 'Edit property' : 'Add property',
    R.field('Name', R.input('name', p ? p.name : '', 'required maxlength="80" placeholder="Maple Street Duplex"')) +
    R.field('Address', R.input('address', p ? p.address : '', 'maxlength="140"')) +
    R.field('Type', R.select('type', [{ value: 'single', label: 'Single-family' }, { value: 'multi', label: 'Multi-unit' }], p ? p.type : 'multi')) +
    R.field('Notes', R.textarea('notes', p ? p.notes : '', 'rows="2"')),
    {
      onSubmit: (d) => {
        if (!d.name) { R.toast('Name is required'); return; }
        const db = Store.get();
        if (p) Object.assign(p, { name: d.name, address: d.address, type: d.type, notes: d.notes });
        else db.properties.push({ id: R.uid(), name: d.name, address: d.address, type: d.type, notes: d.notes });
        Store.save(); R.closeModal(); R.toast('Property saved'); App.rerender();
      }
    });
}

function vPropertyDetail(id) {
  const p = Store.property(id);
  if (!p) return '<p class="empty">Property not found.</p>';
  const units = Store.unitsOf(id);
  const d = Store.dashboard();
  const pl = Store.propertyPL(id, d.month);
  let html = backTo('#/properties', 'Properties') +
    '<div class="row-actions" style="justify-content:space-between;align-items:center">' +
      '<h1 class="page-title" style="margin:0">' + R.esc(p.name) + sampleTag(p) + '</h1>' +
      '<button class="btn btn-ghost btn-sm" id="btn-edit-prop">Edit</button></div>' +
    '<div class="card">' +
      kv('Address', p.address || '—') + kv('Type', p.type === 'single' ? 'Single-family' : 'Multi-unit') +
      (p.notes ? kv('Notes', p.notes) : '') +
      '<hr class="divider">' +
      kv('Collected · ' + R.monthLabel(d.month), R.fmtMoney(pl.collected)) +
      kv('Expenses · ' + R.monthLabel(d.month), R.fmtMoney(pl.expenses)) +
      kv('<b>Net</b>', '<b>' + R.fmtMoney(pl.net) + '</b>') +
    '</div>';

  html += '<div class="section-head"><h3>Units (' + units.length + ')</h3><button class="btn btn-gold btn-sm" id="btn-add-unit">+ Unit</button></div>';
  if (!units.length) html += emptyState('🚪', 'No units yet.');
  units.forEach(u => {
    const tenants = Store.tenantsOfUnit(u.id);
    const t = tenants[0];
    html += '<div class="list-item" style="cursor:default">' +
      '<div class="grow"><div class="title">' + R.esc(u.label) + ' <span class="badge ' + (t ? 'occupied' : 'vacant') + '">' + (t ? 'Occupied' : 'Vacant') + '</span></div>' +
      '<div class="sub">' + (u.beds || '—') + ' bd · ' + (u.baths || '—') + ' ba · rent ' + R.fmtMoney(u.rent) +
      (t ? ' · ' + R.esc(t.name) : '') + '</div></div>' +
      '<div><button class="btn btn-ghost btn-sm" data-unit-edit="' + u.id + '">Edit</button></div></div>';
  });

  const expenses = Store.expensesOfProperty(id);
  html += '<div class="section-head"><h3>Expenses</h3><button class="btn btn-gold btn-sm" id="btn-add-exp">+ Expense</button></div>';
  if (!expenses.length) html += '<div class="card"><div class="muted">No expenses recorded.</div></div>';
  expenses.slice(0, 20).forEach(e => {
    html += '<div class="list-item" style="cursor:default"><div class="grow"><div class="title">' + R.esc(e.category) +
      '</div><div class="sub">' + R.shortDate(e.date) + (e.note ? ' · ' + R.esc(e.note) : '') + '</div></div>' +
      '<div class="amt">' + R.fmtMoney(e.amount) + '</div>' +
      '<div><button class="btn btn-danger btn-sm" data-exp-del="' + e.id + '">✕</button></div></div>';
  });

  html += '<div class="danger-zone"><h3>Danger zone</h3><button class="btn btn-danger btn-sm" id="btn-del-prop">Delete property</button></div>';

  bind(html, () => {
    document.getElementById('btn-edit-prop').onclick = () => propertyForm(p);
    document.getElementById('btn-add-unit').onclick = () => unitForm(p, null);
    document.getElementById('btn-add-exp').onclick = () => expenseForm(p, null);
    document.querySelectorAll('[data-unit-edit]').forEach(b => b.onclick = (e) => { e.stopPropagation(); unitForm(p, Store.unit(b.getAttribute('data-unit-edit'))); });
    document.querySelectorAll('[data-exp-del]').forEach(b => b.onclick = () => {
      R.confirmModal('Delete expense?', 'This expense will be removed.', 'Delete', () => {
        const db = Store.get();
        db.expenses = db.expenses.filter(x => x.id !== b.getAttribute('data-exp-del'));
        Store.save(); R.toast('Expense deleted'); App.rerender();
      });
    });
    document.getElementById('btn-del-prop').onclick = () => {
      const unitIds = Store.unitsOf(p.id).map(u => u.id);
      const hasTenants = Store.get().tenants.some(t => unitIds.includes(t.unitId));
      if (hasTenants) { R.toast('Move or remove tenants first'); return; }
      R.confirmModal('Delete property?', '“' + p.name + '” and its units and expenses will be removed. Charges and payments are kept for records.', 'Delete', () => {
        const db = Store.get();
        db.properties = db.properties.filter(x => x.id !== p.id);
        db.units = db.units.filter(u => u.propertyId !== p.id);
        db.expenses = db.expenses.filter(x => x.propertyId !== p.id);
        Store.save(); location.hash = '#/properties'; R.toast('Property deleted');
      });
    };
  });
  return html;
}

function kv(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

function unitForm(p, u) {
  R.openModal(u ? 'Edit unit' : 'Add unit — ' + p.name,
    R.field('Label', R.input('label', u ? u.label : '', 'required maxlength="40" placeholder="Unit A"')) +
    '<div class="form-row">' +
      R.field('Beds', R.input('beds', u ? u.beds : '', 'inputmode="numeric" placeholder="2"')) +
      R.field('Baths', R.input('baths', u ? u.baths : '', 'inputmode="decimal" placeholder="1"')) +
    '</div>' +
    R.field('Monthly rent', R.input('rent', u ? (u.rent / 100).toFixed(2) : '', 'required inputmode="decimal" placeholder="1450.00"'), 'Numbers only, e.g. 1450.00'),
    {
      onSubmit: (d) => {
        const cents = R.toCents(d.rent);
        if (!d.label) { R.toast('Label is required'); return; }
        if (cents === null || cents < 0) { R.toast('Enter a valid rent amount'); return; }
        const db = Store.get();
        if (u) Object.assign(u, { label: d.label, beds: d.beds, baths: d.baths, rent: cents });
        else db.units.push({ id: R.uid(), propertyId: p.id, label: d.label, beds: d.beds, baths: d.baths, rent: cents, status: 'vacant' });
        Store.save(); R.closeModal(); R.toast('Unit saved'); App.rerender();
      }
    });
}

const EXP_CATS = ['Repairs', 'Insurance', 'Taxes', 'Utilities', 'HOA', 'Management', 'Mortgage', 'Other'];
function expenseForm(p, e) {
  R.openModal(e ? 'Edit expense' : 'Add expense — ' + p.name,
    R.field('Category', R.select('category', EXP_CATS.map(c => ({ value: c, label: c })), e ? e.category : 'Repairs')) +
    '<div class="form-row">' +
      R.field('Amount', R.input('amount', e ? (e.amount / 100).toFixed(2) : '', 'required inputmode="decimal" placeholder="250.00"')) +
      R.field('Date', R.input('date', e ? e.date : R.todayStr(), 'required type="date"')) +
    '</div>' +
    R.field('Note', R.input('note', e ? e.note : '', 'maxlength="140"')),
    {
      onSubmit: (d) => {
        const cents = R.toCents(d.amount);
        if (cents === null || cents < 0) { R.toast('Enter a valid amount'); return; }
        if (!R.validDate(d.date)) { R.toast('Enter a valid date'); return; }
        const db = Store.get();
        if (e) Object.assign(e, { category: d.category, amount: cents, date: d.date, note: d.note });
        else db.expenses.push({ id: R.uid(), propertyId: p.id, date: d.date, category: d.category, amount: cents, note: d.note });
        Store.save(); R.closeModal(); R.toast('Expense saved'); App.rerender();
      }
    });
}

function emptyState(ico, msg) {
  return '<div class="empty"><span class="big">' + ico + '</span>' + R.esc(msg) + '</div>';
}

/* ================= TENANTS ================= */
function vTenants() {
  const tenants = Store.get().tenants.slice().sort((a, b) => a.name.localeCompare(b.name));
  let html = '<h1 class="page-title">Tenants</h1>' +
    '<div class="row-actions"><button class="btn btn-gold" id="btn-add-tenant">+ Add tenant</button></div>';
  if (!tenants.length) html += emptyState('🧑‍🌾', 'No tenants yet.');
  tenants.forEach(t => {
    const bal = Store.tenantBalance(t.id);
    const overdue = Store.chargesOfTenant(t.id).some(c => Store.isOverdue(c));
    html += '<button class="list-item" data-go="#/tenants/' + t.id + '">' +
      '<div class="grow"><div class="title">' + R.esc(t.name) + sampleTag(t) +
      (t.status === 'past' ? ' <span class="badge waived">Past</span>' : '') + '</div>' +
      '<div class="sub">' + R.esc(Store.unitLabel(t.unitId)) + ' · ' + R.fmtMoney(t.monthlyRent) + '/mo</div></div>' +
      (bal > 0 ? '<div class="amt" style="color:' + (overdue ? 'var(--oxblood)' : 'inherit') + '">' + R.fmtMoney(bal) + ' due</div>' : '<div class="amt" style="color:var(--ok)">✓</div>') +
      '</button>';
  });
  bind(html, () => { document.getElementById('btn-add-tenant').onclick = () => tenantForm(null); });
  return html;
}

function unitOptions(selected) {
  return Store.get().units.map(u => {
    const p = Store.property(u.propertyId);
    return { value: u.id, label: (p ? p.name + ' · ' : '') + u.label };
  });
}

function tenantForm(t) {
  const units = Store.get().units;
  if (!units.length && !t) { R.toast('Add a property and unit first'); location.hash = '#/properties'; return; }
  R.openModal(t ? 'Edit tenant' : 'Add tenant',
    R.field('Full name', R.input('name', t ? t.name : '', 'required maxlength="80"')) +
    '<div class="form-row">' +
      R.field('Phone', R.input('phone', t ? t.phone : '', 'required inputmode="tel" placeholder="(555) 123-4567"')) +
      R.field('Email', R.input('email', t ? t.email : '', 'type="email" placeholder="name@mail.com"')) +
    '</div>' +
    R.field('Unit', R.select('unitId', unitOptions(), t ? t.unitId : ''), 'Phone + PIN is how they log into the tenant portal.') +
    '<div class="form-row">' +
      R.field('Lease start', R.input('leaseStart', t ? t.leaseStart : '', 'type="date"')) +
      R.field('Lease end', R.input('leaseEnd', t ? t.leaseEnd : '', 'type="date"')) +
    '</div>' +
    '<div class="form-row">' +
      R.field('Monthly rent', R.input('monthlyRent', t ? (t.monthlyRent / 100).toFixed(2) : '', 'required inputmode="decimal"')) +
      R.field('Due day', R.input('dueDay', t ? t.dueDay : '1', 'required inputmode="numeric" min="1" max="31"')) +
    '</div>' +
    R.field('Security deposit', R.input('deposit', t ? (t.deposit / 100).toFixed(2) : '', 'inputmode="decimal"')) +
    R.field('Stripe payment link', R.input('stripeLink', t ? t.stripeLink : '', 'type="url" inputmode="url" placeholder="https://buy.stripe.com/..."'), 'Create at stripe.com → Payment Links, paste here. Tenants tap “Pay rent” to open it.') +
    R.field('Portal PIN', R.input('pin', t ? t.pin : R.genPin(), 'required inputmode="numeric" maxlength="10"'), 'Auto-generated. Tenant logs in with phone + this PIN.') +
    R.field('Status', R.select('status', [{ value: 'active', label: 'Active' }, { value: 'past', label: 'Past / moved out' }], t ? t.status : 'active')) +
    R.field('Notes', R.textarea('notes', t ? t.notes : '', 'rows="2"')),
    {
      onSubmit: (d) => {
        if (!d.name || !d.phone) { R.toast('Name and phone are required'); return; }
        const rent = R.toCents(d.monthlyRent);
        if (rent === null || rent < 0) { R.toast('Enter a valid rent'); return; }
        const dep = d.deposit ? R.toCents(d.deposit) : 0;
        if (dep === null || dep < 0) { R.toast('Enter a valid deposit'); return; }
        const dueDay = Math.min(31, Math.max(1, parseInt(d.dueDay, 10) || 1));
        if (!d.unitId) { R.toast('Pick a unit'); return; }
        if (d.leaseStart && !R.validDate(d.leaseStart)) { R.toast('Bad lease start date'); return; }
        if (d.leaseEnd && !R.validDate(d.leaseEnd)) { R.toast('Bad lease end date'); return; }
        if (d.stripeLink && !/^https?:\/\//i.test(d.stripeLink)) { R.toast('Payment link must start with http'); return; }
        const db = Store.get();
        // one active tenant per unit: mark others past when assigning an active tenant
        if (d.status === 'active') {
          db.tenants.forEach(x => { if (x.unitId === d.unitId && x.status === 'active' && (!t || x.id !== t.id)) x.status = 'past'; });
        }
        if (t) Object.assign(t, { name: d.name, phone: d.phone, email: d.email, unitId: d.unitId, leaseStart: d.leaseStart, leaseEnd: d.leaseEnd, monthlyRent: rent, dueDay, deposit: dep, stripeLink: d.stripeLink, pin: d.pin, status: d.status, notes: d.notes });
        else db.tenants.push({ id: R.uid(), name: d.name, phone: d.phone, email: d.email, unitId: d.unitId, leaseStart: d.leaseStart, leaseEnd: d.leaseEnd, monthlyRent: rent, dueDay, deposit: dep, stripeLink: d.stripeLink, pin: d.pin, status: d.status, notes: d.notes });
        Store.save(); R.closeModal(); R.toast('Tenant saved'); App.rerender();
      }
    });
}

function vTenantDetail(id) {
  const t = Store.tenant(id);
  if (!t) return '<p class="empty">Tenant not found.</p>';
  const charges = Store.chargesOfTenant(t.id);
  const payments = Store.paymentsOfTenant(t.id);
  const bal = Store.tenantBalance(t.id);
  let html = backTo('#/tenants', 'Tenants') +
    '<div class="row-actions" style="justify-content:space-between;align-items:center">' +
      '<h1 class="page-title" style="margin:0">' + R.esc(t.name) + sampleTag(t) + '</h1>' +
      '<button class="btn btn-ghost btn-sm" id="btn-edit-tenant">Edit</button></div>' +
    '<div class="card">' +
      kv('Unit', R.esc(Store.unitLabel(t.unitId))) +
      kv('Phone', R.esc(t.phone || '—')) + kv('Email', R.esc(t.email || '—')) +
      kv('Rent', R.fmtMoney(t.monthlyRent) + ' / mo, due day ' + t.dueDay) +
      kv('Lease', (t.leaseStart ? R.shortDate(t.leaseStart) : '—') + ' → ' + (t.leaseEnd ? R.shortDate(t.leaseEnd) : '—')) +
      kv('Deposit', R.fmtMoney(t.deposit)) +
      kv('Portal PIN', '<b>' + R.esc(t.pin) + '</b>') +
      kv('Pay link', t.stripeLink ? '✓ Set' : '<span style="color:var(--muted)">Not set</span>') +
      '<hr class="divider">' +
      kv('<b>Balance due</b>', '<b style="color:' + (bal > 0 ? 'var(--oxblood)' : 'var(--ok)') + '">' + R.fmtMoney(bal) + '</b>') +
    '</div>' +
    '<div class="row-actions">' +
      '<button class="btn btn-green btn-sm" id="btn-copy-portal">Copy portal login</button>' +
      '<button class="btn btn-ghost btn-sm" id="btn-record-pay">Record payment</button>' +
    '</div>';

  html += '<div class="section-head"><h3>Charges</h3></div>';
  if (!charges.length) html += '<div class="card"><div class="muted">No charges yet.</div></div>';
  charges.slice().reverse().forEach(c => {
    const cb = Store.chargeBalance(c);
    html += '<button class="list-item" data-go="#/charges">' +
      '<div class="grow"><div class="title">' + R.esc(c.label) + '</div>' +
      '<div class="sub">Due ' + R.shortDate(c.dueDate) + ' · ' + typeBadge(c.type) + ' ' + chargeBadge(c) + '</div></div>' +
      '<div class="amt">' + R.fmtMoney(cb) + (cb !== c.amount && cb > 0 ? '<div class="sub">of ' + R.fmtMoney(c.amount) + '</div>' : '') + '</div></button>';
  });

  html += '<div class="section-head"><h3>Payments</h3></div>';
  if (!payments.length) html += '<div class="card"><div class="muted">No payments yet.</div></div>';
  payments.slice(0, 15).forEach(p => {
    const c = p.chargeId ? Store.charge(p.chargeId) : null;
    html += '<div class="list-item" style="cursor:default"><div class="grow"><div class="title">' + R.fmtMoney(p.amount) +
      ' <span class="badge method">' + R.esc(methodLabel(p.method)) + '</span></div>' +
      '<div class="sub">' + R.shortDate(p.date) + (c ? ' · ' + R.esc(c.label) : ' · unallocated') + (p.reference ? ' · ref ' + R.esc(p.reference) : '') + '</div></div></div>';
  });

  bind(html, () => {
    document.getElementById('btn-edit-tenant').onclick = () => tenantForm(t);
    document.getElementById('btn-copy-portal').onclick = () => {
      const link = portalURL();
      R.copyText('Rent portal: ' + link + '\nLog in with your phone number and PIN ' + t.pin + '\n— ' + (Store.get().settings.businessName || 'Your landlord'),
        'Portal login copied');
    };
    document.getElementById('btn-record-pay').onclick = () => paymentForm(null, t.id);
  });
  return html;
}

function portalURL() {
  return location.origin + location.pathname + '#/portal';
}

function methodLabel(m) {
  const map = { stripe: 'Stripe', apple_pay: 'Apple Pay', zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App', cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', other: 'Other' };
  return map[m] || m;
}
