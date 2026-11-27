<?php
/*
 * E-COOP - writes a report (from reports.php) as an A4 PDF document with TCPDF.
 * Letterhead with the college name and logo on every page, report number and date,
 * summary boxes, the table (its header repeats on every page), signature lines and page numbers.
 * Arabic reports are right-to-left; English words and numbers inside Arabic text keep their order.
 */
/* TCPDF lists cURL settings (to download images from the internet, which E-COOP never does).
   XAMPP often has the PHP cURL extension turned off, and then PHP stops with "Undefined constant CURLOPT_...".
   Without cURL these names get placeholder numbers; they are never used because TCPDF checks function_exists('curl_init'). */
if (!extension_loaded('curl')) {
    foreach (['CURLINFO_HTTP_CODE', 'CURLOPT_CONNECTTIMEOUT', 'CURLOPT_FAILONERROR', 'CURLOPT_FOLLOWLOCATION', 'CURLOPT_MAXREDIRS', 'CURLOPT_PROTOCOLS', 'CURLOPT_RETURNTRANSFER', 'CURLOPT_SSL_VERIFYHOST', 'CURLOPT_SSL_VERIFYPEER', 'CURLOPT_TIMEOUT', 'CURLOPT_URL', 'CURLOPT_USERAGENT', 'CURLPROTO_FTP', 'CURLPROTO_FTPS', 'CURLPROTO_HTTP', 'CURLPROTO_HTTPS'] as $i => $name) {
        if (!defined($name)) define($name, 90000 + $i);
    }
}
require_once __DIR__ . '/tcpdf/tcpdf.php';

class EcoopPdf extends TCPDF {
    public array $r;

    public function Header(): void {
        $r = $this->r; $ar = $r['lang'] === 'ar';
        $m = 12; $w = $this->getPageWidth();
        // logo at the start side, college name next to it, report number at the end side
        // the logo is placed with left-to-right coordinates: on the right in Arabic, on the left in English
        $this->setRTL(false);
        $this->Image(__DIR__ . '/logo-print.jpg', $ar ? $w - $m - 32 : $m, 8, 32, 0, 'JPG');
        $this->setRTL($ar);
        $this->SetTextColor(27, 54, 93);
        $this->SetFont('dejavusans', 'B', 12);
        $this->SetXY($m + 36, 9);
        $this->Cell(120, 6, bd(rt('footer.college', $r['lang']), $ar), 0, 2, $ar ? 'R' : 'L');
        $this->SetFont('dejavusans', '', 9);
        $this->SetTextColor(90, 98, 112);
        $this->Cell(120, 5, bd(rt('pdf.unit', $r['lang']), $ar), 0, 2, $ar ? 'R' : 'L');
        // the company's logo at the other top corner (right in English, left in Arabic); the report number moves next to it
        $logo = $this->companyLogo();
        $gap = 0;
        if ($logo) {
            $this->setRTL(false);
            try {
                $this->Image($logo, $ar ? $m : $w - $m - 24, 6, 24, 16, '', '', '', false, 300, '', false, false, 0, $ar ? 'LM' : 'RM');
                $gap = 27;
            } catch (Throwable $e) { error_log('E-COOP PDF: company logo skipped: ' . $e->getMessage()); }
            $this->setRTL($ar);
        }
        $this->SetXY($m, 9);
        $this->SetFont('dejavusans', '', 8);
        $this->Cell($w - 2 * $m - 36 - $gap, 5, bd(rt('pdf.number', $r['lang']) . ': ' . $r['number'], $ar), 0, 2, $ar ? 'L' : 'R');
        $this->Cell($w - 2 * $m - 36 - $gap, 5, bd(rt('pdf.date', $r['lang']) . ': ' . rdate($r['date'], $r['lang']) . ' ' . $r['time'], $ar), 0, 2, $ar ? 'L' : 'R');
        $this->SetDrawColor(52, 211, 153);
        $this->SetLineWidth(0.6);
        $this->Line($m, 25, $w - $m, 25);
        $this->SetLineWidth(0.2);
    }

    /* the company's uploaded photo, if TCPDF can read it here: JPEG always; PNG only with GD (transparency); WebP never */
    private function companyLogo(): ?string {
        $rel = (string)($this->r['logo'] ?? '');
        if ($rel === '' || !preg_match('#^avatars/[A-Za-z0-9_.-]+$#', $rel)) return null;
        $path = ECOOP_ROOT . '/storage/' . $rel;
        if (!is_file($path)) return null;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($ext === 'jpg' || $ext === 'jpeg') return $path;
        if ($ext === 'png' && (extension_loaded('gd') || extension_loaded('imagick'))) return $path;
        return null;
    }

    public function Footer(): void {
        $r = $this->r; $ar = $r['lang'] === 'ar';
        $m = 12; $w = $this->getPageWidth();
        $this->SetY(-13);
        $this->SetDrawColor(210, 214, 220);
        $this->Line($m, $this->GetY(), $w - $m, $this->GetY());
        $this->SetFont('dejavusans', '', 7.5);
        $this->SetTextColor(110, 116, 128);
        $this->Cell(($w - 2 * $m) * .7, 7, bd(rt('pdf.footer', $r['lang']), $ar), 0, 0, $ar ? 'R' : 'L');
        $page = rt('pdf.page', $r['lang'], ['n' => $this->getAliasNumPage(), 't' => $this->getAliasNbPages()]);
        $this->Cell(($w - 2 * $m) * .3, 7, $page, 0, 0, $ar ? 'L' : 'R');
    }
}

/* keep English words, e-mails and numbers in their own order inside Arabic text (Unicode left-to-right embedding) */
function bd(string $s, bool $rtl): string {
    if (!$rtl || $s === '') return $s;
    if (!preg_match('/\p{Arabic}/u', $s)) return "\u{202A}" . $s . "\u{202C}";
    return preg_replace_callback('/[A-Za-z0-9][\x20-\x7E]*[A-Za-z0-9.%)]|[A-Za-z0-9]/', fn($m) => "\u{202A}" . $m[0] . "\u{202C}", $s);
}
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

/* one table cell: the first line bold, the next lines small and grey; statuses get a colour */
function pdf_cell($v, array $c, bool $rtl, string $lang, bool $bold = false): string {
    $v = (string)$v;
    if ($c['status'] && $v !== '—') {
        $colors = ['Approved' => '#047857', 'Accepted' => '#047857', 'Completed' => '#047857', 'Active' => '#047857',
                   'Submitted' => '#B45309', 'Pending' => '#B45309', 'Pending Approval' => '#B45309', 'In progress' => '#B45309',
                   'Request Revision' => '#B91C1C', 'Rejected' => '#B91C1C', 'Not submitted' => '#6B7280'];
        return '<span style="color:' . ($colors[$v] ?? '#374151') . ';font-weight:bold">' . h(bd(rstatus($v, $lang), $rtl)) . '</span>';
    }
    $lines = explode("\n", $v);
    $out = ($bold || count($lines) > 1 ? '<b>' : '') . h(bd($lines[0], $rtl)) . ($bold || count($lines) > 1 ? '</b>' : '');
    foreach (array_slice($lines, 1) as $l) $out .= '<br/><span style="color:#6B7280;font-size:7pt">' . h(bd($l, $rtl)) . '</span>';
    return $out;
}

function report_pdf(array $r): string {
    $ar = $r['lang'] === 'ar';
    $pdf = new EcoopPdf('L', 'mm', 'A4', true, 'UTF-8');
    $pdf->r = $r;
    $pdf->SetCreator('E-COOP');
    $pdf->SetAuthor($r['by']);
    $pdf->SetTitle($r['title']);
    $pdf->SetSubject($r['filters']);
    $pdf->SetMargins(12, 30, 12);
    $pdf->SetHeaderMargin(6);
    $pdf->SetFooterMargin(12);
    $pdf->SetAutoPageBreak(true, 18);
    $pdf->setRTL($ar);
    $pdf->setFontSubsetting(true);
    $pdf->SetFont('dejavusans', '', 9);
    $pdf->AddPage();
    $start = $ar ? 'right' : 'left';

    // title, filters, who generated it
    $html = '<h1 style="font-size:17pt;color:#1B365D">' . h(bd($r['title'], $ar)) . '</h1>'
          . '<p style="font-size:9pt;color:#374151"><b>' . h(rt('filtersLabel', $r['lang'])) . ':</b> ' . h(bd($r['filters'], $ar)) . '<br/>'
          . h(bd($r['meta'], $ar)) . ' (' . h(bd($r['byRole'], $ar)) . ')'
          . ($r['note'] ? '<br/><span style="color:#6B7280">' . h(bd($r['note'], $ar)) . '</span>' : '') . '</p>';
    $pdf->writeHTML($html, true, false, true, false, $start);

    // summary boxes
    if ($r['stats']) {
        $cells = '';
        foreach ($r['stats'] as $s) {
            $cells .= '<td style="background-color:#F1F5F9;border:0.3px solid #D9DEE5" align="center"><span style="font-size:7.5pt;color:#6B7280">' . h(bd($s[0], $ar))
                    . '</span><br/><span style="font-size:15pt;font-weight:bold;color:#1B365D">' . h(bd((string)$s[1], $ar)) . '</span></td>';
        }
        $pdf->writeHTML('<table cellpadding="5" cellspacing="4"><tr>' . $cells . '</tr></table>', true, false, true, false, $start);
    }

    // the table; its header row repeats on every page
    $sum = array_sum(array_column($r['cols'], 'w'));
    $head = '';
    foreach ($r['cols'] as $c) {
        $head .= '<th width="' . round($c['w'] * 100 / $sum, 2) . '%" style="background-color:#1B365D;color:#FFFFFF;font-weight:bold;font-size:7pt" align="'
               . ($c['num'] ? 'center' : $start) . '">' . h(bd($c['label'], $ar)) . '</th>';
    }
    $body = '';
    if (!$r['rows']) {
        $body = '<tr><td colspan="' . count($r['cols']) . '" align="center" style="color:#6B7280">' . h(rt('noReportData', $r['lang'])) . '</td></tr>';
    }
    foreach ($r['rows'] as $i => $row) {
        $body .= '<tr nobr="true">';
        foreach ($r['cols'] as $c) {
            $body .= '<td width="' . round($c['w'] * 100 / $sum, 2) . '%" style="background-color:' . ($i % 2 ? '#F8FAFC' : '#FFFFFF') . ';border-bottom:0.3px solid #E2E6EB" align="'
                   . ($c['num'] ? 'center' : $start) . '">' . pdf_cell($row[$c['key']] ?? '', $c, $ar, $r['lang']) . '</td>';
        }
        $body .= '</tr>';
    }
    if ($r['total']) {
        $body .= '<tr nobr="true">';
        foreach ($r['cols'] as $c) {
            $body .= '<td width="' . round($c['w'] * 100 / $sum, 2) . '%" style="background-color:#E8F7F0;font-weight:bold;border-top:0.6px solid #1B365D" align="'
                   . ($c['num'] ? 'center' : $start) . '">' . h(bd((string)($r['total'][$c['key']] ?? ''), $ar)) . '</td>';
        }
        $body .= '</tr>';
    }
    $pdf->SetFont('dejavusans', '', 8);
    $pdf->writeHTML('<table cellpadding="4"><thead><tr>' . $head . '</tr></thead><tbody>' . $body . '</tbody></table>', true, false, true, false, $start);

    // signatures (kept together on one page)
    $sign = fn($label, $name) => '<td width="33.3%"><span style="color:#6B7280;font-size:8pt">' . h(bd($label, $ar)) . '</span><br/><br/>'
        . ($name !== '' ? '<b>' . h(bd($name, $ar)) . '</b>' : '&nbsp;') . '<br/>' . str_repeat('_', 34) . '<br/><span style="color:#6B7280;font-size:7.5pt">'
        . h(rt('pdf.signature', $r['lang'])) . '</span></td>';
    $pdf->SetFont('dejavusans', '', 9);
    $pdf->Ln(4);
    $pdf->writeHTML('<table cellpadding="4" nobr="true"><tr>' . $sign(rt('pdf.prepared', $r['lang']), $r['by']) . $sign(rt('pdf.reviewed', $r['lang']), '')
        . $sign(rt('pdf.stamp', $r['lang']), '') . '</tr></table>', true, false, true, false, $start);

    return $pdf->Output($r['file'] . '.pdf', 'S');
}
