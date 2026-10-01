const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');const {indexedDB:IDB,IDBKeyRange}=require('fake-indexeddb');
const bundle=fs.readFileSync(BUNDLE,'utf8');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let shared={};   // localStorage carried across "page loads" on the same device
function page(online){
 const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
 const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
 const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.indexedDB=IDB;w.IDBKeyRange=IDBKeyRange;
 Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto,configurable:true});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 Object.defineProperty(w.navigator,'onLine',{get:()=>online,configurable:true});
 for(const [k,v] of Object.entries(shared))w.localStorage.setItem(k,v);
 const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
 const ctx=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});w.CSS={escape:s=>String(s)};w.HTMLCanvasElement.prototype.getContext=function(){return ctx};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
 w.eval(bundle);
 const q=s=>w.document.querySelector(s),txt=()=>w.document.querySelector('#app').textContent.replace(/\s+/g,' ');
 const click=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
 const type=(s,v)=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
 const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
 const keep=()=>{shared={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);shared[k]=w.localStorage.getItem(k)}};
 return {w,q,txt,click,type,toasts,errs,keep,M:()=>w.__mock};
}
const login=async(P,e,pw)=>{P.type('[data-b="lf.email"]',e);P.type('[data-b="lf.pw"]',pw);P.click('[data-a="login"]');await sleep(80);if(P.q('[data-b="lf.code"]')){P.type('[data-b="lf.code"]','123456');P.click('[data-a="mfaVerify"]')}await sleep(400)};
(async()=>{
 // ---- page load 1: online, turn on offline entry
 let P=page(true);await sleep(80);await login(P,'lab@fbg.com','labpassword12');
 console.log('O1 toggle shown:',/Offline order entry on this device: off/.test(P.txt()));
 P.click('[data-a="offlineToggle"]');await sleep(1500);
 console.log('O2 enabled:',/Offline order entry on this device: on/.test(P.txt()),'|',P.toasts().slice(-70));
 P.w.localStorage.setItem('sb-abc-auth-token','{"access_token":"x"}');P.keep();
 console.log('O0 errors:',P.errs);
 // ---- page load 2: no connection
 P=page(false);await sleep(600);
 console.log('F1 offline boot:',/You're offline/.test(P.txt()),'| menu:',[...P.w.document.querySelectorAll('.nav button')].map(b=>b.textContent.replace(/\d+$/,'').trim()).join(', '));
 P.click('[data-a="go"][data-v="order-new"]');await sleep(30);
 P.type('[data-b="draft.clinicId"]','c1001');await sleep(10);P.click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Off'],['last','Line'],['dob','1985-04-04']])P.type(`[data-b="pt.${k}"]`,v);P.type('[data-b="pt.sex"]','M');P.type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);
 P.click('[data-a="ordNext"]');await sleep(20);P.click('[data-a="toggleTest"][data-id="CMP"]');P.click('[data-a="toggleArr"][data-k="icd"]');P.click('[data-a="ordNext"]');await sleep(20);
 const pp=P.q('[data-b="draft.provPaper"]');if(pp){pp.checked=true;pp.dispatchEvent(new P.w.Event('input',{bubbles:true}))}
 P.click('[data-a="ordNext"]');await sleep(20);P.click('[data-a="ordNext"]');await sleep(800);
 console.log('F2 offline order:',(P.txt().match(/FBG\d{6}-\d{4}/)||['none'])[0],'|',P.toasts().slice(-80));
 const raw=await new Promise(r=>{const o=IDB.open('fbg-offline',1);o.onsuccess=()=>{const t=o.result.transaction('kv').objectStore('kv').getAllKeys();t.onsuccess=()=>r(t.result)}});
 const box=await new Promise(r=>{const o=IDB.open('fbg-offline',1);o.onsuccess=()=>{const t=o.result.transaction('kv').objectStore('kv').get(raw.find(k=>String(k).startsWith('queue:')));t.onsuccess=()=>r(t.result)}});
 console.log('F3 stored encrypted:',!!box&&box.ct instanceof Uint8Array,'| plaintext visible:',Buffer.from(box.ct).toString('latin1').includes('Line'),'| keys:',raw.join(','));
 P.click('[data-a="go"][data-v="offline"]');await sleep(20);console.log('F4 offline list:',(P.txt().match(/Offline orders.{0,160}/)||[''])[0].slice(0,160));
 console.log('F0 errors:',P.errs);P.keep();
 // ---- page load 3: back online, upload
 P=page(true);await sleep(80);await login(P,'lab@fbg.com','labpassword12');await sleep(1500);
 const up=P.M().store.orders.find(o=>o.data.history.some(h=>/offline entry/.test(h.note||'')));
 console.log('U1 uploaded:',up&&up.data.accession,up&&up.data.status,'|',P.toasts().slice(-90));
 const left=await new Promise(r=>{const o=IDB.open('fbg-offline',1);o.onsuccess=()=>{const t=o.result.transaction('kv').objectStore('kv').getAllKeys();t.onsuccess=()=>r(t.result)}});
 console.log('U2 queue cleared:',!left.some(k=>String(k).startsWith('queue:')),'| keys:',left.join(','));
 console.log('U0 errors:',P.errs,P.M().errors);process.exit(0)
})();
