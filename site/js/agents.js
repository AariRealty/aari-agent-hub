/* Aari Realty · "Choose your agent"
   Ported from the aaritransactions.com homepage TC renderer so the section is
   visually identical: the same face+label stacks, the same detail-card markup,
   the same modal behaviour. Roster lives in js/agents-data.js.

   One deliberate difference: picking an agent on the Transactions site opens
   its intake modal. Here it carries the choice to contact.html?agent=<id>,
   where the form pre-selects that agent. */
(function () {
  'use strict';

  var DATA = window.AARI_AGENTS || {};
  var ALL = (DATA.agents || []).filter(function (t) { return t.isActive; });
  if (!ALL.length) return;

  /* Mount points are matched by id suffix so the markup also works where a
     build prefixes ids (the multi-page preview bundle does). */
  function one(name, scope) {
    return (scope || document).querySelector('[id="' + name + '"], [id$="--' + name + '"]');
  }
  function all(name) {
    return Array.prototype.slice.call(
      document.querySelectorAll('[id="' + name + '"], [id$="--' + name + '"]'));
  }

  var IG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/></svg>';

  /* Short label under each face — same rule the Transactions site uses. */
  function specialty(t) {
    if (t.role === 'broker_owner') return t.bestFor || 'Broker';
    if (t.bestFor) {
      var s = t.bestFor.replace(/-side files/, '-side').replace(/ files/, '').replace(/ deals/, '');
      return s.length > 14 ? s.split(/[\/\s]/)[0] : s;
    }
    return t.title || '';
  }

  /* ---------- Face + label stacks (homepage) ---------- */
  var carousel = ALL.filter(function (t) { return t.showInCarousel; });

  all('aariTeam').forEach(function (teamEl) {
    teamEl.innerHTML = carousel.map(function (t, i) {
      return '<div class="tcv4-tc-stack">' +
        '<button class="tcv4-face" data-agent-id="' + t.id + '" data-index="' + i + '" aria-label="Open ' + t.firstName + '’s full card" type="button">' +
          '<img src="' + t.photoUrl + '" alt="' + t.displayName + '" loading="lazy">' +
        '</button>' +
        '<div class="tcv4-label" data-agent-id="' + t.id + '"><strong>' + t.firstName + '</strong>' + specialty(t) + '</div>' +
      '</div>';
    }).join('');
  });

  all('aariBigsub').forEach(function (el) {
    el.innerHTML = carousel.length + ' agent' + (carousel.length === 1 ? '' : 's') + ' &middot; 1 standard &middot; zero pressure';
  });

  /* ---------- Roster cards (agents page) ---------- */
  all('aariPicker').forEach(function (grid) {
    grid.innerHTML = ALL.map(function (t) {
      return '<article class="tc-pick-card">' +
        '<div class="tc-pick-photo"><img src="' + t.photoUrl + '" alt="' + t.displayName + '" loading="lazy"></div>' +
        '<div class="tc-pick-body">' +
          '<span class="tc-pick-role">' + t.title + '</span>' +
          '<h3 class="tc-pick-name">' + t.displayName + '</h3>' +
          (t.fitLine ? '<p class="tc-pick-fit">' + t.fitLine + '</p>' : '') +
          '<div class="tc-pick-actions">' +
            (t.pickable !== false
              ? '<a class="tc-pick-choose" href="contact.html?agent=' + t.id + '">Pick ' + t.firstName + ' &rarr;</a>' : '') +
            '<button type="button" class="tc-pick-email" data-agent-id="' + t.id + '">Full card</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  });

  /* ---------- Detail modal — markup copied from the Transactions renderer ---------- */
  function openModal(m) {
    m.classList.add('active');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tcv4-modal-open');
  }
  function closeModal() {
    document.querySelectorAll('.tcv4-modal.active').forEach(function (m) {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('tcv4-modal-open');
    document.querySelectorAll('.tcv4-face').forEach(function (f) { f.classList.remove('active'); });
  }

  function renderDetail(id, from) {
    var scope = (from && from.closest && from.closest('.pg')) || document;
    var modalEl = one('aariAgentModal', scope);
    var detailEl = one('aariAgentDetail', scope);
    if (!modalEl || !detailEl) return;

    var t = ALL.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var idx = ALL.indexOf(t);
    var num = String(idx + 1).padStart(2, '0');
    var ig = t.social && t.social.instagram;
    var langs = (t.languages || []).join(' &middot; ');
    var traits = (t.specialties || t.traits || []).join(' &middot; ');
    var market = (t.marketAreas || []).join(' &middot; ');
    var photo = t.photoPortrait || t.photoUrl;

    detailEl.innerHTML =
      '<div class="tcv4-detail-card">' +
        '<button class="tcv4-detail-close" type="button" aria-label="Close card">&times;</button>' +
        '<div class="tcv4-detail-photo-wrap">' +
          '<img class="tcv4-detail-photo" src="' + photo + '" alt="' + t.displayName + ', ' + t.title + '" loading="lazy">' +
          '<span class="tcv4-detail-num">' + num + '</span>' +
        '</div>' +
        '<div class="tcv4-detail-info">' +
          '<h3 class="tcv4-detail-name">' + t.displayName + '</h3>' +
          '<p class="tcv4-detail-role">' + t.title + '</p>' +
          (t.fitLine ? '<p class="tcv4-detail-tagline">' + t.fitLine + '</p>' : '') +
          '<div class="tcv4-detail-specs">' +
            (t.hours ? '<div class="tcv4-detail-spec"><strong>Hours</strong><span>' + t.hours + '</span></div>' : '') +
            (t.bestFor ? '<div class="tcv4-detail-spec"><strong>Best for</strong><span>' + t.bestFor + '</span></div>' : '') +
            (langs ? '<div class="tcv4-detail-spec"><strong>Languages</strong><span>' + langs + '</span></div>' : '') +
            (t.license ? '<div class="tcv4-detail-spec"><strong>License</strong><span>' + t.license + '</span></div>' : '') +
          '</div>' +
          (traits || market ? '<div class="tcv4-detail-traits">' +
            (traits ? '<strong>Strengths</strong>' + traits : '') +
            (market ? '<br><strong style="margin-top:8px;display:block">Market</strong>' + market : '') +
          '</div>' : '') +
          '<div class="tcv4-detail-foot">' +
            '<div class="tcv4-detail-socs">' +
              (ig ? '<a href="' + ig + '" class="tcv4-detail-soc" aria-label="' + t.firstName + ' on Instagram" target="_blank" rel="noopener">' + IG_SVG + '</a>' : '') +
            '</div>' +
            (t.pickable !== false
              ? '<a class="tcv4-detail-pick" href="contact.html?agent=' + t.id + '">Pick ' + t.firstName + ' &rarr;</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    openModal(modalEl);
    scope.querySelectorAll('.tcv4-face').forEach(function (f) {
      f.classList.toggle('active', f.dataset.agentId === id);
    });
    var close = detailEl.querySelector('.tcv4-detail-close');
    if (close) close.addEventListener('click', closeModal);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-agent-id]');
    if (el) { e.preventDefault(); renderDetail(el.dataset.agentId, el); return; }
    if (e.target.closest && (e.target.closest('[data-tcv4-close]') || e.target.closest('.tcv4-modal-backdrop'))) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.querySelector('.tcv4-modal.active')) closeModal();
  });

  /* ---------- Contact form: pre-select from ?agent=<id> ---------- */
  var select = one('c-agent');
  if (select) {
    ALL.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.displayName + ' (' + t.title + ')';
      o.textContent = t.displayName + ' — ' + t.title;
      select.appendChild(o);
    });
  }
  window.aariPickAgent = function (id) {
    var t = ALL.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var val = t.displayName + ' (' + t.title + ')';
    var field = one('aariAgentField'), chip = one('aariAgentChip'), sel = one('c-agent');
    if (field) field.value = val;
    if (sel) sel.value = val;
    if (chip) {
      chip.innerHTML = '<img src="' + t.photoUrl + '" alt="" width="44" height="44">' +
        '<span><strong>' + t.displayName + '</strong>' + t.title + ' &middot; your message goes to them</span>' +
        '<a href="agents.html">Change</a>';
      chip.hidden = false;
    }
  };
  try {
    var q = new URL(window.location.href).searchParams.get('agent');
    if (q) window.aariPickAgent(q);
  } catch (_) {}
})();
