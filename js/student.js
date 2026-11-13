/* =====================================================================
   E-COOP - student pages
   dashboard.html, opportunities.html, opportunity.html, applications.html,
   attendance.html, report.html, evaluations.html
   ===================================================================== */

/* open opportunities of approved companies (what a student may see) */
function visibleOpps() {
  return S.opps.filter(function (o) { var c = find(S.companies, o.company); return o.status === 'Open' && c && c.status === 'Approved'; });
}
function myApplication(oppId) {
  return S.apps.filter(function (a) { return a.student === ME.ref && a.opp === oppId; })[0] || null;
}
/* why the student cannot apply to this opportunity ('' = can apply). PHP and the database check the same rules again. */
function applyBlock(o, st) {
  if (st.placement) return t('apply.placed');
  if (seatsTaken(o.id) >= o.capacity) return t('err.capacity_full');
  if (o.minGpa && st.gpa === '') return t('gpaMissing');
  if (o.minGpa && +st.gpa < +o.minGpa) return t('gpaLow') + ' (' + t('yourGpa') + ' ' + st.gpa + ')';
  return '';
}
function oppLink(o) { return 'opportunity.html?id=' + o.id; }

/* ---------- Dashboard ---------- */
function renderDashboard() {
  var st = myStudent();
  var pl = st.placement ? find(S.placements, st.placement) : null, opp = pl ? find(S.opps, pl.opp) : null;
  var rep = reportOf(st.id), counts = attCounts(st.id);
  setText('greet', greeting());
  setText('me-short', shortName(ME.name));
  show('profile-alert', !st.phone || st.gpa === '');
  show('revision-alert', !!rep && rep.status === 'Request Revision');

  // this week: the last five working days (Sunday to Thursday)
  var days = [], d = TODAY;
  while (days.length < 5) { if (weekday(d) <= 4) days.unshift(d); d = addDays(d, -1); }
  var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], done = 0, pending = 0;
  setHTML('week-bars', days.map(function (day) {
    var a = S.attendance.filter(function (x) { return x.student === st.id && x.date === day; })[0];
    if (a && a.status !== 'Rejected') done++;
    if (a && a.status === 'Pending') pending++;
    var cls = !a ? ' co-bar--empty' : a.status === 'Pending' ? ' co-bar--lav' : a.status === 'Rejected' ? ' co-bar--red' : '';
    var height = !a ? 8 : a.status === 'Pending' ? 70 : a.status === 'Rejected' ? 40 : 92;
    return '<div class="co-bar' + cls + '" title="' + fmtDate(day) + '"><i style="height:' + height + '%"></i><b>' + t('day.' + names[weekday(day)]) + '</b></div>';
  }).join(''));
  setText('week-done', done);
  setText('week-pending', pending);

  // training progress: days checked in out of the working days of the placement
  var total = pl ? workdays(pl.start, pl.end).length : 0;
  setHTML('progress-ring', ring(total ? counts.days * 100 / total : 0, counts.days + ' / ' + total + ' ' + t('common.days')));
  setText('days-approved', counts.approved);
  setText('days-pending', counts.pending);
  setText('days-rejected', counts.rejected);
  var today = S.attendance.filter(function (a) { return a.student === st.id && a.date === TODAY; })[0];
  var evals = S.evals.filter(function (e) { return e.student === st.id; }).length;
  setText('next-step', !pl ? t('nextApply') : rep && rep.status === 'Request Revision' ? t('nextRevision') : !today && TODAY <= pl.end ? t('nextCheckIn')
    : !rep ? t('nextReport') : evals < 2 ? t('nextEvals') : t('nextKeepGoing'));

  setupCheckin(renderDashboard);

  // my placement (company + supervisor), or my latest applications
  setText('placement-title', pl ? t('dash.my_placement') : t('dash.my_applications'));
  if (pl) {
    var sup = supervisorUser(st.supervisor);
    setHTML('placement-list',
      row(media(companyName(opp.company), true), esc(opp.title), esc(companyName(opp.company)) + ' · ' + esc(cityLabel(opp.city, LANG)) + ' · ' + fmtDate(pl.start) + ' – ' + fmtDate(pl.end), badge(pl.status)) +
      (sup ? row('<span class="co-row__media">' + icon('users') + '</span>', esc(sup.name), t('role.Supervisor') + (sup.dept ? ' · ' + esc(sup.dept) : ''))
           : row('<span class="co-row__media">' + icon('users') + '</span>', t('dash.no_supervisor'), t('dash.no_supervisor_d'))));
  } else {
    var apps = S.apps.filter(function (a) { return a.student === st.id; }).slice(0, 3);
    setHTML('placement-list', apps.length ? apps.map(function (a) {
      var o = find(S.opps, a.opp);
      return row(media(companyName(o.company)), '<a href="' + oppLink(o) + '">' + esc(o.title) + '</a>', esc(companyName(o.company)) + ' · ' + t('app.submitted', { date: fmtDate(a.date) }), badge(a.status));
    }).join('') : emptyBox('list', t('dash.no_apps'), '', '<a class="co-btn co-btn--primary co-btn--sm" href="opportunities.html">' + t('dash.browse') + '</a>'));
  }

  // opportunities for my major (only while I am not placed)
  var forMe = pl ? [] : visibleOpps().filter(function (o) { return o.majors.indexOf(st.major) >= 0 && seatsTaken(o.id) < o.capacity && !myApplication(o.id); }).slice(0, 3);
  show('recommended-box', forMe.length > 0);
  setHTML('recommended-list', forMe.map(function (o) {
    return '<a class="co-row app-row-link" href="' + oppLink(o) + '">' + media(companyName(o.company), true) + '<span class="co-row__text"><span class="co-row__title">' + esc(o.title) +
      '</span><span class="co-row__sub">' + esc(companyName(o.company)) + ' · ' + esc(cityLabel(o.city, LANG)) + '</span></span>' + icon('chev') + '</a>';
  }).join(''));

  // final report: training time elapsed + the report status
  if (!pl) setHTML('report-card', '<p class="co-caption">' + t('report.not_ready') + '</p>');
  else {
    var all = workdays(pl.start, pl.end).length, passed = TODAY < pl.start ? 0 : workdays(pl.start, TODAY < pl.end ? TODAY : pl.end).length;
    var pct = all ? Math.round(passed * 100 / all) : 0;
    setHTML('report-card', '<div class="co-metric">' + pct + '%</div><div class="co-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div>' +
      '<p class="co-caption">' + t('dash.time_elapsed_due', { date: fmtDate(pl.end) }) + '</p>' +
      '<div class="co-row"><div class="co-row__text"><span class="co-row__title">' + (rep ? esc(rep.file) : t('report.file')) + '</span>' +
      (rep ? '<span class="co-row__sub">' + t('report.submitted_on', { date: fmtDate(rep.date) }) + '</span>' : '') + '</div>' + badge(rep ? rep.status : 'Not submitted') + '</div>');
  }

  setHTML('dash-notifs', S.notifs.length ? S.notifs.slice(0, 3).map(function (n) {
    return '<a class="co-row app-row-link' + (n.read ? '' : ' app-unread') + '" href="notifications.html"><span class="co-row__text"><span class="co-row__title app-wrap" dir="auto">' + esc(notifText(n)) +
      '</span><span class="co-row__sub"><bdi>' + relDay(n.ts) + ' · ' + n.ts.slice(11) + '</bdi></span></span></a>';
  }).join('') : '<p class="co-caption">' + t('notif.none') + '</p>');
}

/* ---------- Check in with today's code (dashboard + attendance page) ---------- */
function setupCheckin(render) {
  var st = myStudent(), form = document.getElementById('code-form');
  var today = S.attendance.filter(function (a) { return a.student === st.id && a.date === TODAY; })[0];
  show('no-placement', !st.placement);
  show('no-placement-btn', !st.placement);
  show('today-done', !!today);
  if (today) setText('today-done-text', ' ' + t('att.ok', { time: today.time }));
  form.hidden = !st.placement || !!today;
  if (form.hidden) return;

  // six boxes: typing moves to the next box, pasting fills all of them
  var boxes = document.querySelectorAll('#code-boxes input');
  boxes.forEach(function (box, i) {
    box.oninput = function () {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      setText('code-error', '');
      if (box.value && i < 5) boxes[i + 1].focus();
    };
    box.onkeydown = function (e) { if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus(); };
    box.onpaste = function (e) {
      e.preventDefault();
      var digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      for (var k = 0; k < digits.length; k++) boxes[k].value = digits[k];
      boxes[Math.min(digits.length, 5)].focus();
    };
  });

  /* PHP checks the code (BR-14, BR-15, BR-16); 5 wrong codes block check-in for 10 minutes */
  form.onsubmit = function (e) {
    e.preventDefault();
    var code = Array.prototype.map.call(boxes, function (b) { return b.value; }).join('');
    if (code.length < 6) { setText('code-error', t('att.six_digits')); return; }
    var btn = document.getElementById('code-btn'); btn.disabled = true;
    api('action.php', { type: 'checkIn', code: code }).then(function (res) {
      if (res.state) S = res.state;
      btn.disabled = false;
      boxes.forEach(function (b) { b.value = ''; });
      if (res.ok) { toast(t('att.ok', { time: nowTime() })); fillHeader(); render(); return; }
      var key = { code_duplicate: 'att.already', code_expired: 'codeExpired', code_none: 'codeNone', code_locked: 'codeLocked' }[res.code];
      var left = /\((\d) attempts left\)/.exec(res.error || '');
      var msg = res.code === 'code_invalid' && left ? t('att.wrong', { n: left[1] }) : key ? t(key) : res.error;
      show('code-locked', res.code === 'code_locked');
      setText('code-locked-text', res.code === 'code_locked' ? msg : '');
      setText('code-error', res.code === 'code_locked' ? '' : msg);
      boxes[0].focus();
    });
  };
}

/* ---------- Opportunities ---------- */
var filtersReady = false;

function renderOpportunities() {
  var st = myStudent(), visible = visibleOpps();
  show('placed-alert', !!st.placement);

  if (!filtersReady) {          // fill the drop-downs once
    var majors = [], cities = [];
    visible.forEach(function (o) {
      o.majors.split(', ').forEach(function (m) { if (m && majors.indexOf(m) < 0) majors.push(m); });
      if (cities.indexOf(o.city) < 0) cities.push(o.city);
    });
    setHTML('f-major', '<option value="">' + t('opp.all_majors') + '</option>' + majors.sort().map(function (m) { return '<option>' + esc(m) + '</option>'; }).join(''));
    setHTML('f-city', '<option value="">' + t('opp.all_cities') + '</option>' + cities.sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(cityLabel(c, LANG)) + '</option>'; }).join(''));
    document.getElementById('f-q').value = searchWord();
    if (!searchWord() && majors.indexOf(st.major) >= 0) document.getElementById('f-major').value = st.major;
    ['f-q', 'f-major', 'f-city'].forEach(function (id) { document.getElementById(id).oninput = renderOpportunities; });
    filtersReady = true;
  }

  var q = document.getElementById('f-q').value.trim().toLowerCase();
  var major = document.getElementById('f-major').value, city = document.getElementById('f-city').value;
  var list = visible.filter(function (o) {
    var text = (o.title + ' ' + companyName(o.company) + ' ' + o.city + ' ' + cityLabel(o.city, 'ar') + ' ' + o.description).toLowerCase();
    return (!q || text.indexOf(q) >= 0) && (!major || o.majors.indexOf(major) >= 0) && (!city || o.city === city);
  });
  setText('lead', t('opp.count', { n: list.length }));
  if (!list.length) { setHTML('opp-list', emptyBox('search', t('opp.none'), t('opp.none_hint'))); return; }

  setHTML('opp-list', '<div class="row g-3">' + list.map(function (o) {
    var mine = myApplication(o.id), left = o.capacity - seatsTaken(o.id), company = companyName(o.company);
    var low = o.minGpa && (st.gpa === '' || +st.gpa < +o.minGpa);
    return '<div class="col-md-6 col-xl-4"><article class="co-card h-100 app-oppcard" data-opp="' + o.id + '">' +
      '<div class="co-card__head">' + media(company, true) + '<div class="co-row__text"><h2 class="co-row__title"><a class="stretched-link" href="' + oppLink(o) + '">' + esc(o.title) + '</a></h2>' +
      '<span class="co-row__sub">' + esc(company) + '</span></div></div>' +
      '<p class="co-caption app-body-text">' + esc(shorten(o.description, 140)) + '</p>' +
      '<div class="app-tags"><span class="co-badge">' + icon('pin', true) + esc(cityLabel(o.city, LANG)) + '</span><span class="co-badge co-badge--lavender">' + esc(o.majors) + '</span>' +
      '<span class="co-badge' + (low ? ' co-badge--red' : '') + '">' + t('minGpa') + ': ' + (o.minGpa || t('noMinimum')) + '</span>' +
      (mine ? badge(mine.status) : '<span class="co-badge' + (left > 0 ? ' co-badge--mint' : '') + '">' + (left > 0 ? t('opp.seats', { n: left }) : t('opp.full')) + '</span>') +
      '</div></article></div>';
  }).join('') + '</div>');
}

/* ---------- One opportunity: details + Apply ---------- */
function renderOpportunity() {
  var id = (/[?&]id=(o\d+)/.exec(location.search) || [])[1];
  var o = visibleOpps().filter(function (x) { return x.id === id; })[0] || (myApplication(id) ? find(S.opps, id) : null);
  if (!o) { setHTML('opp-detail', '<div class="col-12">' + emptyBox('search', t('err.t404'), t('err.d404'), '<a class="co-btn co-btn--primary co-btn--sm" href="opportunities.html">' + t('dash.browse') + '</a>') + '</div>'); return; }

  var st = myStudent(), company = find(S.companies, o.company), taken = seatsTaken(o.id), left = Math.max(0, o.capacity - taken);
  setText('od-media', initials(company.name));
  setText('od-title', o.title);
  setText('od-sub', company.name + ' · ' + cityLabel(o.city, LANG));
  setHTML('od-tags', '<span class="co-badge">' + icon('pin', true) + esc(cityLabel(o.city, LANG)) + '</span><span class="co-badge co-badge--lavender">' + esc(o.majors) + '</span>' +
    '<span class="co-badge">' + t('opp.posted', { date: fmtDate(o.posted) }) + '</span>');
  setText('od-desc', o.description);
  setText('od-left', left);
  setText('od-cap', o.capacity);
  document.getElementById('od-bar').style.width = (o.capacity ? Math.round(taken * 100 / o.capacity) : 0) + '%';
  setText('od-gpa', o.minGpa ? o.minGpa + ' / 4.00' + (st.gpa !== '' ? ' · ' + t('yourGpa') + ' ' + st.gpa : '') : t('noMinimum'));

  var mine = myApplication(o.id), block = applyBlock(o, st);
  if (mine) {
    setHTML('od-action', '<div class="co-alert' + (mine.status === 'Accepted' ? ' co-alert--mint' : mine.status === 'Rejected' ? ' co-alert--red' : '') + '">' + icon('ok') + '<div><strong>' + esc(statusText(mine.status)) + '</strong>' +
      '<span>' + t('opp.applied_on', { date: fmtDate(mine.date) }) + '</span></div></div><a class="co-btn co-btn--soft co-btn--sm" href="applications.html">' + t('nav.applications') + '</a>');
  } else if (block) {
    setHTML('od-action', '<div class="co-alert co-alert--amber" id="apply-block">' + icon('info') + '<div>' + esc(block) + '</div></div>' +
      '<button class="co-btn co-btn--primary w-100 justify-content-center" type="button" disabled>' + t('apply.button') + '</button>');
  } else {
    setHTML('od-action', '<button class="co-btn co-btn--primary w-100 justify-content-center" type="button" id="apply-btn" onclick="applyTo(\'' + o.id + '\')">' + icon('send', true) + t('apply.button') + '</button>' +
      '<p class="co-caption">' + t('apply.note') + '</p>');
  }
}

function applyTo(oppId) {
  act({ type: 'apply', opp: oppId }, t('apply.done'), renderOpportunity);
}

/* ---------- My applications ---------- */
var appStatus = '';

function renderApplications() {
  setupChips('app-filter', 'data-status', appStatus, function (v) { appStatus = v; renderApplications(); });
  var apps = S.apps.filter(function (a) { return a.student === ME.ref && (!appStatus || a.status === appStatus); });
  if (!apps.length) {
    setHTML('apps-list', emptyBox('list', t('dash.no_apps'), '', '<a class="co-btn co-btn--primary co-btn--sm" href="opportunities.html">' + t('dash.browse') + '</a>'));
    return;
  }
  setHTML('apps-list', '<div class="co-card"><div class="co-list">' + apps.map(function (a) {
    var o = find(S.opps, a.opp);
    var sub = esc(companyName(o.company)) + ' · ' + esc(cityLabel(o.city, LANG)) + ' · ' + t('app.submitted', { date: fmtDate(a.date) }) +
      (a.status === 'Rejected' && a.reason ? '</span><span class="co-row__sub app-reason">' + t('common.reason') + ': ' + esc(a.reason) : '');
    var right = badge(a.status) + (a.status === 'Submitted'
      ? '<button class="co-btn co-btn--danger-ghost co-btn--sm" type="button" onclick="withdraw(\'' + a.id + '\')">' + t('app.withdraw') + '</button>' : '');
    return row(media(companyName(o.company)), '<a href="' + oppLink(o) + '">' + esc(o.title) + '</a>', sub, right, ' data-app="' + a.id + '"');
  }).join('') + '</div></div>');
}

function withdraw(appId) {
  if (confirm(t('app.withdraw_confirm'))) act({ type: 'withdraw', id: appId }, t('app.withdrawn'), renderApplications);
}

/* ---------- Attendance ---------- */
function renderAttendance() {
  var st = myStudent(), counts = attCounts(st.id);
  setText('today-date', fmtDate(TODAY));
  setupCheckin(renderAttendance);
  setText('att-approved', counts.approved);
  setText('att-pending', counts.pending);
  setText('att-rejected', counts.rejected);
  var mine = S.attendance.filter(function (a) { return a.student === st.id; }).slice().reverse();
  setHTML('history-body', tableRows(mine.map(function (a) {
    return [fmtDate(a.date), '<span dir="ltr">' + a.time + '</span>', badge(a.status), esc(a.comment || '—')];
  }), 4, t('att.none_yet')));
}

/* ---------- Final report ---------- */
function renderReport() {
  var st = myStudent(), rep = reportOf(st.id), pl = st.placement ? find(S.placements, st.placement) : null;
  show('no-placement', !pl);
  show('current-report', !!rep);
  show('report-none', !rep && !!pl);
  if (rep) {
    document.getElementById('report-link').href = reportLink(rep);
    setText('report-file', rep.file);
    setText('report-when', t('report.submitted_on', { date: fmtDate(rep.date) }));
    setHTML('report-badge', badge(rep.status));
  }
  show('report-approved', !!rep && rep.status === 'Approved');
  setText('report-approved-c', rep && rep.comments ? rep.comments : '');
  show('report-revision', !!rep && rep.status === 'Request Revision');
  setText('report-revision-c', rep && rep.comments ? rep.comments : '');
  // upload: the first time, or again when the supervisor asks for a revision
  var canUpload = !!pl && (!rep || rep.status === 'Request Revision');
  show('upload-form', canUpload);
  setText('upload-label', rep ? t('report.reupload') : t('report.upload'));
  setText('report-due', pl && pl.due ? t('reportDue') + ': ' + fmtDate(pl.due) : '');

  document.getElementById('upload-form').onsubmit = function (e) {
    e.preventDefault();
    var file = document.getElementById('report-input').files[0];
    if (!file || !/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) { setText('upload-error', t('fileTypeError')); return; }
    setText('upload-error', '');
    var btn = document.getElementById('upload-btn'); btn.disabled = true;
    // 1) upload the file  2) save the report record
    var key = 'f' + Date.now(), data = new FormData();
    data.append('key', key); data.append('file', file, file.name);
    fetch(ROOT + 'api/upload.php', { method: 'POST', body: data, credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (up) {
      if (!up.ok) { btn.disabled = false; setText('upload-error', up.error); return; }
      act({ type: 'submitReport', file: file.name, fileKey: key }, t('report.uploaded'), renderReport).then(function () {
        btn.disabled = false; document.getElementById('report-input').value = '';
      });
    });
  };
}

/* ---------- My evaluations ---------- */
function renderEvaluations() {
  var st = myStudent(), evals = S.evals.filter(function (e) { return e.student === st.id; }), rep = reportOf(st.id);
  ['Company', 'Academic'].forEach(function (type) {
    var e = evals.filter(function (x) { return x.type === type; })[0];
    setHTML('eval-' + type, e
      ? '<div class="co-metric">' + e.score + ' <small>/ 100</small></div><div class="co-progress co-progress--thin' + (type === 'Company' ? ' co-progress--mint' : '') + '"><span style="width:' + e.score + '%"></span></div>' +
        '<p class="app-body-text" dir="auto">' + esc(e.comments || '') + '</p><p class="co-caption">' + esc(userName(e.by)) + ' · ' + fmtDate(e.date) + '</p>'
      : emptyBox(type === 'Company' ? 'building' : 'cap', t('eval.waiting'), t('eval.waiting_' + type)));
  });
  setText('ev-days', attCounts(st.id).approved);
  setText('ev-avg', evals.length ? Math.round(evals.reduce(function (sum, e) { return sum + e.score; }, 0) / evals.length) : '—');
  setHTML('ev-report', badge(rep ? rep.status : 'Not submitted'));
}
