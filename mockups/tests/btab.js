// The phone tab bar after the five-tab regroup: five slots, no More, and a
// sub-tab row that scrolls rather than wrapping.
const {chromium}=require('playwright-core');
const {go}=require('./goto');
const D='/tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

// ---- desktop: the top nav still carries the five -------------------------
const d=await b.newPage({viewport:{width:1440,height:1000}});
const de=[]; d.on('pageerror',e=>de.push(e.message));
await d.goto('file://'+D+'artifact/aari-hub-v6.html'); await d.waitForTimeout(2600);
console.log('DESKTOP');
console.log('  top nav visible:', await d.isVisible('#nav'));
console.log('  bottom bar visible:', await d.isVisible('#btabs'), '(want false)');
console.log('  tabs:', await d.$$eval('#nav a',e=>e.map(x=>x.textContent)));
console.log('  Ask is a top-bar button:', await d.isVisible('#askbtn'));
console.log('  errors:', de.length?de:'none');

// ---- phone ---------------------------------------------------------------
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+D+'artifact/aari-hub-v6.html'); await p.waitForTimeout(2600);
const top=async()=>Math.round(await p.$eval('#grid',e=>e.getBoundingClientRect().top));

console.log('\nPHONE 390x844');
console.log('  top nav hidden:', !(await p.isVisible('#nav')));
console.log('  bottom bar visible:', await p.isVisible('#btabs'));
console.log('  slots:', await p.$$eval('#btabs .bt',e=>e.map(x=>x.textContent.trim())));
console.log('  no More button:', (await p.$$('#bmore')).length===0);
console.log('  labels fit:', await p.$$eval('#btabs .bt',e=>e.every(x=>x.scrollWidth<=x.clientWidth+1)));
console.log('  sideways scroll:', await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1));
console.log('  content starts at:', await top()+'px');

// every main tab reachable in one tap, and its subs render
for(const m of ['Deals','People','Money','Reach','Today']){
  await p.click(`#btabs [data-bt="${m}"]`); await p.waitForTimeout(800);
  const subs=await p.$$eval('#subs button',e=>e.map(x=>x.textContent));
  const oneLine=await p.evaluate(()=>{const r=document.querySelector('.subrow');
    return !r || Math.round(r.getBoundingClientRect().height)<=36;});
  console.log(`  ${m.padEnd(6)} active=${await p.$eval('#btabs .bt.on',e=>e.textContent.trim())}`+
    ` subs=[${subs.join(', ')}] oneLine=${oneLine} top=${await top()}px`);
}

// the last sub of the widest tab is reachable by scrolling the row
await p.click('#btabs [data-bt="People"]'); await p.waitForTimeout(700);
await p.click('#subs [data-sub="4"]'); await p.waitForTimeout(800);
console.log('  reached the 5th sub:', await p.$eval('#subs .on',e=>e.textContent),
  '| greeting:', await p.$eval('#greet',e=>e.textContent));

// Ask from the top bar, on a phone
await p.click('#askbtn'); await p.waitForTimeout(800);
console.log('  Ask opens on phone:', await p.$eval('#greet',e=>e.textContent),
  '| sub row hidden:', await p.$eval('#subs',e=>e.hidden));
await p.click('#askbtn'); await p.waitForTimeout(700);

// the bar must not cover the last line of the page
await p.click('#ta'); await p.waitForTimeout(900);   // Database is agent-side
await go(p,'People','Database');
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(500);
console.log('  footer clears the bar:', await p.evaluate(()=>{
  const f=document.getElementById('foot'), t=document.getElementById('btabs');
  return Math.round(f.getBoundingClientRect().bottom) <= Math.round(t.getBoundingClientRect().top);}));

// a contact card is a native dialog — it must sit above the bar
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(300);
const first=await p.$('.dbrow .namecell');
if(first){ await first.click(); await p.waitForTimeout(700);
  console.log('  contact card opens over the bar:', await p.evaluate(()=>{
    const dlg=document.getElementById('contact');
    if(!dlg||!dlg.open) return 'card did not open';
    const r=dlg.getBoundingClientRect();
    return dlg.contains(document.elementFromPoint(r.left+r.width/2, r.top+40));}));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400); }

await p.screenshot({path:D+'shot-btab.png'});
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();})();
