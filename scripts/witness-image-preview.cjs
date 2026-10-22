// Real renderer/dialog/browser, simulated native I/O. Supply a real raster for the preview.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const output=process.env.IMAGE_ARTIFACTS || '/tmp/mezzanine-image-preview';await fs.mkdir(output,{recursive:true});
 const png=await fs.readFile(process.env.IMAGE_FIXTURE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHAT_CHROME});
 const page=await browser.newPage({viewport:{width:1080,height:720}});const errors=[],remote=[];const checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('example.invalid'))remote.push(r.url())});
 try{
  await page.addInitScript(base64=>{
   window.fileCalls=[];
   window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
    window.fileCalls.push({cmd,args});
    if(cmd==='read_chat_image'){if(args.path.includes('missing'))throw 'Image not found';return Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer}
    if(cmd==='reveal_chat_file')return;
    throw new Error('Unexpected command '+cmd);
   }};
  },png.toString('base64'));
  await page.goto((process.env.IMAGE_WITNESS_URL || 'http://127.0.0.1:1432')+'/scripts/image-preview-witness.html');
  const link=page.getByRole('link',{name:'Tavern icon'});await link.waitFor();
  assert.equal(await page.evaluate(()=>window.fileCalls.length),0);checks.push('No file read before click');
  await link.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth>0);
  assert.equal(await page.evaluate(()=>document.querySelector('dialog')===document.activeElement.closest('dialog')),true);
  await page.screenshot({path:path.join(output,'fit.png')});
  assert.equal(await dialog.evaluate(d=>d.getBoundingClientRect().width<=innerWidth&&d.getBoundingClientRect().height<=innerHeight),true);
  await page.getByRole('button',{name:'Actual size',exact:true}).click();
  assert.equal(await page.locator('.graphite-image-actual').count(),1);
  await page.getByRole('button',{name:'Show in folder',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fileCalls.filter(c=>c.cmd==='reveal_chat_file').length),1);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await link.evaluate(el=>el===document.activeElement),true);checks.push('Keyboard open, fit, actual size, reveal and Escape focus restoration');
  await page.getByRole('link',{name:'Missing image'}).click();await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Retry image'}).click();
  assert.equal(await page.evaluate(()=>window.fileCalls.filter(c=>c.args.path.includes('missing')).length),2);
  await page.getByRole('button',{name:'Close preview'}).click();checks.push('Missing file is visible and retryable');
  const before=await page.evaluate(()=>window.fileCalls.length);
  await page.getByRole('link',{name:'Source file'}).click();assert.equal(await page.evaluate(()=>window.fileCalls.length),before);
  await page.getByRole('button',{name:'Show in folder',exact:true}).click();await page.keyboard.press('Escape');
  checks.push('Non-image path is reveal-only');
  await page.getByRole('link',{name:'Local artwork'}).click();await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth>0);
  await page.screenshot({path:path.join(output,'markdown-image.png')});checks.push('Markdown image syntax opens the same viewer');
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);checks.push('No browser errors or remote image requests');
  await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify({checks,boundary:'Chromium renderer and dialog; native IPC simulated, not installed Windows acceptance'},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
