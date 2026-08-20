// Every destination that existed before the regroup must still be reachable.
const {chromium}=require('playwright-core');
const D='/tmp/claude-0/-home-user-aari-agent-hub/068e851b-2019-5748-a1f6-201d88d16971/scratchpad/';
const WAS={
 broker:['Dashboard','Broker Command','Team','Roster Command','Deals','Transaction Review',
   'Team Production','Agent Inventory','Deadline Radar','Money','Revenue and Fees','Announcements',
   'Team Email','Email','Blog Posts','Classes','Onboarding','Recruits','Compliance','Control Panel','Ask'],
 agent:['Dashboard','Today','Pipeline','Database','Pop bys','Transactions','Announcements',
   'Classes','Goal Engine','Ask']};
const NOW_MAP={
 'Dashboard':'Overview','Broker Command':'Needs you','Deals':'Files','Transaction Review':'Review',
 'Team Production':'Production','Agent Inventory':'Listings','Deadline Radar':'Deadlines',
 'Money':'Overview','Revenue and Fees':'Costs','Email':'Newsletter','Blog Posts':'Blog',
 'Roster Command':'Roster','Control Panel':'Accounts','Today':'My day','Ask':'(top bar)'};
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1440,height:1100}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+D+'artifact/aari-hub-v6.html'); await p.waitForTimeout(2600);
for(const [btn,role] of [['tb','broker'],['ta','agent']]){
  await p.click('#'+btn); await p.waitForTimeout(800);
  const mains=await p.$$eval('#nav a',e=>e.map(x=>x.textContent));
  const found=[];
  for(const m of mains){
    await p.click(`#nav a[data-t="${m}"]`); await p.waitForTimeout(550);
    const subs=await p.$$eval('#subs button',e=>e.map(x=>x.textContent.trim()));
    (subs.length?subs:[m]).forEach(s=>found.push(s));
  }
  found.push('(top bar)');           // Ask
  const missing=WAS[role].filter(old=>{
    const want=NOW_MAP[old]||old;
    return !found.includes(want);
  });
  console.log(`${role.toUpperCase()}: was ${WAS[role].length} destinations, now ${found.length} reachable`);
  console.log('  missing:', missing.length?missing:'none');
}
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();})();
