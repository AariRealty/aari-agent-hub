const {chromium}=require('playwright-core');
const D='/tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[];
// ---- desktop: walk every main tab and every sub -------------------------
const d=await b.newPage({viewport:{width:1440,height:1100}});
d.on('pageerror',e=>errs.push('desktop: '+e.message));
await d.goto('file://'+D+'artifact/aari-hub-v6.html'); await d.waitForTimeout(2600);
for(const role of ['tb','ta']){
  await d.click('#'+role); await d.waitForTimeout(700);
  console.log('\n== '+(role==='tb'?'BROKER':'AGENT')+' ==');
  const mains=await d.$$eval('#nav a',e=>e.map(x=>x.textContent));
  console.log('  mains:', mains.join(' · '));
  for(const m of mains){
    await d.click(`#nav a[data-t="${m}"]`); await d.waitForTimeout(600);
    const subs=await d.$$eval('#subs button',e=>e.map(x=>x.textContent));
    let line='  '+m.padEnd(7)+' → '+(subs.length?subs.join(' · '):'(single page)');
    const seen=[];
    for(let i=0;i<Math.max(subs.length,1);i++){
      if(subs.length){ await d.click(`#subs [data-sub="${i}"]`); await d.waitForTimeout(650); }
      seen.push(await d.$$eval('#grid > *',e=>e.length));
    }
    console.log(line+'   cards: '+seen.join(','));
  }
}
// memory: leave a sub, come back, it should still be there
await d.click('#tb'); await d.waitForTimeout(600);
await d.click('#nav a[data-t="Deals"]'); await d.waitForTimeout(500);
await d.click('#subs [data-sub="3"]'); await d.waitForTimeout(600);
const before=await d.$eval('#subs .on',e=>e.textContent);
await d.click('#nav a[data-t="Money"]'); await d.waitForTimeout(500);
await d.click('#nav a[data-t="Deals"]'); await d.waitForTimeout(600);
console.log('\n  remembers the sub you were on:', before, '->', await d.$eval('#subs .on',e=>e.textContent));
// Ask
await d.click('#askbtn'); await d.waitForTimeout(700);
console.log('  Ask opens:', await d.$eval('#greet',e=>e.textContent),
  '| sub row hidden:', await d.$eval('#subs',e=>e.hidden),
  '| lit:', await d.$eval('#askbtn',e=>e.classList.contains('on')));
await d.click('#askbtn'); await d.waitForTimeout(600);
console.log('  Ask closes back to:', await d.$eval('#greet',e=>e.textContent));

// ---- phone --------------------------------------------------------------
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>errs.push('phone: '+e.message));
await p.goto('file://'+D+'artifact/aari-hub-v6.html'); await p.waitForTimeout(2600);
console.log('\n== PHONE ==');
console.log('  bar:', await p.$$eval('#btabs .bt',e=>e.map(x=>x.textContent.trim())));
console.log('  no More button:', await p.$$eval('#bmore',e=>e.length)===0);
console.log('  content starts at:', Math.round(await p.$eval('#grid',e=>e.getBoundingClientRect().top))+'px');
console.log('  sideways scroll:', await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1));
await p.click('[data-bt="People"]'); await p.waitForTimeout(900);
console.log('  People subs:', await p.$$eval('#subs button',e=>e.map(x=>x.textContent)));
console.log('  sub row fits:', await p.evaluate(()=>{const r=document.querySelector('.subrow');return r.scrollWidth<=r.clientWidth+1;}), '(false = scrolls, which is fine)');
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();})();
