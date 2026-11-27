/* =====================================================================
   E-COOP - public pages: home, about, FAQ, privacy, contact, log in, register
   ===================================================================== */

/* header: a signed-in visitor gets one "Dashboard" button instead of Log in / Register */
function renderPublic() {
  if (!ME) return;
  show('login-link', false);
  show('register-link', false);
  var open = document.getElementById('open-app');
  open.href = homeOf(ME.role);
  open.hidden = false;
}

/* ---------- Home ---------- */
function renderHome() {
  renderPublic();
  var open = S.opps.filter(function (o) { var c = find(S.companies, o.company); return o.status === 'Open' && c && c.status === 'Approved'; });
  setText('stat-companies', S.companies.filter(function (c) { return c.status === 'Approved'; }).length);
  setText('stat-opps', open.length);
  setText('stat-placed', S.students.filter(function (x) { return x.placement; }).length);

  // the three newest open opportunities
  show('latest-box', open.length > 0);
  setHTML('latest-opps', open.slice(0, 3).map(function (o) {
    var left = o.capacity - seatsTaken(o.id), company = companyName(o.company);
    return '<div class="col-md-4"><article class="co-card h-100">' +
      '<div class="co-card__head">' + media(company, true) + '<div class="co-row__text"><h3 class="co-row__title">' + esc(o.title) + '</h3>' +
      '<span class="co-row__sub">' + esc(company) + ' · ' + esc(cityLabel(o.city, LANG)) + '</span></div></div>' +
      '<p class="co-caption app-body-text">' + esc(shorten(o.description, 140)) + '</p>' +
      '<div class="app-tags"><span class="co-badge co-badge--lavender">' + esc(o.majors) + '</span>' +
      '<span class="co-badge">' + (left > 0 ? t('opp.seats', { n: left }) : t('opp.full')) + '</span></div></article></div>';
  }).join(''));
}

/* ---------- Contact (saved in the database, read by the COOP office) ---------- */
function renderContact() {
  renderPublic();
  document.getElementById('contact-form').onsubmit = sendContact;
}

function sendContact(e) {
  e.preventDefault();
  var name = document.getElementById('c-name').value.trim();
  var email = document.getElementById('c-email').value.trim();
  var msg = document.getElementById('c-msg').value.trim();
  var topic = document.getElementById('c-topic');
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setText('c-name-err', name.length < 3 ? t('eName') : '');
  setText('c-email-err', emailOk ? '' : t('eEmail'));
  setText('c-msg-err', msg.length < 20 ? t('msgLeft', { n: 20 - msg.length }) : '');
  if (name.length < 3 || !emailOk || msg.length < 20) return;
  api('action.php', { type: 'contact', msg: { name: name, email: email, topic: topic.selectedOptions[0].textContent, topicKey: topic.value, msg: msg } })
    .then(function (res) {
      if (!res.ok) { toast(res.error, true); return; }
      show('contact-form', false);
      show('contact-done', true);
    });
}

function contactAgain() {
  document.getElementById('contact-form').reset();
  show('contact-form', true);
  show('contact-done', false);
}

/* ---------- Log in ---------- */
function renderLogin() {
  if (ME) { location.href = homeOf(ME.role); return; }
  setText('greet', greeting());

  document.getElementById('login-form').onsubmit = function (e) {
    e.preventDefault();
    var email = document.getElementById('h-email').value.trim(), pass = document.getElementById('h-pass').value;
    if (!email) { setText('login-error', t('eEmail')); return; }
    if (!pass) { setText('login-error', t('ePass')); return; }
    login(email, pass);
  };
  // demo account buttons
  document.querySelectorAll('.demo-list button').forEach(function (btn) {
    btn.onclick = function () { login(btn.dataset.email, DEMO_PASSWORD); };
  });
}

/* PHP checks the password with password_verify() and starts the session */
function login(email, password) {
  setText('login-error', '');
  api('auth.php', { op: 'login', email: email, password: password }).then(function (res) {
    if (res.ok) {
      location.href = homeOf(find(res.state.users, res.me).role);
      return;
    }
    var messages = { no_user: 'eNoUser', suspended: 'eSuspended', wrong_password: 'rePassWrong', locked: 'eLocked' };
    setText('login-error', messages[res.code] ? t(messages[res.code]) : res.error);
  });
}

/* ---------- Register ---------- */
function renderRegister() {
  if (ME) { location.href = homeOf(ME.role); return; }
  setHTML('r-city', SA_CITIES.map(function (c) { return '<option value="' + esc(c.en) + '">' + esc(LANG === 'ar' ? c.ar : c.en) + '</option>'; }).join(''));
  document.getElementById('r-city').value = 'Jubail';

  // register.html?kind=Company opens with that account type chosen
  var wanted = /[?&]kind=(Student|Supervisor|Company)/.exec(location.search);
  document.querySelectorAll('input[name=kind]').forEach(function (radio) {
    if (wanted && radio.value === wanted[1]) radio.checked = true;
    radio.onchange = showKindFields;
  });
  showKindFields();
  document.getElementById('register-form').onsubmit = register;
}

function kind() { return document.querySelector('input[name=kind]:checked').value; }

/* show the fields of the chosen account type */
function showKindFields() {
  var k = kind(), company = k === 'Company';
  show('student-fields', k === 'Student');
  show('student-fields-2', k === 'Student');
  show('supervisor-fields', k === 'Supervisor');
  show('company-fields', company);
  setText('kind-badge', t('role.' + k));
  setText('register-title', t({ Student: 'auth.register_student', Supervisor: 'auth.register_supervisor', Company: 'auth.register_company' }[k]));
  setText('r-name-label', company ? t('companyNameLabel') : t('auth.full_name'));
  setText('r-email-label', company ? t('auth.work_email') : t('auth.inst_email'));
  setText('r-email-help', company ? t('workEmailHelp') : t('collegeEmailHelp'));
  document.getElementById('r-email').placeholder = company ? 'name@company.sa' : 'name@gmail.com';
  var note = document.getElementById('kind-note');
  note.hidden = !company;
  note.textContent = company ? t('company.pending_d') : '';
  document.querySelectorAll('.kinds .co-chip').forEach(function (chip) {
    chip.setAttribute('aria-checked', chip.querySelector('input').checked ? 'true' : 'false');
  });
}

function register(e) {
  e.preventDefault();
  var k = kind();
  var v = {
    name: document.getElementById('r-name').value.trim(), email: document.getElementById('r-email').value.trim().toLowerCase(),
    phone: document.getElementById('r-phone').value.replace(/\s/g, ''), gpa: document.getElementById('r-gpa').value.trim(),
    pass: document.getElementById('r-pass').value, pass2: document.getElementById('r-pass2').value
  };
  var errors = {
    'r-name-err': v.name.length < 3 ? (k === 'Company' ? t('reCompany') : t('reName')) : '',
    'r-email-err': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? t('reEmail') : (k !== 'Company' && !/@(jic\.edu\.sa|gmail\.com)$/.test(v.email) ? t('reCollege') : ''),
    'r-phone-err': !/^05\d{8}$/.test(v.phone) ? t('rePhone') : '',
    'r-gpa-err': k === 'Student' && (isNaN(parseFloat(v.gpa)) || +v.gpa < 0 || +v.gpa > 4) ? t('reGpa') : '',
    'r-pass-err': v.pass.length < 8 || !/[A-Za-z]/.test(v.pass) || !/\d/.test(v.pass) ? t('rePass') : '',
    'r-pass2-err': v.pass !== v.pass2 ? t('rePass2') : '',
    'r-agree-err': !document.getElementById('r-agree').checked ? t('reAgree') : ''
  };
  var ok = true;
  Object.keys(errors).forEach(function (id) { setText(id, errors[id]); if (errors[id]) ok = false; });
  if (!ok) return;

  var btn = document.getElementById('r-submit'); btn.disabled = true;
  show('server-error', false);
  api('auth.php', {
    op: 'register', kind: k, name: v.name, email: v.email, phone: v.phone, password: v.pass,
    major: document.getElementById('r-major').value, gpa: k === 'Student' ? String(parseFloat(v.gpa)) : '',
    city: document.getElementById('r-city').value, dept: document.getElementById('r-dept').value
  }).then(function (res) {
    if (res.ok) { location.href = homeOf(find(res.state.users, res.me).role); return; }
    btn.disabled = false;
    var box = document.getElementById('server-error');
    box.textContent = res.code === 'email_taken' ? t('reTaken') : res.code === 'email_domain' ? t('reCollege') : res.error;
    box.hidden = false;
  });
}
