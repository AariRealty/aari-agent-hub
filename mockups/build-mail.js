// The letter, built from the live joinaari.com rather than from the skill doc.
//
// The skill's recruiting-page reference describes a pure-black page with 4px
// buttons and "black and white only". The site has moved on: it is now
// light-dominant with full-bleed black bands, warm creams, fully-rounded pill
// CTAs, and -- the signature move -- a shallow wave where one band meets the
// next. Everything below is measured off the screenshots:
//
//   #ffffff  hero and most light sections
//   #f5f4f1  the near-neutral card ground
//   #f5f0e8  the warm section band ("how it works")
//   #0a0a0a  the full-bleed black bands
//   #141210  the announcement bar and every pill CTA
//   #f0e8da  cream ink on black
//   #e7e2d7  card borders
//
// The wave measures 18-55px of amplitude on a 1320px-wide 3x phone capture,
// i.e. roughly 6-18 CSS px; scaled to a 640px letter that is a ~22px rise.
const fs=require('fs'), path=require('path');

function checkTags(html,file){
  const o=(html.match(/<div\b/g)||[]).length, c=(html.match(/<\/div>/g)||[]).length;
  if(o!==c) throw new Error(file+': '+o+' <div> but '+c+' </div> -- '+
    (o>c?(o-c)+' unclosed':(c-o)+' extra')+'. A <div> closed with </p> is the usual cause.');
}

const C={white:'#ffffff',card:'#f5f4f1',cream:'#f5f0e8',black:'#0a0a0a',deep:'#141210',
         ink:'#141210',oncream:'#f0e8da',line:'#e7e2d7',mute:'#6b6b6b'};

// a shallow organic wave, the shape the site uses where two bands meet
const WAVE='M0,26 C110,26 170,3 330,6 C470,9 545,24 640,15 L640,26 L0,26 Z';
function wave(above,below){
  return `        <div class="wv" style="background:${above}"><svg viewBox="0 0 640 26" `+
    `preserveAspectRatio="none" aria-hidden="true"><path d="${WAVE}" fill="${below}"/></svg></div>`;
}
const DARK=n=>n===C.black||n===C.deep;

const OPTS=[
 {k:'A',name:'The wave',
  blurb:'The site’s own join. Every time the letter changes ground, it changes on a curve.',
  run:[C.white,C.cream,C.black,C.white,C.black,C.deep], join:'wave',
  why:'this is the thing your site actually does, and it is the thing that makes it feel unlike every other brokerage email. Six bands, six curves, and no two neighbouring sections share a ground.',
  cost:'a curve is an image in an email. Outlook will not render an inline SVG, so each of the five joins has to ship as a sliced PNG — five more images to load, and five more things to go wrong on a slow connection.'},
 {k:'B',name:'The cards',
  blurb:'Each section a rounded card floating on the warm ground, the way the checklist and testimonials sit on the site.',
  run:[C.white,C.white,C.black,C.white,C.black,C.deep], join:'card',
  why:'it borrows the site’s other division — the bordered, rounded card — instead of its curve. It needs no images at all, so it renders identically in every client, and the gaps do the dividing.',
  cost:'it is calmer than the site. Cards read as a list of things rather than one letter, and the black sections lose their full-bleed drama when they are inset with a margin round them.'},
 {k:'C',name:'The arch',
  blurb:'Straight joins, except one. A single deep curve where the letter turns black, and that is the whole gesture.',
  run:[C.white,C.cream,C.black,C.white,C.black,C.deep], join:'arch',
  why:'one big moment instead of five small ones. The single arch lands where the letter turns to the ask, so the curve means something rather than just decorating a seam. Only one image to ship.',
  cost:'the other four joins are hard edges, so away from the arch it reads as a plainer letter than the site. It is the least like joinaari of the three.'}
];

const BODY=(run,join)=>{
  const bands=[
// 1 hero
 g=>`      <div class="band hero" style="background:${g}">
        <span class="sp s1"></span><span class="sp s2"></span><span class="sp s3"></span>
        <span class="sp s4"></span><span class="sp s5"></span><span class="sp s6"></span>
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty">
        <div class="eyebrow">Broker-owned &middot; Southwest Florida</div>
        <div class="h xl">Thinking about<br>your next move? <i>Let&rsquo;s find out.</i></div>
        <p class="sub">The Southwest Florida brokerage that will pull the real numbers for your
          street, and tell you plainly what they mean.</p>
        <p class="punch">Every month you guess is a month you are guessing with your biggest asset.</p>
        <a class="pill" href="https://wa.me/12392018950">Get your number <span>&rarr;</span></a>
        <div class="micro">No obligation. No pressure to list.</div>
      </div>`,
// 2 the checklist card
 g=>`      <div class="band" style="background:${g}">
        <div class="eyebrow">What you get</div>
        <div class="h lg">Three things, <i>and no homework.</i></div>
        <div class="cardbox">
          <div class="ck"><span class="tick">&#10003;</span>What your home would list for this month, from what actually closed</div>
          <div class="ck"><span class="tick">&#10003;</span>What moving would really cost you, the whole figure</div>
          <div class="ck"><span class="tick">&#10003;</span>An honest no if now is the wrong time</div>
          <a class="pill" href="https://wa.me/12392018950">Start the conversation <span>&rarr;</span></a>
        </div>
      </div>`,
// 3 black band
 g=>`      <div class="band" style="background:${g}">
        <div class="eyebrow">Your street, day one</div>
        <div class="h lg">The numbers you&rsquo;d pay for anywhere else. <i>Free.</i></div>
        <div class="marq">Comps <span>&#9733;</span> Days on market <span>&#9733;</span> Net sheet
          <span>&#9733;</span> Tax record <span>&#9733;</span> Comps</div>
      </div>`,
// 4 who
 g=>`      <div class="band" style="background:${g}">
        <div class="eyebrow">Who you are dealing with</div>
        <div class="h lg">Not a call centre. <i>Marlenyi.</i></div>
        <p>Broker and owner of Aari Realty. I work Lee, Collier and Hendry, I answer my own phone,
          and I will tell you when the answer is no.</p>
        <div class="creds">SRS &middot; PSA &middot; ABR &middot; C2EX &middot; BK3530153</div>
      </div>`,
// 5 the ask
 g=>`      <div class="band ask" style="background:${g}">
        <span class="sp s2"></span><span class="sp s5"></span>
        <div class="eyebrow">Let us look at your street</div>
        <div class="h xl">Your address<br><i>belongs up here.</i></div>
        <a class="pill light" href="https://wa.me/12392018950">Let&rsquo;s chat <span>&rarr;</span></a>
        <div class="micro">Or simply reply to this email.</div>
      </div>`,
// 6 footer
 g=>`      <div class="band foot" style="background:${g}">
        <img class="mark sm" src="__AARI_MARK__" alt="Aari Realty">
        <div class="fl">Marlenyi L. Paredes &middot; Broker, Aari Realty LLC &middot; BK3530153<br>
          (239) 201-8950 &middot; <a href="mailto:marlenyi@aarirealty.com">marlenyi@aarirealty.com</a></div>
        <div class="hr"></div>
        <div class="fl">You are receiving this because we have worked together, or you asked to hear from me.<br>
          <a href="#">Unsubscribe</a> &middot; <a href="#">Update your details</a><br>
          Aari Realty LLC, Fort Myers, Florida</div>
      </div>`
  ];
  const out=[];
  bands.forEach((fn,i)=>{
    const g=run[i], prev=i? run[i-1] : null;
    if(prev && prev!==g){
      if(join==='wave') out.push(wave(prev,g));
      else if(join==='arch') out.push(i===4 ? `        <div class="arch" style="background:${prev}">`+
        `<div style="background:${g}"></div></div>` : '');
    }
    let html=fn(g);
    if(join==='card' && !DARK(g) && i>0 && i<5) html=html.replace('class="band"','class="band asCard"');
    out.push(html);
  });
  return out.filter(Boolean).join('\n');
};

const slots=OPTS.map(o=>{
  const strip=o.run.map(n=>`<i style="background:${n}${n===C.white?';box-shadow:inset 0 0 0 1px #e7e2d7':''}"></i>`).join('');
  return `    <div class="slot" data-k="${o.k}">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span>
        <span class="run">${strip}</span></div>
      <div class="mail"><div class="mstage" id="g${o.k}"><div class="m">
${BODY(o.run,o.join)}
      </div></div></div>
      <p class="slotwhy"><b>Why it works:</b> ${o.why}
        <span class="cost">Cost: ${o.cost}</span></p>
    </div>`;
}).join('\n\n');

const src=path.join(__dirname,'aari-email-template.src.html');
const dest=path.join(__dirname,'aari-email-template.html');
const mark='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8');
if(!s.includes('__SLOTS__')) throw new Error('slot placeholder missing');
s=s.replace('__SLOTS__',slots);
if(!s.includes('__AARI_MARK__')) throw new Error('mark placeholder missing');
s=s.split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB -',OPTS.length,'joins from one body');
