import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
const artifact=process.argv[2]
assert(artifact?.startsWith('/nix/store/'))
const require=createRequire(import.meta.url)
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'p41-smoke-'))
const report={artifact,scratch,tests:{},blockedBrowserRequests:[],browserErrors:[]}
const home=path.join(scratch,'home'),data=path.join(scratch,'farm'),commons=path.join(scratch,'commons'),tmp=path.join(scratch,'tmp')
for(const dir of [home,data,commons,tmp]) fs.mkdirSync(dir,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
const port=await freePort()
const title='P41 Synthetic Welcome'
for(const site of ['alpha.localhost','beta.localhost']) {
 const base=path.join(data,site)
 for(const d of ['pages','status','assets/plugins/image'])fs.mkdirSync(path.join(base,d),{recursive:true})
 const story=[{id:'p41-paragraph',type:'paragraph',text:site==='alpha.localhost'?'P41 synthetic alpha page':'P41 synthetic beta page'}]
 const page={title,story,journal:[{type:'create',date:1,item:{title,story}}]}
 fs.writeFileSync(path.join(base,'pages/welcome-visitors'),JSON.stringify(page))
}
fs.writeFileSync(path.join(commons,'fixture.txt'),'synthetic commons')
const config={farm:true,security_type:'friends',host:'127.0.0.1',port,data,commons,allowed:'alpha.localhost,beta.localhost',cookieSecret:'synthetic-p41-only-'+String(port).repeat(16),neighbors:'',session_duration:7}
const configFile=path.join(scratch,'config.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2))
report.config={...config,cookieSecret:'[disposable synthetic secret]'}
const profile=path.join(scratch,'network.sb')
fs.writeFileSync(profile,'(version 1)\n(allow default)\n(deny network*)\n(allow network-outbound (remote ip "localhost:*"))\n(allow network-inbound network-bind (local ip "localhost:*"))\n(allow network* (local unix-socket) (remote unix-socket))\n(deny file-read* file-write* (subpath "/Users/rgb/.wiki") (subpath "/home/rgb/.wiki"))\n')
const env={PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:home,TMPDIR:tmp,SOURCE_DATE_EPOCH:'1'}
let child,browser,log='',fixture
const get=(route,site='alpha.localhost',options={})=>new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port,path:route,method:options.method||'GET',headers:{Host:`${site}:${port}`,...options.headers}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}))});req.on('error',reject);req.end(options.body)
})
const stop=async()=>{if(child&&child.exitCode!==null){child=null;return}if(child){const done=new Promise(r=>child.once('exit',r));try{process.kill(-child.pid,'SIGTERM')}catch{};await done;child=null}}
const start=async()=>{
 child=spawn('/usr/bin/sandbox-exec',['-f',profile,path.join(artifact,'bin/wiki'),'--config',configFile],{cwd:scratch,env,detached:true,stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b)
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('server exited: '+log);try{if((await get('/welcome-visitors.json')).status===200)return}catch{};await new Promise(r=>setTimeout(r,200))}
 throw Error('startup timeout: '+log)
}
try {
 // Verify the runtime sandbox disallows outbound connections before starting wiki.
 const probe=execFileSync('/usr/bin/sandbox-exec',['-f',profile,process.execPath,'-e',`const n=require('node:net');const s=n.connect(443,'192.0.2.1');s.on('error',e=>{console.log(e.code);process.exit(e.code==='EPERM'?0:1)});setTimeout(()=>process.exit(2),2000)`],{env,cwd:scratch,encoding:'utf8'})
 assert(probe.includes('EPERM'));report.tests.egressDeny='PASS (kernel EPERM)'
 await start();report.tests.A_server='PASS'
 assert((await get('/welcome-visitors.json')).body.includes('synthetic alpha'))
 assert((await get('/welcome-visitors.json','beta.localhost')).body.includes('synthetic beta'))
 assert.notEqual((await get('/','unknown.localhost')).status,200);report.tests.B_farm='PASS: two sites and rejected unknown host'
 const login=await get('/login','alpha.localhost',{method:'POST'});assert.equal(login.status,200)
 const cookie=login.headers['set-cookie'].map(x=>x.split(';')[0]).join('; ')
 const ownerFile=path.join(data,'alpha.localhost/status/owner.json');const owner=fs.readFileSync(ownerFile,'utf8');assert(JSON.parse(owner).friend.secret)
 assert.equal((await get('/recycler/system/slugs.json')).status,403)
 report.tests.C_friends='PASS: claim persisted; anonymous protected request denied'
 const bundle=await get('/client.js');assert.equal(bundle.status,200);assert(/javascript/.test(bundle.headers['content-type']));assert(bundle.body.includes('0.33.0-dev+'));report.tests.D_clientBundle='PASS'
 const ordinary=await get('/view/welcome-visitors');assert.equal(ordinary.status,200);report.tests.E_page='PASS'
 const discovery=await get('/system/plugins.json');assert.equal(discovery.status,200)
 for(const name of ['mech','solo','journalmatic'])assert(discovery.body.includes(name))
 report.tests.F_discovery='PASS'
 for(const [label,url] of Object.entries({G_mech:'/plugins/mech/mech.js',H_solo:'/plugins/solo/solo.js',I_journalmatic:'/plugins/journalmatic/check-page.html'})){const res=await get(url);assert.equal(res.status,200);assert(res.body.length>100);report.tests[label]='PASS'}
 assert.equal((await get('/plugins/solo/dialog/index.html')).status,200)
 assert.equal((await get('/about-journalmatic-plugin.json')).status,200)
 const mech=await get('/plugin/mech/run/welcome-visitors/p41?mech=W10=&state=e30=');assert.equal(mech.status,200);assert.deepEqual(JSON.parse(mech.body).mech,[]);report.tests.mechServer='PASS'
 const commonsQuery=encodeURIComponent(Buffer.from(JSON.stringify([{command:'COMMONS'}])).toString('base64'))
 const commonsResult=await get(`/plugin/mech/run/welcome-visitors/p41?mech=${commonsQuery}&state=e30=`)
 assert.equal(JSON.parse(commonsResult.body).state.commons.all.files,1);report.tests.commons='PASS: mech reads scratch commons'
 // Local HTTP fixture exercises HTTPS-first failure then HTTP fallback, anonymously.
 fixture=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.setHeader('etag','p41-fixture');res.setHeader('x-not-allowed','drop-me');res.end(JSON.stringify({fixture:true}))})
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r))
 const proxied=await get(`/proxy/127.0.0.1:${fixture.address().port}/fixture.json`);assert.equal(proxied.status,200);assert.equal(JSON.parse(proxied.body).fixture,true);assert.equal(proxied.headers.etag,'p41-fixture');assert.equal(proxied.headers['x-not-allowed'],undefined);report.tests.proxyFixture='PASS: anonymous HTTP fallback, buffered JSON, header filtering'
 const browserWrapper=path.join(scratch,'browser-sandbox.sh')
 const quote=x=>"'"+x.replaceAll("'", "'\\''")+"'"
 fs.writeFileSync(browserWrapper,'#!/bin/sh\nexec /usr/bin/sandbox-exec -f '+quote(profile)+' '+quote(chromium.executablePath())+' "$@"\n',{mode:0o755})
 browser=await chromium.launch({headless:true,executablePath:browserWrapper,env:{...process.env,HOME:home,TMPDIR:tmp},args:['--host-resolver-rules=MAP alpha.localhost 127.0.0.1, MAP beta.localhost 127.0.0.1','--disable-background-networking']})
 const context=await browser.newContext()
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(['alpha.localhost','beta.localhost','127.0.0.1'].includes(u.hostname)&&Number(u.port)===port)return route.continue();report.blockedBrowserRequests.push(u.href);return route.abort('blockedbyclient')})
 const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(String(e)))
 await page.goto(`http://alpha.localhost:${port}/view/welcome-visitors`)
 await page.waitForFunction(()=>document.querySelector('.story')?.textContent.includes('P41 synthetic alpha'))
 for(const name of ['mech','solo'])await page.addScriptTag({url:`/plugins/${name}/${name}.js`})
 assert(await page.evaluate(()=>!!window.plugins.mech?.emit&&!!window.plugins.solo?.emit))
 await page.goto(`http://alpha.localhost:${port}/plugins/journalmatic/check-page.html`)
 await page.waitForFunction(()=>typeof window.link_click==='function')
 report.tests.browserPlugins='PASS: ordinary page rendered; mech/solo registered; journalmatic module initialized'
 const installedClient=path.join(artifact,'lib/node_modules/wiki/node_modules/wiki-client')
 const {newPage}=require(path.join(installedClient,'lib/page.js'))
 const one=newPage({title:'Merge fixture',story:[],journal:[{type:'create',date:1,item:{title:'Merge fixture',story:[]}}]})
 const two=newPage({title:'Merge fixture',story:[],journal:[{type:'add',id:'smoke-merge',date:2,item:{id:'smoke-merge',type:'paragraph',text:'Merged'}}]},'fixture.example.test')
 assert(one.merge(two).getRawPage().story.some(x=>x.id==='smoke-merge'));report.tests.J_merge='PASS on installed artifact'
 const mocha=path.resolve('node_modules/mocha/bin/mocha.js')
 execFileSync('/usr/bin/sandbox-exec',['-f',profile,process.execPath,mocha,path.join(installedClient,'test/siteAdapter.js')],{cwd:scratch,env,stdio:'pipe'})
 report.tests.K_optionalIndex='PASS: installed artifact caches optional-index 404'

 assert.deepEqual(report.browserErrors,[])
 await browser.close();browser=null
 await stop();await start()
 assert.equal(fs.readFileSync(ownerFile,'utf8'),owner)
 assert((await get('/welcome-visitors.json')).body.includes('synthetic alpha'))
 // Ensure the synthetic recycler exists before checking the retained session.
 fs.mkdirSync(path.join(data,'alpha.localhost/recycle'),{recursive:true})
 assert.equal((await get('/recycler/system/slugs.json','alpha.localhost',{headers:{Cookie:cookie}})).status,200)
 report.tests.M_restart='PASS: page, owner and synthetic session survive'
 for(const [key,value] of Object.entries({home,data,commons,tmp}))assert(value.startsWith(scratch+path.sep))
 function audit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){assert(!item.isSymbolicLink());if(item.isDirectory())audit(path.join(dir,item.name))}}
 audit(scratch);assert(!log.includes('/home/rgb/.wiki')&&!log.includes('/Users/rgb/.wiki'))
 report.tests.L_isolation='PASS: explicit scratch paths, separate HOME/cwd, no symlinks, production paths denied by sandbox'
 report.status='PASS'
} catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1}
finally{if(browser)await browser.close();await stop();if(fixture)await new Promise(r=>fixture.close(r));fs.writeFileSync(path.join(scratch,'wiki.log'),log);fs.writeFileSync('candidate/smoke-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
