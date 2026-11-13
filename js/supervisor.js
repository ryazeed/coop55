/* =====================================================================
   E-COOP - academic supervisor pages
   dashboard.html, students.html, attendance.html, reports.html,
   evaluations.html, export.html
   ===================================================================== */

function myStudents() { return S.students.filter(function (x) { return x.supervisor === ME.ref; }); }
function myStudentIds() { return myStudents().map(function (x) { return x.id; }); }
function pendingAttendance() {
  var ids = myStudentIds();
  return S.attendance.filter(function (a) { return ids.indexOf(a.student) >= 0 && a.status === 'Pending'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}
function reportBadge(x) { var rep = reportOf(x.id); return rep ? rep.status : 'Not submitted'; }

/* ---------- Dashboard ---------- */
function renderSupDashboard() {
  var mine = myStudents(), ids = myStudentIds(), pending = pendingAttendance();
  var reports = S.reports.filter(function (r) { return ids.indexOf(r.student) >= 0 && r.status === 'Submitted'; }).length;
  var placed = mine.filter(function (x) { return x.placement; });
  var avg = placed.length ? Math.round(placed.reduce(function (sum, x) { return sum + attendanceRate(x.id); }, 0) / placed.length) : 0;
  setText('greet', greeting());
  setText('me-short', ME.name);
  setText('k-students', mine.length);
  setText('k-attendance', pending.length);
  setText('k-reports', reports);
  setText('k-rate', avg + '%');

  setHTML('review-list', pending.length ? pending.slice(0, 5).map(function (a) {
    var st = find(S.students, a.student);
    return row(userMedia(st.user), esc(studentName(st.id)), fmtDate(a.date) + ' · ' + a.time,
      '<button class="co-btn co-btn--primary co-btn--sm" type="button" onclick="decideAttendance([\'' + a.id + '\'], \'Approved\', renderSupDashboard)">' + t('common.approve') + '</button>');
  }).join('') : emptyBox('ok', t('sup.all_reviewed')));
  setHTML('student-cards', mine.length ? studentRows(mine.slice(0, 5), reportBadge) : emptyBox('users', t('sup.no_students')));
  setHTML('activity', activityList(ids));
}

/* ---------- My students ---------- */
function renderStudents() {
  var box = document.getElementById('st-q');
  if (!box.oninput) { box.value = searchWord(); box.oninput = renderStudents; }
  var q = box.value.trim().toLowerCase();
  var list = myStudents().filter(function (x) {
    var o = x.placement ? oppOfPlacement(x.placement) : null;
    return !q || (studentName(x.id) + ' ' + x.major + ' ' + (o ? companyName(o.company) : '')).toLowerCase().indexOf(q) >= 0;
  });
  setText('lead', list.length + ' ' + t('sup.k_students').toLowerCase());
  setHTML('student-list', list.length ? studentRows(list, reportBadge) : emptyBox('users', t('sup.no_students')));
}

/* ---------- Attendance review (UC-14) ---------- */
function renderSupAttendance() {
  var pending = pendingAttendance();
  setText('lead', pending.length ? pending.length + ' ' + t('pendingAttendance').toLowerCase() : t('sup.all_reviewed'));
  show('approve-all', pending.length > 0);
  setText('all-count', pending.length);
  document.getElementById('approve-all').onclick = function () {
    if (confirm(t('att.approve_all_confirm'))) decideAttendance(pending.map(function (a) { return a.id; }), 'Approved', renderSupAttendance);
  };
  setHTML('attendance-body', tableRows(pending.map(function (a) {
    var st = find(S.students, a.student), opp = oppOfPlacement(a.placement);
    return [who(st.user), esc(companyName(opp.company)), fmtDate(a.date), '<span dir="ltr">' + a.time + '</span>', badge(a.status),
      '<div class="app-actions"><button class="co-btn co-btn--danger-ghost co-btn--sm" type="button" onclick="rejectAttendance(\'' + a.id + '\')">' + t('common.reject') + '</button>' +
      '<button class="co-btn co-btn--primary co-btn--sm" type="button" onclick="decideAttendance([\'' + a.id + '\'], \'Approved\', renderSupAttendance)">' + t('common.approve') + '</button></div>'];
  }), 6, t('sup.all_reviewed')));
}

function decideAttendance(ids, status, render, comment) {
  var msg = status === 'Approved' ? (ids.length > 1 ? t('att.approved_n', { n: ids.length }) : t('att.approved')) : t('att.rejected');
  act({ type: 'attDecision', ids: ids, status: status, comment: comment || '' }, msg, render);
}

/* rejecting needs a comment: the student sees it */
function rejectAttendance(id) {
  var a = find(S.attendance, id);
  askReason(t('att.reject_title', { name: studentName(a.student), date: fmtDate(a.date) }), t('common.reject'), function (reason) {
    decideAttendance([id], 'Rejected', renderSupAttendance, reason);
  });
}

/* ---------- Final reports (UC-15) ---------- */
function renderSupReports() {
  var ids = myStudentIds();
  var reports = S.reports.filter(function (r) { return ids.indexOf(r.student) >= 0; })
    .sort(function (a, b) { return (a.status === 'Submitted' ? 0 : 1) - (b.status === 'Submitted' ? 0 : 1) || (a.date < b.date ? 1 : -1); });
  setHTML('reports-body', tableRows(reports.map(function (r) {
    var st = find(S.students, r.student);
    var buttons = r.status !== 'Submitted' ? esc(r.comments || '') : '<div class="app-actions">' +
      '<button class="co-btn co-btn--soft co-btn--sm" type="button" onclick="reviseReport(\'' + r.id + '\')">' + t('report.request_revision') + '</button>' +
      '<button class="co-btn co-btn--primary co-btn--sm" type="button" onclick="approveReport(\'' + r.id + '\')">' + t('common.approve') + '</button></div>';
    return [who(st.user), '<a href="' + reportLink(r) + '" target="_blank" rel="noopener">' + icon('doc', true) + ' ' + esc(r.file) + '</a>', fmtDate(r.date), badge(r.status), buttons];
  }), 5, t('sup.no_reports')));
}

function approveReport(id) {
  act({ type: 'reportDecision', id: id, status: 'Approved' }, t('report.reviewed'), renderSupReports);
}

function reviseReport(id) {
  var r = find(S.reports, id);
  askReason(t('report.request_revision') + ' · ' + studentName(r.student), t('report.send_back'), function (reason) {
    act({ type: 'reportDecision', id: id, status: 'Request Revision', comment: reason }, t('report.reviewed'), renderSupReports);
  });
}

/* ---------- Academic evaluations (UC-16) ---------- */
/* allowed only after the placement is completed and the final report is approved (the database checks this too) */
function evalBlock(x) {
  if (!x.placement) return t('eval.no_placement');
  if (find(S.placements, x.placement).status !== 'Completed') return t('eval.not_completed');
  var rep = reportOf(x.id);
  if (!rep || rep.status !== 'Approved') return t('eval.report_first');
  return '';
}

function renderSupEvals() {
  var mine = myStudents(), ids = myStudentIds();
  var evals = S.evals.filter(function (e) { return ids.indexOf(e.student) >= 0; });
  var done = function (x) { return evals.some(function (e) { return e.student === x.id && e.type === 'Academic'; }); };
  setupEvalForm(mine.filter(function (x) { return !done(x) && !evalBlock(x); }), 'Academic', renderSupEvals);
  var waiting = mine.filter(function (x) { return !done(x) && evalBlock(x); }).map(function (x) {
    return row(userMedia(x.user), esc(studentName(x.id)), esc(evalBlock(x)), '<span class="co-badge co-badge--amber">' + t('eval.not_yet') + '</span>');
  }).join('');
  setHTML('eval-list', (evals.length ? evalRows(evals, true) : '') + waiting || emptyBox('star', t('eval.waiting')));
}

/* ---------- Cohort report (UC-17): table, CSV, print ---------- */
var academicReady = false;

function renderAcademic() {
  var mine = myStudents();
  if (!academicReady) {
    var majors = [], pls = [];
    mine.forEach(function (x) { if (majors.indexOf(x.major) < 0) majors.push(x.major); if (x.placement && pls.indexOf(x.placement) < 0) pls.push(x.placement); });
    setHTML('ar-major', '<option value="">' + t('opp.all_majors') + '</option>' + majors.sort().map(function (m) { return '<option>' + esc(m) + '</option>'; }).join(''));
    setHTML('ar-pl', '<option value="">' + t('allPlacements') + '</option>' + pls.map(function (id) {
      var o = oppOfPlacement(id); return '<option value="' + id + '">' + esc(companyName(o.company) + ' · ' + o.title) + '</option>';
    }).join(''));
    ['ar-major', 'ar-pl'].forEach(function (id) { document.getElementById(id).onchange = renderAcademic; });
    academicReady = true;
  }
  var major = document.getElementById('ar-major').value, pl = document.getElementById('ar-pl').value;
  var list = mine.filter(function (x) { return (!major || x.major === major) && (!pl || x.placement === pl); });

  var rows = list.map(function (x) {
    var c = attCounts(x.id), o = x.placement ? oppOfPlacement(x.placement) : null, rep = reportOf(x.id);
    return { student: studentName(x.id), major: x.major, placement: o ? companyName(o.company) + ' · ' + o.title : '—', days: c.days, approved: c.approved,
      pending: c.pending, rejected: c.rejected, att: x.placement ? attendanceRate(x.id) + '%' : '—', report: rep ? rep.status : 'Not submitted',
      cScore: dash(latestScore(x.id, 'Company')), aScore: dash(latestScore(x.id, 'Academic')) };
  });
  var cols = [['student', 'colStudent'], ['major', 'colMajor'], ['placement', 'colPlacement'], ['days', 'colDays', 1], ['approved', 'colApproved', 1],
    ['pending', 'colPending', 1], ['rejected', 'colRejected', 1], ['att', 'colAttRate', 1], ['report', 'colReport', 0, 1], ['cScore', 'colCompanyScore', 1], ['aScore', 'colAcademicScore', 1]];
  var placed = list.filter(function (x) { return x.placement; });
  var avgAtt = average(placed.map(function (x) { return attendanceRate(x.id); }));
  var approved = rows.filter(function (r) { return r.report === 'Approved'; }).length;
  var avgC = average(list.map(function (x) { return latestScore(x.id, 'Company'); }));
  var filters = t('semester') + ' 481 · ' + (major || t('opp.all_majors')) + ' · ' + (pl ? document.getElementById('ar-pl').selectedOptions[0].textContent : t('allPlacements'));

  showReport({
    title: t('academicReportsTitle'), file: 'E-COOP_Academic_Report_' + TODAY, logName: 'academic cohort', filters: filters, cols: cols, rows: rows,
    stats: [[t('stStudents'), rows.length], [t('stAvgAtt'), avgAtt == null ? '—' : avgAtt + '%'], [t('stReportsApproved'), approved + ' / ' + rows.length], [t('stAvgCompany'), avgC == null ? '—' : avgC + '/100']]
  });
}
