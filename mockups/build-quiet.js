// This mockup carries no photograph, so there is nothing to inline -- the copy
// exists only so the built name matches the others.
const fs=require('fs'), path=require('path');
const src=path.join(__dirname,'dashboard-v6-quiet.src.html');
const dest=path.join(__dirname,'dashboard-v6-quiet.html');
fs.copyFileSync(src,dest);
console.log('wrote',dest,(fs.statSync(dest).size/1024).toFixed(0)+'KB');
