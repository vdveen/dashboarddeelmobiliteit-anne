const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
(async()=>{
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
 const page=await browser.newPage({viewport:{width,height}});
 page.on('pageerror',e=>console.log(name,'PAGEERROR',e.message));
 await page.goto('http://localhost:8444');
 await page.getByRole('button',{name:'Openbare kaart',exact:true}).click();
 const toggle=page.getByRole('button',{name:'Voertuigen selecteren'});
 await toggle.click();
 const panel=page.locator('.SelectionTool-panel');
 await panel.waitFor();
 const bounds=await panel.boundingBox();
 assert(bounds.x>=0 && bounds.x+bounds.width<=width);
 const controls=await page.locator('.maplibregl-ctrl-bottom-right > .maplibregl-ctrl').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
 const nonempty=controls.filter(c=>c.width&&c.height).sort((a,b)=>a.y-b.y);
 for(let i=1;i<nonempty.length;i++) assert(nonempty[i-1].y+nonempty[i-1].height<=nonempty[i].y);
 console.log(name, JSON.stringify({panel:bounds,controls:nonempty}));
 await page.screenshot({path:`/tmp/fork-repairs-2026-09-06/browser/${name}-controls.png`});
 await page.close();
 }
 await browser.close();
})();
