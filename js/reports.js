/* =====================================================================
   E-COOP - reports (company trainee report, supervisor cohort report UC-17,
   admin institutional reports FR-21)
   PHP calculates every report (api/report.php). The page shows it as a table,
   "Download PDF" gets the official PDF from the server, "Download CSV" saves the same rows for Excel.
   ===================================================================== */

function latestScore(sid, type) { var e = S.evals.filter(function (x) { return x.student === sid && x.type === type; })[0]; return e ? e.score : null; }
function average(list) { var v = list.filter(function (x) { return x != null; }); return v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length) : null; }
function dash(v) { return v == null || v === '' ? '—' : v; }

/* ask PHP for a report and draw it. params = filters, e.g. { opp: 'o2' } */
function loadReport(kind, params) {
  var query = 'kind=' + kind + '&lang=' + LANG;
  Object.keys(params || {}).forEach(function (k) { if (params[k]) query += '&' + k + '=' + encodeURIComponent(params[k]); });
  var pdf = document.getElementById('pdf-btn');
  pdf.href = ROOT + 'api/report.php?' + query + '&format=pdf';
  return api('report.php?' + query).then(function (res) {
    if (!res.ok) { toast(res.error, true); return; }
    showReport(res.report);
  });
}

/* r = the report from PHP: { title, meta, filters, note, cols: [{key, label, num, status}], rows, total, stats: [[label, value]], number, file } */
function showReport(r) {
  var empty = !r.rows.length;
  setText('report-title', 'E-COOP · ' + r.title);
  setText('report-meta', r.meta + ' · ' + r.filters + (r.note ? ' · ' + r.note : ''));
  setHTML('report-stats', (r.stats || []).map(function (s) {
    return '<section class="co-card"><span class="co-caption">' + esc(s[0]) + '</span><div class="co-metric"><bdi dir="ltr">' + esc(s[1]) + '</bdi></div></section>';   // "0 / 3" keeps its order in Arabic
  }).join(''));
  setHTML('report-head', '<tr>' + r.cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr>');
  var rows = r.rows.concat(r.total ? [r.total] : []);
  setHTML('report-body', empty ? '<tr><td colspan="' + r.cols.length + '" class="co-caption">' + t('noReportData') + '</td></tr>' : rows.map(function (row, i) {
    var isTotal = r.total && i === rows.length - 1;
    return '<tr' + (isTotal ? ' class="app-total"' : '') + '>' + r.cols.map(function (c) {
      return '<td' + (c.num ? ' class="num"' : '') + '>' + cellHTML(row[c.key], c, isTotal) + '</td>';
    }).join('') + '</tr>';
  }).join(''));
  var pdf = document.getElementById('pdf-btn');
  pdf.classList.toggle('disabled', empty);
  pdf.setAttribute('aria-disabled', empty ? 'true' : 'false');
  pdf.onclick = function (e) { if (empty) e.preventDefault(); else toast(t('exportedToast')); };
  document.getElementById('csv-btn').disabled = empty;
  document.getElementById('csv-btn').onclick = function () {
    downloadCSV(r);
    act({ type: 'logExport', report: r.kind + ' ' + r.number, format: 'CSV' }, t('exportedToast'));
  };
}

/* a cell: statuses get a badge; a second line (e.g. university ID, period, supervisor e-mail) is shown small */
function cellHTML(v, c, isTotal) {
  v = v == null ? '' : String(v);
  if (c.status && v !== '—' && !isTotal) return badge(v);
  var lines = v.split('\n');
  if (lines.length === 1) return esc(v);
  return '<strong>' + esc(lines[0]) + '</strong>' + lines.slice(1).map(function (l) {
    return '<br><span class="co-caption"' + (/@|^0\d/.test(l) ? ' dir="ltr"' : '') + '>' + esc(l) + '</span>';
  }).join('');
}

/* CSV with a BOM so Excel shows Arabic correctly */
function downloadCSV(r) {
  function cell(v) { v = v == null || v === '—' ? '' : String(v).replace(/\n/g, ' · '); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var lines = [cell(r.title), cell(r.meta), cell(r.filters), cell(r.number), ''];
  lines.push(r.cols.map(function (c) { return cell(c.label); }).join(','));
  r.rows.concat(r.total ? [r.total] : []).forEach(function (row) {
    lines.push(r.cols.map(function (c) { var v = row[c.key]; return cell(c.status && v !== '—' ? statusText(v) : v); }).join(','));
  });
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = r.file + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
