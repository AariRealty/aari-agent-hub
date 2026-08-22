// A guard for the bug class that has now bitten twice: two pieces of text in
// the same card physically sitting on top of each other.
const {chromium}=require('playwright-core');
const D='/tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const W of [1440,1100,900,760,390]){
 const p=await b.newPage({viewport:{width:W,height:2400},isMobile:W<500,hasTouch:W<500});
 await p.goto('file://'+D+'artifact/aari-hub-v6.html'); await p.waitForTimeout(2400);
 for(const role of ['Broker','Agent']){
  await p.evaluate(r=>{[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===r).click()},role);
  await p.waitForTimeout(900);
  const bad=await p.evaluate(()=>{
   const out=[];
   // every leaf element that holds text, measured against its siblings
   const leaves=[...document.querySelectorAll('#grid *')].filter(e=>
     e.children.length===0 && e.textContent.trim() && !e.closest('.lyg,.szmenu') &&
     // the photo card is a deliberate overlay -- a name and two buttons sitting
     // on top of a full-bleed picture, plus a flip side parked behind the front
     !e.closest('[data-card="photo"]') &&
     // and skip anything inside a popover that is not currently on screen
     !(function(){ let n=e; while(n && n!==document.body){
         const cs=getComputedStyle(n);
         if(cs.opacity==='0'||cs.visibility==='hidden'||cs.display==='none') return true;
         n=n.parentElement; } return false; })());
   for(let i=0;i<leaves.length;i++){
     const a=leaves[i], ar=a.getBoundingClientRect();
     if(!ar.width||!ar.height) continue;
     for(let j=i+1;j<leaves.length;j++){
       const c=leaves[j], cr=c.getBoundingClientRect();
       if(!cr.width||!cr.height) continue;
       if(a.contains(c)||c.contains(a)) continue;
       const ox=Math.min(ar.right,cr.right)-Math.max(ar.left,cr.left);
       const oy=Math.min(ar.bottom,cr.bottom)-Math.max(ar.top,cr.top);
       if(ox>3&&oy>3) out.push((a.className||a.tagName)+' x '+(c.className||c.tagName)+
         ' in '+(a.closest('[data-card]')||{getAttribute:()=>'?'}).getAttribute('data-card'));
     }
   }
   return [...new Set(out)].slice(0,6);});
  console.log(String(W).padStart(4)+'px '+role.padEnd(7), bad.length?'TEXT OVERLAP '+bad.join(' | '):'no text overlaps');
 }
 await p.close();
}
await b.close();})();
