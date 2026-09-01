/* ============================================================================
   Aari Realty · agent roster + "choose your agent"
   ----------------------------------------------------------------------------
   THIS ARRAY IS THE SINGLE SOURCE OF TRUTH. Edit it here and every place the
   roster appears updates: the homepage face row, the modal, the agents page
   picker, and the agent pre-selected on the contact form.

   BEFORE LAUNCH — Marlenyi, verify each row:
     · The person is currently affiliated with Aari Realty LLC.
     · Their Florida license is active and on file with the brokerage.
     · The `fit` line is what THEY would say about themselves. The placeholder
       lines below are deliberately generic — no specialty, market or claim has
       been written for anyone but you, because inventing one is a false
       advertising problem. Replace them.
     · Add `lic` (license number) if you want it displayed.
   Remove a row to take someone off the site. Add a row to add someone.

   NOT INCLUDED ON PURPOSE: Eileen Hernandez and Milennys Vargas are transaction
   coordinators, not selling agents, so they are not on a consumer-facing
   "choose your agent" list. Add them only if that changes.
   ========================================================================== */

window.AARI_AGENTS = [
  {
    slug: 'marlenyi-paredes',
    name: 'Marlenyi Paredes',
    first: 'Marlenyi',
    role: 'Broker-Owner',
    photo: 'images/agents/marlenyi-paredes.jpg',
    fit: 'You want the broker herself, and you want to be told the truth about your number.',
    bio: 'Florida licensed real estate broker and the founder of Aari Realty. Marlenyi built the brokerage after years running businesses with her husband, and she still works directly with clients — which is the only way the standard stays real. She is direct, she will tell you when she disagrees with your price, and she would rather lose a listing than take one she cannot defend.',
    creds: ['SRS', 'ABR', 'PSA', 'C2EX'],
    langs: ['English', 'Spanish'],
    email: 'marlenyi@aarirealty.com'
  },
  {
    slug: 'alejandro-paredes',
    name: 'Alejandro Paredes',
    first: 'Alejandro',
    role: 'Realtor®',
    photo: 'images/agents/alejandro-paredes.jpg',
    fit: '',            /* TODO Marlenyi: one line in his voice */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  },
  {
    slug: 'odalis-mora',
    name: 'Odalis Mora',
    first: 'Odalis',
    role: 'Realtor®',
    photo: 'images/agents/odalis-mora.jpg',
    fit: '',            /* TODO */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  },
  {
    slug: 'alied-machuca',
    name: 'Alied Machuca',
    first: 'Alied',
    role: 'Realtor®',
    photo: 'images/agents/alied-machuca.jpg',
    fit: '',            /* TODO */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  },
  {
    slug: 'ana-puentes',
    name: 'Ana Puentes',
    first: 'Ana',
    role: 'Realtor®',
    photo: 'images/agents/ana-puentes.jpg',
    fit: '',            /* TODO */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  },
  {
    slug: 'flavia-aguilera',
    name: 'Flavia Aguilera',
    first: 'Flavia',
    role: 'Realtor®',
    photo: 'images/agents/flavia-aguilera.jpg',
    fit: '',            /* TODO */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  },
  {
    slug: 'roosevelt-sanchez',
    name: 'Roosevelt Sanchez',
    first: 'Roosevelt',
    role: 'Realtor®',
    photo: 'images/agents/roosevelt-sanchez.jpg',
    fit: '',            /* TODO */
    bio: '',
    creds: [],
    langs: ['English', 'Spanish']
  }
];

(function () {
  'use strict';
  var AGENTS = window.AARI_AGENTS || [];
  var FALLBACK_FIT = 'Southwest Florida · Aari Realty';
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var byIndex = {};
  AGENTS.forEach(function (a, i) { byIndex[a.slug] = i; });

  /* Mount points are matched by id SUFFIX, not exact id, so the same markup
     works when a build prefixes ids (the multi-page preview bundle does), and
     so a section can appear more than once on a page without breaking. */
  function mounts(name) {
    return Array.prototype.slice.call(document.querySelectorAll('[id="' + name + '"], [id$="--' + name + '"]'));
  }

  /* ---- Homepage face row -------------------------------------------------- */
  mounts('aariTeam').forEach(function (team) {
    team.innerHTML = AGENTS.map(function (a) {
      return '<div class="tcv4-tc-stack">' +
        '<button type="button" class="tcv4-face" data-agent="' + esc(a.slug) + '" aria-label="' + esc(a.name) + ', ' + esc(a.role) + '">' +
          '<img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '" loading="lazy" width="120" height="120">' +
        '</button>' +
        '<p class="tcv4-label" data-agent="' + esc(a.slug) + '"><strong>' + esc(a.first) + '</strong>' + esc(a.role) + '</p>' +
      '</div>';
    }).join('');
  });

  /* ---- Agents page picker ------------------------------------------------- */
  mounts('aariPicker').forEach(function (picker) {
    picker.innerHTML = AGENTS.map(function (a) {
      return '<article class="tc-pick-card">' +
        '<div class="tc-pick-photo"><img src="' + esc(a.photo) + '" alt="' + esc(a.name) + '" loading="lazy" width="160" height="160"></div>' +
        '<div class="tc-pick-body">' +
          '<span class="tc-pick-role">' + esc(a.role) + '</span>' +
          '<h3 class="tc-pick-name">' + esc(a.name) + '</h3>' +
          '<p class="tc-pick-fit">' + esc(a.fit || FALLBACK_FIT) + '</p>' +
          '<div class="tc-pick-actions">' +
            '<a class="tc-pick-choose" href="contact.html?agent=' + encodeURIComponent(a.slug) + '">Work with ' + esc(a.first) + '</a>' +
            '<button type="button" class="tc-pick-email" data-agent="' + esc(a.slug) + '">Read more</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  });

  /* ---- Detail modal ------------------------------------------------------- */
  function openAgent(slug, from) {
    var scope = (from && from.closest && from.closest('.pg')) || document;
    var modal = scope.querySelector('[id="aariAgentModal"], [id$="--aariAgentModal"]');
    var detail = scope.querySelector('[id="aariAgentDetail"], [id$="--aariAgentDetail"]');
    if (!modal || !detail) return;
    var i = byIndex[slug];
    if (i === undefined) return;
    var a = AGENTS[i];
    var meta = [];
    if (a.creds && a.creds.length) meta.push(a.creds.join(' · '));
    if (a.langs && a.langs.length) meta.push(a.langs.join(' · '));
    detail.innerHTML =
      '<div class="tcv4-detail-card">' +
        '<button type="button" class="tcv4-detail-close" data-agent-close aria-label="Close">&times;</button>' +
        '<div class="tcv4-detail-photo-wrap">' +
          '<span class="tcv4-detail-num">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          '<img class="tcv4-detail-photo" src="' + esc(a.photo) + '" alt="' + esc(a.name) + '" width="400" height="500">' +
        '</div>' +
        '<div class="tcv4-detail-info">' +
          '<h3 class="tcv4-detail-name">' + esc(a.name) + '</h3>' +
          '<p class="tcv4-detail-role">' + esc(a.role) + ' · Aari Realty</p>' +
          '<p class="tcv4-detail-tagline">' + esc(a.fit || FALLBACK_FIT) + '</p>' +
          (a.bio ? '<p class="tcv4-detail-traits">' + esc(a.bio) + '</p>' : '') +
          (meta.length ? '<div class="tcv4-detail-specs">' + meta.map(function (m) {
              return '<span class="tcv4-detail-spec">' + esc(m) + '</span>';
            }).join('') + '</div>' : '') +
          '<div class="tcv4-detail-foot">' +
            '<a class="tcv4-detail-pick" href="contact.html?agent=' + encodeURIComponent(a.slug) + '">Work with ' + esc(a.first) + ' &rarr;</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tcv4-modal-open');
  }
  function closeAgent() {
    document.querySelectorAll('.tcv4-modal.active').forEach(function (m) {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('tcv4-modal-open');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-agent]');
    if (t) { e.preventDefault(); openAgent(t.getAttribute('data-agent'), t); return; }
    if (e.target.closest && (e.target.closest('[data-agent-close]') || e.target.closest('.tcv4-modal-backdrop'))) closeAgent();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAgent();
  });

  /* ---- Contact form: pre-select the agent from ?agent=slug ---------------- */
  var chip = mounts('aariAgentChip')[0];
  var field = mounts('aariAgentField')[0];
  var select = mounts('c-agent')[0];
  if (select) {
    AGENTS.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.name + ' (' + a.role + ')';
      o.textContent = a.name + ' — ' + a.role;
      o.dataset.slug = a.slug;
      select.appendChild(o);
    });
  }
  var slug = null;
  try { slug = new URL(window.location.href).searchParams.get('agent'); } catch (_) {}
  if (slug && byIndex[slug] !== undefined) {
    var a = AGENTS[byIndex[slug]];
    if (field) field.value = a.name + ' (' + a.role + ')';
    if (select) select.value = a.name + ' (' + a.role + ')';
    if (chip) {
      chip.innerHTML = '<img src="' + esc(a.photo) + '" alt="" width="44" height="44">' +
        '<span><strong>' + esc(a.name) + '</strong>' + esc(a.role) + ' · your message goes to them' +
        '</span><a href="agents.html">Change</a>';
      chip.hidden = false;
    }
  }
})();
