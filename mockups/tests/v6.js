const {chromium}=require('playwright-core');
const F='file:///tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/artifact/aari-hub-v6.html';
const OUT='/tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/';
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e));
  p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
  await p.goto(F); await p.waitForTimeout(2400);

  const photoOk=await p.$eval('.photo img',i=>i.complete&&i.naturalWidth>0).catch(()=>'no img');
  console.log('PHOTO loaded:',photoOk);
  console.log('ROLE SWITCH:',await p.$$eval('.roleswitch button',bs=>bs.map(x=>x.textContent+'='+x.getAttribute('aria-pressed')).join(' ')));

  for(const role of ['broker','agent']){
    if(role==='agent'){ await p.click('#ta'); await p.waitForTimeout(900); }
    const tabs=await p.$$eval('#nav a',as=>as.map(a=>a.textContent));
    console.log('\n== '+role.toUpperCase()+' tabs:',tabs.join(' | '));
    for(const t of tabs){
      await p.click('#nav a[data-t="'+t.replace(/"/g,'')+'"]');
      await p.waitForTimeout(700);
      const cards=await p.$$eval('#grid > *',cs=>cs.length);
      const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      const foot=await p.$eval('#foot',e=>e.textContent.slice(0,40));
      const on=await p.$$eval('#nav a.on',as=>as.map(a=>a.textContent).join(','));
      console.log('  '+t.padEnd(14)+' cards='+String(cards).padEnd(3)+' on='+on.padEnd(14)+' xoverflow='+overflow+'  foot="'+foot+'..."');
      await p.screenshot({path:OUT+'v6/'+role+'-'+t.replace(/\W+/g,'')+'.png',fullPage:true});
    }
  }
  console.log('\nERRORS:',errs.length?errs:'none');
  await b.close();
})();
