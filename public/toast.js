function showToast(message, type) {
  type = type || 'success';
  if (type === 'error') message = friendlyError(message);
  let layer = document.getElementById('toastLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'toastLayer';
    layer.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; flex-direction:column; gap:8px; align-items:center; pointer-events:none;';
    document.body.appendChild(layer);
  }
  const bg = type === 'error' ? '#C23B3B' : '#14213D';
  const icon = type === 'error'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16h.01" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="1.6"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const toast = document.createElement('div');
  toast.style.cssText = 'display:flex; align-items:center; gap:8px; background:' + bg + '; color:#fff; padding:10px 16px; border-radius:8px; font-size:13px; font-family:"IBM Plex Sans",-apple-system,sans-serif; opacity:0; transform:translateY(-8px); transition:opacity 0.25s ease, transform 0.25s ease; box-shadow:0 4px 14px rgba(0,0,0,0.18);';
  toast.innerHTML = icon + '<span>' + message + '</span>';
  layer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2400);
}

function showSessionExpired() {
  document.body.innerHTML =
    '<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F5F6F2; text-align:center; font-family:\'IBM Plex Sans\',-apple-system,sans-serif; color:#14213D; padding:24px;">' +
    '<div style="max-width:360px;">' +
    '<svg width="56" height="56" viewBox="0 0 34 34" fill="none" style="margin-bottom:16px;"><circle cx="17" cy="17" r="16" fill="#14213D"/><circle cx="17" cy="9" r="2" stroke="#E8A33D" stroke-width="1.6"/><line x1="17" y1="11" x2="17" y2="20" stroke="#E8A33D" stroke-width="1.8" stroke-linecap="round"/><line x1="13" y1="14.5" x2="21" y2="14.5" stroke="#E8A33D" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5,18 Q9.5,23 14,24" stroke="#E8A33D" stroke-width="1.8" stroke-linecap="round"/><path d="M24.5,18 Q24.5,23 20,24" stroke="#E8A33D" stroke-width="1.8" stroke-linecap="round"/></svg>' +
    '<h1 style="font-family:Fraunces,Georgia,serif; font-size:24px; margin:0 0 8px;">Your session expired</h1>' +
    '<p style="font-size:14px; color:#5B6472; margin:0 0 20px;">For your security you were signed out. Log back in to pick up where you left off.</p>' +
    '<a href="/login.html" style="display:inline-block; background:#14213D; color:#fff; text-decoration:none; padding:11px 22px; border-radius:7px; font-size:14px; font-weight:600;">Log in again</a>' +
    '</div></div>';
  setTimeout(function () { window.location.href = '/login.html'; }, 4000);
}

/* Friendly wording for technical errors (Google, payments, network), and a safety net for failed requests. */
var FRIENDLY = {
  google: "RepAnchor lost its connection to Google. Open the dashboard and reconnect your Google Business Profile.",
  payments: "We couldn't reach our payment provider just now. Nothing was charged. Please try again in a minute.",
  network: "Can't reach RepAnchor right now. Check your internet connection and try again.",
  busy: "You're going a little fast. Please wait a minute and try again.",
  generic: "Something went wrong on our end. Please try again in a moment."
};
function friendlyError(msg) {
  var m = String(msg == null ? '' : msg);
  if (/invalid_grant|unauthorized_client|refresh token|token has been (expired|revoked)|google (api|auth)/i.test(m)) return FRIENDLY.google;
  if (/stripe|No such (customer|subscription|price|checkout|charge)|Invalid API Key|StripeError/i.test(m)) return FRIENDLY.payments;
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket hang up|Failed to fetch|Load failed|NetworkError/i.test(m)) return FRIENDLY.network;
  if (/Unexpected token|<html|<!DOCTYPE|is not valid JSON|Internal Server Error/i.test(m)) return FRIENDLY.generic;
  return m || FRIENDLY.generic;
}
(function () {
  if (window.__repanchorFetchWrapped) return;
  window.__repanchorFetchWrapped = true;
  var realFetch = window.fetch.bind(window);
  var lastToast = 0;
  function quietToast(text) {
    var now = Date.now();
    if (now - lastToast < 8000) return;
    lastToast = now;
    showToast(text, 'error');
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/^(https?:\/\/[^/]+)?\/api\//.test(url)) return realFetch(input, init);
    return realFetch(input, init).then(function (res) {
      if (res.status === 429) quietToast(FRIENDLY.busy);
      if (res.status < 400) return res;
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('json') === -1) {
        if (res.status >= 500) quietToast(FRIENDLY.generic);
        return res;
      }
      return res.clone().json().then(function (data) {
        if (data && typeof data.error === 'string') {
          var nice = friendlyError(data.error);
          if (nice !== data.error) {
            data.error = nice;
            return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: res.headers });
          }
        }
        return res;
      }).catch(function () { return res; });
    }, function (err) {
      quietToast(FRIENDLY.network);
      throw err;
    });
  };
})();
