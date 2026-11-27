<?php
/*
 * GET api/report.php?opp=o2  -> { ok, company, rows, stats }
 * Trainee report for the signed-in company: every student training at this company,
 * their attendance, final report, both evaluations and their academic supervisor.
 * Only the company's own trainees are read from the database (the check is in the SQL, not in the page).
 * Supervisor review comments are not included: the company sees the report status only.
 */
require __DIR__ . '/lib/bootstrap.php';

handle(function () {
    $me = require_user('Company');
    $companyId = (int)$me['company_id'];
    $oppId = isset($_GET['opp']) && $_GET['opp'] !== '' ? nid($_GET['opp']) : null;
    $today = val('SELECT CURDATE()');

    $sql = "SELECT s.student_id, s.university_id, u.full_name, m.major_name,
                   o.opportunity_id, o.title, p.placement_id, p.start_date, p.end_date, p.status AS placement_status,
                   sp.department, su.full_name AS sup_name, su.email AS sup_email, su.phone AS sup_phone,
                   (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Approved') AS att_approved,
                   (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Pending')  AS att_pending,
                   (SELECT COUNT(*) FROM attendance_records a WHERE a.student_id = s.student_id AND a.approval_status = 'Rejected') AS att_rejected,
                   (SELECT r.review_status FROM final_reports r WHERE r.student_id = s.student_id) AS report_status,
                   (SELECT e.score FROM evaluations e WHERE e.student_id = s.student_id AND e.placement_id = p.placement_id AND e.evaluator_type = 'Company')  AS company_score,
                   (SELECT e.score FROM evaluations e WHERE e.student_id = s.student_id AND e.placement_id = p.placement_id AND e.evaluator_type = 'Academic') AS academic_score
            FROM students s
            JOIN users u ON u.user_id = s.user_id
            JOIN majors m ON m.major_id = s.major_id
            JOIN training_placements p ON p.placement_id = s.placement_id
            JOIN coop_opportunities o ON o.opportunity_id = p.opportunity_id
            LEFT JOIN academic_supervisors sp ON sp.supervisor_id = s.supervisor_id
            LEFT JOIN users su ON su.user_id = sp.user_id
            WHERE o.company_id = ?";
    $args = [$companyId];
    if ($oppId) { $sql .= ' AND o.opportunity_id = ?'; $args[] = $oppId; }

    $rows = [];
    foreach (all($sql . ' ORDER BY o.title, u.full_name', $args) as $r) {
        // attendance rate = days checked in (not rejected) / working days (Sunday to Thursday) so far
        $until = $today < $r['end_date'] ? $today : $r['end_date'];
        $workdays = 0;
        for ($d = strtotime($r['start_date']); $d <= strtotime($until); $d += 86400) {
            if ((int)date('w', $d) <= 4) $workdays++;
        }
        $got = (int)$r['att_approved'] + (int)$r['att_pending'];
        $rows[] = [
            'student' => $r['full_name'], 'universityId' => $r['university_id'], 'major' => $r['major_name'],
            'opp' => 'o' . $r['opportunity_id'], 'opportunity' => $r['title'],
            'start' => $r['start_date'], 'end' => $r['end_date'], 'placementStatus' => $r['placement_status'],
            'days' => $got, 'approved' => (int)$r['att_approved'], 'pending' => (int)$r['att_pending'], 'rejected' => (int)$r['att_rejected'],
            // no rate before the training starts (it would show 0% and pull the average down)
            'rate' => $workdays ? min(100, (int)round($got * 100 / $workdays)) : null,
            'report' => $r['report_status'] ?? 'Not submitted',
            'companyScore' => $r['company_score'] === null ? null : (int)$r['company_score'],
            'academicScore' => $r['academic_score'] === null ? null : (int)$r['academic_score'],
            'supervisor' => $r['sup_name'], 'supDept' => $r['department'], 'supEmail' => $r['sup_email'], 'supPhone' => $r['sup_phone'],
        ];
    }

    $avg = function (array $list) { $list = array_filter($list, fn($v) => $v !== null); return $list ? (int)round(array_sum($list) / count($list)) : null; };
    json_out(['ok' => true, 'company' => val('SELECT company_name FROM companies WHERE company_id = ?', [$companyId]), 'rows' => $rows,
        'stats' => [
            'trainees' => count($rows),
            'openOpps' => (int)val("SELECT COUNT(*) FROM coop_opportunities WHERE company_id = ? AND status = 'Approved'", [$companyId]),
            'avgRate' => $avg(array_column($rows, 'rate')),
            'reportsApproved' => count(array_filter($rows, fn($r) => $r['report'] === 'Approved')),
            'avgCompany' => $avg(array_column($rows, 'companyScore')),
            'avgAcademic' => $avg(array_column($rows, 'academicScore')),
        ]]);
});
