/* =====================================================================
   E-COOP - shared JavaScript for every page
   - talks to the PHP back end (api/state.php, api/action.php, api/auth.php)
   - English / Arabic text, light / dark theme, side menu, top bar, toasts
   - small helpers used by the role files (student.js, company.js, chat.js, ...)
   ===================================================================== */

/* folder of the site, so pages inside student/, company/ ... can reach api/ */
var ROOT = (function () {
  var src = document.currentScript.src;
  return src.slice(0, src.lastIndexOf('js/main.js'));
})();

var S = null;       // data from the server: users, students, opps, apps, attendance ...
var ME = null;      // signed-in user
var TODAY = '';     // today's date from the server (YYYY-MM-DD)
var DEMO_PASSWORD = 'Coop@2026';

/* ---------- language and theme ---------- */
function t(key, args) {
  var text = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
  if (args) text = String(text).replace(/\{(\w+)\}/g, function (m, k) { return args[k] != null ? args[k] : m; });
  return text;
}

/* replace the English text written in the HTML with the chosen language */
function translatePage() {
  document.querySelectorAll('[data-t]').forEach(function (el) {
    var k = el.getAttribute('data-t');
    if (el.tagName !== 'TITLE' && (I18N[LANG][k] || I18N.en[k])) el.textContent = t(k);
  });
  document.querySelectorAll('[data-t-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-t-ph')); });
  document.querySelectorAll('[data-t-title]').forEach(function (el) { el.title = t(el.getAttribute('data-t-title')); el.setAttribute('aria-label', el.title); });
  var title = document.querySelector('title[data-t]');
  if (title) document.title = t(title.getAttribute('data-t')) + ' · E-COOP';
}

function switchLanguage() {
  localStorage.setItem('ecoop-lang', LANG === 'ar' ? 'en' : 'ar');
  location.reload();
}

function switchTheme(theme) {
  var root = document.documentElement;
  theme = theme || (root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  root.setAttribute('data-theme', theme);
  localStorage.setItem('ecoop-theme', theme);
}

/* ---------- talking to the server ---------- */
function api(path, body) {
  return fetch(ROOT + 'api/' + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) { return r.json(); })
    .catch(function () { return { ok: false, error: 'Cannot reach the server. Is Apache (XAMPP) or the PHP server running?' }; });
}

/* load the data, check the user may open this page, then draw it.
   role = 'Student' | 'Company' | 'Supervisor' | 'Admin' | null (public page) */
function startPage(role, render) {
  if (location.protocol === 'file:') { showStartError('Open E-COOP through the web server, e.g. http://localhost/coop55/'); return; }
  api('state.php').then(function (res) {
    if (!res.ok) { showStartError(res.error); return; }
    TODAY = res.today;
    S = res.state;
    ME = res.me ? find(S.users, res.me) : null;
    if (role && !ME) { location.href = ROOT + 'login.html'; return; }                        // not signed in
    if (role && ME.role !== role) { location.href = homeOf(ME.role); return; }                // wrong role
    translatePage();
    if (ME) fillHeader();
    render();
  });
}

/* send one action (apply, approve, check-in ...) and redraw the page with the saved data */
function act(action, okMessage, render) {
  return api('action.php', action).then(function (res) {
    if (res.state) S = res.state;
    if (res.ok) { if (okMessage) toast(okMessage); }
    else toast(res.error, true);
    if (ME) { ME = find(S.users, ME.id) || ME; fillHeader(); }
    if (render) render();
    return res;
  });
}

function homeOf(role) { return ROOT + role.toLowerCase() + '/dashboard.html'; }

function signOut() {
  api('auth.php', { op: 'logout' }).then(function () { location.href = ROOT + 'login.html'; });
}

function showStartError(msg) {
  document.body.innerHTML = '<main class="site-wrap narrow" style="padding-top:48px"><div class="co-card">' +
    '<h1 class="co-card__title">E-COOP cannot start</h1><p class="co-caption">' + esc(msg) + '</p>' +
    '<ol class="app-list"><li>Start <b>Apache</b> and <b>MySQL</b> in XAMPP.</li><li>Open <a href="' + ROOT + 'install.php">install.php</a> once to create the database.</li>' +
    '<li>Open the site from <span dir="ltr">http://localhost/coop55/</span></li></ol></div></main>';
}

/* word typed in the top search box (?q=...) */
function searchWord() {
  var m = /[?&]q=([^&]*)/.exec(location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

/* ---------- top bar: user, place, notifications ---------- */
function fillHeader() {
  var nameEl = document.getElementById('me-name');
  if (!nameEl) return;
  nameEl.textContent = ME.name;
  document.getElementById('me-avatar').outerHTML = avatar(ME, 'me-avatar');
  setText('menu-name', ME.name);
  setText('menu-sub', t('role.' + ME.role) + ' · ' + ME.email);
  var place = t('role.Admin');
  if (ME.role === 'Student') place = myStudent().major;
  if (ME.role === 'Company') { var c = find(S.companies, ME.ref); place = c.name + ' · ' + cityLabel(c.city, LANG); }
  if (ME.role === 'Supervisor') place = ME.dept || t('role.Supervisor');
  setText('me-loc', place);
  var unread = S.notifs.filter(function (n) { return !n.read; }).length;
  document.getElementById('notif-bell').classList.toggle('co-iconbtn--dot', unread > 0);
  var dot = document.getElementById('chat-dot');                    // unread chat messages: a dot on "Messages" in the side menu
  if (dot) dot.hidden = unreadChats() === 0;
}

/* text of one notification (the server sends a key and its values) */
function notifText(n) {
  var args = Object.assign({}, n.args);
  if (args.d) args.d = fmtDate(args.d);
  return t(n.key, args);
}

/* ---------- chat: unread messages (used by the side menu on every page) ---------- */
function chatUnread(ch) {
  return S.msgs.filter(function (m) { return m.chat === ch.id && m.from !== ME.id && m.ts > ch.lastRead; }).length;
}
function unreadChats() {
  return S.chats.reduce(function (sum, ch) { return sum + chatUnread(ch); }, 0);
}

/* ---------- toast message ---------- */
function toast(msg, isError) {
  var box = document.getElementById('toasts');
  if (!box) return;
  var el = document.createElement('div');
  el.className = 'co-alert co-toast co-alert--' + (isError ? 'red' : 'mint');
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function () { el.remove(); }, isError ? 12000 : 4500);     // errors stay longer so they can be read
}

/* ---------- helpers for the data ---------- */
function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function userName(uid) { var u = find(S.users, uid); return u ? u.name : ''; }
function studentName(sid) { var st = find(S.students, sid); return st ? userName(st.user) : ''; }
function supervisorUser(supId) { return S.users.filter(function (u) { return u.ref === supId; })[0] || null; }
function supervisorName(supId) { var u = supervisorUser(supId); return u ? u.name : ''; }
function companyName(cid) { var c = find(S.companies, cid); return c ? c.name : ''; }
function oppOfPlacement(pid) { var p = find(S.placements, pid); return p ? find(S.opps, p.opp) : null; }
function myStudent() { return find(S.students, ME.ref); }
function reportOf(sid) { return S.reports.filter(function (r) { return r.student === sid; })[0] || null; }
/* students already placed in an opportunity (its taken seats) */
function seatsTaken(oppId) {
  var pl = S.placements.filter(function (p) { return p.opp === oppId; })[0];
  return pl ? S.students.filter(function (x) { return x.placement === pl.id; }).length : 0;
}

/* working days are Sunday to Thursday */
function addDays(d, n) { var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function weekday(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
function workdays(from, to) {
  var out = [], d = from;
  while (d <= to) { if (weekday(d) <= 4) out.push(d); d = addDays(d, 1); }
  return out;
}
/* attendance rate = days checked in (not rejected) / working days so far */
function attendanceRate(sid) {
  var st = find(S.students, sid);
  if (!st || !st.placement) return null;
  var p = find(S.placements, st.placement);
  var days = workdays(p.start, TODAY < p.end ? TODAY : p.end).length;
  var got = S.attendance.filter(function (a) { return a.student === sid && a.status !== 'Rejected'; }).length;
  return days ? Math.min(100, Math.round(got * 100 / days)) : 0;
}
function attCounts(sid) {
  var c = { days: 0, approved: 0, pending: 0, rejected: 0 };
  S.attendance.filter(function (a) { return a.student === sid; }).forEach(function (a) {
    if (a.status === 'Approved') c.approved++; else if (a.status === 'Pending') c.pending++; else if (a.status === 'Rejected') c.rejected++;
  });
  c.days = c.approved + c.pending;
  return c;
}

/* ---------- small HTML builders (design classes: co-*, app-*) ---------- */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
function show(id, visible) { var el = document.getElementById(id); if (el) el.hidden = !visible; }

/* status names: an application or report that waits for a decision is shown as "Pending", an approved opportunity as "Approved" */
var STATUS_KEY = { Submitted: 'status.Pending', Open: 'status.Approved' };
function statusText(st) {
  if (STATUS_KEY[st]) return t(STATUS_KEY[st]);
  return LANG === 'ar' ? (STATUS_AR[st] || t(st)) : (I18N.en[st] || st);
}
var STATUS_TONE = {
  Approved: 'mint', Accepted: 'mint', Active: 'mint', Open: 'mint', Evaluated: 'mint', Completed: 'lavender', Submitted: 'amber',
  Pending: 'amber', 'Pending Approval': 'amber', 'Request Revision': 'amber', 'Pending Evaluation': 'amber', Rejected: 'red', Suspended: 'red'
};
function badge(st) {
  var tone = STATUS_TONE[st];
  return '<span class="co-badge' + (tone ? ' co-badge--' + tone : '') + '" data-status="' + esc(st) + '">' + esc(statusText(st)) + '</span>';
}
function initials(name) { var p = String(name).replace(/^Dr\.\s*/, '').trim().split(/\s+/); return (((p[0] || '')[0] || '') + ((p.length > 1 ? p[p.length - 1] : '')[0] || '')).toUpperCase(); }
function avatar(user, id) {
  var idAttr = id ? ' id="' + id + '"' : '';
  if (user && user.avatar) return '<img class="co-avatar"' + idAttr + ' src="' + ROOT + esc(user.avatar) + '" alt="">';
  return '<span class="co-avatar"' + idAttr + '>' + esc(initials(user ? user.name : '?')) + '</span>';
}
/* square with initials (or the photo) at the start of a row */
function media(name, mint, user) {
  if (user && user.avatar) return '<img class="co-row__media" src="' + ROOT + esc(user.avatar) + '" alt="">';
  return '<span class="co-row__media' + (mint ? ' co-row__media--mint' : '') + '">' + esc(initials(name)) + '</span>';
}
function userMedia(uid) { var u = find(S.users, uid); return media(u ? u.name : '?', false, u); }
/* one list row: [media] title / sub ... [right side] */
function row(mediaHtml, title, sub, right, attrs) {
  return '<div class="co-row app-row-wrap"' + (attrs || '') + '>' + mediaHtml + '<div class="co-row__text"><span class="co-row__title">' + title + '</span>' +
    (sub ? '<span class="co-row__sub app-wrap">' + sub + '</span>' : '') + '</div>' + (right ? '<div class="co-row__actions">' + right + '</div>' : '') + '</div>';
}
function emptyBox(iconName, text, hint, action) {
  return '<div class="app-empty"><span class="co-tile co-tile--lavender">' + icon(iconName || 'info') + '</span><p class="app-empty__title">' + esc(text) + '</p>' +
    (hint ? '<p class="co-caption">' + esc(hint) + '</p>' : '') + (action ? '<div>' + action + '</div>' : '') + '</div>';
}
/* table rows: rows = [[cell, cell, ...], ...]; cells are HTML */
function tableRows(rows, cols, emptyText) {
  if (!rows.length) return '<tr><td colspan="' + cols + '" class="co-caption">' + esc(emptyText || t('noRecords')) + '</td></tr>';
  return rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
}
function who(uid, sub) {
  var u = find(S.users, uid);
  return '<span class="app-who">' + avatar(u) + '<span><strong>' + esc(u ? u.name : '') + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></span>';
}
/* progress ring (0 to 100) */
function ring(pct, caption) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  var c = 2 * Math.PI * 56, len = c * pct / 100, mint = Math.min(len, c * 0.2), a = 2 * Math.PI * pct / 100;
  var arcs = pct <= 0 ? '' : '<circle class="co-ring__lav" cx="66" cy="66" r="56" stroke-dasharray="' + len.toFixed(1) + ' ' + c.toFixed(1) + '"/>' +
    '<circle class="co-ring__mint" cx="66" cy="66" r="56" stroke-dasharray="' + mint.toFixed(1) + ' ' + c.toFixed(1) + '" stroke-dashoffset="' + (-(len - mint)).toFixed(1) + '"/>' +
    '<circle class="co-ring__knob" cx="' + (66 + 56 * Math.cos(a)).toFixed(1) + '" cy="' + (66 + 56 * Math.sin(a)).toFixed(1) + '" r="8"/>';
  return '<div class="co-ring" role="img" aria-label="' + pct + '% ' + esc(caption) + '"><svg viewBox="0 0 132 132"><circle class="co-ring__track" cx="66" cy="66" r="56"/>' + arcs +
    '</svg><div class="co-ring__label"><span class="co-ring__value">' + pct + '%</span><span class="co-caption">' + esc(caption) + '</span></div></div>';
}
/* horizontal bars: items = [{ label, value, max, tone, text }] */
function barChart(items) {
  if (!items.length) return emptyBox('chart', t('noRecords'));
  return items.map(function (it) {
    var w = it.max ? Math.round(it.value * 100 / it.max) : 0;
    return '<div class="app-chart__row"><span class="app-chart__label">' + esc(it.label) + '</span>' +
      '<span class="co-progress co-progress--thin' + (it.tone === 'mint' ? ' co-progress--mint' : '') + '"><span style="width:' + w + '%"></span></span>' +
      '<b class="app-chart__num">' + esc(it.text != null ? it.text : it.value) + '</b></div>';
  }).join('');
}
/* filter chips: marks the chosen chip and calls onPick(value) when another one is clicked */
function setupChips(boxId, attr, current, onPick) {
  document.querySelectorAll('#' + boxId + ' .co-chip').forEach(function (chip) {
    chip.setAttribute('aria-pressed', chip.getAttribute(attr) === current ? 'true' : 'false');
    chip.onclick = function () { onPick(chip.getAttribute(attr)); };
  });
}

/* ---------- dates ---------- */
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function fmtDate(d) {
  if (!d) return '';
  var m = +d.slice(5, 7) - 1, day = +d.slice(8, 10), y = d.slice(0, 4);
  return day + ' ' + (LANG === 'ar' ? MONTHS_AR[m] : MONTHS[m]) + ' ' + y;
}
function relDay(d) {
  var diff = Math.round((new Date(TODAY + 'T12:00:00Z') - new Date(d.slice(0, 10) + 'T12:00:00Z')) / 864e5);
  if (diff <= 0) return t('today');
  if (diff === 1) return t('yesterday');
  return t('daysAgo', { n: diff });
}
function greeting() { var hr = new Date().getHours(); return t(hr < 12 ? 'greet.morning' : hr < 17 ? 'greet.afternoon' : 'greet.evening'); }
function nowTime() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function shortName(name) { var p = String(name).trim().split(/\s+/); return p.length > 1 && !/^Dr\./.test(p[0]) ? p[0] + ' ' + p[p.length - 1][0] + '.' : name; }

/* ---------- pop-ups ---------- */
/* ask for a reason, then call done(reason) */
function askReason(title, buttonText, done) {
  var box = document.getElementById('reason-modal'), form = document.getElementById('reason-form'), text = document.getElementById('reason-text');
  var modal = bootstrap.Modal.getOrCreateInstance(box);
  setText('reason-title', title);
  setText('reason-submit', buttonText);
  setText('reason-error', '');
  text.value = '';
  form.onsubmit = function (e) {
    e.preventDefault();
    var reason = text.value.trim();
    if (reason.length < 3) { setText('reason-error', t('app.reason_required')); return; }
    modal.hide();
    done(reason);
  };
  modal.show();
  setTimeout(function () { text.focus(); }, 300);
}

/* student details (company trainees, supervisor students) */
function openStudent(sid) {
  var x = find(S.students, sid), name = studentName(sid), u = find(S.users, x.user);
  var o = x.placement ? oppOfPlacement(x.placement) : null, rate = attendanceRate(sid), rep = reportOf(sid);
  var recent = S.attendance.filter(function (a) { return a.student === sid; }).slice(-5).reverse();
  var html = '<div class="app-ringrow">' + ring(rate || 0, t('attendanceRate')) + '<div class="co-list">' +
    row(userMedia(x.user), esc(name), esc(x.major) + ' · ' + t('profile.gpa') + ' ' + esc(x.gpa || '—')) +
    row('<span class="co-tile">' + icon('mail') + '</span>', '<span dir="ltr">' + esc(u.email) + '</span>', '<span dir="ltr">' + esc(x.phone || '') + '</span>') +
    row('<span class="co-tile co-tile--lavender">' + icon('doc') + '</span>', t('profile.cv'), x.cv ? '<bdi>' + esc(x.cv) + '</bdi>' : t('noCv'), x.cv ? cvButton(x) : '') + '</div></div>';
  html += '<div class="co-list mt-3">';
  if (o) html += row('<span class="co-tile co-tile--mint">' + icon('brief') + '</span>', esc(o.title), esc(companyName(o.company)), badge('Active')) +
    row('<span class="co-tile">' + icon('users') + '</span>', esc(supervisorName(x.supervisor) || t('unassigned')), t('role.Supervisor')) +
    row('<span class="co-tile co-tile--lavender">' + icon('doc') + '</span>', rep ? '<a href="' + reportLink(rep) + '" target="_blank">' + esc(rep.file) + '</a>' : t('nav.report'), rep ? fmtDate(rep.date) : '', badge(rep ? rep.status : 'Not submitted'));
  else html += '<p class="co-caption">' + t('noPlacementTitle') + '</p>';
  html += '</div>';
  if (recent.length) html += '<h3 class="app-subtitle">' + t('recentCheckins') + '</h3><div class="co-list">' +
    recent.map(function (a) { return row('<span class="co-tile">' + icon('check') + '</span>', fmtDate(a.date), a.time, badge(a.status)); }).join('') + '</div>';
  html += '<h3 class="app-subtitle">' + t('nav.evaluations') + '</h3><div class="co-list">' + evalRows(S.evals.filter(function (e) { return e.student === sid; })) + '</div>';
  setText('info-title', name);
  setHTML('info-body', html);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('info-modal')).show();
}

/* ---------- shared parts used by several roles ---------- */
/* list of evaluations (company, supervisor, student details) */
function evalRows(evals, showStudent) {
  if (!evals.length) return emptyBox('star', t('eval.waiting'));
  return evals.map(function (e) {
    var title = showStudent ? esc(studentName(e.student)) : (e.type === 'Company' ? t('eval.Company') : t('eval.Academic'));
    var sub = (showStudent ? (e.type === 'Company' ? t('eval.Company') : t('eval.Academic')) + ' · ' : '') + fmtDate(e.date) + (e.comments ? ' · ' + esc(e.comments) : '');
    return row('<span class="co-tile' + (e.type === 'Company' ? ' co-tile--mint' : ' co-tile--lavender') + '">' + icon(e.type === 'Company' ? 'building' : 'cap') + '</span>', title, sub,
      '<span class="co-badge' + (e.score < 60 ? ' co-badge--red' : ' co-badge--mint') + '">' + e.score + ' / 100</span>', ' data-eval="' + e.id + '"');
  }).join('');
}

/* recent activity (dashboards) */
function activityList(studentIds, opts) {
  opts = opts || {};
  var items = [];
  var inScope = function (sid) { return !studentIds || studentIds.indexOf(sid) >= 0; };
  S.attendance.forEach(function (a) {
    if (inScope(a.student) && (!opts.pids || opts.pids.indexOf(a.placement) >= 0))
      items.push({ icon: 'check', tone: a.status === 'Rejected' ? '' : 'mint', date: a.date, time: a.time, text: t('aCheckIn', { n: studentName(a.student), x: a.time }) });
  });
  S.apps.forEach(function (a) {
    var o = find(S.opps, a.opp), key = a.status === 'Accepted' ? 'aAccepted' : a.status === 'Rejected' ? 'aRejectedApp' : 'aApplied';
    if (inScope(a.student) && (!opts.oppIds || opts.oppIds.indexOf(a.opp) >= 0))
      items.push({ icon: 'brief', tone: a.status === 'Accepted' ? 'mint' : '', date: a.date, text: t(key, { n: studentName(a.student), o: o ? o.title : '' }) });
  });
  if (!opts.oppIds) S.reports.forEach(function (r) {
    if (inScope(r.student)) items.push({ icon: 'doc', tone: 'lavender', date: r.date, text: t('aReport', { n: studentName(r.student) }) });
  });
  S.evals.forEach(function (e) {
    if (inScope(e.student)) items.push({ icon: 'star', tone: 'lavender', date: e.date, text: t('aEval', { n: studentName(e.student), x: e.type === 'Company' ? t('companyEval') : t('academicEval'), s: e.score }) });
  });
  items.sort(function (a, b) { var x = a.date + (a.time || ''), y = b.date + (b.time || ''); return x < y ? 1 : x > y ? -1 : 0; });
  items = items.slice(0, opts.limit || 6);
  if (!items.length) return emptyBox('bolt', t('noActivity'));
  return items.map(function (it) {
    return row('<span class="co-tile' + (it.tone ? ' co-tile--' + it.tone : '') + '">' + icon(it.icon) + '</span>', '<span class="app-wrap">' + esc(it.text) + '</span>', relDay(it.date) + (it.time ? ' · ' + it.time : ''));
  }).join('');
}

/* students as rows (company trainees / supervisor students): click opens the details */
function studentRows(list, badgeFor) {
  if (!list.length) return emptyBox('users', t('noRecords'));
  return list.map(function (x) {
    var rate = attendanceRate(x.id), o = x.placement ? oppOfPlacement(x.placement) : null;
    var sub = esc(x.major) + (o ? ' · ' + esc(companyName(o.company)) : '') + ' · ' + t('attendanceRate') + ' ' + (rate == null ? '—' : rate + '%');
    return row(userMedia(x.user), esc(studentName(x.id)), sub,
      badge(badgeFor(x)) + '<button class="co-btn co-btn--soft co-btn--sm" type="button" onclick="openStudent(\'' + x.id + '\')">' + t('viewDetails') + '</button>', ' data-student="' + x.id + '"');
  }).join('');
}

/* final report file: opens through api/file.php (permission is checked by PHP) */
function reportLink(rep) { return ROOT + 'api/file.php?key=' + encodeURIComponent(rep.fileKey); }
/* a student's CV (PHP checks who may open it) */
function cvLink(st) { return ROOT + 'api/file.php?cv=' + encodeURIComponent(st.id.replace(/^s/, '')); }
function cvButton(st) {
  return st.cv ? '<a class="co-btn co-btn--soft co-btn--sm" href="' + cvLink(st) + '" target="_blank" rel="noopener" data-cv="' + st.id + '">' + icon('doc', true) + t('viewCv') + '</a>'
    : '<span class="co-caption">' + t('noCv') + '</span>';
}

/* evaluation form (company: Company evaluation, supervisor: Academic evaluation) */
function setupEvalForm(students, evalType, render) {
  var form = document.getElementById('eval-form');
  if (!students.length) { form.hidden = true; return; }
  form.hidden = false;
  var sel = document.getElementById('ev-student');
  var keep = sel.value;
  sel.innerHTML = students.map(function (x) { return '<option value="' + x.id + '">' + esc(studentName(x.id)) + '</option>'; }).join('');
  if (keep) sel.value = keep;
  var range = document.getElementById('ev-score');
  range.oninput = function () { setText('ev-score-out', range.value); };
  form.onsubmit = function (e) {
    e.preventDefault();
    var comments = document.getElementById('ev-comments').value.trim();
    if (comments.length < 10) { setText('ev-error', t('commentsRequired')); return; }
    setText('ev-error', '');
    act({ type: 'submitEval', student: sel.value, evalType: evalType, score: +range.value, comments: comments }, t('evalSaved'), render)
      .then(function (res) { if (res.ok) { document.getElementById('ev-comments').value = ''; range.value = 80; setText('ev-score-out', '80'); } });
  };
}

/* shared page: notifications.html */
function renderNotifications() {
  var unread = S.notifs.filter(function (n) { return !n.read; }).length;
  show('read-all', unread > 0);
  setHTML('notif-list', S.notifs.length ? S.notifs.map(function (n) {
    return '<div class="co-row' + (n.read ? '' : ' app-unread') + '"><span class="co-tile' + (n.read ? '' : ' co-tile--lavender') + '">' + icon('bell') + '</span>' +
      '<span class="co-row__text"><span class="co-row__title app-wrap" dir="auto">' + esc(notifText(n)) + '</span><span class="co-row__sub"><bdi>' + relDay(n.ts) + ' · ' + n.ts.slice(11) + '</bdi></span></span>' +
      (n.read ? '' : '<span class="co-badge co-badge--lavender">' + t('notif.new') + '</span>') + '</div>';
  }).join('') : emptyBox('bell', t('notif.none')));
}
function readAllNotifs() { act({ type: 'readNotifs' }, null, renderNotifications); }

/* first n characters of a long text */
function shorten(text, n) { text = String(text || ''); return text.length > n ? text.slice(0, n - 1).trim() + '…' : text; }
