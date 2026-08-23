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
        <p>Three or four lines in your own words &mdash; where you have been, what the brokerage
          did last month, one human thing. This is the part nobody can generate for you.</p>
        <div class="snaps"><span>${gap('Photo')}</span><span>${gap('Photo')}</span><span>${gap('Photo')}</span></div>
        <p class="cap">Three from your camera roll, last month.</p>
      </div>`,
 town:()=>`      <div class="sec">
        <div class="eyebrow">Latest around town</div>
        <div class="h">What is opening, moving and changing.</div>
        <ul class="rows">
          ${[1,2,3,4,5].map(()=>`<li><span class="rt">${gap('Business')} &ndash; ${gap('what is happening')}</span>
            <span class="srcpill">source</span></li>`).join('\n          ')}
        </ul>
        <p class="rule">Five items &middot; 70 characters each &middot; <b>each one needs a link before this section can be marked done</b></p>
      </div>`,
 market:()=>`      <div class="sec">
        <div class="eyebrow">How&rsquo;s the market?</div>
        <div class="h">Lee County, in four numbers.</div>
        <div class="stats">
          <div><b>${gap('&mdash;')}</b><span>Sold</span></div>
          <div><b>${gap('&mdash;')}</b><span>Active</span></div>
          <div><b>${gap('&mdash;')}</b><span>Avg sold price</span></div>
          <div><b>${gap('&mdash;')}</b><span>Avg days on market</span></div>
        </div>
        <p class="cap">From your MLS export. The Hub has no market feed &mdash; only Aari&rsquo;s own deals.</p>
        <p>Then two sentences of your own on what those numbers mean for someone living here.
          That part is the credibility, not the figures.</p>
        <div class="askbrk">Stuck on the read? <b>Ask Marlenyi</b> &mdash; goes straight to the broker.</div>
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
            <div class="lph">${gap('Photo &mdash; not in the Hub')}</div>
            <div class="lb"><b>${l.addr}</b><span>${l.city}</span>
              <span class="lp">${l.price}<i>${l.type}</i></span>
              <span class="why">${gap('Why this one')} &mdash; the agent writes this</span></div>
          </div>`).join('\n          ')}
        </div>
        <p class="rule">Pulled from your own book &mdash; <b>7 active listings</b> in the Hub, address
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
  cost:'the one section only you can offer &mdash; your own listings &mdash; is the one most people never scroll to.'},
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

const src=path.join(__dirname,'aari-newsletter.src.html');
const dest=path.join(__dirname,'aari-newsletter.html');
const mark='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8').replace('__COLS__',cols).split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB');
