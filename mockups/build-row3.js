// This mockup carries no photograph, so there is nothing to inline -- the copy
// exists only so the built name matches the others.
const fs=require('fs'), path=require('path');
// Guard: a <div> closed with </p> nests everything that follows inside it and
// the page still renders, just wrong. Count the tags before writing.
function checkTags(html, file){
  const open = (html.match(/<div\b/g)||[]).length;
  const close = (html.match(/<\/div>/g)||[]).length;
  if(open !== close){
    throw new Error(file+': '+open+' <div> but '+close+' </div> -- '+
      (open>close ? (open-close)+' unclosed' : (close-open)+' extra')+
      '. A <div> closed with </p> is the usual cause.');
  }
}

const src=path.join(__dirname,'dashboard-v6-row3.src.html');
const dest=path.join(__dirname,'dashboard-v6-row3.html');
checkTags(fs.readFileSync(src,'utf8'),dest);
fs.copyFileSync(src,dest);
console.log('wrote',dest,(fs.statSync(dest).size/1024).toFixed(0)+'KB');
