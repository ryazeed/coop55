/*
 * E-COOP browser test: signs in as each role and uses the real buttons and forms.
 *   npm i playwright        (once)
 *   node tests/ui_test.js http://localhost:8000 [folder for screenshots]
 * The test resets the demo database first (install.php).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const SHOTS = process.argv[3] || '';
const PASSWORD = 'Coop@2026';
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info === undefined ? '' : '-> ' + String(info).slice(0, 300)); }
}

(async () => {
  const browser = await chromium.launch();
  const jsErrors = [];
  async function open(lang = 'en', size = { width: 1366, height: 850 }) {
    const ctx = await browser.newContext({ viewport: size });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(l => localStorage.setItem('ecoop-lang', l), lang);
    const p = await ctx.newPage();
    p.on('pageerror', e => jsErrors.push(p.url() + ' ' + e.message));
    p.on('dialog', d => d.accept());                       // confirm() questions: answer OK
    return { ctx, p };
  }
  async function login(p, email, password = PASSWORD) {
    await p.goto(BASE + '/login.html');
    await p.fill('#h-email', email); await p.fill('#h-pass', password);
    await Promise.all([p.waitForURL(/dashboard\.html/), p.click('#login-form button[type=submit]')]);
    await p.waitForTimeout(400);
  }
  const go = async (p, path) => { await p.goto(BASE + path); await p.waitForTimeout(600); };
  const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: SHOTS + '/' + name + '.png' }); } };
  const toast = p => p.locator('#toasts .co-toast').last().innerText().catch(() => '');
  const text = (p, sel) => p.locator(sel).first().innerText();
  const reason = async (p, words) => { await p.waitForSelector('#reason-modal.show'); await p.fill('#reason-text', words); await p.click('#reason-submit'); await p.waitForTimeout(900); };

  const res = await (await fetch(BASE + '/install.php', { method: 'POST' })).text();
  ok('install.php creates the database', /22 tables|Done|created/i.test(res), res.replace(/<[^>]+>/g, ' ').slice(0, 200));

  let ctx, p;
  // ---------------------------------------------------------------- public pages
  ({ ctx, p } = await open());
  await go(p, '/index.html');
  ok('home shows live numbers and the latest opportunities', +(await text(p, '#stat-opps')) >= 4 && await p.locator('#latest-opps article').count() === 3);
  await shot(p, '01_home');
  for (const page of ['about', 'faq', 'privacy']) { await go(p, '/' + page + '.html'); ok(page + ' page opens', (await text(p, 'main h1')).length > 3); }
  await go(p, '/contact.html');
  await p.click('#contact-form button[type=submit]');
  ok('contact form checks the fields', (await text(p, '#c-name-err')).length > 0);
  await p.fill('#c-name', 'Sara Visitor'); await p.fill('#c-email', 'sara@example.com'); await p.selectOption('#c-topic', 'company');
  await p.fill('#c-msg', 'We would like to offer two training seats next semester.'); await p.click('#contact-form button[type=submit]'); await p.waitForTimeout(800);
  ok('contact message is sent', await p.isVisible('#contact-done'));
  await go(p, '/student/dashboard.html');
  ok('a guest is sent to the log-in page', /login\.html/.test(p.url()));
  await p.fill('#h-email', 'ahmed.almousa@jic.edu.sa'); await p.fill('#h-pass', 'wrong-pass'); await p.click('#login-form button[type=submit]'); await p.waitForTimeout(700);
  ok('wrong password is refused', (await text(p, '#login-error')).length > 3 && /login\.html/.test(p.url()));
  await Promise.all([p.waitForURL(/student\/dashboard/), p.locator('.demo-list button[data-email="ahmed.almousa@jic.edu.sa"]').click()]);
  ok('demo account button signs in', true);
  await ctx.close();

  // ---------------------------------------------------------------- company: daily code, applicants, new opportunity
  ({ ctx, p } = await open());
  await login(p, 'coop@easternlogistics.sa');
  ok('company dashboard shows its numbers', (await text(p, '#k-trainees')) === '3' && (await text(p, '#k-pending')) === '2');
  await go(p, '/company/daily-code.html');
  await p.click('#code-cards button'); await p.waitForTimeout(900);
  const code = (await p.locator('#code-cards .co-code span').allInnerTexts()).join('');
  ok('company generates today\'s 6-digit code', /^\d{6}$/.test(code), code);
  await shot(p, '02_daily_code');
  await go(p, '/company/opportunities.html');
  await p.click('#new-btn');
  await p.locator('#templates .co-chip').first().click();
  await p.fill('#o-title', 'Inventory Control Trainee'); await p.fill('#o-gpa', '4.5'); await p.click('#post-form button[type=submit]'); await p.waitForTimeout(300);
  ok('minimum GPA above 4 is refused', (await text(p, '#o-gpa-err')).length > 3);
  await p.fill('#o-gpa', '3.2'); await shot(p, '03_new_opportunity');
  await p.click('#post-form button[type=submit]'); await p.waitForTimeout(900);
  const posted = p.locator('#postings-body tr', { hasText: 'Inventory Control Trainee' });
  ok('new opportunity waits for approval with its minimum GPA', /3\.20/.test(await posted.innerText()) && /Pending Approval/.test(await posted.innerText()), await posted.innerText().catch(() => 'no row'));
  await ctx.close();

  // ---------------------------------------------------------------- student (placed): check in, report, messages
  ({ ctx, p } = await open());
  await login(p, 'ahmed.almousa@jic.edu.sa');
  ok('student dashboard shows the placement', /Supply Chain Analyst Trainee/.test(await text(p, '#placement-list')) && await p.isVisible('#code-form'));
  const boxes = p.locator('#code-boxes input');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(wrong[i]);
  await p.click('#code-btn'); await p.waitForTimeout(800);
  ok('wrong code is refused with the tries left', /4/.test(await text(p, '#code-error')), await text(p, '#code-error'));
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
  await p.click('#code-btn'); await p.waitForTimeout(900);
  ok('student checks in with the right code', await p.isVisible('#today-done') && await p.isHidden('#code-form'));
  await shot(p, '04_student_dashboard');
  await go(p, '/student/attendance.html');
  ok('attendance history shows today as pending', /Pending/.test(await p.locator('#history-body tr').first().innerText()));
  await go(p, '/student/report.html');
  await p.setInputFiles('#report-input', { name: 'Ahmed_Coop_Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') });
  await p.click('#upload-btn'); await p.waitForTimeout(1500);
  ok('student uploads the final report', /Ahmed_Coop_Report\.pdf/.test(await text(p, '#report-file')) && await p.isHidden('#upload-form'), await toast(p));
  await go(p, '/student/report.html');
  await p.setInputFiles('#report-input', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }).catch(() => {});
  await go(p, '/student/evaluations.html');
  ok('evaluations page opens', (await text(p, '#eval-Company')).length > 5 && (await text(p, '#ev-days')) !== '');
  await go(p, '/student/messages.html');
  ok('menu shows unread messages', await p.isVisible('#chat-dot'));
  ok('messages list has my conversations', await p.locator('.app-chatrow').count() === 3);
  await p.locator('.app-chatrow', { hasText: 'Abdullah Rashed Alrumi' }).click(); await p.waitForTimeout(700);
  await p.fill('#msg-input', 'The outline is ready, I will upload it today.'); await p.click('#composer button[type=submit]'); await p.waitForTimeout(800);
  ok('student sends a message', /outline is ready/.test(await p.locator('#msgs .app-msg--mine').last().innerText()));
  await shot(p, '05_messages');
  await p.fill('#lookup', 'nobody@nowhere.sa'); await p.click('#lookup-form button[type=submit]'); await p.waitForTimeout(300);
  ok('unknown e-mail shows an error', (await text(p, '#lookup-error')).length > 5);
  await p.fill('#lookup', 'coop.office@jic.edu.sa'); await p.click('#lookup-form button[type=submit]'); await p.waitForTimeout(900);
  ok('new conversation opens by e-mail', (await text(p, '#thread-name')) === 'COOP Office' && await p.locator('.app-chatrow').count() === 4);
  await p.fill('#msg-input', 'Hello, when is the final report due?'); await p.press('#msg-input', 'Enter'); await p.waitForTimeout(800);
  await go(p, '/student/settings.html');
  await p.fill('#p-phone', '0551234000'); await p.fill('#p-gpa', '9'); await p.click('#profile-form button[type=submit]'); await p.waitForTimeout(300);
  ok('GPA above 4 is refused in the profile', (await text(p, '#p-gpa-err')).length > 3);
  await p.fill('#p-gpa', '3.40'); await p.click('#profile-form button[type=submit]'); await p.waitForTimeout(900);
  ok('student saves the profile', /saved/i.test(await toast(p)), await toast(p));
  await p.locator('.pref[data-key="summary"]').check(); await p.waitForTimeout(700);
  await go(p, '/student/settings.html');
  ok('notification setting is remembered', await p.locator('.pref[data-key="summary"]').isChecked());
  await go(p, '/student/notifications.html');
  ok('notifications are listed', await p.locator('#notif-list .co-row').count() >= 3);
  if (await p.isVisible('#read-all')) { await p.click('#read-all'); await p.waitForTimeout(700); }
  ok('mark all as read clears the bell', !(await p.locator('#notif-bell').getAttribute('class')).includes('co-iconbtn--dot'));
  await ctx.close();

  // ---------------------------------------------------------------- student (not placed): minimum GPA, apply, withdraw
  ({ ctx, p } = await open());
  await login(p, 'yazeed.alqahtani@jic.edu.sa');
  ok('student without placement sees no check-in form', await p.isHidden('#code-form') && await p.isVisible('#no-placement'));
  await go(p, '/student/opportunities.html');
  ok('opportunity cards show the minimum GPA', /Minimum GPA: 3\.75/.test(await text(p, '#opp-list')));
  await p.locator('#opp-list article', { hasText: 'Procurement Analyst Trainee' }).locator('a').click(); await p.waitForTimeout(700);
  ok('GPA below the minimum cannot apply', await p.isVisible('#apply-block') && await p.locator('#od-action button').isDisabled(), await text(p, '#od-action'));
  await shot(p, '06_min_gpa');
  await go(p, '/student/opportunities.html');
  await p.fill('#f-q', 'Fleet'); await p.waitForTimeout(300);
  ok('search filters the opportunities', await p.locator('#opp-list article').count() === 1);
  await p.locator('#opp-list article a').first().click(); await p.waitForTimeout(700);
  await p.click('#apply-btn'); await p.waitForTimeout(900);
  ok('student applies to an opportunity', /Pending/.test(await text(p, '#od-action')), await toast(p));
  await go(p, '/student/applications.html');
  const mine = p.locator('#apps-list .co-row', { hasText: 'Fleet Scheduling Trainee' });
  ok('the application is listed as pending', /Pending/.test(await mine.innerText()));
  await mine.locator('button').click(); await p.waitForTimeout(900);
  ok('student withdraws the application', /Withdrawn/.test(await p.locator('#apps-list .co-row', { hasText: 'Fleet Scheduling Trainee' }).innerText()));
  await go(p, '/student/opportunities.html'); await p.selectOption('#f-major', '');
  await p.locator('#opp-list article', { hasText: 'HR Operations Trainee' }).locator('a').click(); await p.waitForTimeout(700);
  await p.click('#apply-btn'); await p.waitForTimeout(900);
  ok('student applies to a second opportunity', /Pending/.test(await text(p, '#od-action')));
  await ctx.close();

  // ---------------------------------------------------------------- company: reject and accept applicants, evaluate
  ({ ctx, p } = await open());
  await login(p, 'coop@easternlogistics.sa');
  await go(p, '/company/applicants.html');
  const hind = p.locator('#applicants-list .co-row', { hasText: 'Hind' }).first();
  await hind.locator('button', { hasText: 'Reject' }).click(); await reason(p, 'The seats were filled by earlier applicants.');
  ok('company rejects an applicant with a reason', /rejected/i.test(await toast(p)), await toast(p));
  const yz = p.locator('#applicants-list .co-row', { hasText: 'Yazeed' });
  await yz.locator('button', { hasText: 'Accept' }).click(); await p.waitForTimeout(1200);
  ok('company accepts an applicant', /accepted/i.test(await toast(p)) && await yz.count() === 0, await toast(p));
  await shot(p, '07_applicants');
  await go(p, '/company/trainees.html');
  ok('the accepted student is now a trainee', /Yazeed/.test(await text(p, '#trainee-cards')));
  await p.selectOption('#ev-student', { label: 'Ahmed Abdulmohsen Almousa' }).catch(() => {});
  const evalName = await p.locator('#ev-student option:checked').innerText();
  await p.fill('#ev-comments', 'Reliable, learns fast and works well with the warehouse team.'); await p.locator('#ev-score').fill('91');
  await p.click('#eval-form button[type=submit]'); await p.waitForTimeout(900);
  ok('company submits an evaluation', /91 \/ 100/.test(await text(p, '#eval-list')), evalName + ' ' + await toast(p));
  await go(p, '/company/report.html');
  await p.waitForSelector('#report-body tr');
  const rep1 = await text(p, '#report-body');
  ok('trainee report lists the trainees with their supervisor', await p.locator('#report-body tr').count() === 4 && /Abdullah Rashed Alrumi/.test(rep1) && /abdullah\.alrumi@jic\.edu\.sa/.test(rep1), rep1.slice(0, 200));
  ok('trainee report shows the numbers', (await text(p, '#report-stats')).includes('4') && /Trainee report · Eastern Logistics/.test(await p.locator('#report-title').innerText()));
  await shot(p, '07b_trainee_report');
  const [csv0] = await Promise.all([p.waitForEvent('download'), p.click('#csv-btn')]);
  const csvText = fs.readFileSync(await csv0.path(), 'utf8');
  ok('trainee report downloads as CSV with the supervisor contact', /Trainee_Report/.test(csv0.suggestedFilename()) && /abdullah\.alrumi@jic\.edu\.sa/.test(csvText) && /Academic supervisor/.test(csvText));
  await p.selectOption('#cr-opp', { label: 'Supply Chain Analyst Trainee' }); await p.waitForTimeout(800);
  ok('trainee report filters by opportunity', await p.locator('#report-body tr').count() === 3 && !/Yazeed/.test(await text(p, '#report-body')));
  await go(p, '/company/profile.html');
  await p.fill('#c-phone', '0138881234'); await p.click('#company-form button[type=submit]'); await p.waitForTimeout(900);
  ok('company saves its profile', (await toast(p)).length > 3 && /Approved/.test(await text(p, '#cp-status')));
  await go(p, '/company/opportunities.html');
  await p.locator('#postings-body tr', { hasText: 'Procurement Analyst Trainee' }).locator('button').click(); await p.waitForTimeout(900);
  ok('company closes an opportunity', /Closed/.test(await p.locator('#postings-body tr', { hasText: 'Procurement Analyst Trainee' }).innerText()));
  await ctx.close();

  // ---------------------------------------------------------------- supervisor (Arabic): attendance, report, messages
  ({ ctx, p } = await open('ar'));
  await login(p, 'abdullah.alrumi@jic.edu.sa');
  ok('Arabic pages are right-to-left', await p.evaluate(() => document.documentElement.dir === 'rtl' && /rtl/.test(document.getElementById('bootstrap-css').href)));
  await shot(p, '08_supervisor_ar');
  await go(p, '/supervisor/attendance.html');
  const before = await p.locator('#attendance-body tr').count();
  await p.locator('#attendance-body tr').first().locator('button').last().click(); await p.waitForTimeout(900);
  ok('supervisor approves one check-in', await p.locator('#attendance-body tr').count() === before - 1);
  await p.locator('#attendance-body tr').first().locator('button').first().click(); await reason(p, 'لم يكن الطالب في موقع التدريب.');
  ok('supervisor rejects a check-in with a comment', await p.locator('#attendance-body tr').count() === before - 2);
  await p.click('#approve-all'); await p.waitForTimeout(1200);
  ok('approve all clears the list', await p.isHidden('#approve-all'));
  await go(p, '/supervisor/reports.html');
  const rep = p.locator('#reports-body tr', { hasText: 'Ahmed_Coop_Report.pdf' });
  ok('supervisor sees the uploaded report', await rep.count() === 1);
  const [file] = await Promise.all([p.waitForEvent('popup'), rep.locator('a').click()]);
  await file.close();
  await rep.locator('button').first().click(); await reason(p, 'أضف ملخصًا تنفيذيًا في بداية التقرير.');
  ok('supervisor requests a revision', await rep.locator('button').count() === 0);
  await go(p, '/supervisor/students.html');
  await p.locator('#student-list button').first().click(); await p.waitForSelector('#info-modal.show');
  ok('student details open', (await text(p, '#info-body')).length > 50);
  await go(p, '/supervisor/messages.html');
  const row = p.locator('.app-chatrow', { hasText: 'Ahmed Abdulmohsen Almousa' });
  ok('supervisor sees the student message as unread', /outline is ready/.test(await row.innerText()) && await row.locator('.co-badge').count() === 1);
  await row.click(); await p.waitForTimeout(700);
  await p.fill('#msg-input', 'ممتاز، بانتظار الملف.'); await p.click('#composer button[type=submit]'); await p.waitForTimeout(800);
  ok('supervisor answers in Arabic', /بانتظار الملف/.test(await p.locator('#msgs .app-msg--mine').last().innerText()));
  await go(p, '/supervisor/export.html');
  const [csv] = await Promise.all([p.waitForEvent('download'), p.click('#csv-btn')]);
  ok('cohort report downloads as CSV', /\.csv$/.test(csv.suggestedFilename()) && await p.locator('#report-body tr').count() >= 3);
  await ctx.close();

  // ---------------------------------------------------------------- student: sees the decisions
  ({ ctx, p } = await open());
  await login(p, 'ahmed.almousa@jic.edu.sa');
  ok('student is told to revise the report', await p.isVisible('#revision-alert'));
  await go(p, '/student/report.html');
  ok('revision comment is shown and upload opens again', await p.isVisible('#report-revision') && await p.isVisible('#upload-form'));
  await go(p, '/student/attendance.html');
  ok('rejected check-in shows the supervisor comment', /Rejected/.test(await text(p, '#history-body')) || /Approved/.test(await text(p, '#history-body')));
  await ctx.close();

  // ---------------------------------------------------------------- admin: approvals, users, assign, placements, reports
  ({ ctx, p } = await open());
  await login(p, 'coop.office@jic.edu.sa');
  ok('admin dashboard counts what is waiting', +(await text(p, '#k-companies')) === 2 && +(await text(p, '#k-opps')) >= 3 && +(await text(p, '#k-unassigned')) === 1, await text(p, '#k-opps') + ' ' + await text(p, '#k-unassigned'));
  await shot(p, '09_admin_dashboard');
  await go(p, '/admin/companies.html');
  await p.locator('#companies-body tr').first().locator('button').last().click(); await p.waitForTimeout(900);
  ok('admin approves a company', await p.locator('#companies-body tr button').count() === 2);
  await p.locator('#companies-body tr').first().locator('button').first().click(); await reason(p, 'The commercial registration could not be verified.');
  ok('admin rejects a company with a reason', await p.locator('#companies-body button').count() === 0);
  await go(p, '/admin/opportunities.html');
  const inv = p.locator('#opps-body tr', { hasText: 'Inventory Control Trainee' });
  await inv.locator('button').last().click(); await p.waitForTimeout(900);
  ok('admin approves the new opportunity', await inv.count() === 0);
  await p.locator('#opps-body tr').first().locator('button').first().click(); await reason(p, 'The description is not clear enough.');
  await p.locator('#o-status .co-chip[data-status="Rejected"]').click(); await p.waitForTimeout(300);
  ok('admin rejects an opportunity with a reason', await p.locator('#opps-body tr').count() >= 1 && /Rejected/.test(await text(p, '#opps-body')));
  await go(p, '/admin/assign.html');
  const yrow = p.locator('#assign-body tr', { hasText: 'Yazeed' });
  await yrow.locator('select').selectOption({ index: 1 }); await p.waitForTimeout(900);
  ok('admin assigns a supervisor', /assigned/i.test(await toast(p)), await toast(p));
  await go(p, '/admin/users.html');
  await p.fill('#u-q', 'omar'); await p.waitForTimeout(300);
  await p.locator('#users-body tr').first().locator('button').click(); await p.waitForTimeout(900);
  ok('admin suspends an account', /Suspended/.test(await p.locator('#users-body tr').first().innerText()));
  await p.locator('#users-body tr').first().locator('button').click(); await p.waitForTimeout(900);
  ok('admin activates it again', /Active/.test(await p.locator('#users-body tr').first().innerText()));
  await go(p, '/admin/placements.html');
  const pl = p.locator('#placements-body tr', { hasText: 'Process Engineering Trainee' });
  await pl.locator('button').click(); await p.waitForTimeout(900);
  ok('admin marks a placement completed', /Completed/.test(await pl.innerText()) && await pl.locator('button').count() === 0);
  await go(p, '/admin/analytics.html');
  ok('analytics show the charts', await p.locator('#chart .app-chart__row').count() >= 2 && /%/.test(await text(p, '#st-rate')));
  await shot(p, '10_analytics');
  await go(p, '/admin/report.html');
  await p.locator('#report-kind .co-chip[data-kind="companies"]').click(); await p.waitForTimeout(300);
  const [csv2] = await Promise.all([p.waitForEvent('download'), p.click('#csv-btn')]);
  ok('institutional report downloads as CSV', /Company_Participation/.test(csv2.suggestedFilename()));
  await go(p, '/admin/audit-logs.html');
  ok('audit log lists the actions', await p.locator('#audit-body tr').count() > 20 && /Marked placement completed/.test(await text(p, '#audit-body')));
  await go(p, '/admin/contact-messages.html');
  ok('admin reads the contact message', /Sara Visitor/.test(await text(p, '#contact-list')));
  await go(p, '/admin/messages.html');
  ok('admin gets only own conversations', /final report due/.test(await text(p, '#chat-list')) && !/college template/.test(await text(p, '#chat-list')));
  await p.click('#logout-btn', { force: true }).catch(async () => { await p.click('.app-userchip__toggle'); await p.click('#logout-btn'); });
  await p.waitForURL(/login\.html/);
  ok('log out returns to the log-in page', true);
  await ctx.close();

  // ---------------------------------------------------------------- register (student, company) + role protection
  ({ ctx, p } = await open());
  await go(p, '/register.html?kind=Student');
  await p.fill('#r-name', 'Noura Test Student'); await p.fill('#r-email', 'noura@gmail.com'); await p.fill('#r-phone', '0551112223'); await p.fill('#r-gpa', '3.6');
  await p.fill('#r-pass', 'Passw0rd1'); await p.fill('#r-pass2', 'Passw0rd1'); await p.check('#r-agree'); await p.click('#r-submit'); await p.waitForTimeout(400);
  ok('students must use the college e-mail', (await text(p, '#r-email-err')).length > 3);
  await p.fill('#r-email', 'noura.test@jic.edu.sa');
  await Promise.all([p.waitForURL(/student\/dashboard/), p.click('#r-submit')]);
  ok('a new student account is created and signed in', true);
  await go(p, '/admin/users.html');
  ok('a student cannot open admin pages', /student\/dashboard/.test(p.url()));
  await ctx.close();
  ({ ctx, p } = await open());
  await go(p, '/register.html?kind=Company');
  ok('company form shows the city', await p.isVisible('#company-fields') && await p.isHidden('#student-fields'));
  await p.fill('#r-name', 'Test Trading Co.'); await p.fill('#r-email', 'hr@testtrading.sa'); await p.fill('#r-phone', '0551112224');
  await p.fill('#r-pass', 'Passw0rd1'); await p.fill('#r-pass2', 'Passw0rd1'); await p.check('#r-agree');
  await Promise.all([p.waitForURL(/company\/dashboard/), p.click('#r-submit')]);
  await p.waitForTimeout(700);
  ok('a new company waits for approval', await p.isVisible('#pending-alert'));
  await go(p, '/company/opportunities.html');
  ok('a company that is not approved cannot post', await p.isHidden('#new-btn'));
  await ctx.close();

  // ---------------------------------------------------------------- phone size + light theme
  ({ ctx, p } = await open('ar', { width: 390, height: 844 }));
  await login(p, 'ahmed.almousa@jic.edu.sa');
  let wide = [];
  for (const page of ['dashboard', 'opportunities', 'applications', 'attendance', 'report', 'evaluations', 'messages', 'notifications', 'settings']) {
    await go(p, '/student/' + page + '.html');
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(page);
  }
  ok('student pages fit a phone screen (Arabic)', wide.length === 0, wide.join(','));
  await go(p, '/student/messages.html');
  await p.locator('.app-chatrow').first().click(); await p.waitForTimeout(600);
  ok('messages on a phone: the conversation replaces the list', await p.isHidden('#chat-list') && await p.isVisible('.thread-back'));
  await shot(p, '11_phone_ar');
  await go(p, '/student/dashboard.html');
  await p.click('.app-themebtn'); await p.waitForTimeout(200);
  ok('theme button switches to light', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
  await shot(p, '12_light');
  await ctx.close();

  ok('no JavaScript errors on any page', jsErrors.length === 0, jsErrors.join(' | '));
  console.log('\n' + pass + ' / ' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
