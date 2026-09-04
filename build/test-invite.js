// The broker roster gained a per-agent Invite button, and lost a hardcoded
// Pending Invites panel that listed four gmail addresses typed in by hand.
// None of those addresses was the address the account signs in with, and one
// of the names was not on the roster at all, so pressing a button there would
// have created a second account for someone who already had one.
//
// What matters about the replacement: it only offers to invite someone who has
// never signed in, it addresses them by user id rather than by an email in the
// markup, and a name with an apostrophe in it must not break out of the
// onclick attribute. O'Brien is in the fixture for exactly that reason.
const {chromium}=require('playwright'); const path=require('path'); const fs=require('fs');
const ROOT=path.join(__dirname,'..');

const MODULE=fs.readFileSync(path.join(ROOT,'broker_module.html'),'utf8');

const MEMBERS=[
 {user_id:'u-broker',full_name:'Marlenyi L. Paredes',email:'marlenyi@aarirealty.com',role:'broker',status:'active',last_login_at:'2026-08-25T13:27:55Z',checklist_done:0},
 {user_id:'u-never', full_name:"Roosevelt O'Brien",  email:'roosevelt.sanchez@aarirealty.com',role:'agent',status:'active',last_login_at:null,checklist_done:0},
 {user_id:'u-been',  full_name:'Eileen Hernandez',   email:'eileenrefl@gmail.com',role:'agent',status:'active',last_login_at:'2026-08-11T17:50:07Z',checklist_done:2},
 {user_id:'u-susp',  full_name:'Ana Puentes',        email:'ana.puentes@aarirealty.com',role:'agent',status:'suspended',last_login_at:null,checklist_done:0},
 {user_id:'u-noml',  full_name:'No Email At All',    email:null,role:'agent',status:'active',last_login_at:null,checklist_done:0}
];

(async()=>{
 // The row markup is a pure function of one member row. The module needs a
 // whole broker shell around it before loadRoster will run, so this lifts the
 // actions block straight out of the shipped file and evaluates it per member.
 // Testing the file rather than a copy of it is the point: a change to the
 // escaping here is a change this test sees.
 const from = MODULE.indexOf("      var actions='';");
 const to   = MODULE.indexOf("      var planCell=");
 if(from < 0 || to < 0 || to <= from){
   console.log('FAIL  could not find the roster actions block in broker_module.html');
   process.exit(1);
 }
 const ACTIONS = MODULE.slice(from, to);

 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 const built = await p.evaluate(({src, members})=>{
   function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
     return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
   const out={};
   const fn = new Function('m','esc', src + '\nreturn actions;');
   members.forEach(function(m){ out[m.user_id] = fn(m, esc); });
   return out;
 }, {src: ACTIONS, members: MEMBERS});

 // Rendered into a real document, so an onclick that broke out of its quotes
 // shows up as a wrong attribute value rather than as text that merely looks
 // fine in a string comparison.
 const parsed = await p.evaluate((built)=>{
   const out={};
   Object.keys(built).forEach(function(k){
     const d=document.createElement('div'); d.innerHTML=built[k];
     const btns=[].slice.call(d.querySelectorAll('button'));
     const inv=btns.filter(function(x){return x.textContent.trim()==='Invite';})[0];
     out[k]={ labels: btns.map(function(x){return x.textContent.trim();}),
              invite: inv ? inv.getAttribute('onclick') : null };
   });
   return out;
 }, built);

 const offered = Object.keys(parsed).filter(k=>parsed[k].invite !== null);
 const checks=[];
 checks.push(['exactly one roster row offers an invite', offered.length===1]);
 checks.push(['it is the agent who has never signed in', offered[0]==='u-never']);
 checks.push(['an agent who has signed in is not offered one', parsed['u-been'].invite===null]);
 checks.push(['a suspended agent is not offered one', parsed['u-susp'].invite===null]);
 checks.push(['an agent with no email is not offered one', parsed['u-noml'].invite===null]);
 checks.push(['the broker is not offered one, and gets no row actions at all',
   parsed['u-broker'].invite===null && parsed['u-broker'].labels.length===0]);
 // The invite is addressed by user id. An email in the markup is only what the
 // confirm box shows, so a wrong one cannot send an invite to a stranger.
 const oc = parsed['u-never'].invite || '';
 checks.push(['the invite is addressed by user id', /bcpInvite\('u-never'/.test(oc)]);
 checks.push(['an apostrophe in a name does not break out of the onclick',
   /O&#39;Brien|O'Brien/.test(oc) && oc.indexOf('Invite</button>')<0]);
 checks.push(['the agent who has signed in still gets Reset PW',
   parsed['u-been'].labels.indexOf('Reset\u00a0PW')>=0 || parsed['u-been'].labels.some(l=>/Reset/.test(l))]);
 checks.push(['nothing in the module still names a hand typed gmail address',
   !/machuca\.alied@gmail\.com|flaviamaguilera@gmail\.com|odalis\.mora1977@gmail\.com|rooseveltsanchezrealestate@gmail\.com/.test(MODULE)]);
 checks.push(['the Pending Invites panel is gone', !/Pending Invites/.test(MODULE.replace(/\/\/[^\n]*/g,''))]);
 checks.push(['the invite calls realty-agent-invite by user id, never by email',
   /apiCall\('realty-agent-invite',\{user_id:uid\}\)/.test(MODULE)]);
 checks.push(['no page errors', errs.length===0]);

 let bad=0;
 for(const [n,ok] of checks){ console.log((ok?'ok   ':'FAIL ')+n); if(!ok) bad++; }
 if(errs.length) console.log('   '+errs.slice(0,3).join(' | '));
 await b.close();
 console.log(bad?'\nFAIL':'\nPASS');
 process.exit(bad?1:0);
})();
