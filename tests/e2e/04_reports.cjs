const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.__RPTSEED=true;w.eval(fs.readFileSync(BUNDLE,'utf8'));
const sign=k=>{const c=w.document.querySelector(`canvas.sigc[data-k="${k}"]`);if(!c)return false;for(const t of ['pointerdown','pointermove','pointerup'])c.dispatchEvent(new w.MouseEvent(t,{bubbles:true,clientX:10,clientY:10}));return true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>w.document.querySelector(s),txt=()=>w.document.querySelector('#app').textContent;
const click=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const type=(s,v)=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const M=()=>w.__mock;
const signRelease=async()=>{click('[data-a="release"]');await sleep(20);const pw=q('#esig-pw');if(pw){pw.value=M().user.pw;click('#modal-root [data-a="esigRelease"]');await sleep(80)}};
const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
async function signIn(email,pw){type('[data-b="lf.email"]',email);type('[data-b="lf.pw"]',pw);click('[data-a="login"]');await sleep(80)}
(async()=>{
 await sleep(80);
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 await login('lab@fbg.com','labpassword12');
 run=(c)=>{};
 w.document.querySelector('[data-a="go"][data-v="queue"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 w.document.querySelector('[data-a="openOrder"][data-id="oRPT"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 click('[data-a="go"][data-v="entry"]');await sleep(20);
 console.log('E1 entry consistency column:',[...w.document.querySelectorAll('.re-test')].slice(-1)[0].textContent.replace(/\s+/g,' ').slice(0,420));
 await signRelease();await sleep(900);
 const o=M().store.orders.find(x=>x.id==='oRPT').data;console.log('E2 status',o.status,'flags',JSON.stringify(o.flags));
 fs.writeFileSync(OUT('report_model.json'),JSON.stringify(M().lastFax||null));
 w.document.querySelector('[data-a="report"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(50);
 const html=w.document.querySelector('#modal-root .rp');fs.writeFileSync(OUT('report.html'),'<html><head><meta charset="utf-8"><style>'+fs.readFileSync(ROOT('src/styles.css'),'utf8')+'</style></head><body style="background:#fff;margin:0">'+html.outerHTML.replace(/src="\/logo.png"/,'src="file://'+ROOT('public/logo.png')+'"')+'</body></html>');
 let bt='',bs=0;w.URL.createObjectURL=b=>{bt=b.type;bs=b.size;return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 console.log('E4 download button:',!!q('#modal-root [data-a="dlReport"]'));click('#modal-root [data-a="dlReport"]');await sleep(2500);console.log('E5 PDF created:',bt,bs,'bytes');
 let blobs=[];w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:x'};q('#modal-root').innerHTML='';click('[data-a="dlHL7"]');await sleep(100);
 const fr=new w.FileReader();const hl7=await new Promise(r=>{fr.onload=()=>r(fr.result);fr.readAsText(blobs[blobs.length-1])});
 console.log('O1 HL7 segments:',hl7.split('\r').map(x=>x.split('|')[0]).join(','));console.log('O2 sample:',hl7.split('\r').filter(x=>/^OBX/.test(x)).slice(0,2).join(' || ').slice(0,260));
 console.log('O3 MSH:',hl7.split('\r')[0].slice(0,120));
 q('#modal-root').innerHTML='';click('[data-a="addOn"]');await sleep(30);
 console.log('A1 add-on screen:',txt().includes('New order'),'step 2:',!!q('[data-a="toggleTest"]'));
 click('[data-a="toggleTest"][data-id="CMP"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(20);
 const pp=q('[data-b="draft.provPaper"]');if(pp){pp.checked=true;pp.dispatchEvent(new w.Event('input',{bubbles:true}))}
 click('[data-a="ordNext"]');await sleep(20);click('[data-a="ordNext"]');await sleep(900);
 const ao=M().store.orders.find(o=>o.data.addOnOf);console.log('A2 add-on order:',ao&&ao.data.accession,ao&&ao.data.addOnOf,ao&&ao.data.status,ao&&ao.data.tests.join('+'),'| banner:',txt().includes('Add-on test using the specimen from accession'),'| toasts:',toasts().slice(-80));
 console.log('E3 report text:',html.textContent.replace(/\s+/g,' ').replace(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}(, \d{1,2}:\d{2}( [AP]M)?)?/g,'<DATE>').replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}(,? \d{1,2}:\d{2}(:\d{2})?( [AP]M)?)?/g,'<DATE>').slice(0,1500));
 console.log('errors',errs,M().errors);process.exit(0)
})();
