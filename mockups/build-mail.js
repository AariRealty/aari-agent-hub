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

// Copy written in Alex Cattoni's structure, sampled from the Copy Posse emails
// in Marlenyi's inbox and written up in docs/alex-cattoni-voice.md: one idea
// per line, ellipses between beats, negate-then-correct, a mid-letter
// admission, a first-name sign-off and a light P.S.
//
// The separations are fixed to the alternating set in all three so that what
// is being compared here is the writing, not the shapes.
const SEPS=['wave','diag','scallop','chev','dome'];

const OPTS=[
 {k:'A',name:'The story bridge',
  blurb:'Opens with something that happened on a street near them, and bridges from it to the offer. Her signature move.',
  why:'a story about a neighbour is the one thing nobody deletes. It earns the next line before it asks for anything, and the bridge to the offer is short enough that it never feels like a bait.',
  cost:'the story has to be true and it has to be recent, which means somebody writes a new one every month. It is the version that goes stale fastest.',
  copy:{
   eyebrow:'A note from your broker',
   h1:'Your neighbours already<br>know what your house<br>is worth.',
   sub:'They just told each other the wrong number…',
   cta1:'Tell me your street',
   intro:['A house on Bayshore sold in nine days last month.',
          'By the weekend, half the street had decided their own place was worth the same…',
          'It wasn&rsquo;t.',
          'Two streets over, the same floor plan sat for eleven weeks and came down twice.',
          'Same month. Same postcode. Two completely different conversations.'],
   cta2:'Get started',
   h2:'So here is what I will <i>actually</i> send you.',
   steps:['What your home would list for this month, from what closed, not from what was asked.',
          'What is sitting unsold near you, and how long it has been sitting there.',
          'What the move would really cost. The whole number, not the headline.',
          'And if now is wrong, I will say so. That one is free too.'],
   cta3:'Book fifteen minutes',
   h3:'Not a call centre. <i>Marlenyi.</i>',
   bio:['Broker and owner of Aari Realty. I work Lee, Collier and Hendry.',
        'I answer my own phone, which my family has opinions about…',
        'And I will tell you when the answer is no.'],
   cta4:'Learn more',
   ask:'Just tell me<br><i>your street.</i>',
   askp:'That is the whole ask. I will do the rest.',
   cta5:'Let&rsquo;s chat',
   ps:'P.S. If you are only curious and not going anywhere, that is completely fine. Curiosity costs nothing here.'}},

 {k:'B',name:'The negation',
  blurb:'Knocks down the thing every agent says, then corrects it. Her &ldquo;Nope.&rdquo; rhythm, straight through.',
  why:'every other letter in their inbox opens by telling them it is a great time to sell. Opening by refusing to say that is the fastest way to sound like a person rather than a campaign.',
  cost:'it is the least warm of the three. Opening on a negative works on people who are sceptical and can read as blunt to people who are not.',
  copy:{
   eyebrow:'A note from your broker',
   h1:'It is not a great<br>time to sell.',
   sub:'It is not a bad one either…',
   cta1:'Get the real number',
   intro:['Every letter you have had from an agent this year opened by telling you it was a great time to sell.',
          'Nope.',
          'It is not a great time. It is not a terrible time.',
          'It is a <b>specific</b> time, and what it means depends entirely on your street, your floor plan and what you would be moving into…',
          'Which is a much less catchy sentence. It is also the true one.'],
   cta2:'Get started',
   h2:'What a real answer <i>looks like.</i>',
   steps:['Your number this month, from the comparables that actually closed.',
          'What is unsold near you, and how long it has been waiting.',
          'The full cost of moving, including the parts nobody quotes.',
          'A straight no, if that is the honest answer this quarter.'],
   cta3:'Book fifteen minutes',
   h3:'Not a call centre. <i>Marlenyi.</i>',
   bio:['Broker and owner of Aari Realty, working Lee, Collier and Hendry.',
        'I am not the loudest broker in this market. I have made peace with that…',
        'I am the one who picks up.'],
   cta4:'Learn more',
   ask:'One message back.<br><i>That is it.</i>',
   askp:'No form. No funnel. No &ldquo;strategy session&rdquo;.',
   cta5:'Let&rsquo;s chat',
   ps:'P.S. If the answer turns out to be &ldquo;wait&rdquo;, I will tell you that and go away quietly.'}},

 {k:'C',name:'The confession',
  blurb:'Opens with something Marlenyi got wrong, and earns the rest of the letter with it. Her mid-piece admission, moved to the front.',
  why:'nobody expects a broker to lead with a mistake. It buys more trust in two lines than a page of credentials, and it makes the honest-no promise later in the letter believable rather than decorative.',
  cost:'it puts a mistake in writing under your licence number. It is the version to be surest about before it goes to ninety-two people.',
  copy:{
   eyebrow:'A note from your broker',
   h1:'I priced one wrong<br>in June.',
   sub:'Here is what it taught me about yours…',
   cta1:'Get your number',
   intro:['I told a seller in June that their asking price was right.',
          'It was not.',
          'I had leaned on what the street was asking instead of what the street had actually been paid…',
          'Twenty-two days and one price drop later, I had learned my lesson properly.',
          'So now I only quote what closed. It is a shorter list. It is the true one.'],
   cta2:'Get started',
   h2:'What I send you <i>now.</i>',
   steps:['Your number this month, built only from what actually closed.',
          'What is sitting unsold near you, and for how long.',
          'What moving would really cost: the whole figure.',
          'And an honest no, when no is the answer. I have learned to say it early.'],
   cta3:'Book fifteen minutes',
   h3:'Not a call centre. <i>Marlenyi.</i>',
   bio:['Broker and owner of Aari Realty. Lee, Collier and Hendry.',
        'I answer my own phone and I keep my own mistakes…',
        'Both of those are on purpose.'],
   cta4:'Learn more',
   ask:'Send me<br><i>your address.</i>',
   askp:'I will send back what it is really worth this month.',
   cta5:'Let&rsquo;s chat',
   ps:'P.S. The June seller closed in September, eleven thousand over the second asking price. We got there.'}}
];

// The structure of the template you sent, on Aari's ground, with the copy in
// Alex's shape: one idea per line, ellipses between beats, a P.S. at the end.
const RUN=[C.black,C.white,C.cream,C.white,C.cream,C.white];

const BODY=(cp)=>{
  const lines=a=>a.map(t=>`<p>${t}</p>`).join('\n          ');
  const bands=[
 g=>`      <div class="band hero" style="${g}">
        <span class="sp s1"></span><span class="sp s2"></span><span class="sp s4"></span>
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty">
        <div class="eyebrow">${cp.eyebrow}</div>
        <div class="h xl">${cp.h1}</div>
        <p class="sub">${cp.sub}</p>
        <a class="pill light" href="https://wa.me/12392018950">${cp.cta1} <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="talk">
          ${lines(cp.intro)}
        </div>
        <a class="pill" href="https://wa.me/12392018950">${cp.cta2} <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="eyebrow">What you get</div>
        <div class="h lg">${cp.h2}</div>
        <div class="media">Neighbourhood snapshot</div>
        <div class="steps">
          ${cp.steps.map((t,n)=>`<div class="stp"><span class="num">${n+1}</span><span class="tx">${t}</span></div>`).join('\n          ')}
        </div>
        <a class="pill" href="https://wa.me/12392018950">${cp.cta3} <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="eyebrow">Who you are dealing with</div>
        <div class="h lg">${cp.h3}</div>
        <div class="media">Marlenyi at a listing</div>
        <div class="talk">
          ${lines(cp.bio)}
        </div>
        <div class="creds">SRS &middot; PSA &middot; ABR &middot; C2EX &middot; BK3530153</div>
        <a class="pill" href="https://wa.me/12392018950">${cp.cta4} <span>&rarr;</span></a>
      </div>`,
 g=>`      <div class="band" style="${g}">
        <div class="accent">
          <div class="h md">${cp.ask}</div>
          <p>${cp.askp}</p>
          <a class="pill light" href="https://wa.me/12392018950">${cp.cta5} <span>&rarr;</span></a>
        </div>
      </div>`,
 g=>`      <div class="band foot" style="${g}">
        <p class="sign">Marlenyi</p>
        <p class="ps">${cp.ps}</p>
        <div class="hr"></div>
        <img class="mark sm" src="__AARI_MARK__" alt="Aari Realty">
        <p class="dis">Aari Realty LLC is a licensed Florida real estate brokerage. Nothing in this
          message is an offer of representation or a guarantee of value.</p>
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
      const sp=sepStyle(SEPS[n % SEPS.length], g, next); n++;
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
${BODY(o.copy)}
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
