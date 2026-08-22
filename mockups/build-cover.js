// Inlines the broker headshot into the phone mockup. The published page has to
// be self-contained -- the artifact host blocks every external origin except
// Google Fonts -- so the image travels with the file.
//
//   node mockups/build-hero.js      -> mockups/dashboard-v6-cover.html
//
// This one uses the 760px JPEG rather than the 2MB PNG in the dashboard build:
// the photo appears five times on this page (three nav avatars and two full
// bleeds), and the full-size PNG would put the page over the 16MB artifact cap.
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(__dirname,'dashboard-v6-cover.src.html'),'utf8');
const jpg=fs.readFileSync(path.join(root,'assets/headshots/marlenyi-760.jpg'));
if(!src.includes('__MP_PHOTO__')) throw new Error('__MP_PHOTO__ placeholder missing');
const out=src.split('__MP_PHOTO__').join('data:image/jpeg;base64,'+jpg.toString('base64'));
const dest=path.join(__dirname,'dashboard-v6-cover.html');
fs.writeFileSync(dest,out);
console.log('wrote',dest,(out.length/1024).toFixed(0)+'KB');
