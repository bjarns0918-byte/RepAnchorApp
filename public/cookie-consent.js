(function () {
  if (localStorage.getItem('repanchor_cookie_consent')) return;

  const banner = document.createElement('div');
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.style.cssText =
    'position:fixed; left:0; right:0; bottom:0; z-index:10000; background:#14213D; color:#fff; ' +
    'padding:16px 20px; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:16px; ' +
    'font-family:"IBM Plex Sans",-apple-system,sans-serif; font-size:13px; box-shadow:0 -2px 12px rgba(0,0,0,0.15);';

  banner.innerHTML =
    '<span style="max-width:520px;">We use cookies to keep you logged in and to run the site securely. ' +
    'By using RepAnchor, you agree to this. See our <a href="/privacy.html" style="color:#E8A33D; text-decoration:underline;">Privacy Policy</a>.</span>' +
    '<button id="cookieAcceptBtn" style="background:#E8A33D; color:#14213D; border:none; border-radius:7px; padding:9px 18px; font-weight:600; font-size:13px; cursor:pointer; white-space:nowrap;">Got it</button>';

  document.body.appendChild(banner);

  document.getElementById('cookieAcceptBtn').addEventListener('click', () => {
    localStorage.setItem('repanchor_cookie_consent', '1');
    banner.remove();
  });
})();
