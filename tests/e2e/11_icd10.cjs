const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.__TOXSEED=true;w.eval(fs.readFileSync(BUNDLE,'utf8'));
const sign=k=>{const c=w.document.querySelector(`canvas.sigc[data-k="${k}"]`);if(!c)return false;for(const t of ['pointerdown','pointermove','pointerup'])c.dispatchEvent(new w.MouseEvent(t,{bubbles:true,clientX:10,clientY:10}));return true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>w.document.querySelector(s),txt=()=>w.document.querySelector('#app').textContent;
const click=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const type=(s,v)=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const M=()=>w.__mock;
const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
async function signIn(email,pw){type('[data-b="lf.email"]',email);type('[data-b="lf.pw"]',pw);click('[data-a="login"]');await sleep(80)}
(async()=>{
 await sleep(80);
 w.fetch=async(u)=>{if(/icd10cm-2026\.json$/.test(u)){const b=fs.readFileSync(ROOT('public/icd10cm-2026.json'),'utf8');return {ok:true,json:async()=>JSON.parse(b)}}throw new Error('no fetch '+u)};
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 await login('clinic@pc.com','clinicpass123');
 click('[data-a="go"][data-v="order-new"]');await sleep(20);click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Ivy'],['last','Code'],['dob','1990-03-03']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','F');type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);click('[data-a="ordNext"]');await sleep(30);
 const opts=()=>[...w.document.querySelectorAll('[data-a="icdPick"]')].map(b=>b.textContent.replace(/\s+/g,' ').trim());
 type('[data-b="draft.icdFree"]','low back pain');await sleep(400);type('[data-b="draft.icdFree"]','low back pain');await sleep(50);
 console.log('S1 words "low back pain":',opts().slice(0,4).join(' | '));
 type('[data-b="draft.icdFree"]','M545');await sleep(30);console.log('S2 code "M545":',opts().slice(0,4).join(' | '));
 type('[data-b="draft.icdFree"]','opioid dependence uncomplicated');await sleep(30);console.log('S3 words "opioid dependence uncomplicated":',opts().slice(0,3).join(' | '));
 click('[data-a="icdPick"]');await sleep(20);
 console.log('S4 picked + description:',(txt().replace(/\s+/g,' ').match(/F11\.20 Opioid dependence, uncomplicated/)||['none'])[0]);
 type('[data-b="draft.icdFree"]','F11');click('[data-a="addIcd"]');await sleep(20);console.log('S5 non-billable rejected:',toasts().slice(-90));
 type('[data-b="draft.icdFree"]','z79891');click('[data-a="addIcd"]');await sleep(20);console.log('S6 typed without dot:',(txt().replace(/\s+/g,' ').match(/Z79\.891 Long term \(current\) use of opiate analgesic/)||['none'])[0]);
 console.log('errors',errs,M().errors);process.exit(0)
})();
