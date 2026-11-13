/* =====================================================================
   E-COOP - settings page (all roles): photo, profile, notification
   settings, language and theme
   ===================================================================== */

var settingsReady = false;

function renderSettings() {
  setHTML('photo-box', avatar(ME));
  setText('set-name', ME.name);
  setText('set-sub', t('role.' + ME.role) + ' · ' + ME.email);
  show('photo-remove', !!ME.avatar);

  // notification switches (on by default, except the weekly summary)
  document.querySelectorAll('.pref').forEach(function (box) {
    var key = box.dataset.key, saved = S.prefs[ME.id + ':' + key];
    box.checked = saved == null ? key !== 'summary' : saved;
    box.onchange = function () { act({ type: 'pref', key: key, value: box.checked }, t('settings.saved')); };
  });

  // language and theme are saved in this browser
  setupChips('set-lang', 'data-value', LANG, function (v) { localStorage.setItem('ecoop-lang', v); location.reload(); });
  setupChips('set-theme', 'data-value', document.documentElement.getAttribute('data-theme') || 'dark', function (v) { switchTheme(v); renderSettings(); });

  if (settingsReady) return;
  settingsReady = true;

  // profile photo (resized in the browser, saved by PHP in storage/avatars)
  document.getElementById('photo-input').onchange = function () {
    var file = this.files[0]; this.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast(t('photoType'), true); return; }
    if (file.size > 5 * 1024 * 1024) { toast(t('photoTooBig'), true); return; }
    resizePhoto(file, function (dataUrl) { act({ type: 'avatar', photo: dataUrl }, t('settings.avatar_saved'), renderSettings); });
  };
  document.getElementById('photo-remove').onclick = function () { act({ type: 'avatar', photo: null }, t('photoRemoved'), renderSettings); };

  document.getElementById('p-name').value = ME.name;
  document.getElementById('p-email').value = ME.email;
  if (ME.role === 'Student') setupStudentProfile();
  else {
    document.getElementById('p-role').value = t('role.' + ME.role) + (ME.dept ? ' · ' + ME.dept : '');
    document.getElementById('p-phone-ro').value = ME.phone || '';
    show('p-phone-box', !!ME.phone);
    document.getElementById('profile-form').onsubmit = function (e) { e.preventDefault(); };
  }
}

/* square 256px JPEG so the photo stays small */
function resizePhoto(file, done) {
  var img = new Image();
  img.onload = function () {
    var size = 256, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var side = Math.min(img.width, img.height);
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    done(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = URL.createObjectURL(file);
}

function setupStudentProfile() {
  var st = myStudent();
  document.getElementById('p-phone').value = st.phone || '';
  document.getElementById('p-gpa').value = st.gpa;
  document.getElementById('p-major').value = st.major;
  if (st.cv) setText('p-cv-name', st.cv);
  document.getElementById('p-cv').onchange = function () { if (this.files[0]) setText('p-cv-name', this.files[0].name); };

  document.getElementById('profile-form').onsubmit = function (e) {
    e.preventDefault();
    var name = document.getElementById('p-name').value.trim();
    var phone = document.getElementById('p-phone').value.trim();
    var gpa = document.getElementById('p-gpa').value.trim(), g = parseFloat(gpa);
    var cvFile = document.getElementById('p-cv').files[0];
    var ok = true;
    setText('p-name-err', name.length < 3 ? t('enterFullName') : ''); if (name.length < 3) ok = false;
    setText('p-phone-err', !/^05\d{8}$/.test(phone) ? t('phoneError') : ''); if (!/^05\d{8}$/.test(phone)) ok = false;
    setText('p-gpa-err', isNaN(g) || g < 0 || g > 4 ? t('gpaError') : ''); if (isNaN(g) || g < 0 || g > 4) ok = false;
    if (cvFile && !/\.(pdf|docx)$/i.test(cvFile.name)) { toast(t('fileTypeError'), true); ok = false; }
    if (!ok) return;
    act({ type: 'profile', fields: { phone: phone, gpa: gpa, cv: cvFile ? cvFile.name : myStudent().cv }, userFields: { name: name } }, t('profile.saved'), renderSettings);
  };
}
