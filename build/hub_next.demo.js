// Builds hub_next.demo.html: the real build with the network swapped out.
//
//   node build/hub_next.demo.js  ->  hub_next.demo.html
//
// Nothing about the design, the markup or the CSS changes. The only edit is
// the transport: the Supabase CDN script is replaced with a stub holding a
// dozen obviously invented contacts, so the page runs anywhere with no
// network and no credentials. Never ship this file to the bucket.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'hub_next.html'), 'utf8');

// Invented people. Not a single row of this is anybody's book.
const PEOPLE = [
  ['Marisol Vega',    'Buyer and Seller', 'A', null,         'Lehigh Acres', 'New Lead'],
  ['Daniel Okafor',   'Buyer',            'A', '2026-06-18', 'Fort Myers',   'Contacted'],
  ['Priya Raman',     'Buyer and Seller', 'A', null,         'Naples',       'New Lead'],
  ['Tomas Lindqvist', 'Seller',           'B', '2026-07-30', 'Cape Coral',   'Agreement Signed'],
  ['Amara Nwosu',     'Buyer and Seller', 'B', null,         'Lehigh Acres', 'New Lead'],
  ['Hugo Bellini',    'Buyer',            'B', '2026-08-11', 'Fort Myers',   'Contacted'],
  ['Freya Ostberg',   'Buyer and Seller', 'C', null,         'Estero',       'New Lead'],
  ['Kwame Mensah',    'Seller',           'C', '2026-05-02', 'Naples',       'Closed'],
  ['Lucia Moreau',    'Buyer and Seller', 'C', null,         'Lehigh Acres', 'New Lead'],
  ['Rafael Duarte',   'Buyer',            'B', null,         'Cape Coral',   'New Lead'],
  ['Sanne de Vries',  'Buyer and Seller', 'A', '2026-08-26', 'Fort Myers',   'Under Contract'],
  ['Idris Haddad',    'Buyer and Seller', 'C', null,         'Lehigh Acres', 'New Lead']
];
const ROWS = PEOPLE.map((r, i) => ({
  id: 'demo-' + i, full_name: r[0], email: i % 3 ? 'name@example.com' : null,
  phone: '555-0' + (100 + i), contact_type: r[1], record_class: 'client', vendor_type: null,
  stage: r[5], tier: r[2], last_touch: r[3], notes: null,
  db_state: r[3] ? 'active' : 'unworked', snoozed_until: null, snooze_count: 0,
  street: null, city: r[4], state: 'FL', postal_code: null,
  household_id: (i === 0 || i === 2) ? 'demo-hh' : null, household_primary: i === 0,
  pre_household_tier: null, birthday: null,
  home_anniversary: i % 4 ? null : '2021-03-04', wedding_anniversary: null, children: null,
  instagram_handle: null, facebook_url: null, whatsapp_number: null,
  is_agent: false, is_business: false, is_homeowner: i % 2 === 0, qualified: i % 5 === 0,
  language: i % 2 ? 'en' : 'es', do_not_market: false, gap_skips: [],
  created_at: '2026-08-01T00:00:00Z'
}));

const STUB = `<script>
/* Demo transport. Stands in for supabase-js so the page runs with no network.
   Writes are held in memory: log a conversation and the queue advances, the
   health flips and the counter moves, exactly as it would against the real
   database, but nothing leaves the page. */
(function(){
  var ROWS = ${JSON.stringify(ROWS)};
  var ACTIVITY = [];
  function ok(d){ return Promise.resolve({ data: d, error: null }); }
  function table(name){
    var q = { _f: [], _patch: null };
    q.select = function(){
      if(name === 'realty_members'){
        return { eq: function(){ return { single: function(){
          return ok({ user_id:'demo', full_name:'Marlenyi L. Paredes', role:'agent',
                      status:'active', commission_plan:null, onboarding_checklist:{} });
        } }; } };
      }
      if(name === 'agent_activity'){
        var s = { eq: function(){ return s; }, then: function(res){ res({ data: ACTIVITY.slice(), error: null }); } };
        return s;
      }
      if(q._patch) return ok(q._applied || []);
      return q;
    };
    q.eq = function(k, v){ q._f.push([k, v]); if(q._patch) apply(); return q; };
    q.order = function(){ return ok(JSON.parse(JSON.stringify(ROWS))); };
    q.update = function(patch){ q._patch = patch; return q; };
    q.insert = function(row){
      if(name === 'agent_activity') ACTIVITY.push(row);
      return { select: function(){ return ok([row]); } };
    };
    function apply(){
      var hit = ROWS.filter(function(r){ return q._f.every(function(f){ return r[f[0]] === f[1]; }); });
      hit.forEach(function(r){ for(var k in q._patch) r[k] = q._patch[k]; });
      q._applied = JSON.parse(JSON.stringify(hit));
    }
    return q;
  }
  window.supabase = { createClient: function(){ return {
    auth: {
      getSession: function(){ return ok({ session: { user: { id: 'demo' }, access_token: 'demo' } }).then(function(r){ return { data: r.data }; }); },
      getUser:    function(){ return ok({ user: { id: 'demo' } }).then(function(r){ return { data: r.data }; }); },
      signInWithPassword: function(){ return ok({ session: { user: { id: 'demo' } } }); },
      signInWithOtp: function(){ return ok({}); },
      signOut: function(){ return ok({}); },
      onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }
    },
    from: table
  }; } };
})();
</script>`;

// Swap the CDN script for the stub. Everything else is byte for byte the file
// that goes to the bucket.
const CDN = /<script src="\/vendor\/supabase-js-[^"]*"><\/script>/;
if (!CDN.test(src)) throw new Error('vendored supabase script tag not found');
let out = src.replace(CDN, STUB);

// A quiet strip so nobody mistakes this for live data.
out = out.replace('<div id="app" hidden>',
  '<div id="app" hidden>\n' +
  '<div style="background:#141210;color:#faf5eb;font-family:\'Poppins\',system-ui,sans-serif;' +
  'font-size:11px;letter-spacing:.09em;text-transform:uppercase;text-align:center;' +
  'padding:7px 14px;line-height:1.5">Preview &middot; twelve invented contacts &middot; nothing saves</div>');

fs.writeFileSync(path.join(root, 'hub_next.demo.html'), out);
console.log('wrote hub_next.demo.html', (out.length / 1024).toFixed(0) + 'KB, ' + ROWS.length + ' sample contacts');
