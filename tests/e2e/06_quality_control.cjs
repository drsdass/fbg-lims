const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.__TOXSEED=true;w.__RPTSEED=true;w.eval(fs.readFileSync(BUNDLE,'utf8'));
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
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1200)};
 const mt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 await login('luna@fbg.com','lunapassword12');
 console.log('Q0 nav has QC:',[...w.document.querySelectorAll('.nav button')].some(b=>/Quality control/.test(b.textContent)));
 click('[data-a="go"][data-v="instruments"]');await sleep(20);
 await upload('c560',FIX('CSV_Screening_Tox_QC.xlsx'),'CSV_Screening_Tox_QC.xlsx');
 console.log('Q1 C560 QC import:',(mt().match(/\d+ control results? logged to Quality control/)||['none'])[0],'| materials',M().store.qc_materials.length,'results',M().store.qc_results.length);
 q('#modal-root').innerHTML='';click('[data-a="setUi"][data-k="itab"][data-val="sciex"]');await sleep(20);
 await upload('sciex',FIX('20260715_JA_Urine_Tox_LCMS.csv'),'u.csv');
 console.log('Q2 MultiQuant QC import:',(mt().match(/\d+ control results? logged to Quality control/)||['none'])[0],'| materials',M().store.qc_materials.length,'| sample:',JSON.stringify(M().store.qc_materials.find(m=>m.data.instrument==='SCIEX 4500').data).slice(0,160));
 await upload('sciex',FIX('20260715_JA_Urine_Tox_LCMS.csv'),'u.csv');
 console.log('Q3 re-import does not duplicate:',M().store.qc_results.length);
 q('#modal-root').innerHTML='';
 // 24 synthetic runs for one control, the last one an outlier
 const mat=M().store.qc_materials.find(m=>m.data.instrument==='Yumizen C560');const base=Date.now()-30*864e5;
 const vals=[100,102,98,101,99,103,97,100,101,99,102,98,100,101,99,100,102,98,101,99,100,101,99,112];
 vals.forEach((v,i)=>M().store.qc_results.push({id:'syn'+i,material_id:mat.id,at:new Date(base+i*864e5).toISOString(),data:{id:'syn'+i,materialId:mat.id,at:base+i*864e5,value:v,by:'Luna',source:'test'}}));
 click('[data-a="go"][data-v="qc"]');await sleep(500);
 console.log('Q4 QC list:',txt().replace(/\s+/g,' ').match(/Controls tracked.{0,160}/)[0].slice(0,160));
 const row=[...w.document.querySelectorAll('[data-a="qcOpen"]')].find(r=>r.dataset.id===mat.id);
 console.log('Q5 target set from first 20 runs:',JSON.stringify({mean:M().store.qc_materials.find(m=>m.id===mat.id).data.mean,sd:M().store.qc_materials.find(m=>m.id===mat.id).data.sd}),'row status:',row&&[...row.children].slice(-3).map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 row.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(500);
 console.log('Q6 LJ chart points:',w.document.querySelectorAll('svg[aria-label="Levey-Jennings chart"] circle').length,'| rules shown:',(txt().match(/1-3s[^A-Z]{0,20}/)||['none'])[0]);
 const cb=[...w.document.querySelectorAll('[data-a="qcComment"]')][0];cb.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);type('#modal-root [data-b="rej.comment"]','Reran control after recalibration, in range');click('#modal-root [data-a="qcSaveComment"]');await sleep(300);
 console.log('Q7 corrective action saved:',JSON.stringify(M().store.qc_results.find(r=>r.data.comment).data.comment));
 click('[data-a="qcPrint"]');await sleep(30);console.log('Q8 print view:',mt().includes('Levey-Jennings QC review'),mt().includes('Laboratory director'));q('#modal-root').innerHTML='';
 click('[data-a="logout"]');await sleep(600);
 await login('lab@fbg.com','labpassword12');
 click('[data-a="go"][data-v="outbox"]');await sleep(400);
 console.log('D1 delivery setup:',(txt().match(/Email: not set up.{0,80}/)||['none'])[0]);
 const sel=q('[data-b="al.channel"]');sel.value='Text';sel.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(10);type('[data-b="al.dest"]','4805550100');click('[data-a="alertTest"]');await sleep(300);
 console.log('D2 test result message:',toasts().slice(-100));
 // PDF download on a released order
 let blobType='',blobSize=0;w.URL.createObjectURL=b=>{blobType=b.type;blobSize=b.size;return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 const rel=M().store.orders.find(o=>o.data.status==='Released')||null;
 if(rel){w.eval('void 0');}
 console.log('P1 released order available:',!!rel);
 console.log('errors',errs,M().errors);process.exit(0)
})();
