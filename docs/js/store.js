/* Rent Collector — store.js : localStorage data layer, derived math, charge engine */
'use strict';

const DB_KEY = 'rentcollector.v1';

const Store = {
  _db: null,

  get() {
    if (!this._db) this._db = loadDB();
    return this._db;
  },
  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this._db));
    } catch (e) {
      RC.toast('Could not save — storage full or unavailable');
    }
  },
  reset() {
    this._db = blankDB();
    this.save();
  },

  /* ---- lookups ---- */
  property(id) { return this.get().properties.find(p => p.id === id) || null; },
  unit(id) { return this.get().units.find(u => u.id === id) || null; },
  tenant(id) { return this.get().tenants.find(t => t.id === id) || null; },
  charge(id) { return this.get().charges.find(c => c.id === id) || null; },
  payment(id) { return this.get().payments.find(p => p.id === id) || null; },

  unitsOf(propertyId) { return this.get().units.filter(u => u.propertyId === propertyId); },
  tenantsOfUnit(unitId) { return this.get().tenants.filter(t => t.unitId === unitId && t.status === 'active'); },
  chargesOfTenant(tenantId) {
    return this.get().charges
      .filter(c => c.tenantId === tenantId)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  },
  paymentsOfCharge(chargeId) { return this.get().payments.filter(p => p.chargeId === chargeId); },
  paymentsOfTenant(tenantId) {
    return this.get().payments
      .filter(p => p.tenantId === tenantId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },
  expensesOfProperty(propertyId, ym) {
    let list = this.get().expenses.filter(e => e.propertyId === propertyId);
    if (ym) list = list.filter(e => RC.monthKeyOf(e.date) === ym);
    return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },

  tenantName(id) { const t = this.tenant(id); return t ? t.name : '—'; },
  unitLabel(id) {
    const u = this.unit(id);
    if (!u) return '—';
    const p = this.property(u.propertyId);
    return (p ? p.name + ' · ' : '') + u.label;
  },

  /* ---- money math (cents) ---- */
  paidOnCharge(charge) {
    return this.paymentsOfCharge(charge.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  },
  chargeBalance(charge) {
    if (charge.status === 'waived') return 0;
    return Math.max(0, (Number(charge.amount) || 0) - this.paidOnCharge(charge));
  },
  isOverdue(charge, today) {
    if (charge.status === 'paid' || charge.status === 'waived') return false;
    const bal = this.chargeBalance(charge);
    if (bal <= 0) return false;
    const grace = Number(this.get().settings.graceDays) || 0;
    const t = today || RC.todayStr();
    return RC.addDays(charge.dueDate, grace) < t;
  },
  tenantBalance(tenantId, today) {
    return this.chargesOfTenant(tenantId)
      .filter(c => c.status !== 'waived')
      .reduce((s, c) => s + this.chargeBalance(c), 0);
  },
  refreshChargeStatus(charge) {
    if (charge.status === 'waived') return;
    const bal = this.chargeBalance(charge);
    if (bal <= 0) charge.status = 'paid';
    else if (this.paidOnCharge(charge) > 0) charge.status = 'partial';
    else charge.status = 'unpaid';
  },

  /* ---- charge engine ---- */
  generateMonthlyCharges(ym) {
    const db = this.get();
    const month = ym || RC.monthKeyOf(RC.todayStr());
    let created = 0, skipped = 0;
    db.tenants.filter(t => t.status === 'active' && t.unitId).forEach(t => {
      const exists = db.charges.some(c =>
        c.tenantId === t.id && c.type === 'rent' && RC.monthKeyOf(c.dueDate) === month);
      if (exists) { skipped++; return; }
      const dueDay = Number(t.dueDay) || 1;
      db.charges.push({
        id: RC.uid(),
        tenantId: t.id,
        unitId: t.unitId,
        label: RC.monthLabel(month) + ' rent',
        amount: Number(t.monthlyRent) || 0,
        dueDate: RC.dueDateForMonth(month, dueDay),
        status: 'unpaid',
        type: 'rent',
        createdAt: new Date().toISOString()
      });
      created++;
    });
    this.save();
    return { created, skipped, month };
  },

  applyLateFees(today) {
    const db = this.get();
    const s = db.settings;
    const t = today || RC.todayStr();
    const feeMonth = RC.monthKeyOf(t);
    let created = 0;
    db.charges.filter(c => (c.status === 'unpaid' || c.status === 'partial') && this.isOverdue(c, t)).forEach(c => {
      const dup = db.charges.some(f =>
        f.type === 'late_fee' && f.parentChargeId === c.id && f.feeMonth === feeMonth);
      if (dup) return;
      const bal = this.chargeBalance(c);
      let fee = 0;
      if (s.lateFeeType === 'percent') fee = Math.round(bal * (Number(s.lateFeeAmount) || 0) / 100);
      else fee = RC.toCents(s.lateFeeAmount) || 0;
      if (fee <= 0) return;
      const tenant = this.tenant(c.tenantId);
      db.charges.push({
        id: RC.uid(),
        tenantId: c.tenantId,
        unitId: c.unitId,
        label: 'Late fee — ' + c.label,
        amount: fee,
        dueDate: t,
        status: 'unpaid',
        type: 'late_fee',
        parentChargeId: c.id,
        feeMonth,
        createdAt: new Date().toISOString()
      });
      created++;
    });
    this.save();
    return { created };
  },

  /* ---- payments ---- */
  recordPayment(data) {
    const db = this.get();
    const pay = {
      id: RC.uid(),
      chargeId: data.chargeId || null,
      tenantId: data.tenantId,
      amount: Number(data.amount) || 0,
      date: data.date || RC.todayStr(),
      method: data.method || 'other',
      reference: data.reference || '',
      note: data.note || ''
    };
    db.payments.push(pay);
    if (pay.chargeId) {
      const c = this.charge(pay.chargeId);
      if (c) this.refreshChargeStatus(c);
    }
    this.save();
    return pay;
  },
  deletePayment(id) {
    const db = this.get();
    const pay = this.payment(id);
    if (!pay) return false;
    db.payments = db.payments.filter(p => p.id !== id);
    if (pay.chargeId) {
      const c = this.charge(pay.chargeId);
      if (c) this.refreshChargeStatus(c);
    }
    this.save();
    return true;
  },

  /* ---- dashboard aggregates ---- */
  dashboard(today) {
    const t = today || RC.todayStr();
    const ym = RC.monthKeyOf(t);
    const db = this.get();
    let collected = 0, outstanding = 0, overdueCount = 0;
    const overdueTenants = [];
    db.payments.forEach(p => { if (RC.monthKeyOf(p.date) === ym) collected += Number(p.amount) || 0; });
    db.charges.forEach(c => {
      if (c.status === 'waived') return;
      outstanding += this.chargeBalance(c);
      if (this.isOverdue(c, t)) {
        overdueCount++;
        const tid = c.tenantId;
        if (!overdueTenants.some(o => o.tenantId === tid)) {
          overdueTenants.push({ tenantId: tid, chargeId: c.id });
        }
      }
    });
    const units = db.units;
    const occupied = units.filter(u => db.tenants.some(te => te.unitId === u.id && te.status === 'active')).length;
    return {
      collected, outstanding, overdueCount, overdueTenants,
      occupancy: units.length ? Math.round(occupied / units.length * 100) : 0,
      occupied, totalUnits: units.length, month: ym
    };
  },

  /* ---- reports ---- */
  monthlyReport(ym) {
    const db = this.get();
    const charges = db.charges.filter(c => c.status !== 'waived' && RC.monthKeyOf(c.dueDate) === ym);
    const expected = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const collected = db.payments
      .filter(p => RC.monthKeyOf(p.date) === ym)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { ym, expected, collected, outstanding: expected - collected, chargeCount: charges.length };
  },
  propertyPL(propertyId, ym) {
    const db = this.get();
    const unitIds = this.unitsOf(propertyId).map(u => u.id);
    const tenantIds = db.tenants.filter(t => unitIds.includes(t.unitId)).map(t => t.id);
    const collected = db.payments
      .filter(p => tenantIds.includes(p.tenantId) && (!ym || RC.monthKeyOf(p.date) === ym))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const expenses = this.expensesOfProperty(propertyId, ym)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { collected, expenses, net: collected - expenses };
  },

  exportJSON() {
    return JSON.stringify(this.get(), null, 2);
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.properties) || !Array.isArray(data.tenants) || !data.settings) {
      throw new Error('Not a Rent Collector backup file');
    }
    ['units', 'charges', 'payments', 'expenses'].forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    this._db = data;
    this.save();
  }
};

/* ---- db shape ---- */
function blankDB() {
  return {
    properties: [], units: [], tenants: [], charges: [], payments: [], expenses: [],
    settings: {
      businessName: '', currency: 'USD',
      lateFeeType: 'flat', lateFeeAmount: '50', graceDays: 5,
      logoTitle: 'Rent Collector'
    },
    seeded: false
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (db && Array.isArray(db.properties)) {
        if (!db.settings) db.settings = blankDB().settings;
        ['units', 'tenants', 'charges', 'payments', 'expenses'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
        return db;
      }
    }
  } catch (e) { /* corrupted -> reseed */ }
  const db = blankDB();
  seedSampleData(db);
  db.seeded = true;
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  return db;
}

function genPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function seedSampleData(db) {
  const p1 = { id: 'sample-p1', name: 'Maple Street Duplex', address: 'SAMPLE — 100 Maple St', type: 'multi', notes: 'Sample property — delete me in Settings.' };
  const p2 = { id: 'sample-p2', name: 'Oak Avenue House', address: 'SAMPLE — 45 Oak Ave', type: 'single', notes: 'Sample property — delete me in Settings.' };
  db.properties.push(p1, p2);
  const u1 = { id: 'sample-u1', propertyId: 'sample-p1', label: 'Unit A', beds: 2, baths: 1, rent: 145000, status: 'occupied' };
  const u2 = { id: 'sample-u2', propertyId: 'sample-p1', label: 'Unit B', beds: 2, baths: 1, rent: 145000, status: 'occupied' };
  const u3 = { id: 'sample-u3', propertyId: 'sample-p2', label: 'Whole house', beds: 3, baths: 2, rent: 210000, status: 'occupied' };
  db.units.push(u1, u2, u3);
  const t1 = { id: 'sample-t1', name: 'SAMPLE — Alice Tenant', phone: '(555) 010-1001', email: 'alice@example.com', unitId: 'sample-u1', leaseStart: '2026-01-01', leaseEnd: '2026-12-31', monthlyRent: 145000, dueDay: 1, deposit: 145000, stripeLink: '', pin: '1111', status: 'active', notes: 'Sample tenant' };
  const t2 = { id: 'sample-t2', name: 'SAMPLE — Bob Tenant', phone: '(555) 010-1002', email: 'bob@example.com', unitId: 'sample-u2', leaseStart: '2026-03-01', leaseEnd: '2027-02-28', monthlyRent: 145000, dueDay: 1, deposit: 145000, stripeLink: '', pin: '2222', status: 'active', notes: 'Sample tenant' };
  const t3 = { id: 'sample-t3', name: 'SAMPLE — Cara Tenant', phone: '(555) 010-1003', email: 'cara@example.com', unitId: 'sample-u3', leaseStart: '2026-06-01', leaseEnd: '2027-05-31', monthlyRent: 210000, dueDay: 1, deposit: 210000, stripeLink: '', pin: '3333', status: 'active', notes: 'Sample tenant' };
  db.tenants.push(t1, t2, t3);
  // October 2026 rent: Alice paid in full, Bob unpaid, Cara unpaid
  const c1 = { id: 'sample-c1', tenantId: 'sample-t1', unitId: 'sample-u1', label: 'October 2026 rent', amount: 145000, dueDate: '2026-10-01', status: 'paid', type: 'rent', createdAt: '2026-09-28T12:00:00Z' };
  const c2 = { id: 'sample-c2', tenantId: 'sample-t2', unitId: 'sample-u2', label: 'October 2026 rent', amount: 145000, dueDate: '2026-10-01', status: 'unpaid', type: 'rent', createdAt: '2026-09-28T12:00:00Z' };
  const c3 = { id: 'sample-c3', tenantId: 'sample-t3', unitId: 'sample-u3', label: 'October 2026 rent', amount: 210000, dueDate: '2026-10-01', status: 'unpaid', type: 'rent', createdAt: '2026-09-28T12:00:00Z' };
  // September rent for Bob: unpaid -> overdue (shows the overdue flow)
  const c4 = { id: 'sample-c4', tenantId: 'sample-t2', unitId: 'sample-u2', label: 'September 2026 rent', amount: 145000, dueDate: '2026-09-01', status: 'unpaid', type: 'rent', createdAt: '2026-08-28T12:00:00Z' };
  db.charges.push(c1, c2, c3, c4);
  db.payments.push(
    { id: 'sample-pay1', chargeId: 'sample-c1', tenantId: 'sample-t1', amount: 145000, date: '2026-10-01', method: 'zelle', reference: '', note: 'Sample payment' }
  );
  db.expenses.push(
    { id: 'sample-e1', propertyId: 'sample-p1', date: '2026-10-02', category: 'Repairs', amount: 18500, note: 'Sample — faucet repair Unit B' }
  );
  db.settings.businessName = 'SAMPLE — Demo Properties LLC';
}

function removeSampleData(db) {
  const isSample = o => String(o.id || '').startsWith('sample-');
  ['properties', 'units', 'tenants', 'charges', 'payments', 'expenses'].forEach(k => {
    db[k] = db[k].filter(o => !isSample(o));
  });
  db.seeded = false;
  if (db.settings.businessName && db.settings.businessName.startsWith('SAMPLE')) db.settings.businessName = '';
}

window.Store = Store;
window.RC = window.RC || {};
Object.assign(window.RC, { DB_KEY, genPin, removeSampleData });
