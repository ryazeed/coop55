/* =====================================================================
   E-COOP - COOP office (admin) pages
   dashboard.html, users.html, companies.html, opportunities.html, placements.html,
   assign.html, analytics.html, report.html, audit-logs.html, contact-messages.html
   ===================================================================== */

function activeStudents() { return S.students.filter(function (x) { return find(S.users, x.user).status === 'Active'; }); }
function pendingCompanies() { return S.companies.filter(function (c) { return c.status === 'Pending Approval'; }); }
function pendingOpps() { return S.opps.filter(function (o) { return o.status === 'Pending Approval'; }); }
function placementRate() {
  var active = activeStudents(), placed = active.filter(function (x) { return x.placement; }).length;
  return { total: active.length, placed: placed, pct: active.length ? Math.round(placed * 100 / active.length) : 0 };
}
function approveReject(onApprove, onReject) {
  return '<div class="app-actions"><button class="co-btn co-btn--danger-ghost co-btn--sm" type="button" onclick="' + onReject + '">' + t('common.reject') + '</button>' +
    '<button class="co-btn co-btn--primary co-btn--sm" type="button" onclick="' + onApprove + '">' + t('common.approve') + '</button></div>';
}

/* ---------- Dashboard ---------- */
function renderAdminDashboard() {
  var comps = pendingCompanies(), opps = pendingOpps(), rate = placementRate();
  setText('greet', greeting());
  setText('me-short', ME.name);
  setText('k-companies', comps.length);
  setText('k-opps', opps.length);
  setText('k-active', S.placements.filter(function (p) { return p.status === 'Active'; }).length);
  setText('k-unassigned', S.students.filter(function (x) { return x.placement && !x.supervisor; }).length);

  setHTML('wait-companies', comps.length ? comps.slice(0, 4).map(function (c) {
    return '<a class="co-row app-row-link" href="companies.html">' + media(c.name) + '<span class="co-row__text"><span class="co-row__title">' + esc(c.name) +
      '</span><span class="co-row__sub">' + esc(cityLabel(c.city, LANG)) + '</span></span>' + icon('chev') + '</a>';
  }).join('') : emptyBox('ok', t('admin.nothing_waiting')));
  setHTML('wait-opps', opps.length ? opps.slice(0, 4).map(function (o) {
    return '<a class="co-row app-row-link" href="opportunities.html">' + media(companyName(o.company), true) + '<span class="co-row__text"><span class="co-row__title">' + esc(o.title) +
      '</span><span class="co-row__sub">' + esc(companyName(o.company)) + '</span></span>' + icon('chev') + '</a>';
  }).join('') : emptyBox('ok', t('admin.nothing_waiting')));
  setHTML('audit-feed', S.audit.length ? S.audit.slice(0, 6).map(auditRow).join('') : emptyBox('shield', t('admin.no_activity')));
  setHTML('placement-ring', ring(rate.pct, t('admin.placed')));
  setText('placement-note', rate.placed + ' / ' + rate.total + ' ' + t('placedOf'));
}

function auditRow(l) {
  var tone = /Rejected|Suspended|FAILED|blocked/i.test(l.action) ? '' : /Approved|Accepted|Activated|Signed in/.test(l.action) ? ' co-tile--mint' : ' co-tile--lavender';
  return row('<span class="co-tile' + tone + '">' + icon('shield') + '</span>', esc(l.action), '<bdi>' + esc(userName(l.user) || '—') + ' · ' + relDay(l.ts) + ' · ' + l.ts.slice(11) + '</bdi>');
}

/* ---------- Users (UC-18) ---------- */
var roleFilter = '', usersReady = false;

function renderUsers() {
  var box = document.getElementById('u-q');
  if (!usersReady) { box.value = searchWord(); box.oninput = renderUsers; usersReady = true; }
  setupChips('role-filter', 'data-role', roleFilter, function (v) { roleFilter = v; renderUsers(); });
  var q = box.value.trim().toLowerCase();
  var list = S.users.filter(function (u) { return (!roleFilter || u.role === roleFilter) && (!q || (u.name + ' ' + u.email).toLowerCase().indexOf(q) >= 0); });
  setText('lead', list.length + ' ' + t('accountsWord'));
  setHTML('users-body', tableRows(list.map(function (u) {
    var active = u.status === 'Active';
    var btn = u.id === ME.id ? '<span class="co-badge">' + t('admin.you') + '</span>'
      : '<div class="app-actions"><button class="co-btn co-btn--sm ' + (active ? 'co-btn--danger-ghost' : 'co-btn--soft') + '" type="button" onclick="setStatus(\'' + u.id + '\', \'' +
        (active ? 'Suspended' : 'Active') + '\')">' + (active ? t('admin.suspend') : t('admin.activate')) + '</button></div>';
    return [who(u.id), '<span dir="ltr">' + esc(u.email) + '</span>', t('role.' + u.role), badge(u.status), btn];
  }), 5));
}

function setStatus(id, status) {
  var name = userName(id);
  if (status === 'Suspended' && !confirm(t('admin.suspend_confirm', { name: name }))) return;
  act({ type: 'userStatus', id: id, status: status }, status === 'Suspended' ? t('admin.suspended', { name: name }) : t('admin.activated', { name: name }), renderUsers);
}

/* ---------- Companies (UC-19) ---------- */
var companyStatus = 'Pending Approval';

function renderCompanies() {
  setupChips('c-status', 'data-status', companyStatus, function (v) { companyStatus = v; renderCompanies(); });
  var list = S.companies.filter(function (c) { return !companyStatus || c.status === companyStatus; });
  setHTML('companies-body', tableRows(list.map(function (c) {
    var opps = S.opps.filter(function (o) { return o.company === c.id; }).length;
    var buttons = c.status === 'Pending Approval' ? approveReject("decideCompany('" + c.id + "', true)", "decideCompany('" + c.id + "', false)") : '';
    return [who(c.user, c.cr ? 'CR ' + c.cr : ''), esc(cityLabel(c.city, LANG)), '<span dir="ltr">' + esc(find(S.users, c.user).email) + '</span>', opps, badge(c.status), buttons];
  }), 6, t('admin.nothing_here')));
}

function decideCompany(id, approve) {
  if (approve) { act({ type: 'companyDecision', id: id, status: 'Approved' }, t('approvedToast'), renderCompanies); return; }
  askReason(t('admin.reject_company', { name: companyName(id) }), t('common.reject'), function (reason) {
    act({ type: 'companyDecision', id: id, status: 'Rejected', reason: reason }, t('rejectedToast2'), renderCompanies);
  });
}

/* ---------- Opportunities (UC-20) ---------- */
var oppStatus = 'Pending Approval';

function renderAdminOpps() {
  setupChips('o-status', 'data-status', oppStatus, function (v) { oppStatus = v; renderAdminOpps(); });
  var list = S.opps.filter(function (o) { return !oppStatus || o.status === oppStatus; });
  setHTML('opps-body', tableRows(list.map(function (o) {
    var buttons = o.status === 'Pending Approval' ? approveReject("decideOpp('" + o.id + "', true)", "decideOpp('" + o.id + "', false)") : '';
    return ['<strong>' + esc(o.title) + '</strong><br><span class="co-caption">' + esc(shorten(o.description, 90)) + '</span>', esc(companyName(o.company)), esc(o.majors), o.capacity, o.minGpa || '—', badge(o.status), buttons];
  }), 7, t('admin.nothing_here')));
}

function decideOpp(id, approve) {
  if (approve) { act({ type: 'oppDecision', id: id, status: 'Open' }, t('approvedToast'), renderAdminOpps); return; }
  askReason(t('admin.reject_opp', { title: find(S.opps, id).title }), t('common.reject'), function (reason) {
    act({ type: 'oppDecision', id: id, status: 'Rejected', reason: reason }, t('rejectedToast2'), renderAdminOpps);
  });
}

/* ---------- Placements ---------- */
function renderPlacements() {
  setHTML('placements-body', tableRows(S.placements.map(function (p) {
    var o = find(S.opps, p.opp), trainees = S.students.filter(function (x) { return x.placement === p.id; });
    var rates = trainees.map(function (x) { return attendanceRate(x.id); });
    var avg = rates.length ? Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length) + '%' : '—';
    var noSup = trainees.filter(function (x) { return !x.supervisor; }).length;
    var names = trainees.map(function (x) { return esc(studentName(x.id)); }).join('<br>') || '—';
    var complete = p.status === 'Active' ? ' <button class="co-btn co-btn--soft co-btn--sm" type="button" onclick="completePlacement(\'' + p.id + '\')">' + t('admin.complete') + '</button>' : '';
    return ['<strong>' + esc(o.title) + '</strong>' + (noSup ? '<br><span class="co-badge co-badge--amber">' + t('admin.n_no_supervisor', { n: noSup }) + '</span>' : ''),
      esc(companyName(o.company)), names, fmtDate(p.start) + ' – ' + fmtDate(p.end), avg, badge(p.status) + complete];
  }), 6, t('admin.no_placed')));
}

function completePlacement(id) {
  if (confirm(t('admin.complete_confirm'))) act({ type: 'completePlacement', id: id }, t('assign.completed'), renderPlacements);
}

/* ---------- Assign supervisors (UC-21) ---------- */
function renderAssign() {
  var sups = S.users.filter(function (u) { return u.role === 'Supervisor' && u.status === 'Active'; });
  var load = function (ref) { return S.students.filter(function (x) { return x.supervisor === ref; }).length; };
  var list = S.students.slice().sort(function (a, b) { return (a.placement && !a.supervisor ? 0 : 1) - (b.placement && !b.supervisor ? 0 : 1); });
  setHTML('assign-body', tableRows(list.map(function (x) {
    var o = x.placement ? oppOfPlacement(x.placement) : null;
    var select = '<select class="co-input" onchange="assignTo(\'' + x.id + '\', this.value)" aria-label="' + t('admin.choose_sup') + '">' +
      (x.supervisor ? '' : '<option value="">' + t('admin.unassigned') + '</option>') +
      sups.map(function (u) { return '<option value="' + u.ref + '"' + (u.ref === x.supervisor ? ' selected' : '') + '>' + esc(u.name) + ' (' + load(u.ref) + ')</option>'; }).join('') + '</select>';
    return [who(x.user), esc(x.major), o ? esc(companyName(o.company)) + '<br><span class="co-caption">' + esc(o.title) + '</span>' : '—', select];
  }), 4));
}

function assignTo(studentId, supId) {
  if (supId) act({ type: 'assign', student: studentId, supervisor: supId }, t('assign.done'), renderAssign);
}

/* ---------- Analytics (UC-22) ---------- */
function renderAnalytics() {
  var rate = placementRate(), placed = S.students.filter(function (x) { return x.placement; });
  var avgAtt = placed.length ? Math.round(placed.reduce(function (sum, x) { return sum + attendanceRate(x.id); }, 0) / placed.length) : 0;
  setText('st-rate', rate.pct + '%');
  setText('st-att', avgAtt + '%');
  setText('st-placements', S.placements.filter(function (p) { return p.status === 'Active'; }).length);
  setText('st-pending', pendingCompanies().length + pendingOpps().length);

  // trainees and open seats per approved company
  var perCompany = S.companies.filter(function (c) { return c.status === 'Approved'; }).map(function (c) {
    var n = placed.filter(function (x) { return oppOfPlacement(x.placement).company === c.id; }).length;
    var seats = S.opps.filter(function (o) { return o.company === c.id && o.status === 'Open'; }).reduce(function (sum, o) { return sum + o.capacity; }, 0);
    return { name: c.name, n: n, seats: seats };
  });
  var max = Math.max.apply(null, perCompany.map(function (c) { return Math.max(c.n, c.seats); }).concat([1]));
  setHTML('chart', perCompany.map(function (c) {
    return '<div class="app-chart__row"><span class="app-chart__label">' + esc(c.name) + '</span><span class="app-chart__track"><span class="app-chart__cap" style="width:' + (c.seats * 100 / max) +
      '%"></span><span class="app-chart__fill" style="width:' + (c.n * 100 / max) + '%"></span></span><b class="app-chart__num">' + c.n + ' / ' + c.seats + '</b></div>';
  }).join(''));

  var statuses = ['Submitted', 'Accepted', 'Rejected', 'Withdrawn'];
  setHTML('apps-chart', barChart(statuses.map(function (st) {
    return { label: statusText(st), value: S.apps.filter(function (a) { return a.status === st; }).length, max: Math.max(S.apps.length, 1), tone: st === 'Accepted' ? 'mint' : '' };
  })));

  var majors = [];
  S.students.forEach(function (x) { if (majors.indexOf(x.major) < 0) majors.push(x.major); });
  setHTML('major-chart', barChart(majors.sort().map(function (m) {
    var all = S.students.filter(function (x) { return x.major === m; }), inPl = all.filter(function (x) { return x.placement; }).length;
    return { label: m, value: inPl, max: all.length, tone: 'mint', text: inPl + ' / ' + all.length };
  })));

  var avg = function (type) {
    var list = S.evals.filter(function (e) { return e.type === type; });
    return list.length ? Math.round(list.reduce(function (sum, e) { return sum + e.score; }, 0) / list.length) : '—';
  };
  setText('avg-company', avg('Company'));
  setText('avg-academic', avg('Academic'));
}

/* ---------- Audit log (UC-23, read-only) ---------- */
function renderAudit() {
  var box = document.getElementById('audit-q');
  box.oninput = renderAudit;
  var q = box.value.trim().toLowerCase();
  var rows = S.audit.filter(function (l) { return !q || (userName(l.user) + ' ' + l.action).toLowerCase().indexOf(q) >= 0; });
  setText('lead', rows.length + ' ' + t('entriesWord'));
  setHTML('audit-body', tableRows(rows.slice(0, 200).map(function (l) {
    return ['<bdi>' + fmtDate(l.ts) + ' · ' + l.ts.slice(11) + '</bdi>', l.user ? who(l.user, t('role.' + find(S.users, l.user).role)) : '—', esc(l.action)];
  }), 3, t('admin.no_activity')));
}

/* ---------- Contact messages (from the public contact form) ---------- */
function renderContactInbox() {
  var list = S.contacts || [];
  setHTML('contact-list', list.length ? list.map(function (m) {
    return row('<span class="co-tile co-tile--lavender">' + icon('mail') + '</span>', esc(m.name) + ' <span class="co-badge">' + esc(m.topic) + '</span>',
      '<span dir="ltr">' + esc(m.email) + '</span> · <bdi>' + fmtDate(m.ts) + ' · ' + m.ts.slice(11) + '</bdi></span><span class="app-body-text app-wrap" dir="auto">' + esc(m.message),
      '<a class="co-btn co-btn--soft co-btn--sm" href="mailto:' + esc(m.email) + '">' + icon('mail', true) + t('reply') + '</a>');
  }).join('') : emptyBox('mail', t('admin.no_contact')));
}

/* ---------- Institutional reports (FR-21): table, CSV, PDF (calculated in PHP) ---------- */
var reportKind = 'placement';

function renderInstReports() {
  setText('lead', t('instReportsLead'));
  setupChips('report-kind', 'data-kind', reportKind, function (v) { reportKind = v; renderInstReports(); });
  loadReport(reportKind, {});
}
