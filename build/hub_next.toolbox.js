/* === Toolbox ==============================================================
   One flat table, realty_toolbox, grouped by category on render.

   A tile with no url is a tool the brokerage has named but not wired up yet.
   It renders greyed and inert with "coming soon" rather than being hidden or,
   worse, rendered as a link that goes nowhere. The broker can see at a glance
   what is still missing, and so can the agent.                              */

var __tbTiles = [];

async function __tbLoad(){
  if(!window.sb) return { ok:false };
  var r = await sb.from('realty_toolbox')
    .select('id,category,category_sort,title,description,emoji,url,file_path,sort,active')
    .eq('active', true)
    .order('category_sort').order('sort');
  if(r.error){ console.error('toolbox', r.error.message); return { ok:false }; }
  __tbTiles = r.data || [];
  return { ok:true, n:__tbTiles.length };
}

/* Categories in the order the table gives them, each with its tiles. */
function __tbGroups(){
  var seen = {}, out = [];
  __tbTiles.forEach(function(t){
    var k = t.category || 'Other';
    if(!seen[k]){ seen[k] = { name:k, tiles:[] }; out.push(seen[k]); }
    seen[k].tiles.push(t);
  });
  return out;
}

function __tbEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* A url is only ever rendered into href after this returns true. The table
   has a CHECK for the same shape; this is the second gate, because a value
   that reached the row before the constraint existed must not become a
   javascript: link on an agent's screen. */
function __tbSafe(u){
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function __tbTile(t){
  var live = __tbSafe(t.url);
  var body =
    '<span class="tbic">' + __tbEsc(t.emoji || '') + '</span>' +
    '<span class="tbtx"><span class="tbt">' + __tbEsc(t.title) + '</span>' +
    '<span class="tbd">' + __tbEsc(t.description || '') +
      (live ? '' : ' <span class="tbsoon">coming soon</span>') + '</span></span>';
  return live
    ? '<a class="tbcard" href="' + __tbEsc(t.url) + '" target="_blank" rel="noopener noreferrer">' + body + '</a>'
    : '<span class="tbcard off" aria-disabled="true">' + body + '</span>';
}

function pageToolbox(){
  var groups = __tbGroups();
  if(!groups.length){
    return '<div class="card wide anim tbwide"><div class="ch"><h2>Toolbox</h2></div>' +
      '<div class="pbempty">Nothing in realty_toolbox yet.</div></div>';
  }
  var wired = __tbTiles.filter(function(t){ return __tbSafe(t.url); }).length;
  return '<div class="card wide anim tbwide"><div class="ch"><h2>Toolbox</h2>' +
    '<span class="chip gh">' + __tbTiles.length + ' tool' + (__tbTiles.length===1?'':'s') + '</span></div>' +
    groups.map(function(g){
      return '<div class="tbgrp"><div class="txlab">' + __tbEsc(g.name) + '</div>' +
        '<div class="tbgrid">' + g.tiles.map(__tbTile).join('') + '</div></div>';
    }).join('') +
    '<div class="pbnote">Live from realty_toolbox. ' + wired + ' of ' + __tbTiles.length +
    ' have a link; the rest are named but not wired up yet and cannot be clicked.</div></div>';
}

/* Broker view of the same table: what is missing, by category. It does not
   duplicate the agent grid, it answers the only question the broker has. */
function pageToolboxAdmin(){
  var groups = __tbGroups();
  var missing = __tbTiles.filter(function(t){ return !__tbSafe(t.url); });
  return '<div class="card wide anim tbwide"><div class="ch"><h2>Manage Toolbox</h2>' +
    (missing.length
      ? '<span class="chip red">' + missing.length + ' without a link</span>'
      : '<span class="chip gh">all wired</span>') + '</div>' +
    (missing.length
      ? '<div class="fill">' + missing.map(function(t){
          return '<div class="tdq"><div><b>' + __tbEsc(t.emoji || '') + ' ' + __tbEsc(t.title) + '</b>' +
            ' <span class="chip red">needs a link</span></div>' +
            '<div class="rfoot">' + __tbEsc(t.category) + ' &middot; ' +
            __tbEsc(t.description || '') + '</div></div>';
        }).join('') + '</div>'
      : '<div class="pbempty">Every tile has a link.</div>') +
    '<div class="pbnote">' + groups.length + ' categor' + (groups.length===1?'y':'ies') + ', ' +
    __tbTiles.length + ' tiles. Add or edit a tile in realty_toolbox: category, ' +
    'category_sort, title, description, emoji, url, sort. A tile with no url shows to agents as ' +
    'coming soon rather than as a dead link.</div></div>';
}
