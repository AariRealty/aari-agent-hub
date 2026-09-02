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

  /* ---- Choose your agent: the face cluster opens the directory popup ---- */
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function blurbOf(a){return a.blurb||'Short intro coming soon.';}
  function roleLine(a){return a.title + (a.badge ? ' · ' + a.badge : '');}

  var stripCount = document.getElementById('tmCount');
  if (stripCount && ROSTER.length) {
    stripCount.textContent = 'The agent behind your move \u2014 ' + ROSTER.length +
      ' licensed Realtors\u00ae across Lee and Collier County.';
  }

  /* Popup browser */
  var br = document.getElementById('br');
  if (br && ROSTER.length) {
    var list = document.getElementById('brList'), det = document.getElementById('brDetail'),
        q = document.getElementById('brQ'), clr = document.getElementById('brClr'),
        chipsEl = document.getElementById('brChips'), cntEl = document.getElementById('brCount');
    var term = '', chip = '', cur = null, lastFocus = null;

    function hay(a){return [a.displayName,a.title,a.badge,a.blurb,(a.tags||[]).join(' '),
      (a.languages||[]).join(' '),(a.marketAreas||[]).join(' ')].join(' ').toLowerCase();}

    /* chips from whatever tags the roster carries, most common first */
    var counts = {};
    ROSTER.forEach(function(a){(a.tags||[]).forEach(function(t){
      t=String(t).trim().toLowerCase(); if(t) counts[t]=(counts[t]||0)+1;});});
    var tags = Object.keys(counts).sort(function(x,y){return counts[y]-counts[x]||x.localeCompare(y);}).slice(0,10);
    if (chipsEl) {
      var roleChips = '<button type="button" class="br-chip" data-role="broker_owner">Broker</button>' +
                      '<button type="button" class="br-chip" data-role="agent_tc">Transaction Coordinators</button>';
      chipsEl.innerHTML = roleChips + tags.map(function(t){
        return '<button type="button" class="br-chip" data-c="'+esc(t)+'">'+
          esc(t.replace(/\b\w/g,function(c){return c.toUpperCase();}))+'</button>';}).join('');
    }

    function results(){
      return ROSTER.filter(function(a){
        if (chip) {
          if (chip.indexOf('role:') === 0) { if (a.role !== chip.slice(5)) return false; }
          else if ((a.tags||[]).map(function(t){return String(t).toLowerCase();}).indexOf(chip) < 0) return false;
        }
        return !term || hay(a).indexOf(term) > -1;
      });
    }

    function detail(a){
      cur = a.id;
      var f = [];
      if (a.bestFor) f.push(['Best for', a.bestFor]);
      if ((a.marketAreas||[]).length) f.push(['Areas', a.marketAreas.join(' · ')]);
      if ((a.languages||[]).length) f.push(['Languages', a.languages.join(' · ')]);
      if ((a.creds||[]).length) f.push(['Credentials', a.creds.join(' · ')]);
      if (a.license) f.push(['License', a.license]);
      var media = a.video
        ? '<video controls playsinline preload="none" poster="'+esc(a.videoPoster||a.photoPortrait||a.photoUrl)+'"><source src="'+esc(a.video)+'"></video>'
        : '<img src="'+esc(a.photoPortrait||a.photoUrl)+'" alt="'+esc(a.displayName)+'">';
      det.innerHTML =
        '<div class="br-hero"><div class="br-media">'+media+'</div>'+
        '<div class="br-info">'+
          '<div class="br-kicker"><span class="br-pill lead">'+esc(a.title)+'</span>'+
            (a.badge ? '<span class="br-pill">'+esc(a.badge)+'</span>' : '')+'</div>'+
          '<h4>'+esc(a.displayName)+'</h4>'+
          '<p class="br-lead'+(a.blurb?'':' e')+'">'+esc(blurbOf(a))+'</p>'+
          (f.length ? '<div class="br-facts">'+f.map(function(x){
            return '<div class="br-fact"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>';}).join('')+'</div>' : '')+
        '</div></div>'+
        '<div class="br-foot"><a class="btn btn-dark" href="contact.html?agent='+esc(a.id)+'">Work with '+esc(a.firstName)+' &rarr;</a></div>';
      list.querySelectorAll('.br-item').forEach(function(i){i.classList.toggle('on', i.dataset.id === a.id);});
    }

    function paint(){
      var res = results();
      cntEl.textContent = res.length === ROSTER.length
        ? ROSTER.length + ' Realtors®'
        : res.length + ' of ' + ROSTER.length;
      if (!res.length) {
        list.innerHTML = '<p class="br-none">Nobody matches that.</p>';
        det.innerHTML = '<p class="br-none">Clear the search to see the team.</p>';
        return;
      }
      list.innerHTML = res.map(function(a){
        return '<button type="button" class="br-item" data-id="'+esc(a.id)+'">'+
          '<div class="br-ph"><img src="'+esc(a.photoUrl)+'" alt="" loading="lazy">'+
            (a.video?'<span class="br-vd"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>':'')+
          '</div><div><p class="br-nm">'+esc(a.displayName)+'</p>'+
          '<p class="br-rl">'+esc(roleLine(a))+'</p></div></button>';
      }).join('');
      detail(res.filter(function(a){return a.id===cur;})[0] || res[0]);
    }

    function open(){
      lastFocus = document.activeElement;
      br.classList.add('on');
      document.body.style.overflow = 'hidden';
      paint();
      if (q) setTimeout(function(){ q.focus(); }, 60);
    }
    function close(){
      var v = det && det.querySelector('video'); if (v) v.pause();
      br.classList.remove('on');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    window.aariOpenAgents = open;

    document.addEventListener('click', function(e){
      if (e.target.closest('[data-open-agents]')) { e.preventDefault(); open(); return; }
      if (e.target.closest('[data-br-close]') || e.target.classList.contains('br-back')) close();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && br.classList.contains('on')) close();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest &&
          e.target.closest('[data-open-agents][role="button"]')) { e.preventDefault(); open(); }
    });
    if (q) q.addEventListener('input', function(){
      term = q.value.trim().toLowerCase();
      if (clr) clr.classList.toggle('on', !!term);
      paint();
    });
    if (clr) clr.addEventListener('click', function(){
      term=''; q.value=''; clr.classList.remove('on'); q.focus(); paint();
    });
    if (chipsEl) chipsEl.addEventListener('click', function(e){
      var c = e.target.closest('.br-chip'); if (!c) return;
      var val = c.dataset.role ? 'role:'+c.dataset.role : c.dataset.c;
      chip = (chip === val) ? '' : val;
      chipsEl.querySelectorAll('.br-chip').forEach(function(x){
        var v = x.dataset.role ? 'role:'+x.dataset.role : x.dataset.c;
        x.classList.toggle('on', v === chip);
      });
      paint();
    });
    list.addEventListener('click', function(e){
      var i = e.target.closest('[data-id]'); if (!i) return;
      detail(ROSTER.filter(function(a){return a.id===i.dataset.id;})[0]);
    });
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
