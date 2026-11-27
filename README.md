# E-COOP — Cooperative Training Management System

**MIS 451 Capstone · Jubail Industrial College · Team E-COOP**

A complete web system for managing cooperative training (COOP): students apply to opportunities, companies accept trainees and generate a daily 6-digit attendance code, academic supervisors approve attendance and review final reports, and the COOP office (admin) approves companies and opportunities, manages users and reads the audit log.

| Layer | Technology |
|---|---|
| Front end | HTML pages (one file per screen) + CSS (Bootstrap grid + the E-COOP design) + small JavaScript files |
| Back end | PHP 8 (PDO, sessions, `password_hash`) — JSON API in `api/` |
| Database | MySQL / MariaDB — 22 tables, 34 foreign keys, CHECK rules, 12 triggers, 2 stored procedures, 4 views |

---

## طريقة التشغيل (بالعربي)

### المطلوب
- **XAMPP** (فيه Apache و PHP 8 و MySQL/MariaDB و phpMyAdmin) من https://www.apachefriends.org
- **Visual Studio Code**

### الطريقة الأولى: XAMPP (الأسهل)
1. افتح **XAMPP Control Panel**، واضغط **Start** عند **Apache** و **MySQL**.
2. انسخ فولدر المشروع إلى `C:\xampp\htdocs\` وسمّه `coop55`.
   - أو من الـ Terminal: `cd C:\xampp\htdocs` ثم `git clone https://github.com/ryazeed/coop55.git`
3. افتح في المتصفح: **http://localhost/coop55/install.php** واضغط **Install / reset the database**.
4. اضغط **Open E-COOP**، أو افتح **http://localhost/coop55/**

### الطريقة الثانية: من داخل VS Code
1. شغّل **MySQL** بس من XAMPP Control Panel.
2. افتح فولدر المشروع في VS Code (**File ← Open Folder**).
3. من القائمة: **Terminal ← Run Task… ← Start E-COOP (PHP server on port 8000)**.
   أو اكتب في الـ Terminal:
   ```
   C:\xampp\php\php.exe -S localhost:8000 router.php
   ```
4. افتح **http://localhost:8000/install.php** (أول مرة بس)، وبعدها **http://localhost:8000**

> لا تفتح `index.html` بالضغط عليه مرتين، ولا تشغّل ملفات PHP بزر Run في VS Code: الموقع يحتاج سيرفر PHP و MySQL ويفتح من المتصفح.

### الحسابات التجريبية
كلمة المرور لكل الحسابات: **`Coop@2026`**. وفي صفحة تسجيل الدخول فيه أزرار تدخلك مباشرة.

| الدور | الإيميل |
|---|---|
| طالب عنده تدريب | `ahmed.almousa@jic.edu.sa` |
| طالب بدون تدريب | `yazeed.alqahtani@jic.edu.sa` |
| شركة | `coop@easternlogistics.sa` |
| مشرف أكاديمي | `abdullah.alrumi@jic.edu.sa` |
| أدمن (مكتب التدريب) | `coop.office@jic.edu.sa` |

### سيناريو العرض على الدكتور (تقريباً 5 دقائق)
1. **الشركة** ← **Daily code** ← **Generate code**: يطلع كود اليوم (6 أرقام).
2. **الطالب** (ahmed) ← الصفحة الرئيسية ← دخّل كود غلط: الرفض يجي من السيرفر مع عدد المحاولات الباقية. بعدها الكود الصحيح: ينحفظ الحضور بحالة Pending.
3. **المشرف** ← **Attendance** ← **Approve**، أو **Reject** مع كتابة السبب.
4. **الطالب** (yazeed) ← **Opportunities** ← افتح "Procurement Analyst Trainee": الحد الأدنى للمعدل 3.75 ومعدله 3.52، فالتقديم مقفل.
5. **الأدمن** ← **Audit log**: كل اللي صار مسجّل باسم صاحبه ووقته.
6. **الشركة** ← **Trainee report**: المتدربين وحضورهم وتقريرهم النهائي وتقييماتهم ومشرفهم الأكاديمي وطريقة التواصل معه، مع طباعة و CSV.
7. **Messages**: أي دور يراسل الثاني، والرسالة تظهر عند الطرف الثاني خلال 5 ثواني.

لو تبي ترجع الديمو من البداية: افتح `install.php` مرة ثانية.

### مشاكل ممكن تواجهك
| المشكلة | الحل |
|---|---|
| "E-COOP cannot start" | شغّل MySQL في XAMPP، وافتح `install.php` |
| MySQL ما يشتغل (port 3306 busy) | سكّر أي MySQL ثاني شغّال، أو غيّر `db_port` في `api/config.php` |
| حطيت كلمة مرور لـ root | اكتبها في `db_pass` داخل `api/config.php` |
| الصفحة فاضية أو قديمة | افتح الموقع من `http://localhost/...` مو من الملف، وسوِّ تحديث بـ Ctrl+F5 |
| الخط يطلع مختلف | الخطوط تتحمّل من Google Fonts، فتحتاج إنترنت. بدون إنترنت يشتغل الموقع بخط الجهاز |

---

## Project structure

```
coop55/
├── index.html  about.html  faq.html  privacy.html  contact.html     public pages
├── login.html              log in + demo accounts
├── register.html           create an account (student, academic supervisor, company)
├── student/                dashboard, opportunities, opportunity, applications, attendance, report, evaluations
├── company/                dashboard, opportunities, applicants, daily-code, trainees, report (trainee report), profile
├── supervisor/             dashboard, students, attendance, reports, evaluations, export
├── admin/                  dashboard, users, companies, opportunities, placements, assign, analytics, report, audit-logs, contact-messages
│                           (every role also has messages.html, notifications.html, settings.html)
├── assets/
│   ├── css/                main.css, dashboard.css, auth.css, rtl.css (the design) + app.css (small additions)
│   ├── img/                logo, favicon
│   └── vendor/bootstrap/   Bootstrap 5 (grid, modal, dropdown), also right-to-left for Arabic
├── js/
│   ├── lang.js             English + Arabic text, Saudi cities, theme and language start-up
│   ├── icons.js            the icons (inline SVG)
│   ├── main.js             shared: talks to the API, top bar, toasts, helpers
│   ├── public.js           home, contact, log in, register
│   ├── student.js  company.js  supervisor.js  admin.js   one file per role
│   ├── chat.js             messages page
│   ├── reports.js          report tables, CSV export, print
│   └── settings.js         profile, photo, notification settings, language, theme
├── api/                    PHP back end (JSON)
│   ├── config.php          database settings (XAMPP: root, empty password)
│   ├── state.php           GET  – the signed-in user + the data for the pages
│   ├── auth.php            POST – login / logout / register
│   ├── action.php          POST – every change (apply, accept, check-in, approve …)
│   ├── report.php          GET  – company trainee report (only that company's trainees)
│   ├── upload.php          POST – final report upload (PDF/DOCX, 10 MB)
│   ├── file.php            GET  – open a report / profile photo (with permission check)
│   └── lib/                bootstrap.php (PDO, sessions, errors), state.php, actions.php
├── install.php             one-click database setup / demo reset
├── router.php              router for "php -S" (blocks private folders)
├── database/ecoop.sql      schema + rules + demo data (one file)
├── storage/                uploaded files (not public)
├── docs/ERD.png, ERD.pdf   the numbered ERD
└── tests/                  api_test.py (135 API checks), ui_test.js (86 browser checks)
```

### How a request works
1. Each HTML page loads `api/state.php` → PHP reads MySQL and returns the data for the signed-in user; the page's JavaScript puts it into the cards and tables.
2. A button (e.g. **Approve**) sends `{ "type": "attDecision", ... }` to `api/action.php`.
3. PHP checks the session role and ownership, runs the SQL with prepared statements (PDO), MySQL checks its own rules (CHECK / UNIQUE / triggers), and PHP returns the fresh data.

### Where the business rules live
| Rule | PHP | MySQL |
|---|---|---|
| FR-01 college e-mail | `auth.php` register | trigger `trg_student_email_domain` |
| NFR-SE-01 hashed passwords | `password_hash` / `password_verify` | `users.password_hash` |
| NFR-SE-05 5 wrong passwords → 15 min lock | `auth.php` login | `users.failed_login_count`, `lockout_until` |
| BR-05 company approved before posting | – | trigger `trg_opp_company_approved` |
| BR-07 apply only to approved opportunities | – | trigger `trg_app_eligibility` |
| Minimum GPA of an opportunity (optional, 0–4) | `act_postOpp`, `act_apply` | `coop_opportunities.min_gpa`, `CHECK 0–4`, trigger `trg_app_eligibility` |
| BR-08 one application per opportunity | `act_apply` | `UNIQUE (student_id, opportunity_id)` |
| Withdraw / decide only while pending | `act_withdraw`, `act_appDecision` | trigger `trg_app_transition` |
| UC-10 accept: capacity, placement, withdraw others | `act_appDecision` | procedure `sp_accept_application` |
| Close an opportunity (Approved → Closed only) | `act_closeOpp` | trigger `trg_opp_transition` |
| BR-13 one 6-digit code per placement per day | `random_int` (CSPRNG) | procedure `sp_get_or_create_daily_code`, `UNIQUE (placement_id, code_date)` |
| BR-14/15 valid code of your own placement | `act_checkIn` | trigger `trg_att_validate` |
| BR-16 one check-in per day | `act_checkIn` | `UNIQUE (student_id, daily_code_id)` |
| 5 wrong codes → 10 min block | `act_checkIn` | `students.failed_code_attempts`, `code_lockout_until` |
| Students never see the codes | `build_state` | – |
| BR-17 PDF/DOCX ≤ 10 MB | `upload.php` (extension + file content) | `CHECK file_size_bytes` |
| BR-18 one final report per student | `act_submitReport` | `UNIQUE (student_id)` |
| BR-19 one company + one academic evaluation | `act_submitEval` | `UNIQUE (student_id, placement_id, evaluator_type)` |
| UC-16 academic evaluation after completion + approved report | `act_completePlacement` (admin) | trigger `trg_eval_academic_precondition` |
| Company trainee report: own trainees only, supervisor comments hidden | `api/report.php` (company_id in the SQL) | – |
| Chat: only members read and send | `build_state`, `my_conversation()` | FK `messages (conversation_id, sender_id)` → `conversation_members` |
| BR-04 audit log cannot be edited | `audit()` on every action | triggers `trg_audit_no_update`, `trg_audit_no_delete` |

### Tests
With the server running on port 8000:
```
python tests/api_test.py http://localhost:8000     # 135 checks: every action, permissions and database rules
node tests/ui_test.js http://localhost:8000         # 86 checks in a real browser: every role's buttons and forms (needs: npm i playwright)
```
The tests reset the demo database first.
