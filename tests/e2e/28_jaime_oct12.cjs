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
 // 60000004 becomes an order placed under the new urine test mapping (confirmation tests, not requisition drugs)
 const U=['Amphetamines','Barbiturates','Benzodiazepines','Buprenorphine','Cocaine','Ecstasy (MDMA)','Fentanyl','Heroin (6-AM)','Methadone','Opiates','Oxycodone','PCP','THC','Ketamine','Tramadol'];
 Object.assign(st('60000004'),{confirm:U,confirmReq:['Oxycodone','Clonazepam','Methadone'],confV:3});
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);if(!fi){errs.push('no input '+kind);return}const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const dump=n=>fs.writeFileSync(OUT(n),'<html><head><meta charset="utf-8"><style>'+fs.readFileSync(ROOT('src/styles.css'),'utf8')+'</style></head><body>'+q('#app').outerHTML+q('#modal-root').outerHTML+'</body></html>');
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 await login('lab@fbg.com','labpassword12');
 // M1-M3: cutoffs tab and LC-MS/MS results under the new mapping
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="cutoffs"]');await sleep(30);
 const rowsTxt=[...w.document.querySelectorAll('tbody tr')].map(tr=>tr.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);
 const _x=0,firstCol=[...w.document.querySelectorAll('tbody td.nm')].map(td=>td.textContent.trim());
 console.log('M1 urine confirmation tests:',firstCol.slice(0,16).join(' | '));
 const comps=t=>[...w.document.querySelectorAll('tbody tr')].reduce((acc,tr)=>{const n=tr.querySelector('td.nm');if(n)acc.cur=n.textContent.trim();if(acc.cur===t)acc.out.push(tr.querySelector('input[data-b$=".name"]').value);return acc},{cur:'',out:[]}).out.join(', ');
 console.log('M2 analytes: Benzodiazepines =',comps('Benzodiazepines'),'| Methadone =',comps('Methadone'),'| Cocaine =',comps('Cocaine'),'| Heroin =',comps('Heroin (6-AM)'),'| Ketamine =',comps('Ketamine'),'| Tramadol =',comps('Tramadol'),'| THC =',comps('THC'));
 click('[data-a="setUi"][data-k="itab"][data-val="sciex"]');await sleep(20);
 await upload('sciex',FIX('20260715_JA_Urine_Tox_LCMS.csv'),'urine.csv');await sleep(600);
 const c4=st('60000004').results.CONF||{};
 console.log('M3 60000004 by confirmation test:',Object.entries(c4).map(([k,v])=>k+'='+v.v+(v.v==='Positive'?' ['+v.c+']':'')).join(' | '));
 const c3=st('60000003').results.CONF||{};console.log('M4 60000003 (placed before the change) keeps requisition drugs:',Object.keys(c3).slice(0,5).join(', '));
 q('#modal-root').innerHTML='';
 // M5: the order page and report for the new-style order
 nav('openOrder',null,'ox60000004');await sleep(40);
 console.log('M5 order page:',(txt().replace(/\s+/g,' ').match(/Confirmation tests \(\d+ tests[^)]*\)/)||['none'])[0],'| requisition:',(txt().replace(/\s+/g,' ').match(/Ordered on the requisition: [^.]*?(?=Prescribed|$|Patient)/)||['none'])[0].slice(0,80));
 // M6: reflex on a positive screen adds the confirmation test, not the requisition drugs
 Object.assign(st('50018185'),{reflex:true,confV:3,confirm:[],confirmReq:[],tests:['UDS']});
 // R1-R3: paste and drop a file onto the paste box
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);
 console.log('R1 paste box help:',/drag the file onto the box below.*paste \(Ctrl\+V\)/.test(txt()));
 const buf=fs.readFileSync(FIX('CSV_Screening_Tox_Patient_Samples_1.xlsx'));const file=new w.File([buf],'CSV_Screening_Tox_Patient_Samples_2.xlsx');file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
 const ta=q('textarea[data-b="ui.paste_c560"]');const pe=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(pe,'clipboardData',{value:{files:[file]}});ta.dispatchEvent(pe);await sleep(1500);
 console.log('R2 pasted file imported:',(mtxt().match(/\d+ result rows? matched to \d+ orders?/)||['none'])[0],'| default prevented',pe.defaultPrevented);
 q('#modal-root').innerHTML='';
 const de=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(de,'dataTransfer',{value:{files:[file]}});q('textarea[data-b="ui.paste_c560"]').dispatchEvent(de);await sleep(1500);
 console.log('R3 dropped file imported:',(mtxt().match(/\d+ result rows? matched to \d+ orders?/)||['none'])[0]);
 q('#modal-root').innerHTML='';
 console.log('M6 reflex adds confirmation tests:',JSON.stringify(st('50018185').confirm),'| requisition drugs recorded:',(st('50018185').confirmReq||[]).length);
 // Q1-Q8: QC periods, control list, control sets, set report
 click('[data-a="go"][data-v="qc"]');await sleep(300);await upload('qctargets',FIX('QC_targets.xlsx'),'QC.xlsx');q('#modal-root').innerHTML='';
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);await upload('c560',FIX('CSV_Screening_Tox_QC.xlsx'),'qc.xlsx');q('#modal-root').innerHTML='';
 click('[data-a="go"][data-v="qc"]');await sleep(400);
 const fen=M().store.qc_materials.map(r=>r.data).find(m=>m.control==='FENT 1');nav('qcOpen',null,fen.id);await sleep(400);
 console.log('Q1 period options:',[...q('[data-b="qs.detailDays"]').options].map(o=>o.textContent).join(' | '));
 click('[data-a="go"][data-v="qc"]');await sleep(200);
 console.log('Q2 tabs:',[...w.document.querySelectorAll('[data-a="setQcTab"]')].map(x=>x.textContent).join(' | '));
 click('[data-a="setQcTab"][data-val="controls"]');await sleep(40);
 dump('qc_controls.html');const ctlRows=[...w.document.querySelectorAll('tbody tr')].map(tr=>tr.textContent.replace(/\s+/g,' ').trim());
 console.log('Q3 control list:',ctlRows.length,'controls | first:',ctlRows[0],'| pH 11.5 row:',(ctlRows.find(r=>r.startsWith('pH 11.5'))||'').slice(0,80));
 click('[data-a="qcCtlEdit"][data-v="Yumizen C560|FENT 1"]');await sleep(20);type('[data-b="rej.code"]','FEN-L1');click('[data-a="qcCtlSave"]');await sleep(300);
 console.log('Q4 code saved on every analyte of that control:',[...new Set(M().store.qc_materials.map(r=>r.data).filter(m=>m.code==='FEN-L1').map(m=>m.control+' '+m.analyte))].join(','),'| list shows it:',txt().includes('FEN-L1'));
 click('[data-a="setQcTab"][data-val="sets"]');await sleep(40);click('[data-a="qcSetSuggest"]');await sleep(400);
 const sets=M().store.qms_records.map(r=>r.data).filter(r=>r.kind==='qcset');
 console.log('Q5 suggested sets:',sets.map(x=>`${x.name} (${x.controls.length})`).join(' | '));
 click('[data-a="qcSetEdit"]:not([data-id])');await sleep(20);click('[data-a="qcSetInst"][data-val="Yumizen C560"]');await sleep(20);type('[data-b="rej.qset.name"]','Yumizen - Fentanyl only');click('[data-a="qcSetCtl"][data-val="FENT 1"]');click('[data-a="qcSetCtl"][data-val="FENT 3"]');click('[data-a="qcSetSave"]');await sleep(300);
 console.log('Q6 custom set:',JSON.stringify(M().store.qms_records.map(r=>r.data).filter(r=>r.kind==='qcset'&&r.name.includes('Fentanyl')).map(x=>[x.instrument,x.controls])));
 click('[data-a="setQcTab"][data-val="reports"]');await sleep(40);
 const ys=sets.find(x=>x.name.startsWith('Yumizen'));const sel=q('[data-b="qs.rpSet"]');sel.value=ys.id;sel.dispatchEvent(new w.Event('change',{bubbles:true}));
 const per=q('[data-b="qs.rpPer"]');per.value='365';per.dispatchEvent(new w.Event('change',{bubbles:true}));
 click('[data-a="qcSetReport"]');await sleep(800);
 dump('qc_set_report.html');const rp=mtxt();console.log('Q7 set report:',(rp.match(/QC report: Yumizen C560 - Urine drug screen/)||['none'])[0],'|',(rp.match(/\d+ controls?, \d+ analytes?, \d+ runs?: \d+ rejects?, \d+ warnings?/)||['none'])[0],'| charts',q('#modal-root').querySelectorAll('svg').length,'| pH 11.5 reject listed',/pH 11\.5\s*pH-U\s*11\.4/.test(rp));
 q('#modal-root').innerHTML='';
 let blob=null;w.URL.createObjectURL=b=>{blob=b;return 'blob:x'};w.URL.revokeObjectURL=()=>{};click('[data-a="qcSetReportCsv"]');await sleep(300);
 const csv=blob?await new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsText(blob)}):'';
 console.log('Q8 CSV:',csv.split('\r\n').length-4,'analyte rows | header',csv.split('\r\n')[3]);
 console.log('errors',errs,M().errors);process.exit(0)
})();
