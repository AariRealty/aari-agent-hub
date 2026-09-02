/* Aari Realty · site behaviour.
   Ported from joinaari.com (AariRealty/Recruiting2, joinaari/index.html) so the
   motion matches: hero dot field, marquee, auto-advancing how-it-works tabs,
   reveal-on-scroll, hamburger. Plus this site's own agent cluster and picker. */
(function () {
  'use strict';

  /* ---- Hamburger (joinaari, verbatim) ---- */
  (function () {
    var h = document.getElementById('navHamburger'), m = document.getElementById('navMenu');
    if (!h || !m) return;
    h.addEventListener('click', function () { h.classList.toggle('open'); m.classList.toggle('open'); });
    m.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { h.classList.remove('open'); m.classList.remove('open'); });
    });
  })();

  /* ---- Hero dot field (joinaari, verbatim) ---- */
  var c = document.getElementById('dots');
  if (c) {
    var n = 150, cols = ['#2a2a2a', '#6b6b6b', '#a8a8a8'], h = '';
    for (var i = 0; i < n; i++) {
      var x = (Math.random() * 100).toFixed(1), y = (Math.random() * 100).toFixed(1),
          col = cols[Math.floor(Math.random() * cols.length)],
          op = (0.35 + Math.random() * 0.35).toFixed(2),
          d = (4 + Math.random() * 2).toFixed(1), dl = (Math.random() * 5).toFixed(1);
      h += '<span style="left:' + x + '%;top:' + y + '%;background:' + col + ';opacity:' + op +
           ';animation-duration:' + d + 's;animation-delay:' + dl + 's"></span>';
    }
    c.innerHTML = h;
  }

  /* ---- Marquee — what's handled on a client's file ---- */
  var mt = document.getElementById('mtrack');
  if (mt) {
    var items = ['Inspection deadline', 'Appraisal', 'Title & survey', 'HOA estoppel',
                 'Insurance binder', 'Flood zone check', 'Permit history', 'Clear to close',
                 'Final walkthrough', 'Homestead filing'];
    var one = items.map(function (t) { return '<span>' + t + '</span>'; }).join('');
    mt.innerHTML = one + one + one + one;
  }

  /* ---- How-it-works tabs (joinaari, verbatim) ---- */
  var rows = document.querySelectorAll('.b5-row'), panes = document.querySelectorAll('.b5-pane'),
      cur = 0, timer = null;
  function setActive(i) {
    cur = i;
    rows.forEach(function (x) { x.classList.remove('active'); });
    panes.forEach(function (x) { x.classList.remove('active'); });
    if (rows[i]) rows[i].classList.add('active');
    if (panes[i]) panes[i].classList.add('active');
  }
  function start() { stop(); timer = setInterval(function () { setActive((cur + 1) % rows.length); }, 3000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  rows.forEach(function (r, i) { r.addEventListener('click', function () { setActive(i); start(); }); });
  var nav5 = document.querySelector('.b5-nav');
  if (nav5) { nav5.addEventListener('mouseenter', stop); nav5.addEventListener('mouseleave', start); }
  if (rows.length) { setActive(0); start(); }

  /* ---- Agent roster ---- */
  var ROSTER = ((window.AARI_AGENTS || {}).agents || []).filter(function (a) { return a.isActive; });

  /* Face cluster (joinaari tm-slot markup) */
  var wrap = document.getElementById('tmAvatars');
  if (wrap && ROSTER.length) {
    ROSTER.forEach(function (p, i) {
      var slot = document.createElement('div');
      slot.className = 'tm-slot';
      slot.style.zIndex = i + 1;
      var img = document.createElement('img');
      img.src = p.photoUrl; img.alt = p.displayName;
      slot.appendChild(img);
      wrap.appendChild(slot);
    });
    for (var r = 0; r < 5; r++) {
      ROSTER.forEach(function (p, i) {
        var dup = document.createElement('div');
        dup.className = 'tm-slot tm-slot-dup';
        dup.style.zIndex = i + 1;
        var di = document.createElement('img');
        di.src = p.photoUrl; di.alt = p.displayName;
        dup.appendChild(di);
        wrap.appendChild(dup);
      });
    }
  }

  /* ---- Interactive picker: stage + face rail, 5s auto-advance ---- */
  var stage = document.getElementById('pickStage');
  if (stage && ROSTER.length) {
    var photo = document.getElementById('pickPhoto'),
        info  = document.getElementById('pickInfo'),
        rail  = document.getElementById('pickRail'),
        bar   = document.getElementById('pickBar'),
        count = document.getElementById('pickCount'),
        num   = document.getElementById('pickNum');

    photo.innerHTML = ROSTER.map(function (a, i) {
      return '<img src="' + (a.photoPortrait || a.photoUrl) + '" alt="' + a.displayName +
             '"' + (i === 0 ? ' class="on"' : '') + ' loading="lazy">';
    }).join('');

    info.innerHTML = ROSTER.map(function (a, i) {
      var tags = [];
      if (a.bestFor) tags.push(a.bestFor);
      (a.languages || []).forEach(function (l) { tags.push(l); });
      (a.marketAreas || []).slice(0, 2).forEach(function (m) { tags.push(m); });
      return '<div class="pick-pane' + (i === 0 ? ' on' : '') + '">' +
        '<p class="pick-role">' + a.title + '</p>' +
        '<h3 class="pick-name">' + a.displayName + '</h3>' +
        '<p class="pick-fit">' + (a.fitLine || 'Southwest Florida &middot; Aari Realty') + '</p>' +
        (tags.length ? '<div class="pick-meta">' + tags.map(function (t) {
            return '<span class="pick-tag">' + t + '</span>'; }).join('') + '</div>' : '') +
        '<div class="pick-actions">' +
          '<a class="btn btn-dark" style="background:#fff;color:var(--ink);border-color:#fff" href="contact.html?agent=' + a.id + '">Pick ' + a.firstName + ' &rarr;</a>' +
          '<a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.35)" href="agents.html">See everyone &rarr;</a>' +
        '</div>' +
      '</div>';
    }).join('');

    rail.innerHTML = ROSTER.map(function (a, i) {
      return '<button type="button" class="pick-face' + (i === 0 ? ' on' : '') + '" data-i="' + i +
             '" aria-label="' + a.displayName + ', ' + a.title + '">' +
             '<img src="' + a.photoUrl + '" alt=""></button>';
    }).join('');

    var imgs = photo.querySelectorAll('img'),
        panes = info.querySelectorAll('.pick-pane'),
        faces = rail.querySelectorAll('.pick-face'),
        at = 0, tick = null, elapsed = 0, HOLD = 5000, paused = false;

    function go(i, human) {
      at = (i + ROSTER.length) % ROSTER.length;
      imgs.forEach(function (el, n) { el.classList.toggle('on', n === at); });
      panes.forEach(function (el, n) { el.classList.toggle('on', n === at); });
      faces.forEach(function (el, n) { el.classList.toggle('on', n === at); });
      if (num) num.textContent = ('0' + (at + 1)).slice(-2);
      if (count) count.textContent = ('0' + (at + 1)).slice(-2) + ' / ' + ('0' + ROSTER.length).slice(-2);
      elapsed = 0;
      if (bar) bar.style.width = '0%';
      var active = faces[at];
      if (active && human && active.scrollIntoView) {
        active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }

    function run() {
      clearInterval(tick);
      tick = setInterval(function () {
        if (paused || document.hidden) return;
        elapsed += 100;
        if (bar) bar.style.width = (elapsed / HOLD * 100) + '%';
        if (elapsed >= HOLD) go(at + 1);
      }, 100);
    }

    faces.forEach(function (f) {
      f.addEventListener('click', function () { go(+f.dataset.i, true); });
    });
    var prev = document.getElementById('pickPrev'), next = document.getElementById('pickNext');
    if (prev) prev.addEventListener('click', function () { go(at - 1, true); });
    if (next) next.addEventListener('click', function () { go(at + 1, true); });

    stage.closest('.pick').addEventListener('mouseenter', function () { paused = true; });
    stage.closest('.pick').addEventListener('mouseleave', function () { paused = false; });
    stage.closest('.pick').addEventListener('focusin', function () { paused = true; });

    /* Arrow keys when the rail has focus */
    rail.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1, true); }
    });

    /* Swipe the stage on touch */
    var x0 = null;
    stage.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; paused = true; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) go(at + (dx < 0 ? 1 : -1), true);
      x0 = null; paused = false;
    }, { passive: true });

    go(0);
    run();
  }

  /* Simple roster grid, where a page wants the whole list at once */
  var grid = document.getElementById('agentGrid');
  if (grid && ROSTER.length) {
    grid.innerHTML = ROSTER.map(function (a) {
      return '<div class="testi-card">' +
        '<div class="testi-av"><img src="' + a.photoUrl + '" alt="' + a.displayName + '"></div>' +
        '<div class="testi-body">' +
          (a.fitLine ? '<p>' + a.fitLine + '</p>' : '<p>Southwest Florida &middot; Aari Realty</p>') +
          '<div class="nm">' + a.displayName + '</div>' +
          '<div class="rl">' + a.title + '</div>' +
          '<a class="btn btn-ghost" style="margin-top:12px" href="contact.html?agent=' + a.id + '">Pick ' + a.firstName + ' &rarr;</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* Contact form: agent select + ?agent= pre-selection */
  var sel = document.getElementById('c-agent');
  if (sel && ROSTER.length) {
    ROSTER.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.displayName + ' (' + a.title + ')';
      o.textContent = a.displayName + ' — ' + a.title;
      sel.appendChild(o);
    });
  }
  try {
    var q = new URL(window.location.href).searchParams.get('agent');
    var pick = ROSTER.filter(function (a) { return a.id === q; })[0];
    if (pick) {
      var val = pick.displayName + ' (' + pick.title + ')';
      var field = document.getElementById('aariAgentField');
      var chip = document.getElementById('aariAgentChip');
      if (field) field.value = val;
      if (sel) sel.value = val;
      if (chip) {
        chip.innerHTML = '<img src="' + pick.photoUrl + '" alt="">' +
          '<span><strong>' + pick.displayName + '</strong>' + pick.title +
          ' &middot; your message goes to them</span><a href="agents.html">Change</a>';
        chip.hidden = false;
      }
    }
  } catch (_) {}

  /* ---- Reveal on scroll (joinaari) ---- */
  document.documentElement.classList.add('jsrv');
  var rv = document.querySelectorAll('.team-head,.tm-cluster,.team-sub,.founder-img,.testi-head,.testi-grid,.how-head,.how .b5-grid,.freebies-inner,.freebies .frb-panels,.faq-head,.faq-list,.tb-head');
  rv.forEach(function (e) { e.classList.add('rv'); });
  ['.testi-grid', '.faq-list', '.freebies .frb-panels'].forEach(function (q) {
    var g = document.querySelector(q); if (g) g.classList.add('rv-stag');
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    rv.forEach(function (e) { io.observe(e); });
  } else {
    rv.forEach(function (e) { e.classList.add('rv-in'); });
  }

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
