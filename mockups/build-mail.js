// The letter mockups carry the Aari mark, so they inline the same trimmed copy
// both dashboard builds read through __AARI_MARK__.
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

const src=path.join(__dirname,'aari-email-template.src.html');
const dest=path.join(__dirname,'aari-email-template.html');
const mark='data:image/png;base64,'+
  fs.readFileSync(path.join(__dirname,'..','assets','logo-mark.png')).toString('base64');
let s=fs.readFileSync(src,'utf8');
if(!s.includes('__AARI_MARK__')) throw new Error('mark placeholder missing');
s=s.split('__AARI_MARK__').join(mark);
checkTags(s,dest);
fs.writeFileSync(dest,s);
console.log('wrote',dest,(s.length/1024).toFixed(0)+'KB');
