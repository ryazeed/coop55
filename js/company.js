/* =====================================================================
   E-COOP - company pages
   dashboard.html, opportunities.html, applicants.html, daily-code.html,
   trainees.html, profile.html
   ===================================================================== */

/* the company's opportunities, placements and trainees */
function myCompanyData() {
  var opps = S.opps.filter(function (o) { return o.company === ME.ref; });
  var oppIds = opps.map(function (o) { return o.id; });
  var placements = S.placements.filter(function (p) { return oppIds.indexOf(p.opp) >= 0; });
  var pids = placements.map(function (p) { return p.id; });
  var trainees = S.students.filter(function (x) { return pids.indexOf(x.placement) >= 0; });
  return { opps: opps, oppIds: oppIds, placements: placements, pids: pids, trainees: trainees };
}

/* message for a company that is not approved yet (or was rejected) */
function showApprovalAlert() {
  var c = find(S.companies, ME.ref);
  show('pending-alert', c.status !== 'Approved');
  if (c.status === 'Rejected') { setText('pending-title', t('company.status_Rejected')); setText('pending-text', ''); }
  return c;
}

/* ---------- Dashboard ---------- */
function renderOverview() {
  var k = myCompanyData();
  showApprovalAlert();
  setText('greet', greeting());
  setText('me-short', ME.name);
  var waiting = S.apps.filter(function (a) { return k.oppIds.indexOf(a.opp) >= 0 && a.status === 'Submitted'; });
  var todays = S.attendance.filter(function (a) { return k.pids.indexOf(a.placement) >= 0 && a.date === TODAY; }).length;
  setText('k-open', k.opps.filter(function (o) { return o.status === 'Open'; }).length);
  setText('k-pending', waiting.length);
  setText('k-trainees', k.trainees.length);
  setText('k-today', todays + ' / ' + k.trainees.length);

  var active = k.placements.filter(function (p) { return p.status === 'Active'; });
  setHTML('code-blocks', active.length ? active.map(function (pl) { return codeBlock(pl, 'renderOverview', false); }).join('')
    : emptyBox('key', t('code.no_placements')));
  setHTML('new-applicants', waiting.length ? waiting.slice(0, 4).map(function (a) {
    var st = find(S.students, a.student);
    return '<a class="co-row app-row-link" href="applicants.html">' + userMedia(st.user) + '<span class="co-row__text"><span class="co-row__title">' + esc(studentName(st.id)) +
      '</span><span class="co-row__sub">' + esc(st.major) + ' · ' + esc(find(S.opps, a.opp).title) + '</span></span>' + icon('chev') + '</a>';
  }).join('') : emptyBox('users', t('company.no_applicants')));
  setHTML('activity', activityList(null, { pids: k.pids, oppIds: k.oppIds }));
}

/* ---------- Daily code ---------- */
/* today's code of one placement, or the button that creates it */
function codeBlock(pl, renderName, big) {
  var code = S.codes.filter(function (c) { return c.placement === pl.id && c.date === TODAY && c.status === 'Active'; })[0];
  var trainees = S.students.filter(function (x) { return x.placement === pl.id; });
  var ins = S.attendance.filter(function (a) { return a.placement === pl.id && a.date === TODAY; });
  var html = '<div class="app-codeblock" data-placement="' + pl.id + '">';
  if (!big) html += '<p class="co-row__title">' + esc(oppOfPlacement(pl.id).title) + '</p>';
  if (code) {
    html += '<div class="co-code co-code--display' + (big ? ' app-code-lg' : '') + '" aria-label="' + t('att.code_label') + ' ' + code.code + '">' +
      code.code.split('').map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
      '<p class="co-caption">' + t('code.expires') + ' · ' + t('code.checked', { n: ins.length, t: trainees.length }) + '</p>';
  } else {
    html += '<p class="co-caption app-body-text">' + t('code.none_today') + '</p>' +
      '<div><button class="co-btn co-btn--primary' + (big ? '' : ' co-btn--sm') + '" type="button" onclick="makeCode(\'' + pl.id + '\', ' + renderName + ')">' + icon('key', true) + t('code.generate') + '</button></div>';
  }
  return html + '</div>';
}

function makeCode(pid, render) {
  act({ type: 'genCode', placement: pid }, t('code.generated'), render);
}

function renderDailyCode() {
  var k = myCompanyData(), active = k.placements.filter(function (p) { return p.status === 'Active'; });
  setHTML('code-cards', active.length ? active.map(function (pl) {
    var students = S.students.filter(function (x) { return x.placement === pl.id; });
    return '<div class="col-lg-6"><section class="co-card h-100"><div class="co-card__head"><span class="co-tile co-tile--mint">' + icon('key') + '</span>' +
      '<h2 class="co-card__title">' + esc(oppOfPlacement(pl.id).title) + '</h2><span class="co-caption">' + fmtDate(TODAY) + '</span></div>' +
      codeBlock(pl, 'renderDailyCode', true) +
      '<div class="co-list">' + students.map(function (x) {
        var a = S.attendance.filter(function (y) { return y.student === x.id && y.date === TODAY; })[0];
        return row(userMedia(x.user), esc(studentName(x.id)), a ? t('code.checked_at', { time: a.time }) : t('code.not_yet'), a ? badge(a.status) : '');
      }).join('') + '</div></section></div>';
  }).join('') : '<div class="col-12">' + emptyBox('key', t('code.no_placements')) + '</div>');

  var past = S.codes.filter(function (c) { return k.pids.indexOf(c.placement) >= 0 && c.status === 'Expired'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 30);
  setHTML('codes-body', tableRows(past.map(function (c) {
    return [fmtDate(c.date), esc(oppOfPlacement(c.placement).title), '<span dir="ltr" class="app-mono">' + c.code + '</span>', badge(c.status)];
  }), 4));
}

/* ---------- Opportunities (post a new one, see their status) ---------- */
var postFormReady = false;

function showPostForm(visible) {
  show('post-form', visible);
  show('new-btn', !visible);
  if (visible) document.getElementById('o-title').focus();
}

function renderPostings() {
  var k = myCompanyData(), company = showApprovalAlert(), approved = company.status === 'Approved';
  show('new-btn', approved && document.getElementById('post-form').hidden);

  if (!postFormReady) {
    setHTML('o-city', SA_CITIES.map(function (c) { return '<option value="' + esc(c.en) + '">' + esc(LANG === 'ar' ? c.ar : c.en) + '</option>'; }).join(''));
    document.getElementById('o-city').value = company.city;
    // template chips fill the form
    document.querySelectorAll('#templates .co-chip').forEach(function (chip) {
      chip.onclick = function () {
        document.querySelectorAll('#templates .co-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        document.getElementById('o-title').value = chip.dataset.title;
        document.getElementById('o-major').value = chip.dataset.major;
        document.getElementById('o-desc').value = chip.dataset.desc;
      };
    });
    document.getElementById('post-form').onsubmit = submitPosting;
    if (approved && location.search.indexOf('new=1') >= 0) showPostForm(true);
    postFormReady = true;
  }

  setHTML('postings-body', tableRows(k.opps.map(function (o) {
    var apps = S.apps.filter(function (a) { return a.opp === o.id; }).length;
    var close = o.status === 'Open' ? ' <button class="co-btn co-btn--danger-ghost co-btn--sm" type="button" onclick="closeOpp(\'' + o.id + '\')">' + t('opp.close') + '</button>' : '';
    return [esc(o.title), esc(cityLabel(o.city, LANG)), seatsTaken(o.id) + ' / ' + o.capacity, o.minGpa || '—', apps, fmtDate(o.posted), badge(o.status) + close];
  }), 7, t('opp.none_company')));
}

function submitPosting(e) {
  e.preventDefault();
  var title = document.getElementById('o-title').value.trim();
  var desc = document.getElementById('o-desc').value.trim();
  var cap = +document.getElementById('o-cap').value;
  var gpa = document.getElementById('o-gpa').value.trim();                 // optional
  var gpaOk = gpa === '' || (!isNaN(gpa) && +gpa >= 0 && +gpa <= 4);
  setText('o-title-err', title.length < 5 ? t('titleRequired') : '');
  setText('o-desc-err', desc.length < 20 ? t('descRequired') : '');
  setText('o-gpa-err', gpaOk ? '' : t('minGpaError'));
  if (title.length < 5 || desc.length < 20 || !gpaOk) return;
  if (!(cap >= 1 && cap <= 20)) { toast(t('capacityError'), true); return; }
  act({ type: 'postOpp', opp: { title: title, city: document.getElementById('o-city').value, majors: document.getElementById('o-major').value, capacity: cap, minGpa: gpa, description: desc } },
    t('opp.submitted'), renderPostings).then(function (res) {
    if (res.ok) { document.getElementById('post-form').reset(); document.getElementById('o-city').value = find(S.companies, ME.ref).city; showPostForm(false); }
  });
}

function closeOpp(id) {
  if (confirm(t('opp.close_confirm'))) act({ type: 'closeOpp', id: id }, t('opp.closed'), renderPostings);
}

/* ---------- Applicants ---------- */
var apStatus = 'Submitted', apReady = false;

function renderApplicants() {
  var k = myCompanyData();
  if (!apReady) {
    setHTML('ap-opp', '<option value="">' + t('company.all_opps') + '</option>' + k.opps.map(function (o) { return '<option value="' + o.id + '">' + esc(o.title) + '</option>'; }).join(''));
    document.getElementById('ap-q').value = searchWord();
    if (searchWord()) apStatus = '';
    document.getElementById('ap-q').oninput = renderApplicants;
    document.getElementById('ap-opp').onchange = renderApplicants;
    apReady = true;
  }
  setupChips('ap-status', 'data-status', apStatus, function (v) { apStatus = v; renderApplicants(); });
  var q = document.getElementById('ap-q').value.trim().toLowerCase(), oppId = document.getElementById('ap-opp').value;
  var mine = S.apps.filter(function (a) { return k.oppIds.indexOf(a.opp) >= 0; });
  var apps = mine.filter(function (a) {
    var st = find(S.students, a.student), text = (studentName(st.id) + ' ' + st.major + ' ' + find(S.opps, a.opp).title).toLowerCase();
    return (!apStatus || a.status === apStatus) && (!oppId || a.opp === oppId) && (!q || text.indexOf(q) >= 0);
  });
  setText('lead', t('company.n_pending', { n: mine.filter(function (a) { return a.status === 'Submitted'; }).length }));
  if (!apps.length) { setHTML('applicants-list', emptyBox('users', t('company.no_applicants'))); return; }

  setHTML('applicants-list', '<div class="co-card"><div class="co-list">' + apps.map(function (a) {
    var st = find(S.students, a.student), u = find(S.users, st.user), o = find(S.opps, a.opp), full = seatsTaken(o.id) >= o.capacity;
    var sub = esc(st.major) + ' · ' + t('profile.gpa') + ' ' + esc(st.gpa || '—') + (o.minGpa ? ' (' + t('minGpa') + ' ' + o.minGpa + ')' : '') + ' · ' + esc(o.title) + ' · ' + fmtDate(a.date) +
      '</span><span class="co-row__sub" dir="ltr">' + esc(u.email) + (st.phone ? ' · ' + esc(st.phone) : '');
    var right = a.status !== 'Submitted' ? badge(a.status)
      : '<button class="co-btn co-btn--soft co-btn--sm" type="button" onclick="openStudent(\'' + st.id + '\')">' + t('viewDetails') + '</button>' +
        '<button class="co-btn co-btn--danger-ghost co-btn--sm" type="button" onclick="rejectApp(\'' + a.id + '\')">' + t('common.reject') + '</button>' +
        '<button class="co-btn co-btn--primary co-btn--sm" type="button" onclick="acceptApp(\'' + a.id + '\')"' + (full ? ' disabled' : '') + '>' + t('common.accept') + '</button>';
    return row(userMedia(st.user), esc(u.name), sub, right, ' data-app="' + a.id + '"');
  }).join('') + '</div></div>');
}

function acceptApp(id) {
  var a = find(S.apps, id);
  if (confirm(t('app.accept_confirm', { name: studentName(a.student) }))) act({ type: 'appDecision', id: id, status: 'Accepted' }, t('app.accepted'), renderApplicants);
}

function rejectApp(id) {
  var a = find(S.apps, id);
  askReason(t('app.reject_title', { name: studentName(a.student) }), t('common.reject'), function (reason) {
    act({ type: 'appDecision', id: id, status: 'Rejected', reason: reason }, t('app.rejected'), renderApplicants);
  });
}

/* ---------- Trainees and evaluations ---------- */
function renderTrainees() {
  var k = myCompanyData(), ids = k.trainees.map(function (x) { return x.id; });
  var evals = S.evals.filter(function (e) { return e.type === 'Company' && ids.indexOf(e.student) >= 0; });
  var done = function (x) { return evals.some(function (e) { return e.student === x.id; }); };
  setHTML('trainee-cards', k.trainees.length ? studentRows(k.trainees, function (x) { return done(x) ? 'Evaluated' : 'Pending Evaluation'; }) : emptyBox('users', t('company.no_trainees')));
  setupEvalForm(k.trainees.filter(function (x) { return !done(x); }), 'Company', renderTrainees);
  setHTML('eval-list', evalRows(evals, true));
}

/* ---------- Company profile ---------- */
var companyFormReady = false;

function renderCompanyProfile() {
  var c = find(S.companies, ME.ref);
  setText('cp-media', initials(c.name));
  setText('cp-name', c.name);
  setText('cp-sub', cityLabel(c.city, LANG) + (c.cr ? ' · CR ' + c.cr : ''));
  setHTML('cp-status', badge(c.status));
  setText('cp-note', c.status === 'Approved' ? t('opp.form_sub') : c.status === 'Rejected' ? t('company.status_Rejected') : t('company.pending_d'));
  if (companyFormReady) return;
  companyFormReady = true;

  document.getElementById('c-name').value = c.name;
  document.getElementById('c-email').value = ME.email;
  document.getElementById('c-phone').value = ME.phone || '';
  setHTML('c-city', SA_CITIES.map(function (x) { return '<option value="' + esc(x.en) + '">' + esc(LANG === 'ar' ? x.ar : x.en) + '</option>'; }).join(''));
  document.getElementById('c-city').value = c.city;

  document.getElementById('company-form').onsubmit = function (e) {
    e.preventDefault();
    var name = document.getElementById('c-name').value.trim(), phone = document.getElementById('c-phone').value.trim();
    var phoneOk = phone === '' || /^0\d{8,9}$/.test(phone);
    setText('c-name-err', name.length < 3 ? t('cpNameError') : '');
    setText('c-phone-err', phoneOk ? '' : t('cpPhoneError'));
    if (name.length < 3 || !phoneOk) return;
    act({ type: 'companyProfile', name: name, city: document.getElementById('c-city').value, phone: phone }, t('cpSaved'), renderCompanyProfile);
  };
}

/* ---------- Trainee report: attendance, final report, evaluations and academic supervisor ---------- */
/* PHP (api/report.php?kind=company) reads only this company's trainees */
var companyReportReady = false;

function renderCompanyReport() {
  if (!companyReportReady) {
    var opps = myCompanyData().opps.filter(function (o) { return S.placements.some(function (p) { return p.opp === o.id; }); });
    setHTML('cr-opp', '<option value="">' + t('company.all_opps') + '</option>' + opps.map(function (o) { return '<option value="' + o.id + '">' + esc(o.title) + '</option>'; }).join(''));
    document.getElementById('cr-opp').onchange = renderCompanyReport;
    companyReportReady = true;
  }
  loadReport('company', { opp: document.getElementById('cr-opp').value });
}
