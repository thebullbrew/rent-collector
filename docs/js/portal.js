/* Rent Collector — portal.js : tenant self-service portal (#/portal) */
'use strict';

const R3 = window.RC;
const PORTAL_SESSION = 'rentcollector.portal';

function portalTenant() {
  try {
    const s = JSON.parse(sessionStorage.getItem(PORTAL_SESSION) || 'null');
    if (!s) return null;
    const t = Store.tenant(s.id);
    if (!t || t.status !== 'active') return null;
    return t;
  } catch (e) { return null; }
}

function vPortal() {
  document.body.classList.add('portal-mode');
  const t = portalTenant();
  if (!t) return portalLogin();
  const s = Store.get().settings;
  const charges = Store.chargesOfTenant(t.id).filter(c => c.status !== 'waived');
  const bal = Store.tenantBalance(t.id);
  const pays = Store.paymentsOfTenant(t.id);

  let html = '<div class="portal-wrap"><div class="portal-card">' +
    '<h1>' + R3.esc(s.businessName || s.logoTitle || 'Rent Collector') + '</h1>' +
    '<div class="muted">Hello, ' + R3.esc(R3.displayFirstName(t.name)) + ' · ' + R3.esc(Store.unitLabel(t.unitId)) + '</div>' +
    '<div class="portal-balance' + (bal === 0 ? ' zero' : '') + '">' + R3.fmtMoney(bal) + '</div>' +
    '<div class="muted">' + (bal === 0 ? 'You are all paid up. 🎉' : 'balance due') + '</div>';

  if (bal > 0) {
    if (t.stripeLink) {
      html += '<div style="margin:18px 0"><a class="btn btn-gold btn-big" href="' + R3.esc(t.stripeLink) + '" target="_blank" rel="noopener">Pay ' + R3.fmtMoney(bal) + '</a>' +
        '<div class="muted" style="margin-top:8px;font-size:12.5px">Secure checkout · Apple Pay accepted on iPhone</div></div>';
    } else {
      html += '<div class="card" style="margin:18px 0;text-align:left"><div class="muted">Online payment isn’t set up for your unit yet. <b>Contact your landlord to pay.</b></div></div>';
    }
  }
  html += '<button class="btn btn-ghost btn-sm" id="portal-logout">Log out</button></div>';

  html += '<div class="section-head"><h3>Charges</h3></div>';
  if (!charges.length) html += '<div class="card"><div class="muted">No charges.</div></div>';
  charges.slice().reverse().forEach(c => {
    const cb = Store.chargeBalance(c);
    html += '<div class="list-item" style="cursor:default"><div class="grow"><div class="title">' + R3.esc(c.label) + '</div>' +
      '<div class="sub">Due ' + R3.shortDate(c.dueDate) + ' · ' + typeBadge(c.type) + ' ' + chargeBadge(c) + '</div></div>' +
      '<div class="amt">' + R3.fmtMoney(cb) + '</div></div>';
  });

  html += '<div class="section-head"><h3>Payment history</h3></div>';
  if (!pays.length) html += '<div class="card"><div class="muted">No payments yet.</div></div>';
  pays.slice(0, 20).forEach(p => {
    html += '<div class="list-item" style="cursor:default"><div class="grow"><div class="title">' + R3.fmtMoney(p.amount) + '</div>' +
      '<div class="sub">' + R3.shortDate(p.date) + ' · ' + R3.esc(methodLabel(p.method)) + '</div></div></div>';
  });
  html += '</div>';

  bind(html, () => {
    document.getElementById('portal-logout').onclick = () => {
      sessionStorage.removeItem(PORTAL_SESSION);
      location.hash = '#/portal'; App.rerender();
    };
  });
  return html;
}

function portalLogin() {
  const s = Store.get().settings;
  const html = '<div class="portal-wrap"><div class="portal-card">' +
    '<h1>' + R3.esc(s.businessName || s.logoTitle || 'Rent Collector') + '</h1>' +
    '<div class="muted" style="margin-bottom:16px">Tenant portal — log in to see your balance and pay rent.</div>' +
    R3.field('Phone number', R3.input('phone', '', 'required inputmode="tel" autocomplete="tel" placeholder="(555) 123-4567"')) +
    R3.field('PIN', R3.input('pin', '', 'required inputmode="numeric" maxlength="10" placeholder="4-digit PIN from your landlord"')) +
    '<button class="btn btn-gold btn-block" id="portal-go" style="margin-top:6px">Log in</button>' +
    '<div class="muted" style="margin-top:12px;font-size:12.5px">Your landlord gave you this PIN with your portal link.</div>' +
    '</div></div>';
  bind(html, () => {
    const go = () => {
      const phone = R3.digitsOnly(document.querySelector('[name=phone]').value);
      const pin = document.querySelector('[name=pin]').value.trim();
      const t = Store.get().tenants.find(x =>
        x.status === 'active' && R3.digitsOnly(x.phone) === phone && String(x.pin) === pin);
      if (!t) { R3.toast('No match — check phone and PIN'); return; }
      sessionStorage.setItem(PORTAL_SESSION, JSON.stringify({ id: t.id }));
      App.rerender();
    };
    document.getElementById('portal-go').onclick = go;
    document.querySelector('[name=pin]').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  return html;
}
