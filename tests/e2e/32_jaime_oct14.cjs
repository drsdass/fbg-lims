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
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const st=acc=>M().store.orders.find(o=>o.data.accession===acc);
 const U=['Amphetamines','Benzodiazepines','Opiates','Oxycodone'];
 Object.assign(st('60000004').data,{confirm:U,confirmReq:['Oxycodone'],confV:3});
 await login('lab@fbg.com','labpassword12');
 // L1-L2: Lab settings points to the definitive cutoffs
 click('[data-a="go"][data-v="labset"]');await sleep(40);
 console.log('L1 lab settings panel:',/Definitive cutoffs and confirmation mapping/.test(txt()));
 click('[data-a="goCutoffs"]');await sleep(40);console.log('L2 opens:',/Instruments/.test(q('.page-h').textContent),'| cutoffs tab on',!!q('.pill.on[data-val="cutoffs"]'));
 // E1-E2: manual entry lists the analytes of each confirmation test, ready to type
 nav('go','entry',st('60000004').id);await sleep(60);
 const comp=[...w.document.querySelectorAll('[data-b^="res.CONF."][data-b*=".k."]')];
 const lbl=[...w.document.querySelectorAll('.conc-grid label > span')].map(s=>s.textContent.replace(/\s+/g,' ').trim());
 console.log('E1 analyte inputs shown:',comp.length,'|',lbl.slice(0,8).join(', '));
 const opi=U.indexOf('Opiates');click(`[data-a="toggleConc"][data-v="CONF.${opi}"]`);await sleep(20);
 console.log('E2 hide works:',w.document.querySelectorAll('[data-b^="res.CONF.'+opi+'.k."]').length===0,'| button',q(`[data-a="toggleConc"][data-v="CONF.${opi}"]`).textContent);
 // P1-P3: pasting a table into the import box imports it at once; a second click while busy is ignored
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(30);
 const csv=['Type,Sample ID,Bar Code,Sample Type,Ordering Date,Chemistry,Result,Response,Replicates,Unit,Flag,Ref Range,Run Date','R,1,60000004,Urine,10/8/2026,OXY,250,1,1,ng/mL,,,10/8/2026 9:00'].join('\n');
 const ta=q('[data-b="ui.paste_c560"]');const ev=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(ev,'clipboardData',{value:{files:[],getData:t=>/plain|text/.test(t)?csv:''}});
 ta.dispatchEvent(ev);
 console.log('P1 busy state:',(q('[data-a="doImport"][data-k="c560"]')||{}).textContent,'| default paste blocked',ev.defaultPrevented);
 click('[data-a="doImport"][data-k="c560"]');await sleep(900);
 console.log('P2 imported once:',/Import complete/.test(mtxt()),'| second click:',/Still importing/.test(toasts()),'| box cleared',q('[data-b="ui.paste_c560"]').value==='');
 q('#modal-root').innerHTML='';
 const ev2=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(ev2,'clipboardData',{value:{files:[],getData:()=>''}});q('[data-b="ui.paste_c560"]').dispatchEvent(ev2);await sleep(20);
 console.log('P3 empty clipboard:',toasts().replace(/\s+/g,' ').slice(-120));
 console.log('errors',errs,M().errors);process.exit(0)
})();
