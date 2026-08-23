const fs=require('fs'), path=require('path');
const {C,SECTIONS,SRC,OPTS,sepStyle,checkTags,noNestedQuote}=require('./build-edit.js');

// Nothing local is invented. Where a section needs a real event, business or
// deal, the mockup shows the slot and says what has to fill it -- the same
// discipline the template's own "verify responses for accuracy" note asks for.
const slot=(n)=>`<span class="slot">${n}</span>`;

const PAGES={
 cover:(g)=>`      <div class="band cover" style="${g}">
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty">
        <div class="ttl">The<br><i>Monthly</i><br>Edit</div>
        <div class="eyebrow">February in Fort Myers</div>
        <div class="by">February 2026 &middot; Marlenyi Paredes</div>
      </div>`,
 editor:(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">From the editor</div>
        <div class="h">Happy February.</div>
        <div class="talk"><p>If you are new here, this is where I put what is happening around
          town, a few local things I am enjoying, and a plain read on the market.</p>
          <p>Easy to skim. Always Fort Myers.</p></div>
        <div class="eyebrow" style="margin-top:26px">Snaps from last month</div>
        <div class="snaps"><span></span><span></span><span></span></div>
        <div class="capt">Three captions, one per photograph</div>
      </div>`,
 market:(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">Lee County market snapshot</div>
        <div class="h">The <i>numbers.</i></div>
        <div class="stats">
          <div class="s"><b>${slot('&mdash;')}</b><span>Sold listings</span><i>vs last month</i></div>
          <div class="s"><b>${slot('&mdash;')}</b><span>Active listings</span><i>vs last month</i></div>
          <div class="s"><b>${slot('&mdash;')}</b><span>Avg sold price</span><i>vs last month</i></div>
          <div class="s"><b>${slot('&mdash;')}</b><span>Avg days on market</span><i>vs last month</i></div>
        </div>
        <div class="srcline">Source: your MLS export &middot; prints under the figures</div>
        <div class="talk"><p>Then one sentence in your words on what those four numbers mean for
          someone living here.</p></div>
        <div class="two"><div class="inv"><b>Homeowners</b>A free estimate of what yours is worth.
          Even if you are only curious.</div>
          <div class="inv"><b>Thinking of buying</b>Questions answered, or a short call. Even if
          you are not ready.</div></div>
      </div>`,
 new:(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">New &amp; coming soon</div>
        <div class="h">Opening <i>near you.</i></div>
        <ul class="list">
          <li>${slot('Business')} &ndash; ${slot('what is happening')}</li>
          <li>${slot('Business')} &ndash; ${slot('what is happening')}</li>
          <li>${slot('Business')} &ndash; ${slot('what is happening')}</li>
          <li>${slot('Business')} &ndash; ${slot('what is happening')}</li>
          <li>${slot('Business')} &ndash; ${slot('what is happening')}</li>
        </ul>
        <div class="rule70">70 characters each &middot; researched and checked</div>
      </div>`,
 events:(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">Events this month</div>
        <div class="h">Worth <i>leaving the house for.</i></div>
        <div class="evgrid">
          ${Array.from({length:8},()=>`<div class="ev"><b>${slot('Event')}</b><span>${slot('Date')} | ${slot('Where')}</span></div>`).join('\n          ')}
        </div>
        <div class="rule70">Ten or more, a few of them for families &middot; every one verified</div>
        <div class="eyebrow" style="margin-top:28px">Local hidden gems</div>
        <div class="talk"><p>Three of your own. Not researched &mdash; these are the ones you would
          actually tell a friend about.</p></div>
      </div>`,
 deals:(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">Local deals</div>
        <div class="h">Worth <i>knowing about.</i></div>
        <ul class="list">
          ${Array.from({length:5},()=>`<li>${slot('Deal')} | ${slot('one sentence')}</li>`).join('\n          ')}
        </ul>
        <div class="rule70">150 characters each &middot; researched and checked</div>
        <div class="signoff">
          <div class="h" style="font-size:26px">See you out there.</div>
          <div class="sig">Marlenyi</div>
          <div class="capt">Broker, Aari Realty LLC &middot; BK3530153 &middot; Fort Myers</div>
        </div>
      </div>`
};

// B inserts a real contents band after the cover. C is not the same six at
// all -- it is one screen with a link to the rest. The captions have to be
// true of what is drawn.
PAGES.index=(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">In this issue</div>
        <div class="idx">
          <a><span>01</span>From the editor<i>&rarr;</i></a>
          <a><span>02</span>Lee County market snapshot<i>&rarr;</i></a>
          <a><span>03</span>New &amp; coming soon<i>&rarr;</i></a>
          <a><span>04</span>Events this month<i>&rarr;</i></a>
          <a><span>05</span>Local deals<i>&rarr;</i></a>
        </div>
        <div class="capt">Five minutes, or ninety seconds if you skip to the events.</div>
      </div>`;
PAGES.digest=(g)=>`      <div class="band" style="${g}">
        <div class="eyebrow">February in Fort Myers</div>
        <div class="h">The <i>short version.</i></div>
        <div class="stats" style="grid-template-columns:1fr 1fr">
          <div class="s"><b>${slot('&mdash;')}</b><span>Avg sold price</span><i>vs last month</i></div>
          <div class="s"><b>${slot('&mdash;')}</b><span>Avg days on market</span><i>vs last month</i></div>
        </div>
        <div class="srcline">Source: your MLS export</div>
        <div class="digcols">
          <div><div class="eyebrow" style="margin:0 0 9px">Three events</div>
            <ul class="list mini"><li>${slot('Event')}</li><li>${slot('Event')}</li><li>${slot('Event')}</li></ul></div>
          <div><div class="eyebrow" style="margin:0 0 9px">Three deals</div>
            <ul class="list mini"><li>${slot('Deal')}</li><li>${slot('Deal')}</li><li>${slot('Deal')}</li></ul></div>
        </div>
        <div class="gem"><b>One hidden gem</b>The single place you would actually send a friend
          this month, in your own words.</div>
        <a class="pill">Read the full edit <span>&rarr;</span></a>
      </div>`;

const ORDER={
 A:['cover','editor','market','new','events','deals'],
 B:['cover','index','editor','market','new','events','deals'],
 C:['cover','digest']
};
const RUNS={
 A:[C.white,C.cream,C.black,C.white,C.cream,C.black],
 B:[C.white,C.card,C.white,C.cream,C.white,C.cream,C.black],
 C:[C.black,C.white]
};
const SEPS=['wave','diag','scallop','chev','dome','wave'];

function renderRun(k){
  const run=RUNS[k], ids=ORDER[k]; const out=[]; let n=0;
  ids.forEach((id,i)=>{
    const g=run[i], next=(i+1<run.length)?run[i+1]:null;
    let style='background:'+g;
    if(next && next!==g){ const sp=sepStyle(SEPS[n%SEPS.length],g,next); n++;
      style=sp.bg+';padding-bottom:'+(sp.pad+46)+'px'; }
    out.push(PAGES[id](style));
  });
  return out.join('\n');
}

const promptCards=SECTIONS.map((s,i)=>{
  const src=SRC[s.src];
  const p=s.prompt;
  return `    <div class="pc">
      <div class="pch"><span class="pn">${i+1}</span><span class="pt">${s.ttl}</span>
        <span class="tag ${src.c}">${src.k}</span></div>
      <p class="pnote">${s.note}</p>
      ${p?`<div class="pbox"><b>${p.n}</b><span class="ask">${p.ask}</span>
        <span class="fmt"><i>Format:</i> ${p.fmt}</span>
        <span class="ex">${p.ex}</span>
        ${p.verify?`<span class="ver">${p.verify}</span>`:''}</div>`:''}
    </div>`;
}).join('\n');

const slots=OPTS.map(o=>`    <div class="slotx" data-k="${o.k}">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span></div>
      <div class="frame" style="height:${o.k==='C'?760:1840}px"><div class="stage" id="g${o.k}"><div class="m">
${renderRun(o.k)}
      </div></div></div>
      <p class="slotwhy"><b>Why it works:</b> ${o.why}
        <span class="cost">Cost: ${o.cost}</span></p>
    </div>`).join('\n\n');

const src=path.join(__dirname,'aari-monthly-edit.src.html');
const dest=path.join(__dirname,'aari-monthly-edit.html');
const mark='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8');
s=s.replace('__PROMPTS__',promptCards).replace('__SLOTS__',slots).split('__AARI_MARK__').join(mark);
checkTags(s,dest); noNestedQuote(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB');
