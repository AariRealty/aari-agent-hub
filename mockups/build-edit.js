// The Monthly Edit, rebuilt in Aari's brand.
//
// Section structure and the prompt method come from the Canva template
// Marlenyi sent (43pp, "Copy of February Monthly Edit"), read from the PDF and
// from her screenshots of the Notes panels on pages 4, 5 and 6. The design is
// Aari's own -- joinaari's palette, Cormorant Garamond and Montserrat, pill
// CTAs, waved section joins -- not the template's.
//
// Every prompt below carries what her template's prompts carry: the research
// instruction, a "think:" steer, a literal output format, a character limit,
// and where to verify it. The SOURCE line on each section says whether the
// Hub can fill it, whether it needs the MLS, or whether it needs research.
const fs=require('fs'), path=require('path');
function checkTags(h,f){const o=(h.match(/<div\b/g)||[]).length,c=(h.match(/<\/div>/g)||[]).length;
  if(o!==c) throw new Error(f+': '+o+' <div> vs '+c+' </div>');}
function noNestedQuote(h,f){ if(/style="[^"]*url\("/.test(h)) throw new Error(f+': nested quote in a style attribute'); }

const C={white:'#ffffff',card:'#f5f4f1',cream:'#f5f0e8',black:'#0a0a0a',deep:'#141210'};
const SHAPES={
  wave:{h:30,d:'M0,34 C110,34 168,4 330,9 C470,13 548,31 640,18 L640,34 Z'},
  dome:{h:36,d:'M0,40 C150,0 490,0 640,40 Z'},
  diag:{h:34,d:'M0,38 L640,1 L640,38 Z'},
  chev:{h:30,d:'M0,34 L320,1 L640,34 Z'},
  scallop:{h:26,d:'M0,30 C40,6 80,6 120,28 C160,6 200,6 240,28 C280,6 320,6 360,28 '+
                  'C400,6 440,6 480,28 C520,6 560,6 600,28 C618,17 630,13 640,14 L640,30 Z'}
};
function sepStyle(n,above,below){
  const sh=SHAPES[n];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${sh.h}" preserveAspectRatio="none">`+
    `<path d="${sh.d}" fill="${below}"/></svg>`;
  const uri="data:image/svg+xml;utf8,"+encodeURIComponent(svg).replace(/'/g,'%27').replace(/"/g,'%22');
  return {bg:`background:${above} url('${uri}') bottom center / 100% ${sh.h}px no-repeat`,pad:sh.h};
}

// ---- the six sections, with the prompt that fills each ----
const SECTIONS=[
 {id:'cover',ttl:'The Monthly Edit',src:'hub',
  note:'Your name, your city and the month. The Hub has all three.'},
 {id:'editor',ttl:'From the editor',src:'you',
  note:'Six lines in your own voice, plus three captions for last month&rsquo;s photographs.',
  prompt:{n:'Prompt 1',ask:'Write my opening note for [MONTH] in Fort Myers. Warm, plain, no sales pitch. '+
    'Mention one thing the brokerage actually did last month.',
    fmt:'Four to six short lines. 480 characters or less.',
    ex:'Happy February. If you are new here, this is where I put what is happening around town&hellip;'}},
 {id:'market',ttl:'Lee County market snapshot',src:'mls',
  note:'Four figures, each against last month, plus your read and the two invitations.',
  prompt:{n:'Not a prompt',ask:'These four numbers come from the MLS, not from a model and not from the Hub. '+
    'The Hub holds Aari&rsquo;s own listings and closings &mdash; it does not hold Lee County market statistics.',
    fmt:'Sold listings &middot; Active listings &middot; Average sold price &middot; Average days on market',
    ex:'Paste them from your MLS export. The source line prints underneath whatever you enter.'}},
 {id:'new',ttl:'New &amp; coming soon',src:'research',
  note:'Four or five openings, relocations or local real estate news.',
  prompt:{n:'Prompt 2',ask:'Research 5 new businesses, restaurants, retailers or real estate news in Fort Myers.',
    fmt:'Name &ndash; what is happening. <b>70 characters or less</b> each.',
    ex:'Alessi Bakery &ndash; relocating to Cypress Street'}},
 {id:'events',ttl:'Events this month',src:'research',
  note:'Ten or more, with a few that work for families.',
  prompt:{n:'Prompt 3',ask:'Pull at least 10 events and concerts in or near Fort Myers for [MONTH]. '+
    'Include a few kid-friendly ones.',
    fmt:'Event name, then <b>date | location</b> underneath.',
    ex:'Art Walk &mdash; Feb 14 | Downtown River District',
    verify:'Verify every one. Check Facebook Events, Eventbrite, local tourism accounts, '+
      'local news, and search &ldquo;events in Fort Myers&rdquo;.'}},
 {id:'deals',ttl:'Local deals',src:'research',
  note:'Five, plus your sign-off.',
  prompt:{n:'Prompt 4',ask:'Research local discounts or deals running in Fort Myers this month. '+
    'Think free museum days, happy hours, discounted admissions, specials at local businesses.',
    fmt:'Deal or discount | one sentence. <b>150 characters or less</b>.',
    ex:'Edison &amp; Ford Estates | Free admission for Lee County residents on the first Sunday'}}
];

const SRC={hub:{k:'The Hub fills this',c:'ok'},
           mls:{k:'From your MLS',c:'warn'},
           you:{k:'You write this',c:'you'},
           research:{k:'Needs research &amp; checking',c:'res'}};

const OPTS=[
 {k:'A',name:'The magazine',
  blurb:'All six sections end to end, full-bleed, waved joins. The template&rsquo;s own shape, in your brand.',
  why:'it reads like something worth keeping. Each section gets its own ground and its own moment, and the waves make the length feel intentional rather than long.',
  cost:'it is six screens on a phone. A monthly that nobody scrolls to the end of is four sections of wasted research.'},
 {k:'B',name:'The index',
  blurb:'A contents list up top that jumps straight to a section. The rest is the same six, as cards.',
  why:'nobody reads a newsletter in order. An index lets the person who only wants the events get to the events, and it tells them in three seconds whether this issue is worth their time.',
  cost:'an index is a second thing to maintain every month, and it puts a list of headings where the warmest part of the letter should be.'},
 {k:'C',name:'The digest',
  blurb:'One screen. The market number, three events, three deals, one gem, and a link to the full edit.',
  why:'it is the version that actually gets read on a phone between showings. Everything else lives behind one link, so the research is not wasted &mdash; it is just not all in the inbox.',
  cost:'it needs somewhere to link to, which means the full edit has to be hosted, not just emailed. That is a build, not a template.'}
];
module.exports={C,SECTIONS,SRC,OPTS,sepStyle,checkTags,noNestedQuote};
