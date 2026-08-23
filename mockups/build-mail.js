// The letter, on joinaari.com's own system rather than the Hub's.
//
// Source of truth: the aari-landing-page skill's recruiting-page reference --
// pure black, Cormorant Garamond headlines, Montserrat body, outlined white
// buttons at 4px radius, the A watermark at 0.04, section eyebrows in muted
// grey. The site is black and white only; the three options below are three
// readings of "a different colour for each section" inside that rule.
//
// One body, three runs. The copy cannot drift between options.
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

const HEX={black:'#000000',near1:'#080808',near2:'#101010',near3:'#050505',white:'#ffffff'};

const OPTS=[
 {k:'A', name:'The rules',
  blurb:'The site’s own method. Pure black end to end; every section named by its eyebrow and closed by a hairline rule.',
  run:['black','black','black','black','black','black'],
  why:'it is not an interpretation of joinaari, it is joinaari. Same ground, same type, same buttons, same watermark, and the sections are told apart the way the site tells them apart &mdash; by naming them and ruling them off.',
  cost:'it is the least visually divided of the three, which is the one thing you asked for. If the division is what you want, this option is the site being faithful rather than the site answering your note.'},
 {k:'B', name:'The steps',
  blurb:'Black, but every band a slightly different black. The divisions are felt as tone without a single colour entering.',
  run:['black','near1','near2','near1','near3','black'],
  why:'every section really is its own shade, so the page divides itself the way you asked, and the brand rule of black and white is never broken. On a good screen the steps read as depth rather than as colour.',
  cost:'the steps are two to sixteen points apart. On a phone in daylight, or on any screen with a bit of glare, several of them will look identical &mdash; you will have paid for a division nobody sees.'},
 {k:'C', name:'The inversion',
  blurb:'Black and white alternating. The middle sections flip to black-on-white, the way the buttons already flip on hover.',
  run:['black','white','black','white','black','black'],
  why:'the divisions are unmissable and it invents nothing &mdash; inversion is already the site’s own move, it is what every button does on hover. It is also the safest of the three in an inbox, because half the letter is white.',
  cost:'four hard edges between black and white is a lot of contrast for something read on a phone at arm’s length, and the letter reads as louder than the site it came from.'}
];

const BANDS = (c)=>[
// 1 · hero
`      <div class="band hero ${c[0]}">
        <span class="wm">A</span>
        <img class="mark" src="__AARI_MARK__" alt="Aari Realty" style="height:26px">
        <div class="eyebrow" style="margin-top:24px">Southwest Florida &middot; Boutique Brokerage</div>
        <div class="h xl">Thinking about<br>your next move?</div>
        <p style="max-width:420px;margin:22px auto 0">You have wondered what it is worth. Let us
          find out properly, with the numbers from your street rather than a website&rsquo;s guess.</p>
        <div style="margin-top:30px"><a class="btn" href="https://wa.me/12392018950">Let&rsquo;s chat</a></div>
        <div class="micro">No obligation. No pressure to list.</div>
      </div>`,
// 2 · the reality
`      <div class="band ${c[1]}">
        <div class="eyebrow">The reality</div>
        <div class="h lg">Most people guess,<br>then act on the guess.</div>
        <ul class="pains" style="margin-top:26px">
          <li>The estimate on the big websites has never been inside your house.</li>
          <li>Your neighbour&rsquo;s asking price is not what your neighbour got.</li>
          <li>What you can buy next has moved further than what you can sell.</li>
        </ul>
      </div>`,
// 3 · what you get
`      <div class="band ${c[2]}">
        <div class="eyebrow">What you get</div>
        <div class="cards" style="margin-top:26px">
          <div class="c"><div class="ct">Your real number</div>
            <div class="cb">What your home would list for this month, from the comparables that actually closed.</div></div>
          <div class="c"><div class="ct">The whole cost</div>
            <div class="cb">What moving up, down or across would actually cost you. The whole figure, not the headline.</div></div>
          <div class="c"><div class="ct">An honest no</div>
            <div class="cb">If now is the wrong time, I will say so, and tell you when to look again.</div></div>
        </div>
        <div class="btnwrap" style="text-align:center;margin-top:34px">
          <a class="btn" href="https://wa.me/12392018950">Let&rsquo;s chat</a></div>
      </div>`,
// 4 · your broker
`      <div class="band ${c[3]}">
        <div class="eyebrow">Your broker</div>
        <div class="h lg">Marlenyi L. Paredes</div>
        <p style="margin-top:18px">Broker and owner of Aari Realty. I work Lee, Collier and Hendry,
          and I answer my own phone. If you would rather have the numbers before the conversation,
          say so and I will send them first.</p>
        <div class="creds">SRS &middot; PSA &middot; ABR &middot; C2EX &middot; BK3530153</div>
      </div>`,
// 5 · the ask
`      <div class="band ${c[4]}" style="text-align:center">
        <span class="wm">A</span>
        <div class="eyebrow">Let us look at your street</div>
        <div class="h lg">One message back<br>is all it takes.</div>
        <div style="margin-top:28px"><a class="btn" href="https://wa.me/12392018950">Let&rsquo;s chat</a></div>
        <div class="micro">Or simply reply to this email.</div>
      </div>`,
// 6 · footer
`      <div class="band foot ${c[5]}">
        <div class="rule" style="margin-bottom:26px"></div>
        <div class="wordmark">Aari Realty</div>
        <div class="fl" style="margin-top:14px">Marlenyi L. Paredes &middot; Broker, Aari Realty LLC &middot; BK3530153<br>
          (239) 201-8950 &middot; <a href="mailto:marlenyi@aarirealty.com">marlenyi@aarirealty.com</a></div>
        <div class="rule" style="margin:22px 0"></div>
        <div class="fl">You are receiving this because we have worked together, or you asked to hear from me.<br>
          <a href="#">Unsubscribe</a> &middot; <a href="#">Update your details</a><br>
          Aari Realty LLC, Fort Myers, Florida</div>
      </div>`
];

const slots = OPTS.map(o=>{
  const cls = o.run.map(n=>'on-'+n);
  const strip = o.run.map(n=>
    `<i style="background:${HEX[n]}${n==='white'?';box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)':''}"></i>`).join('');
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
if(!s.includes('__AARI_MARK__')) throw new Error('mark placeholder missing');
s=s.split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB','-',OPTS.length,'runs from one body');
