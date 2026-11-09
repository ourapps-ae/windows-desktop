const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { settings, policy } = require('../examples/consumer.cjs');
const { createPolicy } = require('../implementation/desktop/src/policy.cjs');
const { createShell, preferences } = require('../implementation/desktop/src/shell.cjs');
const { build } = require('../implementation/desktop/scripts/build.cjs');
const { EventEmitter } = require('node:events');

function permissions() {
  const session=new EventEmitter();
  session.setPermissionCheckHandler=handler=>{session.check=handler;};
  session.setPermissionRequestHandler=handler=>{session.request=handler;};
  session.setDisplayMediaRequestHandler=handler=>{session.display=handler;};
  let page=policy.ENTRY+'#player';
  const contents={getURL:()=>page,executeJavaScript:async()=>({mode:'player',interacted:true})};
  const state={window:{isDestroyed:()=>false,webContents:contents},interacted:true,generation:0};
  createShell(settings,{},policy).installPermissions(session,state);
  const details={isMainFrame:true,requestingUrl:policy.ENTRY,mediaTypes:['audio'],mediaType:'audio'};
  const request=()=>new Promise(resolve=>{void session.request(contents,'media',resolve,details);});
  return {session,contents,state,details,request,setPage:url=>{page=url;}};
}

test('all renderer protections and absence of system bridge hold',()=>{
  for(const name of ['sandbox','contextIsolation','webSecurity']) assert.equal(preferences[name],true);
  for(const name of ['nodeIntegration','nodeIntegrationInWorker','nodeIntegrationInSubFrames','webviewTag','allowRunningInsecureContent']) assert.equal(preferences[name],false);
  assert.equal(preferences.preload,undefined);
});

test('permission handlers grant only the interacted player main frame',async()=>{
  const h=permissions();
  assert.equal(h.session.check(h.contents,'media',policy.ORIGIN,h.details),true);
  assert.equal(await h.request(),true);
  assert.equal(h.session.check(null,'media',policy.ORIGIN,h.details),false);
  assert.equal(h.session.check(h.contents,'notifications',policy.ORIGIN,h.details),false);
  assert.equal(h.session.check(h.contents,'media','https://evil.example',h.details),false);
  assert.equal(h.session.check(h.contents,'media',policy.ORIGIN,{...h.details,isMainFrame:false}),false);
  h.state.interacted=false;
  assert.equal(await h.request(),false);
  h.state.interacted=true;
  h.setPage(policy.ENTRY+'#board');
  assert.equal(await h.request(),false);
});

test('missing mode or activation, renderer failure, screen capture and downloads deny',async()=>{
  const h=permissions();
  for(const result of [{mode:'board',interacted:true},{mode:'player',interacted:false},{}]) {
    h.contents.executeJavaScript=async()=>result;
    assert.equal(await h.request(),false);
  }
  h.contents.executeJavaScript=async()=>{throw new Error('closed');};
  assert.equal(await h.request(),false);
  assert.deepEqual(await new Promise(resolve=>h.session.display({},resolve)),{});
  let denied=false;
  h.session.emit('will-download',{preventDefault(){denied=true;}});
  assert.equal(denied,true);
});

test('pending capture cannot complete after board navigation',async()=>{
  const h=permissions(); let release;
  h.contents.executeJavaScript=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.request();
  h.setPage(policy.ENTRY+'#board');
  release({mode:'player',interacted:true});
  assert.equal(await pending,false);
});

test('loopback connections require an explicit configured origin',async()=>{
  const production=await policy.assetResponse(settings.webRoot,{url:policy.ENTRY,method:'GET'});
  assert.doesNotMatch(production.headers.get('content-security-policy'),/localhost|127\.0\.0\.1/);
  const local=createPolicy({...settings,serverOrigin:'http://127.0.0.1:8788'});
  const response=await local.assetResponse(settings.webRoot,{url:local.ENTRY,method:'GET'});
  assert.match(response.headers.get('content-security-policy'),/http:\/\/127.0.0.1:8788 ws:\/\/127.0.0.1:8788/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
});

test('shell blocks redirects, child navigation and webviews and invalidates mode generations',()=>{
  const opened=[];
  class BrowserWindow {
    constructor(options) { this.options=options; this.webContents=new EventEmitter(); this.webContents.getURL=()=>policy.ENTRY+'#player'; this.webContents.setWindowOpenHandler=fn=>{this.open=fn;}; }
    isFocused(){return true;}
    setMenuBarVisibility(){}
  }
  const state={};
  const win=createShell(settings,{BrowserWindow,shell:{openExternal:async url=>opened.push(url)}},policy).createWindow({},state);
  assert.equal(win.options.title,settings.appName);
  win.webContents.emit('before-input-event',{}, {type:'keyDown'});
  assert.equal(state.interacted,true);
  assert.deepEqual(win.open({url:'https://store.example/install'}),{action:'deny'});
  assert.equal(opened.length,1);
  win.open({url:'https://evil.example/'});
  assert.equal(opened.length,1);
  for(const name of ['will-redirect','will-attach-webview','will-frame-navigate']) {
    let prevented=false;
    win.webContents.emit(name,{isMainFrame:false,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
  }
  win.webContents.emit('did-navigate-in-page',{},policy.ENTRY+'#board',true);
  assert.equal(state.generation,1);
  assert.equal(state.interacted,false);
});

test('configured identities and exact external origins',()=>{
  assert.equal(policy.ENTRY,'example://app/index.html');
  for(const url of ['example://evil/index.html','example://user@app/index.html','https://app/index.html','example://app/index.html?q=1','example://app/other.html']) assert.equal(policy.trustedPage(url),false);
  assert.equal(policy.externalURL('https://store.example/install'),true);
  for(const url of ['https://store.example.evil/','https://user@store.example/','http://store.example/','https://store.example:444/']) assert.equal(policy.externalURL(url),false);
  assert.throws(()=>createPolicy({...settings,serverOrigin:'https://server.example/;evil'}));
  assert.throws(()=>createPolicy({...settings,scheme:'file'}));
});

test('media requires player mode, trusted main frame, interaction and known types',()=>{
  const request={page:policy.ENTRY+'#player',origin:policy.ENTRY,permission:'media',interacted:true,mainFrame:true,mediaTypes:['audio','video']};
  assert.equal(policy.mediaAllowed(request),true);
  for(const delta of [{page:policy.ENTRY+'#board'},{origin:'https://evil.example'},{permission:'display-capture'},{interacted:false},{mainFrame:false},{mediaTypes:[]},{mediaTypes:['screen']}]) assert.equal(policy.mediaAllowed({...request,...delta}),false);
  assert.equal(preferences.nodeIntegration,false);
  assert.equal(preferences.sandbox,true);
});

test('bundled resources reject traversal, links outside root and nonread requests',async()=>{
  const root=settings.webRoot;
  assert.match(await (await policy.assetResponse(root,{url:policy.ENTRY,method:'GET'})).text(),/Bundled local content/);
  assert.equal((await policy.assetResponse(root,{url:policy.ENTRY,method:'HEAD'})).body,null);
  assert.equal((await policy.assetResponse(root,{url:policy.ENTRY,method:'POST'})).status,405);
  for(const suffix of ['/../package.json','/%2e%2e/package.json','/%252e%252e/package.json','/%5csecret','/%00','/missing']) assert.equal(await policy.assetPath(root,policy.ORIGIN+suffix),null);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-path-'));
  try {
    await fs.mkdir(path.join(tmp,'web'));
    await fs.writeFile(path.join(tmp,'outside'),'private');
    await fs.symlink(path.join(tmp,'outside'),path.join(tmp,'web','link'));
    assert.equal(await policy.assetPath(path.join(tmp,'web'),policy.ORIGIN+'/link'),null);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});

test('permission response is rejected after a pending mode switch',async()=>{
  let requestHandler;
  const session={setPermissionCheckHandler(){},setPermissionRequestHandler(fn){requestHandler=fn;},setDisplayMediaRequestHandler(){},on(){}};
  let release;
  const contents={getURL:()=>policy.ENTRY+'#player',executeJavaScript:()=>new Promise(resolve=>{release=resolve;})};
  const state={window:{isDestroyed:()=>false,webContents:contents},interacted:true,generation:0};
  createShell(settings,{},policy).installPermissions(session,state);
  let result;
  const pending=requestHandler(contents,'media',value=>{result=value;},{requestingUrl:policy.ENTRY,isMainFrame:true,mediaTypes:['video']});
  state.generation++;
  release({mode:'player',interacted:true}); await pending;
  assert.equal(result,false);
});

test('build runs supplied web project and serves relocated packaged assets',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-build-'));
  try {
    const webRoot=path.join(tmp,'web'); const outputRoot=path.join(tmp,'resources','web');
    await fs.mkdir(path.join(webRoot,'dist-desktop'),{recursive:true});
    await fs.writeFile(path.join(webRoot,'package.json'),JSON.stringify({scripts:{'build:desktop':'node -e "process.exit(process.env.VITE_DESKTOP === \'1\' ? 0 : 1)"'}}));
    await fs.copyFile(path.join(settings.webRoot,'index.html'),path.join(webRoot,'dist-desktop','index.html'));
    await build({webRoot,outputRoot});
    await fs.rm(webRoot,{recursive:true});
    assert.match(await (await policy.assetResponse(outputRoot,{url:policy.ENTRY,method:'GET'})).text(),/Bundled local content/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});
