<?php
/*
 * E-COOP - the five reports, calculated in PHP from MySQL.
 * The same data is shown as a table on the page (JSON) and written to the PDF (report_pdf.php),
 * so the screen, the CSV and the PDF always show the same numbers.
 *
 *   company     Company     trainee report: own trainees, attendance, final report, scores, academic supervisor
 *   cohort      Supervisor  cohort report: own students
 *   placement   Admin       placement by major
 *   companies   Admin       company participation
 *   completion  Admin       completion and evaluations
 *
 * Each report: ['title', 'meta', 'filters', 'note', 'cols' => [[key, label, isNumber, isStatus, width]], 'rows', 'total', 'stats', 'file']
 */

const REPORT_ROLES = ['company' => 'Company', 'cohort' => 'Academic Supervisor', 'placement' => 'Admin', 'companies' => 'Admin', 'completion' => 'Admin'];

/* ---------------------------------------------------------------- texts (the same English/Arabic texts as the pages, from lang.json) */
function report_texts(): array {
    static $t = null;
    if ($t === null) $t = json_decode((string)@file_get_contents(__DIR__ . '/lang.json'), true) ?: ['en' => [], 'ar' => [], 'st' => []];
    return $t;
}
function rt(string $key, string $lang, array $args = []): string {
    $t = report_texts();
    $s = $t[$lang][$key] ?? $t['en'][$key] ?? $key;
    foreach ($args as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}
/* status names as the pages show them: a report waiting for review is "Pending", an approved opportunity "Approved" */
function rstatus(?string $st, string $lang): string {
    if ($st === null || $st === '') return '—';
    if ($st === 'Submitted') return rt('status.Pending', $lang);
    $t = report_texts();
    if ($lang === 'ar') return $t['st'][$st] ?? $t['ar'][$st] ?? $st;
    return $t['en'][$st] ?? $st;
}
function rdate(?string $d, string $lang): string {
    if (!$d) return '';
    static $en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    static $ar = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    $m = (int)substr($d, 5, 2) - 1;
    return (int)substr($d, 8, 2) . ' ' . ($lang === 'ar' ? $ar[$m] : $en[$m]) . ' ' . substr($d, 0, 4);
}
function ravg(array $list): ?int {
    $list = array_values(array_filter($list, fn($v) => $v !== null));
    return $list ? (int)round(array_sum($list) / count($list)) : null;
}
function rdash($v, string $suffix = ''): string { return $v === null || $v === '' ? '—' : $v . $suffix; }

/* ---------------------------------------------------------------- one row per student, with everything the reports need */
function report_students(string $where = '1 = 1', array $args = []): array {
    $today = val('SELECT CURDATE()');
    $rows = all("SELECT s.student_id, s.university_id, s.supervisor_id, s.placement_id, u.full_name, u.account_status, m.major_name,
                        p.start_date, p.end_date, p.status AS placement_status, o.opportunity_id, o.title, o.company_id, c.company_name,
                        sp.department, su.full_name AS sup_name, su.email AS sup_email, su.phone AS sup_phone,
                        (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Approved') AS att_approved,
                        (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Pending')  AS att_pending,
                        (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Rejected') AS att_rejected,
                        (SELECT r.review_status FROM final_reports r WHERE r.student_id = s.student_id) AS report_status,
                        (SELECT e.score FROM evaluations e WHERE e.student_id = s.student_id AND e.evaluator_type = 'Company'  ORDER BY e.evaluation_id DESC LIMIT 1) AS company_score,
                        (SELECT e.score FROM evaluations e WHERE e.student_id = s.student_id AND e.evaluator_type = 'Academic' ORDER BY e.evaluation_id DESC LIMIT 1) AS academic_score
                 FROM students s
                 JOIN users u ON u.user_id = s.user_id
                 JOIN majors m ON m.major_id = s.major_id
                 LEFT JOIN training_placements p ON p.placement_id = s.placement_id
                 LEFT JOIN coop_opportunities o ON o.opportunity_id = p.opportunity_id
                 LEFT JOIN companies c ON c.company_id = o.company_id
                 LEFT JOIN academic_supervisors sp ON sp.supervisor_id = s.supervisor_id
                 LEFT JOIN users su ON su.user_id = sp.user_id
                 WHERE $where
                 ORDER BY u.full_name", $args);
    foreach ($rows as &$r) {
        // attendance rate = days checked in (not rejected) / working days (Sunday to Thursday) so far; none before the training starts
        $r['days'] = (int)$r['att_approved'] + (int)$r['att_pending'];
        $r['rate'] = null;
        if ($r['placement_id']) {
            $until = $today < $r['end_date'] ? $today : $r['end_date'];
            $work = 0;
            for ($d = strtotime($r['start_date']); $d <= strtotime($until); $d += 86400) if ((int)date('w', $d) <= 4) $work++;
            if ($work) $r['rate'] = min(100, (int)round($r['days'] * 100 / $work));
        }
        $r['report_status'] = $r['report_status'] ?? 'Not submitted';
        $r['company_score'] = $r['company_score'] === null ? null : (int)$r['company_score'];
        $r['academic_score'] = $r['academic_score'] === null ? null : (int)$r['academic_score'];
    }
    return $rows;
}

/* ---------------------------------------------------------------- build a report for the signed-in user */
function build_report(array $me, string $kind, array $q, string $lang): array {
    if (!isset(REPORT_ROLES[$kind])) fail('Unknown report.', 'not_found', 404);
    if ($me['role'] !== REPORT_ROLES[$kind]) fail('Your role cannot open this report.', 'forbidden', 403);
    $fn = 'report_' . $kind;
    $r = $fn($me, $q, $lang);
    $r['kind'] = $kind;
    $r['lang'] = $lang;
    $r['by'] = $me['full_name'];
    $r['byRole'] = rt('role.' . ui_role($me['role']), $lang);
    $r['date'] = val('SELECT CURDATE()');
    $r['time'] = substr((string)val('SELECT CURTIME()'), 0, 5);
    $r['number'] = 'RPT-' . strtoupper(substr($kind, 0, 3)) . '-' . str_replace('-', '', $r['date']) . '-' . str_replace(':', '', $r['time']) . '-' . $me['user_id'];
    $r['meta'] = rt('generatedOn', $lang) . ': ' . rdate($r['date'], $lang) . ' ' . $r['time'] . ' · ' . rt('generatedBy', $lang) . ' ' . $me['full_name'];
    $r['file'] = 'E-COOP_' . $r['file'] . '_' . $r['date'];
    $r['total'] = $r['total'] ?? null;
    $r['note'] = $r['note'] ?? '';
    return $r;
}

/* columns: [key, text key, is number, is status, width weight] */
function report_cols(array $cols, string $lang): array {
    return array_map(fn($c) => ['key' => $c[0], 'label' => rt($c[1], $lang), 'num' => !empty($c[2]), 'status' => !empty($c[3]), 'w' => $c[4] ?? 1], $cols);
}

/* ---------- company: trainee report ---------- */
function report_company(array $me, array $q, string $lang): array {
    $where = 'o.company_id = ?'; $args = [(int)$me['company_id']];
    $opp = isset($q['opp']) && $q['opp'] !== '' ? nid($q['opp']) : null;
    if ($opp) { $where .= ' AND o.opportunity_id = ?'; $args[] = $opp; }
    $list = report_students($where, $args);
    $company = (string)val('SELECT company_name FROM companies WHERE company_id = ?', [$me['company_id']]);
    $rows = array_map(fn($x) => [
        'student' => $x['full_name'] . "\n" . $x['university_id'] . ' · ' . $x['major_name'],
        'opportunity' => $x['title'] . "\n" . rdate($x['start_date'], $lang) . ' – ' . rdate($x['end_date'], $lang),
        'training' => $x['placement_status'],
        'days' => $x['days'], 'approved' => (int)$x['att_approved'], 'pending' => (int)$x['att_pending'], 'rejected' => (int)$x['att_rejected'],
        'rate' => rdash($x['rate'], '%'), 'report' => $x['report_status'],
        'cScore' => rdash($x['company_score']), 'aScore' => rdash($x['academic_score']),
        'supervisor' => $x['sup_name'] ? implode("\n", array_filter([$x['sup_name'], $x['department'], $x['sup_email'], $x['sup_phone']])) : rt('dash.no_supervisor', $lang),
    ], $list);
    $oppName = $opp ? (string)val('SELECT title FROM coop_opportunities WHERE opportunity_id = ? AND company_id = ?', [$opp, $me['company_id']]) : '';
    return [
        'title' => rt('company.report_title', $lang) . ' · ' . $company, 'file' => 'Trainee_Report',
        'filters' => $oppName !== '' ? $oppName : rt('company.all_opps', $lang), 'note' => rt('attReviewNote', $lang),
        'cols' => report_cols([['student', 'colStudent', 0, 0, 1.6], ['opportunity', 'colOpportunity', 0, 0, 1.6], ['training', 'colStatus', 0, 1, .8],
            ['days', 'colDays', 1, 0, .72], ['approved', 'colApproved', 1, 0, .82], ['pending', 'colPending', 1, 0, .78], ['rejected', 'colRejected', 1, 0, .8],
            ['rate', 'colAttRate', 1, 0, .85], ['report', 'colReport', 0, 1, .95], ['cScore', 'colCompanyScore', 1, 0, .8], ['aScore', 'colAcademicScore', 1, 0, .8],
            ['supervisor', 'colSupervisorContact', 0, 0, 1.9]], $lang),
        'rows' => $rows,
        'stats' => [
            [rt('stTrainees', $lang), (string)count($list)],
            [rt('stOpenOpps', $lang), (string)val("SELECT COUNT(*) FROM coop_opportunities WHERE company_id = ? AND status = 'Approved'", [$me['company_id']])],
            [rt('stAvgAtt', $lang), rdash(ravg(array_column($list, 'rate')), '%')],
            [rt('stReportsApproved', $lang), count(array_filter($list, fn($x) => $x['report_status'] === 'Approved')) . ' / ' . count($list)],
            [rt('stAvgCompany', $lang), rdash(ravg(array_column($list, 'company_score')), '/100')],
            [rt('stAvgAcademic', $lang), rdash(ravg(array_column($list, 'academic_score')), '/100')],
        ],
    ];
}

/* ---------- supervisor: cohort report (UC-17) ---------- */
function report_cohort(array $me, array $q, string $lang): array {
    $where = 's.supervisor_id = ?'; $args = [(int)$me['supervisor_id']];
    $major = trim((string)($q['major'] ?? ''));
    $pl = isset($q['placement']) && $q['placement'] !== '' ? nid($q['placement']) : null;
    if ($major !== '') { $where .= ' AND m.major_name = ?'; $args[] = $major; }
    if ($pl) { $where .= ' AND s.placement_id = ?'; $args[] = $pl; }
    $list = report_students($where, $args);
    $rows = array_map(fn($x) => [
        'student' => $x['full_name'] . "\n" . $x['university_id'], 'major' => $x['major_name'],
        'placement' => $x['placement_id'] ? $x['company_name'] . "\n" . $x['title'] : '—',
        'days' => $x['days'], 'approved' => (int)$x['att_approved'], 'pending' => (int)$x['att_pending'], 'rejected' => (int)$x['att_rejected'],
        'att' => rdash($x['rate'], '%'), 'report' => $x['report_status'], 'cScore' => rdash($x['company_score']), 'aScore' => rdash($x['academic_score']),
    ], $list);
    $placed = array_filter($list, fn($x) => $x['placement_id']);
    $plName = $pl ? (string)val('SELECT CONCAT(c.company_name, " · ", o.title) FROM training_placements p JOIN coop_opportunities o ON o.opportunity_id = p.opportunity_id
                                  JOIN companies c ON c.company_id = o.company_id WHERE p.placement_id = ?', [$pl]) : rt('allPlacements', $lang);
    return [
        'title' => rt('academicReportsTitle', $lang), 'file' => 'Academic_Report',
        'filters' => rt('semester', $lang) . ' 481 · ' . ($major !== '' ? $major : rt('opp.all_majors', $lang)) . ' · ' . $plName,
        'cols' => report_cols([['student', 'colStudent', 0, 0, 1.5], ['major', 'colMajor', 0, 0, 1.2], ['placement', 'colPlacement', 0, 0, 1.8], ['days', 'colDays', 1, 0, .75],
            ['approved', 'colApproved', 1, 0, .82], ['pending', 'colPending', 1, 0, .78], ['rejected', 'colRejected', 1, 0, .8], ['att', 'colAttRate', 1, 0, .85],
            ['report', 'colReport', 0, 1, .95], ['cScore', 'colCompanyScore', 1, 0, .8], ['aScore', 'colAcademicScore', 1, 0, .8]], $lang),
        'rows' => $rows,
        'stats' => [
            [rt('stStudents', $lang), (string)count($list)],
            [rt('stAvgAtt', $lang), rdash(ravg(array_column($placed, 'rate')), '%')],
            [rt('stReportsApproved', $lang), count(array_filter($list, fn($x) => $x['report_status'] === 'Approved')) . ' / ' . count($list)],
            [rt('stAvgCompany', $lang), rdash(ravg(array_column($list, 'company_score')), '/100')],
        ],
    ];
}

/* ---------- admin: placement by major (FR-21) ---------- */
function report_placement(array $me, array $q, string $lang): array {
    $list = report_students("u.account_status = 'Active'");
    $by = [];
    foreach ($list as $x) $by[$x['major_name']][] = $x;
    ksort($by);
    $rows = []; $T = ['n' => 0, 'p' => 0, 'a' => 0, 'acc' => 0];
    foreach ($by as $major => $st) {
        $ids = array_column($st, 'student_id');
        $in = implode(',', array_map('intval', $ids));
        $apps = (int)val("SELECT COUNT(*) FROM applications WHERE student_id IN ($in)");
        $acc = (int)val("SELECT COUNT(*) FROM applications WHERE student_id IN ($in) AND status = 'Accepted'");
        $placed = count(array_filter($st, fn($x) => $x['placement_id']));
        $T['n'] += count($st); $T['p'] += $placed; $T['a'] += $apps; $T['acc'] += $acc;
        $rows[] = ['major' => $major, 'students' => count($st), 'placed' => $placed, 'unplaced' => count($st) - $placed,
            'rate' => round($placed * 100 / count($st)) . '%', 'apps' => $apps, 'acc' => $acc];
    }
    $rate = $T['n'] ? (int)round($T['p'] * 100 / $T['n']) : 0;
    return [
        'title' => rt('rPlacement', $lang), 'file' => 'Placement_by_Major', 'filters' => rt('semester', $lang) . ' 481',
        'cols' => report_cols([['major', 'colMajor', 0, 0, 2], ['students', 'colStudents', 1], ['placed', 'colPlaced', 1], ['unplaced', 'colUnplaced', 1],
            ['rate', 'colPlacementRate', 1], ['apps', 'colApplications', 1], ['acc', 'colAccepted', 1]], $lang),
        'rows' => $rows,
        'total' => ['major' => rt('total', $lang), 'students' => $T['n'], 'placed' => $T['p'], 'unplaced' => $T['n'] - $T['p'], 'rate' => $rate . '%', 'apps' => $T['a'], 'acc' => $T['acc']],
        'stats' => [[rt('stStudents', $lang), (string)$T['n']], [rt('stPlacementRate', $lang), $rate . '%'], [rt('colApplications', $lang), (string)$T['a']]],
    ];
}

/* ---------- admin: company participation (FR-21) ---------- */
function report_companies(array $me, array $q, string $lang): array {
    $placed = report_students('s.placement_id IS NOT NULL');
    $rows = [];
    foreach (all('SELECT * FROM companies ORDER BY company_name') as $c) {
        $cid = (int)$c['company_id'];
        $opps = all('SELECT status, capacity FROM coop_opportunities WHERE company_id = ?', [$cid]);
        $open = array_filter($opps, fn($o) => $o['status'] === 'Approved');
        $apps = all('SELECT a.status FROM applications a JOIN coop_opportunities o ON o.opportunity_id = a.opportunity_id WHERE o.company_id = ?', [$cid]);
        $trainees = array_filter($placed, fn($x) => (int)$x['company_id'] === $cid);
        $rows[] = ['company' => $c['company_name'], 'city' => $c['city'], 'status' => $c['approval_status'],
            'opps' => count($open) . ' / ' . count($opps), 'seats' => array_sum(array_column($open, 'capacity')), 'apps' => count($apps),
            'acc' => count(array_filter($apps, fn($a) => $a['status'] === 'Accepted')), 'trainees' => count($trainees),
            'score' => rdash(ravg(array_column($trainees, 'company_score')))];
    }
    $approved = count(array_filter($rows, fn($r) => $r['status'] === 'Approved'));
    return [
        'title' => rt('rCompanies', $lang), 'file' => 'Company_Participation', 'filters' => rt('semester', $lang) . ' 481',
        'cols' => report_cols([['company', 'colCompany', 0, 0, 2], ['city', 'colCity'], ['status', 'colStatus', 0, 1, 1.2], ['opps', 'colOpps', 1], ['seats', 'colSeats', 1],
            ['apps', 'colApplications', 1], ['acc', 'colAccepted', 1], ['trainees', 'colTrainees', 1], ['score', 'colAvgScore', 1]], $lang),
        'rows' => $rows,
        'stats' => [[rt('stCompanies', $lang), $approved . ' / ' . count($rows)], [rt('colTrainees', $lang), (string)array_sum(array_column($rows, 'trainees'))]],
    ];
}

/* ---------- admin: completion and evaluations (FR-21) ---------- */
function report_completion(array $me, array $q, string $lang): array {
    $list = report_students('s.placement_id IS NOT NULL');
    $rows = array_map(function ($x) use ($lang) {
        $done = $x['report_status'] === 'Approved' && $x['company_score'] !== null && $x['academic_score'] !== null;
        return ['student' => $x['full_name'], 'major' => $x['major_name'], 'company' => $x['company_name'], 'sup' => $x['sup_name'] ?: '—',
            'att' => rdash($x['rate'], '%'), 'report' => $x['report_status'], 'cScore' => rdash($x['company_score']), 'aScore' => rdash($x['academic_score']),
            'status' => $done ? 'Completed' : 'In progress'];
    }, $list);
    $done = count(array_filter($rows, fn($r) => $r['status'] === 'Completed'));
    return [
        'title' => rt('rCompletion', $lang), 'file' => 'Completion_and_Evaluations', 'filters' => rt('semester', $lang) . ' 481',
        'cols' => report_cols([['student', 'colStudent', 0, 0, 1.6], ['major', 'colMajor', 0, 0, 1.3], ['company', 'colCompany', 0, 0, 1.4], ['sup', 'colSupervisor', 0, 0, 1.4],
            ['att', 'colAttRate', 1, 0, .7], ['report', 'colReport', 0, 1], ['cScore', 'colCompanyScore', 1, 0, .7], ['aScore', 'colAcademicScore', 1, 0, .7],
            ['status', 'colStatus', 0, 1]], $lang),
        'rows' => $rows,
        'stats' => [[rt('stCompletion', $lang), ($rows ? (int)round($done * 100 / count($rows)) : 0) . '%'],
            [rt('stAvgAtt', $lang), rdash(ravg(array_column($list, 'rate')), '%')],
            [rt('stReportsApproved', $lang), count(array_filter($list, fn($x) => $x['report_status'] === 'Approved')) . ' / ' . count($list)]],
    ];
}
