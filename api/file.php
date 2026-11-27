<?php
/*
 * GET api/file.php?key=r12      -> the final report file (student owner, their supervisor, the placement company, admin)
 * GET api/file.php?avatar=5     -> a profile photo (any signed-in user)
 * GET api/file.php?cv=3         -> a student's CV (the student, the office, their supervisor, companies they applied to)
 * Files live in /storage, which the web server never serves directly.
 */
require __DIR__ . '/lib/bootstrap.php';
handle(function () {
    $u = require_user();
    if (isset($_GET['avatar'])) {
        $p = val('SELECT avatar_path FROM users WHERE user_id = ?', [(int)$_GET['avatar']]);
        $path = $p ? ECOOP_ROOT . '/storage/' . $p : null;
        if (!$path || !is_file($path)) fail('No photo.', 'not_found', 404);
        $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
        header('Content-Type: ' . ($types[strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? 'image/jpeg'));
        header('Cache-Control: private, max-age=86400');
        readfile($path);
        exit;
    }
    if (isset($_GET['cv'])) {
        $s = one('SELECT student_id, user_id, supervisor_id, cv_file_path, cv_file_name FROM students WHERE student_id = ?', [nid((string)$_GET['cv'])]);
        if (!$s || !$s['cv_file_path']) fail('This student has no CV.', 'not_found', 404);
        $allowed = $u['role'] === 'Admin' || (int)$s['user_id'] === (int)$u['user_id']
            || ($u['supervisor_id'] && (int)$s['supervisor_id'] === (int)$u['supervisor_id'])
            || ($u['company_id'] && val('SELECT 1 FROM applications a JOIN coop_opportunities o ON o.opportunity_id = a.opportunity_id
                                         WHERE a.student_id = ? AND o.company_id = ? LIMIT 1', [$s['student_id'], $u['company_id']]));
        if (!$allowed) fail('You cannot open this CV.', 'forbidden', 403);
        $path = ECOOP_ROOT . '/storage/' . $s['cv_file_path'];
        if (!is_file($path)) fail('The CV file is missing from storage.', 'not_found', 404);
        $pdf = strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'pdf';
        $name = str_replace(['"', "\r", "\n"], '', $s['cv_file_name'] ?: basename($path));
        header('Content-Type: ' . ($pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
        header('Content-Length: ' . filesize($path));
        header("Content-Disposition: " . ($pdf ? 'inline' : 'attachment') . "; filename=\"" . preg_replace('/[^\x20-\x7E]/', '_', $name) . "\"; filename*=UTF-8''" . rawurlencode($name));
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }
    $rid = nid($_GET['key'] ?? '');
    $r = one('SELECT f.*, s.user_id AS suser, s.supervisor_id AS ssup, o.company_id FROM final_reports f
              JOIN students s ON s.student_id = f.student_id JOIN training_placements p ON p.placement_id = f.placement_id
              JOIN coop_opportunities o ON o.opportunity_id = p.opportunity_id WHERE f.report_id = ?', [$rid]);
    if (!$r) fail('Report not found.', 'not_found', 404);
    $allowed = $u['role'] === 'Admin' || (int)$r['suser'] === (int)$u['user_id']
        || ($u['supervisor_id'] && (int)$r['ssup'] === (int)$u['supervisor_id'])
        || ($u['company_id'] && (int)$r['company_id'] === (int)$u['company_id']);
    if (!$allowed) fail('You cannot open this report.', 'forbidden', 403);
    $path = ECOOP_ROOT . '/storage/' . $r['file_path'];
    if (!is_file($path)) fail('The file is missing from storage.', 'not_found', 404);
    $type = $r['file_type'] === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    header('Content-Type: ' . $type);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: inline; filename="' . str_replace('"', '', $r['original_file_name']) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
});
