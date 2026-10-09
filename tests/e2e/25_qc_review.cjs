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
 const st=acc=>M().store.orders.find(o=>o.data.accession===acc).data;
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);if(!fi){errs.push('no input '+kind);return}const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const dump=n=>fs.writeFileSync(OUT(n),'<html><head><meta charset="utf-8"><style>'+fs.readFileSync(ROOT('src/styles.css'),'utf8')+'</style></head><body>'+q('#app').outerHTML+q('#modal-root').outerHTML+'</body></html>');
 const mats=()=>M().store.qc_materials.map(r=>r.data);
 await login('luna@fbg.com','lunapassword12');
 // T1-T3: Jaime's target sheet
 click('[data-a="go"][data-v="qc"]');await sleep(300);
 console.log('T1 import targets button:',!!q('input[data-imp="qctargets"]'),'| review panel:',txt().includes('QC review and approval'));
 await upload('qctargets',FIX('QC_targets.xlsx'),'QC.xlsx');
 console.log('T2 summary:',mtxt().slice(0,330));
 const fen=mats().find(m=>m.control==='FENT 1'),of=mats().find(m=>m.control==='OFQC1A'),cr=mats().find(m=>m.control==='CRE-U 1.3');
 console.log('T3 materials:',mats().length,'| FENT 1',JSON.stringify(fen&&[fen.instrument,fen.analyte,fen.lot,fen.expires,fen.mean,fen.sd,fen.units]),'| OFQC1A',JSON.stringify(of&&[of.instrument,of.analyte,of.lot,of.mean,of.sd]),'| CRE-U units',cr&&cr.units);
 q('#modal-root').innerHTML='';
 await upload('qctargets',FIX('QC_targets.xlsx'),'QC.xlsx');
 console.log('T4 re-import is idempotent:',mats().length,mtxt().slice(0,140));
 q('#modal-root').innerHTML='';
 // Q1-Q2: Yumizen QC file scored against the targets
 click('[data-a="go"][data-v="instruments"]');await sleep(30);
 await upload('c560',FIX('CSV_Screening_Tox_QC.xlsx'),'CSV_Screening_Tox_QC_1.xlsx');
 console.log('Q1 C560 QC scored:',(mtxt().match(/\d+ control results logged and scored[^.]*\./)||['none'])[0]);
 console.log('Q2 flagged rows:',[...q('#modal-root').querySelectorAll('tbody tr')].filter(tr=>/Reject|Warning|lot/.test(tr.textContent)).map(tr=>tr.textContent.replace(/\s+/g,' ').trim()).join(' || ').slice(0,400));
 q('#modal-root').innerHTML='';
 // H1-H4: LC-MS/MS file with patients and QCs: failed controls hold only the drug classes they cover
 click('[data-a="setUi"][data-k="itab"][data-val="sciex"]');await sleep(20);
 await upload('sciex',FIX('20260715_JA_Urine_Tox_LCMS.csv'),'20260715_JA_Urine_Tox_LCMS_1.csv');
 dump('qc_import.html');console.log('H1 LCMS QC:',(mtxt().match(/\d+ control results logged and scored[^.]*\.[^.]*\./)||['none'])[0]);
 await sleep(600);
 const h3=st('60000003').qcHold;console.log('H2 hold on 60000003:',JSON.stringify(h3&&h3.analytes),'| items',h3&&h3.items.length,'| runs',JSON.stringify(st('60000003').runs.map(r=>[r.inst,r.day])));
 q('#modal-root').innerHTML='';
 nav('reviewOrder',null,'ox60000003');await sleep(40);
 dump('qc_hold.html');console.log('H3 entry banner:',(txt().replace(/\s+/g,' ').match(/QC hold\..{0,160}/)||['none'])[0]);
 click('[data-a="fillNormals"]');await sleep(10);click('[data-a="verifyResults"]');await sleep(200);
 console.log('H4 verify blocked by hold:',!st('60000003').verified,'|',toasts().slice(-90));
 click('[data-a="qcHoldClear"]');await sleep(20);click('[data-a="qcHoldSave"]');await sleep(20);console.log('H5 needs details:',toasts().slice(-30));
 type('[data-b="rej.note"]','Recalibrated Norbuprenorphine; QC2A re-run 205 ng/mL, in range.');click('[data-a="qcHoldSave"]');await sleep(100);
 console.log('H6 hold released:',!!(st('60000003').qcHold.cleared),st('60000003').qcHold.cleared&&st('60000003').qcHold.cleared.action,'| banner',/QC hold released by/.test(txt()));
 // G1-G3: the run's QC hasn't been reviewed: warn mode asks, and saying no stops verification
 w.confirm=m=>{console.log('G1 confirm asked:',m);return false};
 click('[data-a="verifyResults"]');await sleep(300);console.log('G2 not verified after No:',!st('60000003').verified);
 w.confirm=()=>true;
 // R1-R4: review and approve the SCIEX run for that day on the QC page
 click('[data-a="go"][data-v="qc"]');await sleep(400);
 type('[data-b="qs.rvDay"]','2026-07-15');const sel=q('[data-b="qs.rvInst"]');sel.value='SCIEX 4500';sel.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(10);
 click('[data-a="qcReview"]');await sleep(400);
 dump('qc_review.html');console.log('R1 review modal:',mtxt().slice(0,260));
 click('[data-a="qcReviewSave"][data-v="1"]');await sleep(50);console.log('R2 approve needs notes when rejects:',toasts().slice(-60));
 type('[data-b="rej.notes"]','Cyclobenzaprine QC1A/QC1B/QC2B not detected: not reported. Norbuprenorphine recalibrated and re-run.');click('[data-a="qcReviewSave"][data-v="1"]');await sleep(200);
 const rv=M().store.qms_records.map(r=>r.data).find(r=>r.kind==='qcreview');console.log('R3 review saved:',JSON.stringify(rv&&{inst:rv.instrument,day:rv.day,n:rv.n,rejects:rv.rejects,approved:rv.approved,by:rv.signer.by,code:/^[A-Z]{1,3}-[A-Z0-9]{2,4}$/.test(rv.signer.code)}));
 console.log('R4 recent reviews table:',(txt().replace(/\s+/g,' ').match(/Run dateInstrumentControlsDecisionReviewed byNotes.{0,90}?\(ID [A-Z0-9-]+\)/)||['none'])[0]);
 // G3: verification now goes through without asking
 let asked=false;w.confirm=()=>{asked=true;return true};
 nav('reviewOrder',null,'ox60000003');await sleep(40);click('[data-a="fillNormals"]');await sleep(10);click('[data-a="verifyResults"]');await sleep(1500);
 console.log('G3 verified without prompt:',!!st('60000003').verified,'asked',asked);
 click('[data-a="logout"]');await sleep(600);
 // S1-S2: lab setting, and block mode
 await login('lab@fbg.com','labpassword12');click('[data-a="go"][data-v="labset"]');await sleep(30);
 const gs=q('[data-b="labf.qcGate"]');console.log('S1 setting:',!!gs,gs&&gs.value);
 gs.value='block';gs.dispatchEvent(new w.Event('change',{bubbles:true}));click('[data-a="saveLab"]');await sleep(200);
 nav('reviewOrder',null,'ox60000004');await sleep(40);
 // 60000004: release its hold; block mode lets it through because the SCIEX day is approved
 click('[data-a="qcHoldClear"]');await sleep(20);type('[data-b="rej.note"]','Same corrective action as 60000003.');click('[data-a="qcHoldSave"]');await sleep(50);
 click('[data-a="fillNormals"]');await sleep(10);click('[data-a="verifyResults"]');await sleep(1500);console.log('S2 block mode, approved day:',!!st('60000004').verified);
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);await upload('c560',FIX('CSV_Screening_Tox_Patient_Samples_1.xlsx'),'CSV_Screening_Tox_Patient_Samples_2.xlsx');q('#modal-root').innerHTML='';await sleep(300);
 nav('reviewOrder',null,'ox50018185');await sleep(40);click('[data-a="fillNormals"]');await sleep(10);click('[data-a="verifyResults"]');await sleep(1500);
 console.log('S3 block mode, unreviewed C560 day:',!st('50018185').verified,'|',toasts().slice(-110));
 console.log('errors',errs,M().errors);process.exit(0)
})();
