/* Rent Collector — app.js : router, tab bar, boot */
'use strict';

const App = {
  current: null,

  routes: [
    { re: /^#\/$/, view: () => vDashboard(), tab: 'dash', title: 'Dashboard' },
    { re: /^#\/properties$/, view: () => vProperties(), tab: 'props', title: 'Properties' },
    { re: /^#\/properties\/([\w-]+)$/, view: (m) => vPropertyDetail(m[1]), tab: 'props', title: 'Property' },
    { re: /^#\/tenants$/, view: () => vTenants(), tab: 'tenants', title: 'Tenants' },
    { re: /^#\/tenants\/([\w-]+)$/, view: (m) => vTenantDetail(m[1]), tab: 'tenants', title: 'Tenant' },
    { re: /^#\/charges$/, view: () => vCharges(), tab: 'charges', title: 'Charges' },
    { re: /^#\/payments$/, view: () => vPayments(), tab: 'pay', title: 'Payments' },
    { re: /^#\/reports$/, view: () => vReports(), tab: 'more', title: 'Reports' },
    { re: /^#\/settings$/, view: () => vSettings(), tab: 'more', title: 'Settings' },
    { re: /^#\/more$/, view: () => vMore(), tab: 'more', title: 'More' },
    { re: /^#\/portal$/, view: () => vPortal(), tab: null, title: 'Tenant portal' },
  ],

  tabs: [
    { id: 'dash', label: 'Home', icon: '🏠', hash: '#/' },
    { id: 'props', label: 'Properties', icon: '🏘️', hash: '#/properties' },
    { id: 'tenants', label: 'Tenants', icon: '🧑‍💼', hash: '#/tenants' },
    { id: 'charges', label: 'Charges', icon: '🧾', hash: '#/charges' },
    { id: 'pay', label: 'Payments', icon: '💵', hash: '#/payments' },
    { id: 'more', label: 'More', icon: '⋯', hash: '#/more' },
  ],

  render() {
    const hash = location.hash || '#/';
    const route = this.routes.find(r => r.re.test(hash)) || this.routes[0];
    const m = hash.match(route.re);
    const view = document.getElementById('view');
    const header = document.getElementById('app-header');
    const tabbar = document.getElementById('tabbar');
    const isPortal = route.tab === null;

    document.body.classList.toggle('portal-mode', isPortal);
    header.style.display = isPortal ? 'none' : '';
    tabbar.style.display = isPortal ? 'none' : '';

    if (!isPortal) {
      const s = Store.get().settings;
      header.querySelector('h1').innerHTML = window.RC.esc(s.logoTitle || 'Rent Collector').replace(/Rent Collector/i, '<span class="gold">Rent</span> Collector');
      const biz = s.businessName ? ' · ' + s.businessName : '';
      header.querySelector('.sub').textContent = 'Property management' + biz;
      tabbar.innerHTML = this.tabs.map(t =>
        '<a href="' + t.hash + '" class="' + (route.tab === t.id ? 'active' : '') + '">' +
        '<span class="ico">' + t.icon + '</span>' + t.label + '</a>'
      ).join('');
    }

    try {
      view.innerHTML = route.view(m);
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="card"><h3>Something went wrong</h3><div class="muted">' +
        window.RC.esc(err.message) + '</div><button class="btn btn-gold" onclick="location.hash=\'#/\'">Back home</button></div>';
    }
    window.scrollTo(0, 0);
    this.current = route.tab;
  },

  rerender() { this.render(); },

  init() {
    Store.get(); // loads / seeds
    window.addEventListener('hashchange', () => this.render());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.RC.closeModal(); });
    if (!location.hash) location.hash = '#/';
    this.render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
};

function vMore() {
  const items = [
    ['#/reports', '📊', 'Reports', 'Collections, P&L, CSV export'],
    ['#/settings', '⚙️', 'Settings', 'Business, late fees, payments, data'],
    ['#/portal', '🔑', 'Tenant portal', 'Preview the tenant login'],
  ];
  let html = '<h1 class="page-title">More</h1>';
  items.forEach(it => {
    html += '<button class="list-item" data-go="' + it[0] + '"><div class="grow">' +
      '<div class="title">' + it[1] + ' ' + it[2] + '</div><div class="sub">' + it[3] + '</div></div>' +
      '<div class="amt">›</div></button>';
  });
  return bind(html, () => {});
}

document.addEventListener('DOMContentLoaded', () => App.init());
