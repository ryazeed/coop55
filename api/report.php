<?php
/*
 * GET api/report.php?kind=company&lang=en            -> { ok, report }  (the table on the page)
 * GET api/report.php?kind=company&lang=ar&format=pdf -> the report as a PDF file (download)
 *
 * kind: company (Company), cohort (Academic Supervisor), placement | companies | completion (Admin)
 * filters: opp (company), major + placement (cohort)
 * Every report is calculated here from MySQL for the signed-in user only (see lib/reports.php).
 */
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/reports.php';

handle(function () {
    $me = require_user();
    $kind = (string)($_GET['kind'] ?? 'company');
    $lang = ($_GET['lang'] ?? 'en') === 'ar' ? 'ar' : 'en';
    $r = build_report($me, $kind, $_GET, $lang);

    if (($_GET['format'] ?? '') !== 'pdf') { json_out(['ok' => true, 'report' => $r]); return; }

    require __DIR__ . '/lib/report_pdf.php';
    $pdf = report_pdf($r);
    audit((int)$me['user_id'], 'Exported ' . $kind . ' report (PDF) ' . $r['number'], 'REPORT', null);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $r['file'] . '.pdf"');
    header('Content-Length: ' . strlen($pdf));
    header('Cache-Control: private, no-store');
    echo $pdf;
});
