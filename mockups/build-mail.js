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
// Every join is a different shape, and none repeats inside a letter.
//
// The seam: the divider is painted in the colour of the band BELOW it, and the
// shape is the colour of the band ABOVE hanging down into it. That way the
// bottom edge of the divider and the top of the next band are already the same
// colour, so no seam is possible there -- which is where the line was showing.
// The divider also overlaps the band above by 1px and the path overshoots the
// top of the viewBox, so there is nothing to see at that edge either.
// Each shape is the colour of the band BELOW rising from the bottom of the
// divider. The divider itself is painted in the colour of the band ABOVE, so
// its top edge matches the band above exactly and no seam is possible there.
// The path overshoots the bottom of the viewBox and the divider carries a 1px
// negative bottom margin, so the band below covers the only edge that could
// antialias. That combination is what finally removed the line.
const SHAPES={
  wave:   {h:30, d:'M0,34 C110,34 168,4 330,9 C470,13 548,31 640,18 L640,34 Z'},
  dome:   {h:36, d:'M0,40 C150,0 490,0 640,40 Z'},
  swoop:  {h:34, d:'M0,38 C210,38 390,4 640,1 L640,38 Z'},
  crest:  {h:32, d:'M0,18 C90,0 200,0 300,14 C410,29 520,31 640,22 L640,36 L0,36 Z'},
  scallop:{h:26, d:'M0,30 C40,6 80,6 120,28 C160,6 200,6 240,28 C280,6 320,6 360,28 '+
                   'C400,6 440,6 480,28 C520,6 560,6 600,28 C618,17 630,13 640,14 L640,30 Z'},
  diag:   {h:34, d:'M0,38 L640,1 L640,38 Z'},
  rdiag:  {h:34, d:'M0,1 L640,38 L0,38 Z'},
  chev:   {h:30, d:'M0,34 L320,1 L640,34 Z'},
  notch:  {h:24, d:'M0,28 L0,12 L268,12 L320,1 L372,12 L640,12 L640,28 Z'},
  step:   {h:28, d:'M0,32 L0,20 L213,20 L213,11 L427,11 L427,1 L640,1 L640,32 Z'},
  point:  {h:30, d:'M0,34 L0,4 L280,4 L320,32 L360,4 L640,4 L640,34 Z'},
  slant:  {h:30, d:'M0,34 L0,26 L300,4 L640,26 L640,34 Z'}
};
// There is no separator element any more. A boundary between two elements is
// a boundary that can antialias, and three attempts at hiding it all left a
// 1px line. The shape is now painted INSIDE the band above, as a background
// image pinned to its bottom edge, in the colour of the band below. One
// element, one paint, nothing to seam against.
function sepStyle(name,above,below){
  const sh=SHAPES[name];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${sh.h}" `+
    `preserveAspectRatio="none"><path d="${sh.d}" fill="${below}"/></svg>`;
  const uri="data:image/svg+xml;utf8,"+encodeURIComponent(svg).replace(/'/g,'%27').replace(/"/g,'%22');
  /* single quotes: this string lands inside a double-quoted style attribute,
     and a nested double quote terminates the attribute early -- the shapes
     silently vanished and every join rendered as a straight edge */
  return {bg:`background:${above} url('${uri}') bottom center / 100% ${sh.h}px no-repeat`,
          pad:sh.h};
}

const OPTS=[
 {k:'A',name:'All curves, none twice',
  blurb:'Five organic separations, every one different — a wave, a dome, a swoop, a crest, a scallop.',
  seps:['wave','dome','swoop','crest','scallop'],
  why:'it is the site’s own language and it never repeats. A curve arrives, then a different curve, so the letter keeps moving instead of settling into a pattern.',
  cost:'five curves is five sliced images in a real email, and curves are the shapes that suffer most when a client rescales them.'},
 {k:'B',name:'All angles, none twice',
  blurb:'Five geometric cuts — a diagonal, a chevron, a stepped edge, a notch, a long slant.',
  seps:['diag','chev','step','notch','slant'],
  why:'angles stay crisp at any size and give the letter an edge the site does not have. Nothing repeats here either.',
  cost:'your site is soft-edged everywhere, so a letter built entirely on hard angles will not feel like it came from the same place.'},
 {k:'C',name:'Curve, angle, curve, angle',
  blurb:'Alternating, so no separation prepares you for the next — wave, diagonal, scallop, chevron, dome.',
  seps:['wave','diag','scallop','chev','dome'],
  why:'the alternation is the point: soft and sharp take turns, so nothing is back to back and each join is a genuine surprise.',
  cost:'mixing two shape languages is the easiest way to look undecided rather than deliberate. The copy either side has to be strong enough to carry it.'}
];

// The structure of the template you sent, on Aari's ground:
// hero, intro + CTA, a heading with a media band and numbered steps, a second
// heading with a media band and a paragraph, an accent card, then a full
// footer with the social row, the unsubscribe and the address.
//
// The run never puts two dark bands together, and text on black is white --
// cream on black was not wanted.
const RUN=[C.black,C.white,C.cream,C.white,C.cream,C.white];

const BODY=(seps)=>{
  const bands=[
 g=>`      <div class="band hero" style="${g}">
        <span class="sp s1"></span><span class="sp s2"></span><span class="sp s4"></span>
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty">
        <div class="eyebrow">Broker-owned &middot; Southwest Florida</div>
        <div class="media tall">Photograph &mdash; your street</div>
        <div class="h xl">Thinking about<br>your next move?</div>
        <a class="pill light" href="https://wa.me/12392018950">Get your number <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <p class="sub">Prices in Southwest Florida moved again this quarter. If you have wondered
          what your home is worth today &mdash; or what your money buys now &mdash; I will pull the
          real numbers for your street and walk you through them. No pressure, no obligation.</p>
        <a class="pill" href="https://wa.me/12392018950">Get started <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="eyebrow">What I will send you</div>
        <div class="h lg">Four things, <i>and no homework.</i></div>
        <div class="media">Neighbourhood snapshot</div>
        <div class="steps">
          <div class="stp"><span class="num">1</span><span class="tx">What your home would list for
            this month, from the comparables that actually closed.</span></div>
          <div class="stp"><span class="num">2</span><span class="tx">What is sitting unsold nearby,
            and how long it has been sitting.</span></div>
          <div class="stp"><span class="num">3</span><span class="tx">What it would cost you to move
            up, down or across &mdash; the whole number, not the headline.</span></div>
          <div class="stp"><span class="num">4</span><span class="tx">If now is wrong, I will tell
            you that too, and when to look again.</span></div>
        </div>
        <a class="pill" href="https://wa.me/12392018950">Book fifteen minutes <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="eyebrow">Who you are dealing with</div>
        <div class="h lg">Not a call centre. <i>Marlenyi.</i></div>
        <div class="media">Marlenyi at a listing</div>
        <p class="sub">Broker and owner of Aari Realty. I work Lee, Collier and Hendry, I answer my
          own phone, and I will tell you when the answer is no.</p>
        <div class="creds">SRS &middot; PSA &middot; ABR &middot; C2EX &middot; BK3530153</div>
        <a class="pill" href="https://wa.me/12392018950">Learn more <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="accent">
          <div class="h md">Let us look at<br><i>your street.</i></div>
          <p>One message back is all it takes. I will do the rest.</p>
          <a class="pill light" href="https://wa.me/12392018950">Let&rsquo;s chat <span>&rarr;</span></a>
        </div>
      </div>`,
 g=>`      <div class="band foot" style="${g}">
        <img class="mark sm" src="__AARI_MARK__" alt="Aari Realty">
        <p class="dis">Aari Realty LLC is a licensed Florida real estate brokerage. Nothing in this
          message is an offer of representation or a guarantee of value.</p>
        <div class="hr"></div>
        <div class="soc"><span>f</span><span>&#120;</span><span>&#9673;</span><span>&#9654;</span><span>in</span><span>&#9834;</span></div>
        <p class="fl">You are receiving this because we have worked together, or you asked to hear
          from me. You can unsubscribe at any time.</p>
        <p class="lk"><a href="#">Support</a> &middot; <a href="#">Privacy</a> &middot;
          <a href="#">Terms</a> &middot; <a href="#">Unsubscribe</a></p>
        <p class="cr">&copy; 2026 Aari Realty LLC &middot; Fort Myers, Florida &middot; (239) 201-8950</p>
      </div>`
  ];
  const out=[]; let n=0;
  bands.forEach((fn,i)=>{
    const g=RUN[i], next=(i+1<RUN.length)? RUN[i+1] : null;
    let style='background:'+g;
    if(next && next!==g){
      const sp=sepStyle(seps[n % seps.length], g, next); n++;
      /* the band grows by the shape's height so the copy never sits on it */
      style=sp.bg+';padding-bottom:'+(sp.pad+52)+'px';
    }
    out.push(fn(style));
  });
  return out.join('\n');
};

const slots=OPTS.map(o=>{
  const strip=RUN.map(n=>`<i style="background:${n}${n===C.white?';box-shadow:inset 0 0 0 1px #e7e2d7':''}"></i>`).join('');
  return `    <div class="slot" data-k="${o.k}">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span>
        <span class="run">${strip}</span></div>
      <div class="mail"><div class="mstage" id="g${o.k}"><div class="m">
${BODY(o.seps)}
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
