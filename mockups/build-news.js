// The monthly newsletter as an EMAIL, following the text-and-graphic structure
// rather than the Canva magazine: Introduction, Latest around town, How's the
// market, Events this month, Listing Spotlight, then a subject line and send.
//
// Deliverability-first on purpose. No background-image separations, no
// full-bleed black bands, no waves. One column, ordinary rules between
// sections, small warm accents. The type is still Aari's -- Cormorant Garamond
// and Montserrat -- because type is not what gets a message filtered.
const fs=require('fs'), path=require('path');
function checkTags(h,f){const o=(h.match(/<div\b/g)||[]).length,c=(h.match(/<\/div>/g)||[]).length;
  if(o!==c) throw new Error(f+': '+o+' <div> vs '+c+' </div>');}

// Marlenyi's seven active listings, read from realty_listings on 23 Aug 2026.
// Address, price and type are real. Everything the Hub cannot supply is drawn
// as a gap rather than filled in: there are no photographs on the table, no
// MLS number, no list date and therefore no days on market, every showings
// count is zero, and every note is a migration artefact rather than a selling
// point. The "why this one" line is the agent's to write.
const LISTINGS=[
 {addr:'1219 Hibiscus Avenue',city:'Lehigh Acres, FL 33972',price:'$355,000',type:'Sale'},
 {addr:'2106 Basin St',city:'Port Charlotte, FL 33952',price:'$305,000',type:'Sale'},
 {addr:'1912 NW 24th Avenue',city:'Cape Coral, FL 33993',price:'$65,000',type:'Sale'}
];

const gap=t=>`<span class="gap">${t}</span>`;

const S={
 intro:()=>`      <div class="sec">
        <div class="eyebrow">From Marlenyi</div>
        <div class="h">February, and what I have been up to.</div>
        <p>Three or four lines in your own words: where you have been, what the brokerage
          did last month, one human thing. This is the part nobody can generate for you.</p>
        <div class="snaps"><span>${gap('Photo')}</span><span>${gap('Photo')}</span><span>${gap('Photo')}</span></div>
        <p class="cap">Three from your camera roll, last month.</p>
      </div>`,
 town:()=>`      <div class="sec">
        <div class="eyebrow">Latest around town</div>
        <div class="h">What is opening, moving and changing.</div>
        <ul class="rows">
          ${[1,2,3,4,5].map(()=>`<li><span class="rt">${gap('Business')}: ${gap('what is happening')}</span>
            <span class="srcpill">source</span></li>`).join('\n          ')}
        </ul>
        <p class="rule">Five items &middot; 70 characters each &middot; <b>each one needs a link before this section can be marked done</b></p>
      </div>`,
 market:()=>`      <div class="sec">
        <div class="eyebrow">How&rsquo;s the market?</div>
        <div class="h">Lee County, in four numbers.</div>
        <div class="stats">
          <div><b>${gap('&nbsp;')}</b><span>Sold</span></div>
          <div><b>${gap('&nbsp;')}</b><span>Active</span></div>
          <div><b>${gap('&nbsp;')}</b><span>Avg sold price</span></div>
          <div><b>${gap('&nbsp;')}</b><span>Avg days on market</span></div>
        </div>
        <p class="cap">From your MLS export. The Hub has no market feed, only Aari&rsquo;s own deals.</p>
        <p>Then two sentences of your own on what those numbers mean for someone living here.
          That part is the credibility, not the figures.</p>
        <div class="askbrk">Stuck on the read? <b>Ask Marlenyi</b>, goes straight to the broker.</div>
      </div>`,
 events:()=>`      <div class="sec">
        <div class="eyebrow">Events this month</div>
        <div class="h">Worth leaving the house for.</div>
        <ul class="rows">
          ${[1,2,3,4].map(()=>`<li><span class="rt"><b>${gap('Event')}</b> ${gap('Date')} | ${gap('Where')}</span>
            <span class="srcpill">source</span></li>`).join('\n          ')}
        </ul>
        <div class="recur"><b>And every month, without asking again</b>
          <span>${gap('Farmers market, Saturdays')}</span>
          <span>${gap('First-Friday art walk')}</span>
          <span>${gap('Monthly antique fair')}</span>
          <em>This list carries over. You write it once and confirm it each month.</em></div>
      </div>`,
 listings:()=>`      <div class="sec">
        <div class="eyebrow">Listing spotlight</div>
        <div class="h">Three worth a look.</div>
        <div class="lcards">
          ${LISTINGS.map(l=>`<div class="lc">
            <div class="lph">${gap('Photo, not in the Hub')}</div>
            <div class="lb"><b>${l.addr}</b><span>${l.city}</span>
              <span class="lp">${l.price}<i>${l.type}</i></span>
              <span class="why">${gap('Why this one')}, the agent writes this</span></div>
          </div>`).join('\n          ')}
        </div>
        <p class="rule">Pulled from your own book, <b>7 active listings</b> in the Hub, address
          and price already there. No photograph, no MLS number and no days on market: those columns
          do not exist yet.</p>
        <div class="perm"><span class="bx"></span><span>These are <b>Aari&rsquo;s own listings</b>, so no
          permission is needed. Choosing someone else&rsquo;s puts a tick here that blocks the send
          until it is confirmed.</span></div>
      </div>`,
 foot:()=>`      <div class="sec foot">
        <div class="sig">Marlenyi</div>
        <p class="cap">Broker, Aari Realty LLC &middot; BK3530153 &middot; (239) 201-8950</p>
        <p class="cap">You are receiving this because we have worked together, or you asked to hear
          from me. <a href="#">Unsubscribe</a> &middot; <a href="#">Update your details</a><br>
          Aari Realty LLC, Fort Myers, Florida</p>
      </div>`
};

const ORDER={
 A:['intro','town','market','events','listings','foot'],
 B:['intro','listings','market','town','events','foot'],
 C:['intro','events','town','market','listings','foot']
};
const OPTS=[
 {k:'A',name:'As written',
  blurb:'The order the guide gives: you, the town, the market, the events, then the listings.',
  why:'the business ask sits last, after four sections of things they actually wanted. It is the order least likely to read as an advert, and it is the one the guide has presumably tested.',
  cost:'the one section only you can offer, your own listings, is the one most people never scroll to.'},
 {k:'B',name:'Listings second',
  blurb:'Your own listings straight after the introduction, then the market, then the local content.',
  why:'it puts the thing no other newsletter in their inbox has near the top, and it means the research sections are the reward rather than the bait.',
  cost:'two of the first three sections are about your business. To someone not moving this month it reads as a sales email, and that is the one they unsubscribe from.'},
 {k:'C',name:'Local first',
  blurb:'Events and openings up front, market and listings behind them.',
  why:'it leads with the only reason a person who is not moving would open this at all. It earns the business content instead of assuming it.',
  cost:'it front-loads the two sections that need the most research, so a month where you run out of time is a month with nothing at the top.'}
];

const cols=OPTS.map(o=>`    <div class="slotx">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span></div>
      <div class="subj"><span>Subject</span>${'&#128064;'} New Italian spot downtown? Plus February&rsquo;s events
        <i>The Hub drafts three. This is the field with the biggest effect on whether any of it is read.</i></div>
      <div class="mail"><div class="m">
${ORDER[o.k].map(id=>S[id]()).join('\n')}
      </div></div>
      <p class="slotwhy"><b>Why it works:</b> ${o.why}
        <span class="cost">Cost: ${o.cost}</span></p>
    </div>`).join('\n\n');


// ---- next month, already started ----
// The Hub does not wait to be asked. On the 1st it stands up the next edition
// with everything it already knows filled in, the recurring events carried
// over from last month, and each research section holding its prompt.
const STAGE=[
 {k:'A',name:'Quietly staged',
  blurb:'It is simply there on the 1st. No notification, nothing to dismiss. You open it when you open it.',
  why:'it respects that a monthly is not urgent. Nothing interrupts anyone, and the work that can be done without a human is already done by the time anybody looks.',
  cost:'an agent who never opens it never learns it exists, and the month passes. This is the option that needs the envelope to carry a count.',
  head:'March is ready when you are', sub:'Staged 1 March &middot; nothing sent',
  rows:[['Introduction','carried over, yours to rewrite','part'],
        ['Latest around town','prompt ready, nothing researched','todo'],
        ['How&rsquo;s the market','waiting on your MLS export','todo'],
        ['Events this month','7 recurring carried over, confirm them','part'],
        ['Listing spotlight','3 listings pulled from your book','done']]},
 {k:'B',name:'Staged with a nudge',
  blurb:'Same staging, but the envelope carries it: March is ready, two sections need you.',
  why:'it is the only one that reaches an agent who would otherwise forget. The count on the envelope already exists, so this costs nothing new to build and it names exactly what is missing.',
  cost:'it is another monthly notification in a Hub that is trying not to nag. If the newsletter slips two months, the nudge becomes noise people learn to ignore.',
  head:'March is ready, two sections need you', sub:'Staged 1 March &middot; nudged once',
  rows:[['Introduction','carried over, yours to rewrite','part'],
        ['Latest around town','<b>needs you</b>','todo'],
        ['How&rsquo;s the market','<b>needs your MLS export</b>','todo'],
        ['Events this month','7 recurring carried over, confirm them','part'],
        ['Listing spotlight','3 listings pulled from your book','done']]},
 {k:'C',name:'Staged and drafted',
  blurb:'The Hub runs the research prompts itself overnight and presents drafts, each with its source, for you to check or throw away.',
  why:'it turns the monthly hour into a review. Everything arrives with a link beside it, so checking is reading rather than searching, and a bad draft costs one tap to discard.',
  cost:'drafts that look finished get approved without being read. This is the option where a wrong opening date under your licence is most likely, and it only works if the source link is genuinely required before a section can pass.',
  head:'March is drafted, please check it', sub:'Staged 1 March &middot; 12 items to verify',
  rows:[['Introduction','carried over, yours to rewrite','part'],
        ['Latest around town','5 drafted, each with a link','check'],
        ['How&rsquo;s the market','waiting on your MLS export','todo'],
        ['Events this month','8 drafted plus 7 recurring','check'],
        ['Listing spotlight','3 listings pulled from your book','done']]}
];
const stageCols=STAGE.map(o=>`    <div class="slotx">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span></div>
      <div class="mail"><div class="m">
        <div class="sec">
          <div class="eyebrow">Next edition</div>
          <div class="h">${o.head}</div>
          <p class="cap">${o.sub}</p>
          <ul class="stg">
            ${o.rows.map(r=>`<li><span class="sd ${r[2]}"></span><span class="sn">${r[0]}</span>
              <span class="ss">${r[1]}</span></li>`).join('\n            ')}
          </ul>
          <p class="rule">Nothing here has been sent. The edition sits as a draft until you send it.</p>
        </div>
      </div></div>
      <p class="slotwhy"><b>Why it works:</b> ${o.why}
        <span class="cost">Cost: ${o.cost}</span></p>
    </div>`).join('\n\n');

const src=path.join(__dirname,'aari-newsletter.src.html');
const dest=path.join(__dirname,'aari-newsletter.html');
const mark='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8').replace('__COLS__',cols).replace('__STAGE__',stageCols).split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB');
