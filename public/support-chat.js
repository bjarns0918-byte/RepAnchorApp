// Floating AI support chat. Self-contained: injects its own button, panel and styles.
(function () {
  if (window.__repanchorChat) return;
  window.__repanchorChat = true;

  var KEY = 'repanchor_chat_v2';
  var state = { messages: [], handoff: false, convId: '' };
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.messages)) state = saved;
  } catch (e) {}
  if (!state.convId) state.convId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ messages: state.messages.slice(-30), handoff: state.handoff, convId: state.convId })); } catch (e) {} }

  var busy = false;
  var config = { loggedIn: false };
  var ANCHOR = '<svg viewBox="0 0 24 24" fill="none" stroke="#E8A33D" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><line x1="12" y1="7.2" x2="12" y2="20.5"/><line x1="8.5" y1="10.5" x2="15.5" y2="10.5"/><path d="M4.5 14c0 4.2 3.2 6.5 7.5 6.5s7.5-2.3 7.5-6.5"/></svg>';

  var css = '\
#rc-btn{position:fixed;right:18px;bottom:18px;z-index:900;background:#14213D;color:#fff;border:none;border-radius:999px;padding:12px 18px 12px 14px;font:600 14px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(20,33,61,.32),0 1px 3px rgba(20,33,61,.2);display:flex;align-items:center;gap:9px;transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}\
#rc-btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,33,61,.38)}\
#rc-btn.hide{opacity:0;transform:scale(.9);pointer-events:none}\
#rc-btn .rc-ico{width:26px;height:26px;border-radius:50%;background:#1d2e52;display:flex;align-items:center;justify-content:center}\
#rc-btn .rc-ico svg{width:16px;height:16px}\
#rc-panel{position:fixed;right:18px;bottom:18px;z-index:901;width:372px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 36px);background:#fff;border:1px solid #E2E4DE;border-radius:16px;box-shadow:0 18px 50px rgba(20,33,61,.30),0 2px 6px rgba(20,33,61,.12);display:flex;flex-direction:column;overflow:hidden;font:14px/1.45 "IBM Plex Sans",system-ui,sans-serif;color:#14213D;opacity:0;visibility:hidden;transform:translateY(14px) scale(.97);transform-origin:bottom right;transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility .2s}\
#rc-panel.open{opacity:1;visibility:visible;transform:none}\
#rc-head{background:#14213D;color:#fff;padding:14px 14px 13px;display:flex;align-items:center;gap:11px;border-bottom:3px solid #E8A33D}\
.rc-logo{width:38px;height:38px;border-radius:50%;background:#1d2e52;display:flex;align-items:center;justify-content:center;flex:none}\
.rc-logo svg{width:22px;height:22px}\
#rc-head .rc-t{flex:1;min-width:0}\
#rc-head b{display:block;font-size:15px;line-height:1.2}\
#rc-head .rc-s{display:flex;align-items:center;gap:6px;font-size:12px;color:#E6E9F0;margin-top:2px}\
.rc-dot{width:8px;height:8px;border-radius:50%;background:#3DD68C;box-shadow:0 0 0 3px rgba(61,214,140,.22)}\
#rc-close{background:none;border:none;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:8px}\
#rc-close:hover{background:#1d2e52}\
#rc-msgs{flex:1;overflow-y:auto;padding:14px 12px 6px;background:#F5F6F2;scroll-behavior:smooth;-webkit-overflow-scrolling:touch}\
.rc-row{display:flex;gap:8px;margin:0 0 12px;align-items:flex-end;animation:rc-in .22s ease}\
.rc-row.u{justify-content:flex-end}\
.rc-av{width:28px;height:28px;border-radius:50%;background:#14213D;display:flex;align-items:center;justify-content:center;flex:none}\
.rc-av svg{width:16px;height:16px}\
.rc-col{max-width:82%;display:flex;flex-direction:column}\
.rc-row.u .rc-col{align-items:flex-end}\
.rc-m{padding:9px 12px;border-radius:14px;word-wrap:break-word;box-shadow:0 1px 2px rgba(20,33,61,.08)}\
.rc-m p{margin:0 0 6px}.rc-m p:last-child{margin-bottom:0}\
.rc-m ol{margin:4px 0 4px;padding-left:20px}.rc-m li{margin:0 0 3px}\
.rc-u{background:#14213D;color:#fff;border-bottom-right-radius:4px}\
.rc-a{background:#fff;border:1px solid #E2E4DE;border-bottom-left-radius:4px}\
.rc-a a{color:#14213D;font-weight:600;text-decoration:underline;text-decoration-color:#E8A33D;text-underline-offset:2px}\
.rc-time{font-size:10.5px;color:#8A93A3;margin:3px 4px 0}\
.rc-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}\
.rc-act{display:inline-block;background:#E8A33D;color:#14213D;font-weight:600;font-size:13px;padding:7px 12px;border-radius:999px;text-decoration:none;box-shadow:0 1px 2px rgba(20,33,61,.15);transition:transform .15s ease,background .15s ease}\
.rc-act:hover{background:#f0b459;transform:translateY(-1px)}\
.rc-typing{display:inline-flex;gap:4px;padding:3px 2px}\
.rc-typing i{width:7px;height:7px;border-radius:50%;background:#9AA3B2;animation:rc-b 1.1s infinite ease-in-out}\
.rc-typing i:nth-child(2){animation-delay:.15s}.rc-typing i:nth-child(3){animation-delay:.3s}\
@keyframes rc-b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}\
@keyframes rc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}\
#rc-chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 0 10px 36px}\
.rc-chip{background:#fff;border:1px solid #D5D9E0;color:#14213D;border-radius:999px;padding:7px 12px;font:500 13px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}\
.rc-chip:hover{border-color:#E8A33D;background:#FFF9EE;transform:translateY(-1px)}\
#rc-foot{border-top:1px solid #E2E4DE;background:#fff;padding:10px 10px 8px}\
#rc-row{display:flex;gap:7px;align-items:center}\
#rc-in{flex:1;min-width:0;font:inherit;font-size:14px;border:1px solid #D5D9E0;border-radius:999px;padding:10px 14px;outline:none;transition:border-color .15s,box-shadow .15s}\
#rc-in:focus{border-color:#E8A33D;box-shadow:0 0 0 3px rgba(232,163,61,.2)}\
#rc-send{background:#14213D;color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;transition:background .15s,transform .15s}\
#rc-send:hover{background:#1d2e52;transform:scale(1.05)}\
#rc-send:disabled{opacity:.45;cursor:default;transform:none}\
#rc-send svg{width:18px;height:18px}\
#rc-human{background:none;border:none;color:#5B6472;font:12px inherit;text-decoration:underline;cursor:pointer;padding:7px 2px 0}\
#rc-form{display:none;padding:8px 2px 0}\
#rc-form input,#rc-form textarea{width:100%;font:inherit;font-size:14px;border:1px solid #D5D9E0;border-radius:10px;padding:9px 11px;margin:0 0 6px;box-sizing:border-box}\
#rc-form button{background:#14213D;color:#fff;border:none;border-radius:999px;padding:9px 16px;font:600 13px inherit;cursor:pointer}\
.rc-note{font-size:11px;color:#8A93A3;margin:7px 2px 0;text-align:center}\
@media print{#rc-btn,#rc-panel{display:none!important}}\
@media(max-width:520px){\
#rc-panel{left:0;right:0;top:0;bottom:auto;width:100%;max-width:none;height:100%;max-height:none;border-radius:0;border:none;transform:translateY(24px)}\
#rc-panel.open{transform:none}\
#rc-in,#rc-form input,#rc-form textarea{font-size:16px}\
#rc-chips{padding-left:0}\
.rc-col{max-width:86%}}\
@media(prefers-reduced-motion:reduce){#rc-panel,#rc-btn,.rc-row,.rc-typing i{transition:none;animation:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var root = document.createElement('div');
  root.innerHTML = '\
<button id="rc-btn" type="button" aria-label="Open support chat"><span class="rc-ico">' + ANCHOR + '</span>Help</button>\
<div id="rc-panel" role="dialog" aria-label="RepAnchor support chat" aria-hidden="true">\
<div id="rc-head"><div class="rc-logo">' + ANCHOR + '</div><div class="rc-t"><b>RepAnchor Support</b><div class="rc-s"><span class="rc-dot"></span>Online &middot; AI assistant</div></div><button id="rc-close" type="button" aria-label="Close chat">&times;</button></div>\
<div id="rc-msgs" aria-live="polite"></div>\
<div id="rc-foot">\
<div id="rc-row"><input id="rc-in" type="text" maxlength="1000" placeholder="Ask a question..." autocomplete="off" enterkeyhint="send"><button id="rc-send" type="button" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>\
<div style="text-align:center"><button id="rc-human" type="button">Message Ben directly</button></div>\
<div id="rc-form"><input id="rc-email" type="email" placeholder="Your email, so Ben can reply" autocomplete="email"><textarea id="rc-note" rows="2" maxlength="2000" placeholder="Anything to add? (optional)"></textarea><button id="rc-submit" type="button">Send to Ben</button> <span id="rc-formmsg" class="rc-note" style="display:inline"></span></div>\
<div class="rc-note">AI can make mistakes. Chats are saved to improve support. Ben usually replies within a day.</div>\
</div></div>';
  document.body.appendChild(root);

  function $(id) { return document.getElementById(id); }
  var box = $('rc-msgs'), panel = $('rc-panel');

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(t) {
    return esc(t)
      .replace(/(\/(?:refunds|privacy|terms|support|contact|about|settings|get-reviews|report|signup)\.html(?:#[a-z]+)?)/g, '<a href="$1">$1</a>')
      .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
  }
  // Plain-text reply -> paragraphs and numbered lists.
  function format(text) {
    var out = '', list = [];
    function flush() { if (list.length) { out += '<ol>' + list.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ol>'; list = []; } }
    String(text).split('\n').forEach(function (line) {
      var m = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (m) { list.push(m[1]); return; }
      flush();
      if (line.trim()) out += '<p>' + inline(line.trim()) + '</p>';
    });
    flush();
    return out || '<p></p>';
  }
  function clock(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function addRow(role, html, ts, actions) {
    var row = document.createElement('div'); row.className = 'rc-row ' + (role === 'user' ? 'u' : 'a');
    var av = role === 'user' ? '' : '<div class="rc-av">' + ANCHOR + '</div>';
    var acts = '';
    if (actions && actions.length) {
      acts = '<div class="rc-acts">' + actions.map(function (a) { return '<a class="rc-act" href="' + esc(a.href) + '">' + esc(a.label) + '</a>'; }).join('') + '</div>';
    }
    row.innerHTML = av + '<div class="rc-col"><div class="rc-m ' + (role === 'user' ? 'rc-u' : 'rc-a') + '">' + html + acts + '</div>' + (ts ? '<div class="rc-time">' + clock(ts) + '</div>' : '') + '</div>';
    box.appendChild(row); scrollDown(); return row;
  }
  function scrollDown() { box.scrollTop = box.scrollHeight; }
  function typingRow() { return addRow('assistant', '<span class="rc-typing"><i></i><i></i><i></i></span>', null); }

  var CHIPS_VISITOR = ['How does the free trial work?', 'How do refunds work?', 'How does RepAnchor work?', 'What does it cost?'];
  var CHIPS_CUSTOMER = ['How do I connect Google?', 'How do refunds work?', 'How do I cancel?', 'Can I change how replies sound?'];

  function render() {
    box.innerHTML = '';
    addRow('assistant', format("Hi! I'm RepAnchor's AI assistant. I can answer questions about how it works, pricing, setup, billing and refunds. What can I help with?"), Date.now());
    state.messages.forEach(function (m) { addRow(m.role, m.role === 'user' ? esc(m.content) : format(m.content), m.at, m.actions); });
    if (state.messages.length === 0) showChips();
    if (state.handoff) showForm();
  }
  function showChips() {
    var wrap = document.createElement('div'); wrap.id = 'rc-chips';
    (config.loggedIn ? CHIPS_CUSTOMER : CHIPS_VISITOR).forEach(function (q) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rc-chip'; b.textContent = q;
      b.addEventListener('click', function () { send(q); });
      wrap.appendChild(b);
    });
    box.appendChild(wrap); scrollDown();
  }
  function showForm() { $('rc-form').style.display = 'block'; $('rc-human').style.display = 'none'; state.handoff = true; persist(); }

  // Mobile: fit the sheet to the visible area so the keyboard never covers the input.
  function fit() {
    var vv = window.visualViewport;
    if (window.innerWidth <= 520 && vv && panel.classList.contains('open')) {
      panel.style.height = vv.height + 'px';
      panel.style.top = vv.offsetTop + 'px';
      scrollDown();
    } else { panel.style.height = ''; panel.style.top = ''; }
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit); }
  var prevOverflow = '';
  function open() {
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); $('rc-btn').classList.add('hide');
    if (window.innerWidth <= 520) { prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    render(); fit();
    if (window.innerWidth > 520) setTimeout(function () { $('rc-in').focus(); }, 120);
  }
  function close() {
    panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); $('rc-btn').classList.remove('hide');
    document.body.style.overflow = prevOverflow; fit();
  }
  $('rc-btn').addEventListener('click', open);
  $('rc-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
  $('rc-human').addEventListener('click', showForm);

  function send(preset) {
    var input = $('rc-in'); var text = (typeof preset === 'string' ? preset : input.value).trim();
    if (!text || busy) return;
    busy = true; $('rc-send').disabled = true; input.value = '';
    var chips = $('rc-chips'); if (chips) chips.remove();
    var now = Date.now();
    state.messages.push({ role: 'user', content: text, at: now }); addRow('user', esc(text), now); persist();
    var typing = typingRow();
    fetch('/api/support-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convId: state.convId, messages: state.messages.slice(-12).map(function (m) { return { role: m.role, content: m.content }; }) })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        typing.remove();
        var reply = res.ok ? res.reply : (res.error || 'Something went wrong. Please try again.');
        var at = Date.now();
        addRow('assistant', format(reply), at, res.ok ? res.actions : null);
        if (res.ok) state.messages.push({ role: 'assistant', content: reply, at: at, actions: res.actions || [] });
        if (res.handoff) showForm();
        persist();
      })
      .catch(function () { typing.remove(); addRow('assistant', format("I couldn't connect just now. Please try again, or email repanchorapp@gmail.com."), Date.now()); })
      .then(function () { busy = false; $('rc-send').disabled = false; scrollDown(); });
  }
  $('rc-send').addEventListener('click', function () { send(); });
  $('rc-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  $('rc-submit').addEventListener('click', function () {
    var email = $('rc-email').value.trim(); var msg = $('rc-formmsg');
    msg.textContent = '';
    fetch('/api/support-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, message: $('rc-note').value, messages: state.messages.slice(-12).map(function (m) { return { role: m.role, content: m.content }; }) }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) { msg.textContent = 'Sent. Ben will email you back.'; $('rc-submit').disabled = true; }
        else msg.textContent = res.error || 'Could not send.';
      })
      .catch(function () { msg.textContent = 'Could not send. Email repanchorapp@gmail.com.'; });
  });

  fetch('/api/support-chat/config').then(function (r) { return r.json(); }).then(function (c) { if (c && c.ok) config = c; }).catch(function () {});
})();
