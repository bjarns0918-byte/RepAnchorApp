/* Demo mode: runs only on /demo. The real dashboard page is shown with made-up data for a fictional restaurant.
   Every /api call is answered here in the browser, so nothing touches a real account. */
(function () {
  if (location.pathname !== '/demo') return;

  var DAY = 864e5, now = Date.now();
  function ago(d) { return new Date(now - d * DAY).toISOString(); }

  var reviews = [
    { reviewId: 'd1', reviewer: 'Jordan M.', starRating: 'FIVE', comment: 'Amazing food, in and out fast, best pizza in town.', createTime: ago(0.3), status: 'posted', postedReply: "Thanks so much, Jordan! We're glad the fast service matched the food. See you next time!", postedAt: ago(0.25), postedBy: 'auto' },
    { reviewId: 'd2', reviewer: 'Alex R.', starRating: 'TWO', comment: 'Waited 40 minutes and nobody told me why. Pizza was fine once it came.', createTime: ago(0.8), status: 'pending_approval', draftReplies: [
      "Alex, I'm sorry about the wait. That's not the experience we want for anyone, and we should have kept you updated. Please reach out to me directly so I can hear more.",
      "Thank you for telling us, Alex. A 40 minute wait with no update isn't okay. We're looking at how we handle busy nights. I'd love to hear more if you're willing to contact me." ] },
    { reviewId: 'd3', reviewer: 'Priya K.', starRating: 'FIVE', comment: 'Best pizza I\'ve had in years, the crust is perfect. Maria at the counter was lovely.', createTime: ago(1.5), status: 'posted', postedReply: "Priya, that means a lot to us! I'll pass your kind words to Maria. Come back soon!", postedAt: ago(1.4), postedBy: 'auto' },
    { reviewId: 'd4', reviewer: 'Sam P.', starRating: 'FIVE', comment: 'Server mentioned the allergy menu without us asking. Felt really looked after.', createTime: ago(2.2), status: 'pending_approval', heldReason: 'sensitive', draftReplies: [
      "Thank you, Sam! We take allergies seriously and are so glad you felt looked after.",
      "Sam, this made our day. Keeping guests safe matters a lot to us. Thanks for coming in!" ] },
    { reviewId: 'd5', reviewer: 'Dana L.', starRating: 'FOUR', comment: 'Great garlic knots. Parking is a pain but worth it.', createTime: ago(3.1), status: 'posted', postedReply: "Thanks, Dana! We agree the garlic knots are special. Sorry about the parking, and we'll see you again!", postedAt: ago(3), postedBy: 'auto' },
    { reviewId: 'd6', reviewer: 'Chris T.', starRating: 'FIVE', comment: 'Family-friendly and the kids loved the margherita.', createTime: ago(4.4), status: 'posted', postedReply: "Chris, we love hearing the kids enjoyed it! Thanks for bringing the family in.", postedAt: ago(4.3), postedBy: 'auto' },
    { reviewId: 'd7', reviewer: 'Morgan B.', starRating: 'THREE', comment: 'Food was good but the dining room was loud and a little crowded.', createTime: ago(5.6), status: 'pending_approval', draftReplies: [
      "Morgan, thanks for the honest feedback. We love that the food hit the spot, and we'll think about how to make the dining room more comfortable on busy nights.",
      "Thank you for coming in, Morgan. Busy nights can get loud, and we appreciate you letting us know. We hope to earn a higher rating next time." ] },
    { reviewId: 'd8', reviewer: 'Lee H.', starRating: 'FIVE', comment: 'Friendly staff, quick delivery, still hot when it arrived.', createTime: ago(6.8), status: 'posted', postedReply: "Thanks, Lee! We work hard to get every delivery to you hot. Appreciate the kind words!", postedAt: ago(6.7), postedBy: 'auto' }
  ];

  var history = [
    { label: 'May', avgRating: 4.2, reviewCount: 18 }, { label: 'Jun', avgRating: 4.3, reviewCount: 21 },
    { label: 'Jul', avgRating: 4.3, reviewCount: 22 }, { label: 'Aug', avgRating: 4.4, reviewCount: 25 },
    { label: 'Sep', avgRating: 4.5, reviewCount: 24 }, { label: 'Oct', avgRating: 4.6, reviewCount: 27 }
  ];
  var themeHistory = [
    { themes: [ { theme: 'Fast service', sentiment: 'positive', mentions: 5 }, { theme: 'Crust quality', sentiment: 'positive', mentions: 4 }, { theme: 'Wait times', sentiment: 'negative', mentions: 4 }, { theme: 'Friendly staff', sentiment: 'positive', mentions: 3 } ] },
    { themes: [ { theme: 'Fast service', sentiment: 'positive', mentions: 7 }, { theme: 'Crust quality', sentiment: 'positive', mentions: 6 }, { theme: 'Wait times', sentiment: 'negative', mentions: 2 }, { theme: 'Friendly staff', sentiment: 'positive', mentions: 5 }, { theme: 'Parking', sentiment: 'negative', mentions: 2 } ] }
  ];
  var API = {
    '/api/me': { ok: true, id: 'demo', email: 'demo@example.com', businessName: "Tony's Pizza (demo)", isAdmin: false, isStaff: false, subscriptionStatus: 'active' },
    '/api/status': { googleConnected: true, locationId: 'demo', locationCount: 1, subscriptionStatus: 'active', isAdmin: false, businessName: "Tony's Pizza (demo)", lastSyncedAt: new Date(now - 6 * 60000).toISOString(), settingsReviewed: true },
    '/api/rating-history': { ok: true, history: history, themeHistory: themeHistory,
      latestMentions: { people: [ { name: 'Maria', sentiment: 'positive', mentions: 4 }, { name: 'Dev', sentiment: 'positive', mentions: 2 } ], dishes: [ { name: 'Margherita', sentiment: 'positive', mentions: 6 }, { name: 'Garlic knots', sentiment: 'positive', mentions: 4 } ] },
      latestDigest: { strengths: 'Guests keep praising the crust and how fast orders come out. Maria is named in four reviews, and the margherita is the most mentioned dish.', improvements: 'Waits on busy Friday nights came up twice, and two guests mentioned parking. A quick text update when a table is running late could turn those 2 and 3 star reviews around.' } },
    '/api/benchmark': { ok: true, configured: true, available: true, enough: true, area: 'River Forest, IL', yourRating: 4.6, comparison: { diff: 0.3, percentile: 78 }, stats: { avgRating: 4.3, medianReviewCount: 96, n: 24 } },
    '/api/competitors': { ok: true, available: true, max: 5, yourRating: 4.6, competitors: [ { placeId: 'demo-a', name: "Luigi's Trattoria", address: '120 Main St, River Forest', rating: 4.4, count: 312 }, { placeId: 'demo-b', name: 'Corner Slice', address: '8 Lake St, Oak Park', rating: 4.1, count: 188 }, { placeId: 'demo-c', name: 'Brick Oven Co.', address: '41 Madison St, River Forest', rating: 4.7, count: 96 } ] },
    '/api/reviews': null
  };

  function json(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  var DEMO_MSG = 'This is a demo with sample data. Start your free trial to use it on your own reviews.';
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = url.split('?')[0];
    if (path.indexOf('/api/') !== 0) return realFetch(input, init);
    if (path === '/api/reviews') return json(reviews);
    if (path === '/api/post-reply' || path === '/api/demo-post-reply') {
      try {
        var b = JSON.parse(init.body);
        reviews.forEach(function (r) { if (r.reviewId === b.reviewId) { r.status = 'posted'; r.postedReply = b.replyText; r.postedAt = new Date().toISOString(); r.postedBy = 'owner'; } });
      } catch (e) {}
      return json({ ok: true });
    }
    if (path.indexOf('/api/support-') === 0) return realFetch(input, init); // the help chat is real, so visitors can ask questions
    if (API[path]) return json(API[path]);
    if (path === '/api/sync-now' || path === '/api/digest-now') return json({ ok: true });
    return json({ ok: false, error: DEMO_MSG });
  };

  // Keep demo data out of the browser cache the real dashboard uses.
  var origGet = Storage.prototype.getItem, origSet = Storage.prototype.setItem;
  Storage.prototype.getItem = function (k) { return /^repanchor_(cached|last_visited)/.test(k) ? null : origGet.call(this, k); };
  Storage.prototype.setItem = function (k, v) { if (/^repanchor_(cached|last_visited)/.test(k)) return; return origSet.call(this, k, v); };

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Demo notice');
    bar.style.cssText = 'position:sticky; top:0; z-index:1001; background:#E8A33D; color:#14213D; text-align:center; font:600 13px "IBM Plex Sans",-apple-system,sans-serif; padding:9px 14px; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; justify-content:center;';
    bar.innerHTML = '<span>You\'re viewing a demo with sample data for a made-up restaurant.</span><a href="/signup.html" style="background:#14213D; color:#fff; text-decoration:none; padding:5px 12px; border-radius:6px;">Start your free trial</a>';
    document.body.insertBefore(bar, document.body.firstChild);

    // Anything that would leave the demo goes to sign up instead.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var h = a.getAttribute('href');
      if (/^\/(settings|get-reviews|report|recap|admin|auth|api)/.test(h) || a.id === 'logoutLink') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof showToast === 'function') showToast('That part needs an account. Start a free trial to try it.');
      }
    }, true);
  });
})();
