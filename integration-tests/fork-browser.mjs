// Independent client/server fork contract. No Mech code executes in this harness.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import http from 'node:http'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const [wikiRoot,playwrightPath,browserPath,label='wiki']=process.argv.slice(2)
if(!browserPath)throw Error('Usage: WIKI_ROOT PLAYWRIGHT_PATH BROWSER_PATH [LABEL]')
const {chromium}=await import(pathToFileURL(path.join(playwrightPath,'index.mjs')))
const here=path.dirname(new URL(import.meta.url).pathname)
const work=fs.mkdtempSync(path.join(os.tmpdir(),'wiki-fork-contract-'))
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const source={title:'Fork Contract',story:[{type:'paragraph',id:'source-item',text:'Trusted local source content'}],journal:[{type:'create',date:1,item:{title:'Fork Contract',story:[]}}]}
const destination={title:'Fork Contract',story:[{type:'paragraph',id:'dest-item',text:'Destination before fork'}],journal:[{type:'create',date:1,item:{title:'Fork Contract',story:[]}}]}
fs.mkdirSync(path.join(work,'data/pages'),{recursive:true});fs.writeFileSync(path.join(work,'data/pages/fork-contract'),JSON.stringify(destination))
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
const origin=`http://remote.fixture.test:${port}`
const log=fs.openSync(path.join(work,'server.log'),'w')
const child=spawn(process.execPath,[path.join(here,'server.mjs'),wikiRoot,work,String(port),origin],{stdio:['ignore',log,log]})
const corsServer=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(source))})
await new Promise(r=>corsServer.listen(0,'127.0.0.1',r))
const corsOrigin=`http://source-cors.fixture.test:${corsServer.address().port}`
const report={label,wikiRoot,origin,source:{site:'localhost:3000',snapshotSha256:sha(JSON.stringify(source))},fixtureBoundary:'localhost:3000 is fulfilled by a disposable browser route. No listener or request to the user real localhost service. Real package client/server; fixture security plugin.',tests:[],requests:[],writes:[],packageProvenance:JSON.parse(fs.readFileSync(path.join(wikiRoot,'wiki-composition-provenance.json'),'utf8')),servedClientSha256:sha(fs.readFileSync(path.join(wikiRoot,'node_modules/wiki-client/client/client.js'))),browserVersion:null}
let browser
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/fork-contract.json`)).ok)break}catch{};if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(work,'server.log'),'utf8').slice(-4000));await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-proxy-server','--host-resolver-rules=MAP *.fixture.test 127.0.0.1']})
 report.browserVersion=browser.version()
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());report.requests.push({url:url.href,method:request.method(),origin:request.headers().origin??null})
  if(url.origin===corsOrigin)return route.continue()
  if(url.origin===origin){
   if(['PUT','POST'].includes(request.method())&&url.pathname.startsWith('/page/')){
    const headers=await request.allHeaders(),encoded=new URLSearchParams(request.postData()||'')
    const action=encoded.has('action')?JSON.parse(encoded.get('action')):request.postDataJSON()
    report.writes.push({url:url.href,wireMethod:request.method(),methodOverride:encoded.get('_method'),body:action,cookieSent:!!headers.cookie})
   }
   return route.continue()
  }
  if(['localhost:3000','source.fixture.test'].includes(url.host)){
   const body=url.pathname==='/favicon.png'?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=', 'base64'):Buffer.from(JSON.stringify(source))
   return route.fulfill({status:200,contentType:url.pathname.endsWith('.json')?'application/json':'image/png',body,headers:url.pathname==='/no-cors.json'?{}:{'Access-Control-Allow-Origin':origin}})
  }
  if(url.host==='other.fixture.test')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Foreign origin fixture</title>'})
  return route.abort()
 })
 const page=await context.newPage();await page.goto(origin+'/view/fork-contract',{waitUntil:'networkidle'})
 await page.waitForFunction(()=>window.wiki?.pageHandler&&document.querySelector('#fork-contract .item.paragraph'))
 const getSource=site=>page.evaluate(site=>new Promise(resolve=>{wiki.site(site).get('fork-contract.json',(error,data)=>resolve({error:error?.msg??null,data}));setTimeout(()=>resolve({error:'fixture timeout',data:null}),7000)}),site)
 const loopback=await getSource('localhost:3000')
 const blockedExpected=label==='ralfbarkow'
 const strippedExpected=['ralfbarkow','localhost'].includes(label)
 assert.equal(!!loopback.data,!blockedExpected,'Source-observed loopback acquisition policy changed')
 report.tests.push({name:'local source reachability from destination origin',status:loopback.data?'PASS':'BLOCKED_BY_EXISTING_CLIENT_POLICY_OR_BROWSER',error:loopback.error,actualSourceRequests:report.requests.filter(r=>r.url.startsWith('http://localhost:3000/')).length})
 const reachable=await getSource('source.fixture.test');assert.deepEqual(reachable.data,source)
 report.tests.push({name:'authorized-origin readable source control',status:'PASS'})
 const unavailable=await getSource('unavailable.fixture.test');assert(unavailable.error)
 report.tests.push({name:'source unavailable',status:'PASS',error:unavailable.error})
 const mutatePage=site=>page.evaluate(({site,raw})=>{
  const element=document.querySelector('#fork-contract'),oldKey=$(element).data('key')
  wiki.lineup.removeKey(oldKey)
  const object=wiki.newPage(raw,site),key=wiki.lineup.addPage(object)
  $(element).data('key',key).data('site',site).data('data',raw).addClass('remote')
  element.dataset.key=key
  if(!object.isRemote()||object.getRemoteSite()!==site)throw Error('Fixture remote PageObject identity failed')
 },{site,raw:source})
 // Non-loopback source is the control. It must not normalize the loopback policy.
 await page.evaluate(()=>fetch('/fixture/login',{method:'POST'}));await page.reload({waitUntil:'networkidle'})
 await mutatePage('source.fixture.test')
 const beforeWrites=report.writes.length
 await page.locator('#fork-contract .fork-page').click()
 await page.waitForFunction(()=>localStorage.getItem('fork-contract')===null,null,{timeout:5000}).catch(()=>{})
 for(let i=0;i<50;i++){const stored=JSON.parse(fs.readFileSync(path.join(work,'data/pages/fork-contract')));if(stored.story.some(x=>x.id==='source-item'))break;await new Promise(r=>setTimeout(r,100))}
 const saved=JSON.parse(fs.readFileSync(path.join(work,'data/pages/fork-contract')))
 assert(saved.story.some(i=>i.id==='source-item'),'Authorized real server fork must copy source story')
 const write=report.writes.slice(beforeWrites).find(w=>w.body.type==='fork');assert(write?.body.forkPage&&write.cookieSent)
 assert(saved.journal.some(a=>a.type==='fork'&&a.site==='source.fixture.test'),'Fork source journal authority')
 report.tests.push({name:'authorized remote write with correct non-loopback fork provenance',status:'PASS',forkPageIncluded:true,journal:saved.journal})
 // Already-held loopback snapshot tests provenance separately from blocked acquisition.
 await page.reload({waitUntil:'networkidle'});await mutatePage('localhost:3000')
 const index=report.writes.length;await page.locator('#fork-contract .fork-page').click();await page.waitForTimeout(700)
 const loopWrite=report.writes.slice(index).find(w=>w.body.type==='fork');assert(loopWrite?.body.forkPage)
 assert.equal(loopWrite.body.site==='localhost:3000',!strippedExpected,'Source-observed loopback provenance policy changed')
 report.intendedLocalToRemoteWorkflow=blockedExpected?'BLOCKED: public-origin acquisition intentionally rejected; preloaded provenance intentionally stripped':strippedExpected?'PARTIAL: source acquired but existing client strips loopback journal provenance':'PASS in isolated HTTP/CORS/authenticated fixtures'
 report.tests.push({name:'loopback source provenance from preloaded snapshot',status:loopWrite.body.site==='localhost:3000'?'PRESERVED':'STRIPPED_BY_EXISTING_CLIENT',site:loopWrite.body.site??null,notOrdinaryAcquisition:!loopback.data})
 // Rejected write must stay out of remote storage; client fallback is observed separately.
 const immutable=sha(fs.readFileSync(path.join(work,'data/pages/fork-contract')))
 await context.clearCookies();await page.goto(origin+'/view/fork-contract',{waitUntil:'networkidle'});await mutatePage('source.fixture.test')
 await page.evaluate(()=>{const element=document.querySelector('#fork-contract');const native=/dom\./.test(wiki.pageHandler.put.toString());wiki.pageHandler.put(native?element:$(element),{type:'fork',site:'source.fixture.test'})});await page.waitForTimeout(500)
 const localFallback=await page.evaluate(()=>!!localStorage.getItem('fork-contract'))
 const rejected=await page.evaluate(async payload=>{
  const r=await fetch('/page/rejected-fork/action',{method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action:JSON.stringify({...payload,date:Date.now()})})});return r.status
 },write.body)
 assert.equal(rejected,403);assert.equal(sha(fs.readFileSync(path.join(work,'data/pages/fork-contract'))),immutable)
 assert(!fs.existsSync(path.join(work,'data/pages/rejected-fork')))
 report.tests.push({name:'remote write rejected without authorized cookie',status:'PASS',httpStatus:rejected,remoteUnchanged:true,clientLocalFallback:localFallback,probe:'Actual server authorization route; non-owner local-storage choice separately exercised through the existing client API, not a synthesized UI button'})
 const cors=await page.evaluate(async url=>{try{await fetch(url);return 'unexpected-success'}catch(e){return e.name}},corsOrigin+'/no-cors.json');assert.equal(cors,'TypeError')
 report.tests.push({name:'browser rejects source without CORS approval',status:'PASS',error:cors})
 const foreign=await context.newPage();await foreign.goto('http://other.fixture.test/')
 const foreignWrite=await foreign.evaluate(async origin=>{try{return(await fetch(origin+'/page/foreign-fork/action',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'fork',site:'localhost:3000',forkPage:{title:'Foreign',story:[],journal:[]},date:Date.now()})})).status}catch(e){return e.name}},origin)
 assert(foreignWrite===403||foreignWrite==='TypeError');assert(!fs.existsSync(path.join(work,'data/pages/foreign-fork')))
 report.tests.push({name:'foreign browser origin cannot write without destination authorization',status:'PASS',result:foreignWrite})
 report.status='PASS: controls; loopback acquisition/provenance retain observed boundaries'
 await context.close()
}catch(error){report.status='FAIL';report.error=error.message;throw error}
finally{
 await new Promise(resolve=>corsServer.close(resolve));if(browser)await browser.close();if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000)})}
 fs.mkdirSync(path.join(here,'.artifacts'),{recursive:true});fs.writeFileSync(path.join(here,'.artifacts/fork-'+label+'.json'),JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({label,status:report.status,error:report.error,tests:report.tests},null,2))
}
