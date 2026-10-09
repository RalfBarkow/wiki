import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const [upstreamWiki,discourseWiki,playwrightPath,browserPath]=process.argv.slice(2)
if(!browserPath)throw Error('Usage: UPSTREAM_WIKI_ROOT DISCOURSE_WIKI_ROOT PLAYWRIGHT_PATH BROWSER_PATH')
const {chromium}=await import(pathToFileURL(path.join(playwrightPath,'index.mjs')))
const here=path.dirname(new URL(import.meta.url).pathname)
const fixtures=path.join(here,'fixtures')
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
for(const record of JSON.parse(fs.readFileSync(path.join(fixtures,'provenance.json'))))
 assert.equal(sha(fs.readFileSync(path.join(fixtures,record.file))),record.sha256)
const original=JSON.parse(fs.readFileSync(path.join(fixtures,'trails.json')))
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wiki-package-browser-'))
const report={kind:'isolated actual Wiki client/server/package execution',cases:[],externalRequests:[],failures:[],browser:null,sourceTrust:'Only selected hash-pinned authored Trails Code and immutable Graph/Cypher fixtures. No public page or arbitrary remote module.'}
const childProcesses=[]
let browser
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function boot(label,wikiRoot){
 const work=path.join(directory,label);fs.mkdirSync(path.join(work,'data/pages'),{recursive:true})
 fs.writeFileSync(path.join(work,'data/pages/trails-rendered'),JSON.stringify(original))
 const dg={title:'Question Root',story:[{id:'fold',type:'pagefold',text:'Question'},{id:'question',type:'paragraph',text:'[[Target Page]]'},{id:'mech-dg',type:'mech',text:'CLICK\n NEIGHBORS\n EXTRACT\n EDGES\n WALK 60 questions\n CLICK\n  SOLO'}],journal:[{type:'create',date:2,item:{title:'Question Root',story:[]}}]}
 fs.writeFileSync(path.join(work,'data/pages/question-root'),JSON.stringify(dg))
 fs.writeFileSync(path.join(work,'data/pages/target-page'),JSON.stringify({title:'Target Page',story:[{id:'target-p',type:'paragraph',text:'Trusted target.'}],journal:[{type:'create',date:1,item:{title:'Target Page',story:[]}}]}))
 const port=await freePort(), origin=`http://remote.fixture.test:${port}`
 const log=fs.openSync(path.join(work,'server.log'),'w')
 const child=spawn(process.execPath,[path.join(here,'server.mjs'),wikiRoot,work,String(port),origin],{stdio:['ignore',log,log]});childProcesses.push(child)
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/trails-rendered.json`);if(r.ok)return{work,origin,port}}catch{};if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100))}
 throw Error('Server startup failed: '+fs.readFileSync(path.join(work,'server.log'),'utf8').slice(-5000))
}
try{
 browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-proxy-server','--host-resolver-rules=MAP remote.fixture.test 127.0.0.1']});report.browser=browser.version()
 for(const [profile,wikiRoot] of [['upstream',upstreamWiki],['discourse',discourseWiki]]){
  const instance=await boot(profile,wikiRoot);const ctx=await browser.newContext({serviceWorkers:'block'})
  const observed={profile,wikiRoot,requests:[],pageErrors:[],consoleErrors:[],status:'not-run'};report.cases.push(observed)
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());observed.requests.push({url:url.href,method:route.request().method()})
   if(url.origin===instance.origin)return route.continue()
   if(url.href==='https://wardcunningham.github.io/graph/graph.js'||url.href==='https://wardcunningham.github.io/graph/cypher.js'){
    return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':instance.origin},body:fs.readFileSync(path.join(fixtures,path.basename(url.pathname)))})
   }
   const extra=JSON.parse(fs.readFileSync(path.join(fixtures,'provenance.json'))).find(f=>f.url===url.href&&f.version==='11.11.1')
   if(extra)return route.fulfill({status:200,contentType:extra.file.endsWith('.css')?'text/css':'text/javascript',headers:{'Access-Control-Allow-Origin':instance.origin},body:fs.readFileSync(path.join(fixtures,extra.file))})
   // No production/network access and no arbitrary import permissions.
   report.externalRequests.push(url.href);return route.abort()
  })
  await ctx.addInitScript(()=>{window.__fixtureBatches=[];window.addEventListener('message',event=>{if(event.data?.type==='batch')window.__fixtureBatches.push(JSON.parse(JSON.stringify(event.data)))})})
  const page=await ctx.newPage();page.on('pageerror',e=>observed.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')observed.consoleErrors.push(m.text())})
  try{
   await page.goto(instance.origin+'/view/trails-rendered',{waitUntil:'networkidle',timeout:30000})
   const mech=page.locator('#trails-rendered .item.mech')
   await mech.getByRole('button',{name:'▶',exact:true}).first().waitFor({timeout:15000})
   await mech.getByRole('button',{name:'▶',exact:true}).first().click()
   await page.waitForFunction(()=>document.querySelector('#trails-rendered .mech')?.textContent.includes('2 aspects'),null,{timeout:15000})
   observed.status=await mech.innerText();assert.match(observed.status,/CODE trails ⇒ 2 aspects/)
   observed.servedMechSha256=sha(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch('/plugins/mech/mech.js')).arrayBuffer())))))
   const module=await page.evaluate(async()=>{const m=await import('/plugins/mech/mech.js');return {commands:Object.keys(m.blocks)}})
   observed.commands=module.commands;for(const name of ['CODE','SOLO','LISTEN','MESSAGE'])assert(module.commands.includes(name))
   for(const name of ['EXTRACT','EDGES','DEBUG'])assert.equal(module.commands.includes(name),profile==='discourse')
   const registry=await page.evaluate(async()=>await(await fetch('/system/plugins.json')).json());observed.pluginRegistry=registry
   // Test the unchanged SOLO sender with an explicit isolated receiver; production Solo is not substituted silently.
   await ctx.route(instance.origin+'/plugins/solo/dialog/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Trusted receiver</title><script>window.received=[];addEventListener("message",e=>{if(e.data?.type==="batch")received.push(e.data)})</script>'}))
   const popupPromise=page.waitForEvent('popup');await mech.getByRole('button',{name:'▶',exact:true}).nth(1).click();const popup=await popupPromise
   await popup.waitForFunction(()=>window.received?.length>0,null,{timeout:10000})
   observed.batch=await popup.evaluate(()=>window.received[0]);const graphs=observed.batch.sources[0].aspects.map(a=>a.graph)
   assert.equal(graphs.length,2);assert(graphs.every(g=>g.nodes.length===3&&g.rels.length===2))
   // Structural combination by exact node labels; separate from executing Solo's layout/Graphviz.
   observed.combined={nodeNames:[...new Set(graphs.flatMap(g=>g.nodes.map(n=>n.props.name)))],edgeCount:graphs.reduce((n,g)=>n+g.rels.length,0)}
   assert.equal(observed.combined.nodeNames.length,5);assert.equal(observed.combined.edgeCount,4)
   await popup.close()
   if(profile==='discourse'){
    await page.goto(instance.origin+'/view/question-root',{waitUntil:'networkidle'})
    const dg=page.locator('#question-root .item.mech')
    await dg.getByRole('button',{name:'▶',exact:true}).first().click()
    await page.waitForFunction(()=>document.querySelector('#question-root .mech')?.textContent.includes('WALK 60 questions ⇒'),null,{timeout:20000})
    observed.discourseStatus=await dg.innerText()
    assert(!observed.discourseStatus.includes('✖︎'),'Discourse commands must execute without trouble')
    const next=page.waitForEvent('popup');await dg.getByRole('button',{name:'▶',exact:true}).nth(1).click();const child=await next
    await child.waitForFunction(()=>window.received?.length>0,null,{timeout:10000})
    observed.discourseBatch=await child.evaluate(()=>window.received[0]);assert(observed.discourseBatch.sources[0].aspects.length>0)
    await child.close()
   }
   observed.acceptance='PASS'
  }catch(error){observed.acceptance='FAIL';observed.error=error.message;observed.body=await page.locator('body').innerText().catch(()=>null);report.failures.push({profile,message:error.message})}
  finally{await ctx.close()}
 }
}finally{
 if(browser)await browser.close()
 for(const child of childProcesses)if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000)})}
 fs.mkdirSync(path.join(here,'.artifacts'),{recursive:true});fs.writeFileSync(path.join(here,'.artifacts/package-browser.json'),JSON.stringify(report,null,2)+'\n')
 // Retain only fixture logs on failure; these are disposable paths, not runtime configuration.
 fs.writeFileSync(path.join(here,'.artifacts/browser-workdir.txt'),directory+'\n')
}
console.log(JSON.stringify({cases:report.cases.map(c=>({profile:c.profile,acceptance:c.acceptance,error:c.error})),failures:report.failures,externalRequests:report.externalRequests},null,2))
assert.equal(report.failures.length,0,'Actual package/browser acceptance failed')
