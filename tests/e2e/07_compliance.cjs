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
const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
async function signIn(email,pw){type('[data-b="lf.email"]',email);type('[data-b="lf.pw"]',pw);click('[data-a="login"]');await sleep(80)}
(async()=>{
 await sleep(80);
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const mt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const ck=(sel,on=true)=>{const c=q(sel);c.checked=on;c.dispatchEvent(new w.Event('input',{bubbles:true}))};
 await login('lab@fbg.com','labpassword12');
 console.log('C0 nav has Compliance:',[...w.document.querySelectorAll('.nav button')].some(b=>/Compliance/.test(b.textContent)));
 // locked report: release the seeded order, then correct it
 w.document.querySelector('[data-a="go"][data-v="queue"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 w.document.querySelector('[data-a="openOrder"][data-id="oRPT"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 click('[data-a="go"][data-v="entry"]');await sleep(20);click('[data-a="release"]');await sleep(900);
 console.log('R1 locked copy saved:',JSON.stringify(M().store.report_versions.map(v=>v.id+':'+v.data.status)));
 click('[data-a="report"]');await sleep(300);console.log('R2 version bar:',(mt().match(/Locked copies:.{0,60}/)||['none'])[0]);q('#modal-root').innerHTML='';
 click('[data-a="startCorrect"]');await sleep(10);type('#modal-root [data-b="rej.reason"]','Typo in THC value');click('#modal-root [data-a="confirmCorrect"]');await sleep(400);click('[data-a="release"]');await sleep(900);
 console.log('R3 versions after correction:',JSON.stringify(M().store.report_versions.map(v=>v.id+':'+v.data.status)));
 click('[data-a="report"]');await sleep(300);console.log('R4 shows both versions:',mt().includes('Version 1'),mt().includes('Version 2 (corrected)'));
 click('#modal-root [data-a="reportVer"][data-i="0"]');await sleep(20);console.log('R5 version 1 view status FINAL:',mt().includes('FINAL'),'| pills:',[...w.document.querySelectorAll('#modal-root [data-a="reportVer"]')].map(p=>p.className+':'+p.textContent).join(' / '),'| status el:',(q('#modal-root .rp-status')||{}).textContent);q('#modal-root').innerHTML='';
 // compliance
 click('[data-a="go"][data-v="qms"]');await sleep(300);
 console.log('Q1 overview due items:',(txt().match(/\d+Overdue/)||[''])[0],'| first:',(w.document.querySelector('[data-a="qmsGo"]')||{textContent:''}).textContent.replace(/\s+/g,' ').slice(0,90));
 click('[data-a="qmsTab"][data-val="equipment"]');await sleep(10);click('[data-a="qmsNew"][data-kind="equipment"]');await sleep(10);
 type('#modal-root [data-b="qmf.name"]','Lab refrigerator 1');const ty=q('#modal-root [data-b="qmf.type"]');ty.value='Refrigerator';ty.dispatchEvent(new w.Event('change',{bubbles:true}));
 type('#modal-root [data-b="qmf.tempMin"]','2');type('#modal-root [data-b="qmf.tempMax"]','8');type('#modal-root [data-b="qmf.tasks"]','Clean and defrost | monthly\nThermometer check | annual');
 click('#modal-root [data-a="qmsSave"]');await sleep(300);const eq=M().store.qms_records.find(r=>r.kind==='equipment');console.log('E1 equipment saved:',!!eq);
 w.document.querySelector(`[data-a="qmsOpen"][data-id="${eq.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 click('[data-a="qmsNew"][data-kind="temp"]');await sleep(10);type('#modal-root [data-b="qmf.reading"]','11');click('#modal-root [data-a="qmsSave"]');await sleep(100);
 console.log('E2 out-of-range needs action:',toasts().includes('out of range'));type('#modal-root [data-b="qmf.notes"]','Door left open; moved reagents, reading 4 C after 30 min');click('#modal-root [data-a="qmsSave"]');await sleep(300);
 console.log('E3 temp logged:',M().store.qms_records.filter(r=>r.kind==='temp').length,'| schedule rows:',w.document.querySelectorAll('.tbl tbody tr').length);
 // lot in use, then an import run records it
 click('[data-a="qmsBack"]');await sleep(10);click('[data-a="qmsTab"][data-val="lot"]');await sleep(10);click('[data-a="qmsNew"][data-kind="lot"]');await sleep(10);
 for(const [k,v] of [['item','DRI Oxycodone reagent'],['lot','OX2291'],['expires',REL(14)]])type(`#modal-root [data-b="qmf.${k}"]`,v);const ins=q('#modal-root [data-b="qmf.instrument"]');ins.value='Yumizen C560';ins.dispatchEvent(new w.Event('change',{bubbles:true}));
 click('#modal-root [data-a="qmsSave"]');await sleep(300);console.log('L1 lot saved:',JSON.stringify(M().store.qms_records.filter(r=>r.kind==='lot').map(r=>r.data.status)));
 // personnel + competency due, SOP ack, vendors, quality, export
 click('[data-a="qmsTab"][data-val="personnel"]');await sleep(10);click('[data-a="qmsNew"][data-kind="personnel"]');await sleep(10);type('#modal-root [data-b="qmf.name"]','Luna Sci');type('#modal-root [data-b="qmf.hired"]',REL(-270));const cr=q('#modal-root [data-b="qmf.cliaRole"]');cr.value='Testing personnel';cr.dispatchEvent(new w.Event('change',{bubbles:true}));click('#modal-root [data-a="qmsSave"]');await sleep(300);
 click('[data-a="qmsTab"][data-val="sop"]');await sleep(10);click('[data-a="qmsNew"][data-kind="sop"]');await sleep(10);for(const [k,v] of [['number','TOX-001'],['title','Urine drug screen on Yumizen C560'],['version','1.0'],['effective',REL(-360)]])type(`#modal-root [data-b="qmf.${k}"]`,v);click('#modal-root [data-a="qmsSave"]');await sleep(300);
 const sop=M().store.qms_records.find(r=>r.kind==='sop');w.document.querySelector(`[data-a="qmsOpen"][data-id="${sop.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);click('[data-a="qmsAck"]');await sleep(300);
 console.log('S1 SOP acknowledged:',M().store.qms_records.filter(r=>r.kind==='ack').length,txt().includes('You acknowledged this version'));
 click('[data-a="qmsBack"]');await sleep(10);click('[data-a="qmsTab"][data-val="security"]');await sleep(10);click('[data-a="qmsSeedVendors"]');await sleep(500);console.log('V1 vendors seeded:',M().store.qms_records.filter(r=>r.kind==='vendor').length);
 click('[data-a="qmsTab"][data-val="overview"]');await sleep(20);
 console.log('O1 overview now:',[...w.document.querySelectorAll('[data-a="qmsGo"]')].map(r=>r.textContent.replace(/\s+/g,' ').trim().slice(0,85)).slice(0,9).join(' || '));
 click('[data-a="qmsTab"][data-val="quality"]');await sleep(20);console.log('QI1 indicators:',(txt().replace(/\s+/g,' ').match(/All orders.{0,140}/)||[''])[0]);
 click('[data-a="qmsTab"][data-val="export"]');await sleep(10);let csv='';w.URL.createObjectURL=b=>{return 'blob:x'};const origBlob=w.Blob;
 click('[data-a="exportOrders"]');await sleep(100);console.log('X1 export logged:',M().store.audit_log.some(a=>a.action==='export'&&/orders_results/.test(a.row_id)));
 console.log('B1 nav compliance badge:',(([...w.document.querySelectorAll('.nav button')].find(b=>/Compliance/.test(b.textContent))||{}).textContent||'').trim());
 console.log('errors',errs,M().errors);process.exit(0)
})();
