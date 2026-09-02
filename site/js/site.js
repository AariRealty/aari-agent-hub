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

  /* ---- Agent directory: search, filter, scroll. Scales to hundreds. ---- */
  var dir = document.getElementById('dirGrid');
  if (dir && ROSTER.length) {
    var qEl     = document.getElementById('dirQ'),
        clearEl = document.getElementById('dirClear'),
        chipsEl = document.getElementById('dirChips'),
        countEl = document.getElementById('dirCount'),
        moreEl  = document.getElementById('dirMore'),
        modal   = document.getElementById('dirModal'),
        panel   = document.getElementById('dirPanel');

    var PAGE = 24, shown = PAGE, q = '', chip = '', results = ROSTER;

    var esc = function (t) {
      return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    var hay = function (a) {
      return [a.displayName, a.title, a.blurb, (a.tags || []).join(' '),
              (a.languages || []).join(' '), (a.marketAreas || []).join(' ')]
             .join(' ').toLowerCase();
    };

    /* Filter chips built from whatever tags the roster actually carries */
    var counts = {};
    ROSTER.forEach(function (a) {
      (a.tags || []).forEach(function (t) {
        t = String(t).trim().toLowerCase();
        if (t) counts[t] = (counts[t] || 0) + 1;
      });
    });
    var chips = Object.keys(counts).sort(function (x, y) {
      return counts[y] - counts[x] || x.localeCompare(y);
    }).slice(0, 8);
    if (chipsEl && chips.length) {
      chipsEl.innerHTML = chips.map(function (t) {
        return '<button type="button" class="dir-chip" data-chip="' + esc(t) + '">' +
               esc(t.replace(/\b\w/g, function (c) { return c.toUpperCase(); })) + '</button>';
      }).join('');
    }

    function apply() {
      results = ROSTER.filter(function (a) {
        if (chip && (a.tags || []).map(function (t) { return String(t).toLowerCase(); }).indexOf(chip) < 0) return false;
        if (!q) return true;
        return hay(a).indexOf(q) > -1;
      });
      shown = PAGE;
      render();
    }

    function render() {
      var slice = results.slice(0, shown);
      if (!slice.length) {
        dir.innerHTML = '';
        dir.insertAdjacentHTML('beforeend',
          '<div class="dir-empty" style="grid-column:1/-1"><p>Nobody matches that yet.</p>' +
          '<button type="button" class="dir-more" id="dirReset" style="margin:0 auto">Show everyone</button></div>');
        var r = document.getElementById('dirReset');
        if (r) r.addEventListener('click', function () {
          q = ''; chip = '';
          if (qEl) qEl.value = '';
          if (clearEl) clearEl.classList.remove('on');
          if (chipsEl) chipsEl.querySelectorAll('.dir-chip').forEach(function (c) { c.classList.remove('on'); });
          apply();
        });
      } else {
        dir.innerHTML = slice.map(function (a) {
          var tags = (a.tags || []).slice(0, 3);
          return '<button type="button" class="dir-card" data-open="' + esc(a.id) + '">' +
            '<div class="dir-shot"><img src="' + esc(a.photoUrl) + '" alt="' + esc(a.displayName) + '" loading="lazy">' +
              (a.video ? '<span class="dir-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Intro</span>' : '') +
            '</div>' +
            '<div class="dir-body">' +
              '<p class="dir-role">' + esc(a.title) + '</p>' +
              '<h3 class="dir-name">' + esc(a.displayName) + '</h3>' +
              '<p class="dir-blurb' + (a.blurb ? '' : ' empty') + '">' +
                esc(a.blurb || 'Short intro coming soon.') + '</p>' +
              (tags.length ? '<div class="dir-tags">' + tags.map(function (t) {
                  return '<span class="dir-tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            '</div>' +
          '</button>';
        }).join('');
      }
      if (countEl) {
        countEl.textContent = results.length === ROSTER.length
          ? ROSTER.length + (ROSTER.length === 1 ? ' agent' : ' agents')
          : results.length + ' of ' + ROSTER.length + ' agents';
      }
      if (moreEl) {
        var left = results.length - shown;
        moreEl.hidden = left <= 0;
        moreEl.textContent = 'Show ' + Math.min(left, PAGE) + ' more';
      }
    }

    if (qEl) {
      qEl.addEventListener('input', function () {
        q = qEl.value.trim().toLowerCase();
        if (clearEl) clearEl.classList.toggle('on', !!q);
        apply();
      });
    }
    if (clearEl) clearEl.addEventListener('click', function () {
      q = ''; qEl.value = ''; clearEl.classList.remove('on'); qEl.focus(); apply();
    });
    if (chipsEl) chipsEl.addEventListener('click', function (e) {
      var c = e.target.closest('.dir-chip'); if (!c) return;
      var v = c.dataset.chip;
      chip = (chip === v) ? '' : v;
      chipsEl.querySelectorAll('.dir-chip').forEach(function (x) {
        x.classList.toggle('on', x.dataset.chip === chip);
      });
      apply();
    });
    if (moreEl) moreEl.addEventListener('click', function () { shown += PAGE; render(); });

    /* Detail panel — plays the intro video when there is one, photo when there isn't */
    function open(id) {
      var a = ROSTER.filter(function (x) { return x.id === id; })[0];
      if (!a || !modal || !panel) return;
      var facts = [];
      if (a.bestFor) facts.push(['Best for', a.bestFor]);
      if ((a.marketAreas || []).length) facts.push(['Areas', a.marketAreas.join(' · ')]);
      if ((a.languages || []).length) facts.push(['Languages', a.languages.join(' · ')]);
      if ((a.creds || []).length) facts.push(['Credentials', a.creds.join(' · ')]);
      if (a.license) facts.push(['License', a.license]);

      var media = a.video
        ? '<video controls playsinline preload="none" poster="' + esc(a.videoPoster || a.photoPortrait || a.photoUrl) + '"><source src="' + esc(a.video) + '"></video>'
        : '<img src="' + esc(a.photoPortrait || a.photoUrl) + '" alt="' + esc(a.displayName) + '">';

      panel.innerHTML =
        '<div class="dir-media">' + media + '</div>' +
        '<div class="dir-detail">' +
          '<button type="button" class="dir-x" data-dir-close aria-label="Close">&times;</button>' +
          '<p class="dir-role">' + esc(a.title) + ' &middot; Aari Realty</p>' +
          '<h3>' + esc(a.displayName) + '</h3>' +
          '<p class="lead' + (a.blurb ? '' : ' empty') + '">' + esc(a.blurb || 'Short intro coming soon.') + '</p>' +
          (facts.length ? '<div class="dir-facts">' + facts.map(function (f) {
              return '<div class="dir-fact"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>';
            }).join('') + '</div>' : '') +
          '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
            '<a class="btn btn-dark" href="contact.html?agent=' + esc(a.id) + '">Work with ' + esc(a.firstName) + ' &rarr;</a>' +
          '</div>' +
        '</div>';
      modal.classList.add('on');
      document.body.style.overflow = 'hidden';
      var x = panel.querySelector('[data-dir-close]'); if (x) x.focus();
    }
    function close() {
      if (!modal) return;
      var v = panel && panel.querySelector('video'); if (v) v.pause();
      modal.classList.remove('on');
      document.body.style.overflow = '';
    }
    dir.addEventListener('click', function (e) {
      var c = e.target.closest('[data-open]'); if (c) open(c.dataset.open);
    });
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-dir-close]') || e.target.classList.contains('dir-back')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('on')) close();
    });

    apply();
  }

  /* Compact roster strip, where a page just wants faces (homepage) */
  var grid = document.getElementById('agentGrid');
  if (grid && ROSTER.length) {
    grid.innerHTML = ROSTER.slice(0, 8).map(function (a) {
      return '<a class="dir-card" href="agents.html" style="text-decoration:none">' +
        '<div class="dir-shot"><img src="' + a.photoUrl + '" alt="' + a.displayName + '" loading="lazy"></div>' +
        '<div class="dir-body"><p class="dir-role">' + a.title + '</p>' +
        '<h3 class="dir-name">' + a.displayName + '</h3></div></a>';
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
