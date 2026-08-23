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

// ---- the separations ----
// Every join is a different shape. The site does not repeat one curve; the
// four edges I measured off the screenshots ran 38, 19, 18 and 55px of rise,
// so they are not the same shape at different sizes -- they are different
// shapes. Each path below is drawn on a 640-wide box and overshoots its
// bottom edge by 2px, and the divider carries margin-bottom:-1px, so the two
// grounds meet with no hairline between them.
const SHAPES={
  // organic
  wave:  {h:30, d:'M0,32 C110,32 168,4 330,9 C470,13 548,29 640,18 L640,32 Z'},
  dome:  {h:36, d:'M0,38 C150,2 490,2 640,38 L640,38 Z'},
  swoop: {h:34, d:'M0,36 C210,36 390,5 640,2 L640,36 Z'},
  scoop: {h:34, d:'M0,3 C190,36 450,36 640,4 L640,36 L0,36 Z'},
  crest: {h:32, d:'M0,20 C90,2 200,2 300,16 C410,31 520,33 640,24 L640,34 L0,34 Z'},
  scallop:{h:26,d:'M0,28 C40,6 80,6 120,28 C160,6 200,6 240,28 C280,6 320,6 360,28 '+
                  'C400,6 440,6 480,28 C520,6 560,6 600,28 C620,17 630,14 640,16 L640,28 Z'},
  // geometric
  diag:  {h:34, d:'M0,36 L640,2 L640,36 Z'},
  rdiag: {h:34, d:'M0,2 L640,36 L640,36 L0,36 Z'},
  chev:  {h:30, d:'M0,32 L320,2 L640,32 Z'},
  notch: {h:24, d:'M0,26 L0,12 L268,12 L320,1 L372,12 L640,12 L640,26 Z'},
  step:  {h:28, d:'M0,30 L0,20 L213,20 L213,11 L427,11 L427,2 L640,2 L640,30 Z'},
  point: {h:30, d:'M0,2 L280,2 L320,30 L360,2 L640,2 L640,32 L0,32 Z'}
};
function sep(name,above,below){
  const sh=SHAPES[name];
  return `        <div class="sep" style="background:${above}"><svg viewBox="0 0 640 ${sh.h+2}" `+
    `preserveAspectRatio="none" aria-hidden="true" style="height:${sh.h}px">`+
    `<path d="${sh.d}" fill="${below}"/></svg></div>`;
}
const OPTS=[
 {k:'A',name:'All curves, none twice',
  blurb:'Four organic separations, every one a different curve — a wave, a dome, a rising swoop, a soft crest.',
  run:[C.white,C.cream,C.black,C.white,C.black,C.black],
  seps:['wave','dome','swoop','crest'],
  why:'it is the site’s own language and it never repeats itself. A curve arrives, then a different curve, so the letter keeps surprising you on the way down instead of settling into a pattern.',
  cost:'four curves is four sliced PNGs in a real email, and curves are the shapes that suffer most when a client scales an image. It is the most expensive of the three to ship.'},
 {k:'B',name:'All angles, none twice',
  blurb:'Four geometric cuts — a diagonal, a chevron, a stepped edge, a notch. Sharp instead of soft.',
  run:[C.white,C.cream,C.black,C.white,C.black,C.black],
  seps:['diag','chev','step','notch'],
  why:'angles are cheaper and crisper than curves: they survive scaling, they read at any size, and they give the letter an edge the site does not have. Nothing repeats here either.',
  cost:'it is a departure. Your site is soft-edged everywhere, so a letter built on hard angles will not feel like it came from the same place.'},
 {k:'C',name:'Curve, angle, curve, angle',
  blurb:'Alternating. A wave, then a diagonal, then a scallop, then a chevron — soft and sharp taking turns.',
  run:[C.white,C.cream,C.black,C.white,C.black,C.black],
  seps:['wave','diag','scallop','chev'],
  why:'the alternation is the pattern, so each separation is a genuine surprise and the two halves of the letter never feel alike. The scallop in particular is the most playful shape of the twelve.',
  cost:'mixing two shape languages is the easiest way to look undecided rather than deliberate. It needs the copy either side to be strong enough to carry it.'}
];

const BODY=(run,seps)=>{
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
  const out=[]; let n=0;
  bands.forEach((fn,i)=>{
    const g=run[i], prev=i? run[i-1] : null;
    /* a separation only where the ground actually changes; the ask and the
       footer share one black so they close as a single panel with no seam */
    if(prev && prev!==g){ out.push(sep(seps[n % seps.length], prev, g)); n++; }
    out.push(fn(g));
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
${BODY(o.run,o.seps)}
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
