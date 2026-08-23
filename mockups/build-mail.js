// The letter mockups. One body, three runs of band colours -- the sections are
// identical in every option so the only thing being compared is the colour
// rhythm. Generating them from one template is the point: it is not possible
// for option B's copy to drift from option A's.
const fs=require('fs'), path=require('path');

function checkTags(html, file){
  const open = (html.match(/<div\b/g)||[]).length;
  const close = (html.match(/<\/div>/g)||[]).length;
  if(open !== close){
    throw new Error(file+': '+open+' <div> but '+close+' </div> -- '+
      (open>close ? (open-close)+' unclosed' : (close-open)+' extra')+
      '. A <div> closed with </p> is the usual cause.');
  }
}

// Aari's own colours. No yellow, no gold.
const HEX={paper:'#fcfcfa',warm:'#faf5eb',blush:'#FFF8F4',stone:'#e7e2d5',
           taupe:'#c9bfa8',deep:'#2a2a2a',panel:'#141210'};

const OPTS=[
 {k:'A', name:'The warm run',
  blurb:'Every band a different warm tone, lightest at the top, deepening as you read. One dark band at the end.',
  run:['paper','blush','warm','stone','taupe','panel'],
  why:'it is the gentlest way to do what you asked. Nothing shouts, but no two sections touch in the same colour, so the eye knows where one idea stops and the next begins. It is also the safest in an inbox &mdash; five light bands render identically everywhere.',
  cost:'the steps between the tones are small. On a dim phone screen in daylight, paper and blush are nearly the same, so part of the effect is lost exactly where most people read.'},
 {k:'B', name:'Alternating',
  blurb:'Dark, light, dark, light. The strongest rhythm of the three and the closest to the letter you first liked.',
  run:['panel','warm','panel','blush','panel','deep'],
  why:'you cannot miss the divisions. Each dark band frames the light one after it, and the section headings land on black where they carry furthest. It keeps the drama of the original without a drop of lime.',
  cost:'three dark bands is a lot of dark. Outlook and some Gmail dark-mode combinations invert parts of dark blocks, and heavy dark backgrounds are the single biggest thing that pushes a message into Promotions.'},
 {k:'C', name:'Deepening',
  blurb:'Starts on paper and gets darker every band, ending almost black. The letter closes rather than stops.',
  run:['paper','warm','stone','taupe','deep','panel'],
  why:'it has a direction. By the time you reach the ask you are on the darkest band on the page, so the closing card is the loudest thing without being a different design. It is the only one of the three that would still read correctly with the copy cut in half.',
  cost:'it commits to an order. Move a section, or add one, and the run has to be rebuilt &mdash; it is the least forgiving of the three when the letter changes.'}
];

// the bands, in order. Each is given a colour by the option's run.
const BANDS = (c)=>[
`      <div class="band hero ${c[0]}">
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty">
        <div class="eyebrow" style="margin-top:20px">Now open in Lee &amp; Collier</div>
        <div class="big" style="font-size:44px;margin-top:16px">Thinking about<br>your next move?</div>
        <div class="pad" style="padding-top:28px"><div class="shot">Photograph</div></div>
      </div>`,
`      <div class="band ${c[1]}">
        <div class="pad"><p class="body">Prices in Southwest Florida have moved again this quarter.
          If you have wondered what your home is worth today &mdash; or what your money buys now
          &mdash; I will pull the real numbers for your street and walk you through them. No
          pressure, no obligation.</p></div>
        <div class="btnwrap" style="padding-top:26px"><a class="btn" href="#">Ask me for your number</a></div>
      </div>`,
`      <div class="band ${c[2]}">
        <div class="pad"><div class="big" style="font-size:32px">What I will send you</div></div>
        <div class="pad" style="padding-top:26px"><div class="shot">Neighbourhood snapshot</div></div>
      </div>`,
`      <div class="band ${c[3]}">
        <div class="pad steps">
          <div class="stp"><span class="num">1</span><span class="tx">What your home would list for this month, from the comparables that actually closed.</span></div>
          <div class="stp"><span class="num">2</span><span class="tx">What is sitting unsold nearby, and how long it has been sitting.</span></div>
          <div class="stp"><span class="num">3</span><span class="tx">What it would cost you to move up, down or across &mdash; the whole number, not the headline.</span></div>
          <div class="stp"><span class="num">4</span><span class="tx">If now is wrong, I will tell you that too, and when to look again.</span></div>
        </div>
        <div class="btnwrap" style="padding-top:30px"><a class="btn" href="#">Book fifteen minutes</a></div>
      </div>`,
`      <div class="band ${c[4]}">
        <div class="big" style="font-size:34px">Let us look at<br>your street.</div>
        <div class="pad" style="padding-top:12px"><p class="body">One message back is all it takes.
          I will do the rest.</p></div>
        <div class="btnwrap" style="padding-top:24px"><a class="btn" href="#">Reply to this email</a></div>
      </div>`,
`      <div class="band footer ${c[5]}">
        <div class="fname">Aari Realty</div>
        <div class="foot">Marlenyi L. Paredes &middot; Broker, Aari Realty LLC &middot; BK3530153<br>
          (239) 201-8950 &middot; <a href="#">marlenyi@aarirealty.com</a></div>
        <div class="rule"></div>
        <div class="foot unsub">You are receiving this because we have worked together or you asked
          to hear from me.<br><a href="#">Unsubscribe</a> &middot; <a href="#">Update your details</a><br>
          Aari Realty LLC, Fort Myers, Florida</div>
      </div>`
];

const slots = OPTS.map(o=>{
  const cls = o.run.map(n=>'on-'+n);
  const strip = o.run.map(n=>`<i style="background:${HEX[n]}"></i>`).join('');
  return `    <div class="slot" data-k="${o.k}">
      <div class="slotcap"><span class="optn">Option ${o.k}</span><span class="t">${o.name}</span>
        <span class="w">${o.blurb}</span>
        <span class="run">${strip}</span></div>
      <div class="mail"><div class="mstage" id="g${o.k}"><div class="m">
${BANDS(cls).join('\n')}
      </div></div></div>
      <p class="slotwhy"><b>Why it works:</b> ${o.why}
        <span class="cost">Cost: ${o.cost}</span></p>
    </div>`;
}).join('\n\n');

const src=path.join(__dirname,'aari-email-template.src.html');
const dest=path.join(__dirname,'aari-email-template.html');
const mark='data:image/png;base64,'+
  fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8');
if(!s.includes('__SLOTS__')) throw new Error('slot placeholder missing');
s=s.replace('__SLOTS__',slots);
// the mark lives in the generated bands, so this is checked after they land
if(!s.includes('__AARI_MARK__')) throw new Error('mark placeholder missing');
s=s.split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB','-',OPTS.length,'runs from one body');
