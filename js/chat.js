/* =====================================================================
   E-COOP - messages page (the same page for student, company, supervisor, admin)
   messages.html: my conversations, the open conversation, new conversation.
   Data: S.chats (my conversations) and S.msgs (their messages) from PHP.
   ===================================================================== */

var openChatId = null;      // the conversation shown on the page
var chatReady = false;

/* ---------- small helpers ---------- */
function chatMessages(chatId) { return S.msgs.filter(function (m) { return m.chat === chatId; }); }
function otherMember(ch) { return ch.members.filter(function (id) { return id !== ME.id; })[0]; }
function chatName(ch) { return ch.kind === 'group' ? ch.title : userName(otherMember(ch)); }
function roleName(uid) { var u = find(S.users, uid); return u ? t('role.' + u.role) : ''; }
function chatAvatar(ch) { return ch.kind === 'group' ? '<span class="co-avatar">' + icon('users', true) + '</span>' : avatar(find(S.users, otherMember(ch))); }

/* ---------- the page ---------- */
function renderChat() {
  if (!chatReady) {
    document.getElementById('composer').onsubmit = sendMessage;
    document.getElementById('lookup-form').onsubmit = findAccount;
    document.getElementById('new-chat-form').onsubmit = function (e) {
      e.preventDefault();
      var uid = document.getElementById('new-chat').value;
      if (uid) startChat(uid);
    };
    setInterval(refreshChat, 5000);                 // look for new messages every 5 seconds
    chatReady = true;
  }
  // people I work with: supervisor, company, trainees, COOP office
  setHTML('new-chat', '<option value="">' + t('msg.new') + '</option>' + suggestedContacts().map(function (uid) {
    return '<option value="' + uid + '">' + esc(userName(uid)) + ' · ' + esc(roleName(uid)) + '</option>';
  }).join(''));
  drawChatList();
  drawThread();
}

/* list of my conversations, newest message first */
function drawChatList() {
  var rows = S.chats.map(function (ch) {
    var ms = chatMessages(ch.id);
    return { ch: ch, last: ms[ms.length - 1] || null, unread: chatUnread(ch) };
  });
  rows.sort(function (a, b) { var x = a.last ? a.last.ts : '', y = b.last ? b.last.ts : ''; return x < y ? 1 : x > y ? -1 : 0; });

  if (!rows.length) { setHTML('chat-list', '<p class="co-caption">' + t('msg.none') + '</p>'); return; }
  setHTML('chat-list', rows.map(function (r) {
    var last = r.last ? (r.last.from === ME.id ? t('you') + ': ' : '') + r.last.text : t('msg.empty');
    return '<button type="button" class="co-row app-row-link app-chatrow" data-chat="' + r.ch.id + '"' + (r.ch.id === openChatId ? ' aria-current="page"' : '') + ' onclick="openChat(\'' + r.ch.id + '\')">' +
      chatAvatar(r.ch) + '<span class="co-row__text"><span class="co-row__title">' + esc(chatName(r.ch)) + '</span>' +
      '<span class="co-row__sub app-ellipsis" dir="auto">' + esc(last) + '</span></span>' +
      (r.unread ? '<span class="co-badge co-badge--lavender">' + r.unread + '</span>' : '') + '</button>';
  }).join(''));
}

/* the open conversation: header, messages grouped by day, message box */
function drawThread() {
  var ch = openChatId ? find(S.chats, openChatId) : null;
  document.getElementById('chat').classList.toggle('has-thread', !!ch);
  show('chat-none', !ch);
  show('chat-open', !!ch);
  if (!ch) return;

  setHTML('thread-avatar', chatAvatar(ch));
  setText('thread-name', chatName(ch));
  setText('thread-sub', ch.kind === 'group'
    ? t('groupChat') + ' · ' + ch.members.map(function (id) { return id === ME.id ? t('you') : userName(id).split(' ')[0]; }).join(', ')
    : roleName(otherMember(ch)));

  var html = '', lastDay = '';
  chatMessages(ch.id).forEach(function (m) {
    var day = m.ts.slice(0, 10), mine = m.from === ME.id;
    if (day !== lastDay) { html += '<div class="app-daysep"><span>' + (day === TODAY ? t('today') : fmtDate(day)) + '</span></div>'; lastDay = day; }
    html += '<div class="app-msg' + (mine ? ' app-msg--mine' : '') + '">' +
      (!mine && ch.kind === 'group' ? '<b class="app-msg__from">' + esc(userName(m.from)) + '</b>' : '') +
      '<p dir="auto">' + esc(m.text) + '</p><span dir="ltr">' + m.ts.slice(11, 16) + '</span></div>';
  });
  var list = document.getElementById('msgs');
  list.innerHTML = html || '<p class="co-caption">' + t('msg.empty') + '</p>';
  list.scrollTop = list.scrollHeight;               // show the newest message
}

function openChat(chatId) {
  openChatId = chatId;
  var ch = chatId ? find(S.chats, chatId) : null;
  if (ch && chatUnread(ch)) act({ type: 'readChat', chat: chatId }, null, renderChat);      // mark as read
  else renderChat();
  if (ch) document.getElementById('msg-input').focus();
}

function sendMessage(e) {
  e.preventDefault();
  var input = document.getElementById('msg-input');
  var text = input.value.trim();
  if (!text || !openChatId) return;
  input.value = '';
  act({ type: 'sendMsg', chat: openChatId, text: text }, null, renderChat).then(function (res) {
    if (!res.ok) input.value = text;                // keep the text if it was not sent
    input.focus();
  });
}

/* ask the server for new messages; redraw only when something changed */
function refreshChat() {
  if (document.hidden) return;
  var before = S.msgs.length + ':' + S.chats.length;
  api('state.php').then(function (res) {
    if (!res.ok || !res.me) return;
    S = res.state;
    if (S.msgs.length + ':' + S.chats.length === before) return;
    var ch = openChatId ? find(S.chats, openChatId) : null;
    if (ch && chatUnread(ch)) act({ type: 'readChat', chat: openChatId }, null, renderChat);   // I am reading this conversation now
    else { fillHeader(); renderChat(); }
  });
}

/* ---------- new conversation ---------- */
/* people this user works with: supervisor, company, trainees, COOP office */
function suggestedContacts() {
  var ids = [];
  function add(uid) {
    var u = uid ? find(S.users, uid) : null;
    if (u && u.id !== ME.id && u.status === 'Active' && ids.indexOf(u.id) < 0) ids.push(u.id);
  }
  function companyUser(pid) { var o = oppOfPlacement(pid), c = o ? find(S.companies, o.company) : null; return c ? c.user : null; }
  function supUserId(supId) { var u = supervisorUser(supId); return u ? u.id : null; }
  var admins = S.users.filter(function (u) { return u.role === 'Admin'; });

  if (ME.role === 'Student') {
    var st = myStudent();
    add(supUserId(st.supervisor));
    if (st.placement) add(companyUser(st.placement));
  } else if (ME.role === 'Company') {
    S.students.forEach(function (x) {
      if (x.placement && companyUser(x.placement) === ME.id) { add(x.user); add(supUserId(x.supervisor)); }
    });
  } else if (ME.role === 'Supervisor') {
    S.students.forEach(function (x) {
      if (x.supervisor === ME.ref) { add(x.user); if (x.placement) add(companyUser(x.placement)); }
    });
  } else {
    S.users.forEach(function (u) { add(u.id); });
  }
  admins.forEach(function (u) { add(u.id); });
  return ids;
}

/* phone numbers are compared as 05XXXXXXXX (also accepts +966 / 00966) */
function normalPhone(v) {
  var d = String(v || '').replace(/[^0-9]/g, '');
  if (d.indexOf('00966') === 0) d = d.slice(5); else if (d.indexOf('966') === 0) d = d.slice(3);
  if (d.length === 9 && d[0] !== '0') d = '0' + d;
  return d;
}

/* find any E-COOP user by the full e-mail or mobile number */
function findAccount(e) {
  e.preventDefault();
  var v = document.getElementById('lookup').value.trim(), user = null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    user = S.users.filter(function (u) { return u.email.toLowerCase() === v.toLowerCase(); })[0];
  } else if (/^0\d{8,9}$/.test(normalPhone(v))) {
    user = S.users.filter(function (u) { return u.phone && normalPhone(u.phone) === normalPhone(v); })[0];
  } else { setText('lookup-error', t('invalidLookup')); return; }

  if (!user) setText('lookup-error', t('noMatch'));
  else if (user.id === ME.id) setText('lookup-error', t('cannotSelf'));
  else if (user.status !== 'Active') setText('lookup-error', t('suspendedContact'));
  else startChat(user.id);
}

/* open the direct conversation with this user (PHP creates it the first time) */
function startChat(uid) {
  setText('lookup-error', '');
  act({ type: 'newChat', user: uid }, null, null).then(function (res) {
    if (!res.ok) return;
    var ch = S.chats.filter(function (c) { return c.kind === 'direct' && c.members.indexOf(uid) >= 0; })[0];
    document.getElementById('lookup').value = '';
    openChat(ch ? ch.id : null);
  });
}
