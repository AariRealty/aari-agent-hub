// Proves a mobile-only change left the desktop exactly where it was.
//
//   node mockups/test-desktop-untouched.js <baseline-commit>
//
// Builds the tracked source at <baseline-commit> and at the working tree, then
// renders both at every desktop width, in both roles, and diffs card position,
// size, span, visibility and every word of text. Zero differences is the pass.
// The break is max-width:720px, so 721px is the narrowest width checked.

const {execSync}=require('child_process');
const fs=require('fs'), os=require('os'), path=require('path');
// playwright-core is not a dependency of this repo -- it lives wherever the
// session installed it. PLAYWRIGHT_CORE points at it if the usual places miss.
const chromium=(()=>{
  const tries=[process.env.PLAYWRIGHT_CORE,'playwright-core','playwright'].filter(Boolean);
  for(const t of tries){ try{ return require(t).chromium; }catch(e){} }
  console.error('playwright-core not found. Install it, or set PLAYWRIGHT_CORE to its path.');
  process.exit(2);
})();

const REPO=path.resolve(__dirname,'..');
const SRC='mockups/dashboard-v6.src.html';
const EXE=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WIDTHS=[1440,1280,1100,900,760,721];

const base=process.argv[2];
if(!base){ console.error('usage: node mockups/test-desktop-untouched.js <baseline-commit>'); process.exit(2); }

const work=fs.mkdtempSync(path.join(os.tmpdir(),'aari-untouched-'));
// Same inlining mockups/build.js does — the artifact host blocks every
// external origin, so both builds have to carry their images.
const PHOTO='data:image/png;base64,'+fs.readFileSync(path.join(REPO,'assets/headshots/marlenyi.png')).toString('base64');
const LOGO ='data:image/png;base64,'+fs.readFileSync(path.join(REPO,'logo.png')).toString('base64');
function build(html,out){
  fs.writeFileSync(out, html.split('__MP_PHOTO__').join(PHOTO).split('__AARI_LOGO__').join(LOGO));
  return out;
}
const before=build(execSync(`git show ${base}:${SRC}`,{cwd:REPO,maxBuffer:1<<28}).toString(),
                   path.join(work,'before.html'));
const after =build(fs.readFileSync(path.join(REPO,SRC),'utf8'),
                   path.join(work,'after.html'));

async function snap(page,role){
  await page.evaluate(r=>document.getElementById(r==='agent'?'ta':'tb').click(),role);
  await page.waitForTimeout(1800);           // the entrance animation has to settle
  return page.evaluate(()=>({
    docW:document.documentElement.scrollWidth,
    docH:document.documentElement.scrollHeight,
    sideways:document.documentElement.scrollWidth>document.documentElement.clientWidth,
    bodyText:(document.body.innerText||'').replace(/\s+/g,' ').trim(),
    cards:[...document.querySelectorAll('#grid>[data-card]')].map(c=>{
      const r=c.getBoundingClientRect(), cs=getComputedStyle(c);
      return {id:c.getAttribute('data-card'), hidden:c.hidden,
        x:Math.round(r.x), y:Math.round(r.y+window.scrollY),
        w:Math.round(r.width), h:Math.round(r.height),
        col:cs.gridColumn, disp:cs.display, self:cs.alignSelf,
        text:(c.innerText||'').replace(/\s+/g,' ').trim()};
    })
  }));
}

function diff(a,b,label){
  const notes=[];
  if(a.docW!==b.docW) notes.push(`page width ${a.docW} -> ${b.docW}`);
  if(a.sideways!==b.sideways) notes.push(`sideways scroll ${a.sideways} -> ${b.sideways}`);
  if(Math.abs(a.docH-b.docH)>2) notes.push(`page height ${a.docH} -> ${b.docH}`);
  const ia=new Map(a.cards.map(c=>[c.id,c])), ib=new Map(b.cards.map(c=>[c.id,c]));
  for(const id of new Set([...ia.keys(),...ib.keys()])){
    const x=ia.get(id), y=ib.get(id);
    if(!x){ notes.push(`card ADDED ${id}`); continue; }
    if(!y){ notes.push(`card REMOVED ${id}`); continue; }
    for(const k of ['x','y','w','h']) if(Math.abs(x[k]-y[k])>2) notes.push(`${id}.${k} ${x[k]} -> ${y[k]}`);
    for(const k of ['hidden','col','disp','self']) if(x[k]!==y[k]) notes.push(`${id}.${k} ${x[k]} -> ${y[k]}`);
    if(x.text!==y.text) notes.push(`${id} text changed`);
  }
  if(a.bodyText!==b.bodyText){
    const aw=a.bodyText.split(' '), bw=b.bodyText.split(' ');
    let i=0; while(i<aw.length&&i<bw.length&&aw[i]===bw[i]) i++;
    notes.push(`words differ from ${i}: "${aw.slice(i,i+10).join(' ')}" -> "${bw.slice(i,i+10).join(' ')}"`);
  }
  console.log(`${String(label).padEnd(18)} ${notes.length?notes.length+' DIFFERENCE(S)':'identical'}`);
  notes.forEach(n=>console.log('   ! '+n));
  return notes.length;
}

(async()=>{
  const browser=await chromium.launch({executablePath:EXE});
  let bad=0, errs=[];
  console.log(`baseline ${base}  vs  working tree\n`);
  for(const W of WIDTHS){
    const pa=await browser.newPage({viewport:{width:W,height:1400}});
    const pb=await browser.newPage({viewport:{width:W,height:1400}});
    pb.on('pageerror',e=>errs.push(`${W}px ${e}`));
    await pa.goto('file://'+before); await pb.goto('file://'+after);
    await pa.waitForTimeout(2200); await pb.waitForTimeout(2200);
    for(const role of ['broker','agent']) bad+=diff(await snap(pa,role),await snap(pb,role),`${W}px ${role}`);
    await pa.close(); await pb.close();
  }
  await browser.close();
  fs.rmSync(work,{recursive:true,force:true});
  if(errs.length) console.log('\njs errors:',errs);
  console.log(`\ndesktop differences: ${bad}`);
  process.exit(bad||errs.length?1:0);
})();
