const {chromium}=require('playwright-core');
const HUB='file:///home/user/aari-agent-hub/hub_payload.html';
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for(const role of ['agent','broker']){
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*', r => {
    const u=r.request().url();
    if(u.startsWith('file://')) return r.continue();
    if(u.includes('realty-tx-review')){
      const body=JSON.parse(r.request().postData()||'{}');
      if(body.action==='list'){
        const all=global.ROWS;
        return r.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({ok:true,broker:role==='broker',
            transactions: role==='broker'?all:all.filter(x=>x.agent_id==='a2')})});
      }
      global.CALLS.push(body);
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
    }
    return r.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  global.CALLS=[];
  global.ROWS=[
   {id:'t1',agent_id:'a1',agent_name:'Alied Machuca',property_address:'1219 Hibiscus Avenue, Lehigh Acres',
    side:'seller',price:349000,closing_date:'2026-09-01',status:'submitted',tx_type:'residential_sale',
    gross_commission:10470,company_fee:null,review_state:'pending',import_source:'skyslope',import_batch:'2026-08-18',edits:[]},
   {id:'t2',agent_id:'a2',agent_name:'Marlenyi L. Paredes',property_address:'816 Frederick Reid St E, Lehigh Acres',
    client_name:'Mileydi Perez',side:'buyer',price:319999,closing_date:'2026-08-14',status:'draft',
    tx_type:'residential_sale',gross_commission:null,company_fee:null,review_state:'pending',
    import_source:'hub',import_batch:'2026-08-18',edits:[]},
   {id:'t3',agent_id:'a2',agent_name:'Marlenyi L. Paredes',property_address:'3000 12th St W, Lehigh Acres',
    side:'buyer',price:30000,closing_date:'2026-09-07',status:'submitted',tx_type:'land_sale',
    gross_commission:900,company_fee:299,review_state:'edited',import_source:'skyslope',import_batch:'2026-08-18',
    review_note:'Commission should be 3% of the sale price.',
    edits:[{id:'e1',field:'gross_commission',old_value:'900',new_value:'1200',state:'proposed'}]}];
  await p.addInitScript(function(){
    function mkq(){ var q={}; ['select','eq','in','not','order','limit','gte','lte','neq'].forEach(function(k){ q[k]=function(){return q}; });
      q.maybeSingle=function(){return Promise.resolve({data:null})};
      q.single=function(){return Promise.resolve({data:null})};
      q.then=function(res){ return Promise.resolve({data:[],error:null}).then(res) };
      return q; }
    var client={ auth:{ getSession:function(){return Promise.resolve({data:{session:{access_token:'stub'}}})},
                        getUser:function(){return Promise.resolve({data:{user:{id:'a2'}}})},
                        onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}} },
                 from:function(){ return mkq(); } };
    window.supabase={ createClient:function(){ return client; } };
    window.sb=client;
  });
  await p.goto(HUB); await p.waitForTimeout(1800);
  // the page needs a session; drive the band directly
  await p.evaluate(()=>{ if(!window.sb) window.sb={auth:{getSession:async()=>({data:{session:{access_token:'x'}}})}};
    document.getElementById('panel-tx-list').classList.add('active');
    var r=document.getElementById('txr-refresh'); if(r) r.click(); });
  await p.waitForTimeout(900);
  const shown=await p.evaluate(()=>{
    const band=document.getElementById('txr-band');
    return {hidden:band.hidden, title:document.getElementById('txr-title').textContent,
      sub:document.getElementById('txr-sub').textContent,
      cards:[...document.querySelectorAll('.txr-card')].map(c=>({
        addr:c.querySelector('.txr-a').textContent,
        btns:[...c.querySelectorAll('.txr-btn')].map(b=>b.textContent),
        flags:[...c.querySelectorAll('.txr-flag')].map(f=>f.textContent),
        diff:c.querySelector('.txr-diff')?c.querySelector('.txr-diff').innerText.replace(/\n/g,' '):''}))};
  });
  console.log('==== '+role.toUpperCase());
  console.log(' band hidden:', shown.hidden, '|', shown.title, '|', shown.sub);
  shown.cards.forEach(c=>console.log('  •',c.addr,'\n     btns:',c.btns,'\n     flags:',c.flags,'\n     diff:',c.diff||'—'));
  // drive the buttons and capture what goes to the edge function
  if(role==='agent'){
    await p.evaluate(()=>{window.confirm=()=>true;window.alert=()=>{};});
    await p.click('.txr-card [data-txr="accept"]'); await p.waitForTimeout(500);
    await p.click('.txr-card [data-txr="fix"]').catch(()=>{}); await p.waitForTimeout(400);
    const open=await p.evaluate(()=>document.getElementById('txr-modal').classList.contains('show'));
    if(open){
      await p.fill('#txr-f-gross','1200'); await p.fill('#txr-f-fee','499');
      await p.fill('#txr-f-note','Commission was blank.');
      await p.click('#txr-m-send'); await p.waitForTimeout(600);
    }
    console.log(' modal opened:', open);
  } else {
    await p.evaluate(()=>{window.confirm=()=>true;window.alert=()=>{};});
    await p.click('.txr-card [data-txr="approve"]'); await p.waitForTimeout(500);
  }
  console.log(' posted to edge fn:', JSON.stringify(global.CALLS,null,0));
  console.log(' page errors:', errs.length?errs.slice(0,3):'none');
  await p.close();
}
await b.close();})();
