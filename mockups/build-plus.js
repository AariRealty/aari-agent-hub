// Inlines the headshot so the greyed-photo treatments can be judged on a real
// picture rather than a placeholder circle.
const fs=require('fs'), path=require('path');
function checkTags(html, file){
  const open=(html.match(/<div\b/g)||[]).length, close=(html.match(/<\/div>/g)||[]).length;
  if(open!==close) throw new Error(file+': '+open+' <div> but '+close+' </div>');
}
const src=path.join(__dirname,'dashboard-v6-plus.src.html');
const dest=path.join(__dirname,'dashboard-v6-plus.html');
let s=fs.readFileSync(src,'utf8');
checkTags(s,dest);
if(!s.includes('__MP_PHOTO__')) throw new Error('photo placeholder missing');
const photo='data:image/jpeg;base64,'+
  fs.readFileSync(path.join(__dirname,'..','assets','headshots','marlenyi-760.jpg')).toString('base64');
s=s.split('__MP_PHOTO__').join(photo);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(fs.statSync(dest).size/1024).toFixed(0)+'KB');
