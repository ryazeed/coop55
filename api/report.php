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

    // a PDF needs a little more time and memory than a page; PHP warnings (XAMPP shows them) must not end up inside the file
    @ini_set('memory_limit', '256M');
    @set_time_limit(120);
    ob_start();
    require __DIR__ . '/lib/report_pdf.php';
    $pdf = report_pdf($r);
    $noise = ob_get_clean();
    if ($noise !== '' && $noise !== false) error_log('E-COOP PDF: PHP printed text while building the PDF: ' . substr(strip_tags($noise), 0, 500));
    while (ob_get_level()) ob_end_clean();
    audit((int)$me['user_id'], 'Exported ' . $kind . ' report (PDF) ' . $r['number'], 'REPORT', null);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $r['file'] . '.pdf"');
    header('Content-Length: ' . strlen($pdf));
    header('Cache-Control: private, no-store');
    echo $pdf;
});
