// Floating AI support chat. Self-contained: injects its own button, panel and styles.
(function () {
  if (window.__repanchorChat) return;
  window.__repanchorChat = true;

  var KEY = 'repanchor_chat_v1';
  var messages = [];
  var handoffShown = false;
  var busy = false;
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.messages)) { messages = saved.messages; handoffShown = !!saved.handoff; } } catch (e) {}
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ messages: messages.slice(-24), handoff: handoffShown })); } catch (e) {} }

  var css = '\
#rc-btn{position:fixed;right:18px;bottom:18px;z-index:900;background:#14213D;color:#fff;border:none;border-radius:999px;padding:12px 18px;font:600 14px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(20,33,61,.3);display:flex;align-items:center;gap:8px}\
#rc-btn:hover{background:#1d2e52}#rc-btn svg{stroke:#E8A33D}\
#rc-panel{position:fixed;right:18px;bottom:18px;z-index:901;width:350px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 36px);background:#fff;border:1px solid #E2E4DE;border-radius:14px;box-shadow:0 10px 36px rgba(20,33,61,.28);display:none;flex-direction:column;overflow:hidden;font:14px/1.45 "IBM Plex Sans",system-ui,sans-serif;color:#14213D}\
#rc-panel.open{display:flex}\
#rc-head{background:#14213D;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between}\
#rc-head b{font-size:14px}#rc-head span{display:block;font-size:11px;color:#E6E9F0;font-weight:400}\
#rc-close{background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}\
#rc-msgs{flex:1;overflow-y:auto;padding:12px;background:#F5F6F2}\
.rc-m{max-width:86%;margin:0 0 8px;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}\
.rc-u{background:#14213D;color:#fff;margin-left:auto;border-bottom-right-radius:3px}\
.rc-a{background:#fff;border:1px solid #E2E4DE;border-bottom-left-radius:3px}\
.rc-a a{color:#14213D;text-decoration:underline}\
#rc-foot{border-top:1px solid #E2E4DE;background:#fff;padding:8px}\
#rc-row{display:flex;gap:6px}\
#rc-in{flex:1;min-width:0;font:inherit;border:1px solid #E2E4DE;border-radius:8px;padding:9px 10px}\
#rc-send{background:#E8A33D;color:#14213D;border:none;border-radius:8px;padding:0 14px;font:600 14px inherit;cursor:pointer}\
#rc-send:disabled{opacity:.5;cursor:default}\
#rc-human{background:none;border:none;color:#6B7280;font:12px inherit;text-decoration:underline;cursor:pointer;padding:6px 2px 0}\
#rc-form{display:none;padding:8px 2px 0}\
#rc-form input,#rc-form textarea{width:100%;font:inherit;border:1px solid #E2E4DE;border-radius:8px;padding:8px 10px;margin:0 0 6px;box-sizing:border-box}\
#rc-form button{background:#14213D;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:600 13px inherit;cursor:pointer}\
.rc-note{font-size:11px;color:#6B7280;margin:6px 2px 0}\
@media print{#rc-btn,#rc-panel{display:none!important}}\
@media(max-width:480px){#rc-panel{right:6px;bottom:6px;width:calc(100vw - 12px);height:calc(100vh - 12px);max-height:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var root = document.createElement('div');
  root.innerHTML = '\
<button id="rc-btn" type="button" aria-label="Open support chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg>Help</button>\
<div id="rc-panel" role="dialog" aria-label="RepAnchor support chat">\
<div id="rc-head"><div><b>RepAnchor support</b><span>AI assistant. Ben steps in when needed.</span></div><button id="rc-close" type="button" aria-label="Close chat">&times;</button></div>\
<div id="rc-msgs" aria-live="polite"></div>\
<div id="rc-foot">\
<div id="rc-row"><input id="rc-in" type="text" maxlength="1000" placeholder="Ask a question..." autocomplete="off"><button id="rc-send" type="button">Send</button></div>\
<button id="rc-human" type="button">Message Ben directly</button>\
<div id="rc-form"><input id="rc-email" type="email" placeholder="Your email, so Ben can reply" autocomplete="email"><textarea id="rc-note" rows="2" maxlength="2000" placeholder="Anything to add? (optional)"></textarea><button id="rc-submit" type="button">Send to Ben</button> <span id="rc-formmsg" class="rc-note"></span></div>\
<div class="rc-note">AI can make mistakes. For billing or account problems, message Ben.</div>\
</div></div>';
  document.body.appendChild(root);

  function $(id) { return document.getElementById(id); }
  var box = $('rc-msgs');

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function linkify(t) {
    return esc(t)
      .replace(/(\/(?:refunds|privacy|terms|support|contact|about|settings|get-reviews|report)\.html)/g, '<a href="$1">$1</a>')
      .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
  }
  function add(role, text) {
    var d = document.createElement('div');
    d.className = 'rc-m ' + (role === 'user' ? 'rc-u' : 'rc-a');
    if (role === 'user') d.textContent = text; else d.innerHTML = linkify(text);
    box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
  }
  function render() {
    box.innerHTML = '';
    add('assistant', "Hi! I'm RepAnchor's AI assistant. I can answer questions about how it works, pricing, setup, billing and refunds. What can I help with?");
    messages.forEach(function (m) { add(m.role, m.content); });
    if (handoffShown) showForm();
  }
  function showForm() { $('rc-form').style.display = 'block'; $('rc-human').style.display = 'none'; handoffShown = true; persist(); }

  function open() { $('rc-panel').classList.add('open'); $('rc-btn').style.display = 'none'; render(); setTimeout(function () { $('rc-in').focus(); }, 50); }
  function close() { $('rc-panel').classList.remove('open'); $('rc-btn').style.display = 'flex'; }
  $('rc-btn').addEventListener('click', open);
  $('rc-close').addEventListener('click', close);
  $('rc-human').addEventListener('click', showForm);

  function send() {
    var input = $('rc-in'); var text = input.value.trim();
    if (!text || busy) return;
    busy = true; $('rc-send').disabled = true; input.value = '';
    messages.push({ role: 'user', content: text }); add('user', text); persist();
    var thinking = add('assistant', '...');
    fetch('/api/support-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.slice(-12) }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var reply = res.ok ? res.reply : (res.error || 'Something went wrong. Please try again.');
        thinking.innerHTML = linkify(reply);
        if (res.ok) messages.push({ role: 'assistant', content: reply });
        if (res.handoff) showForm();
        persist();
      })
      .catch(function () { thinking.textContent = "I couldn't connect just now. Please try again, or email repanchorapp@gmail.com."; })
      .then(function () { busy = false; $('rc-send').disabled = false; box.scrollTop = box.scrollHeight; });
  }
  $('rc-send').addEventListener('click', send);
  $('rc-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  $('rc-submit').addEventListener('click', function () {
    var email = $('rc-email').value.trim(); var msg = $('rc-formmsg');
    msg.textContent = '';
    fetch('/api/support-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, message: $('rc-note').value, messages: messages.slice(-12) }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) { msg.textContent = 'Sent. Ben will email you back.'; $('rc-submit').disabled = true; }
        else msg.textContent = res.error || 'Could not send.';
      })
      .catch(function () { msg.textContent = 'Could not send. Email repanchorapp@gmail.com.'; });
  });
})();
