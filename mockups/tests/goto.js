// Shared navigation helper for the five-tab layout.
// go(page, 'People', 'Database')  — main tab, then the named sub.
module.exports.go = async function(p, main, sub){
  const phone = await p.evaluate(()=>window.innerWidth <= 720);
  if(phone) await p.click(`#btabs [data-bt="${main}"]`);
  else      await p.click(`#nav a[data-t="${main}"]`);
  await p.waitForTimeout(700);
  if(sub){
    const i = await p.$$eval('#subs button', (els, s)=>els.findIndex(e=>e.textContent.trim()===s), sub);
    if(i < 0) throw new Error(`sub "${sub}" not found under ${main}: `+
      (await p.$$eval('#subs button',e=>e.map(x=>x.textContent))).join(', '));
    await p.click(`#subs [data-sub="${i}"]`);
    await p.waitForTimeout(800);
  }
};
module.exports.ask = async function(p){ await p.click('#askbtn'); await p.waitForTimeout(800); };
