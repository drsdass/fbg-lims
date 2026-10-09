const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.eval(fs.readFileSync(BUNDLE,'utf8'));
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
 const dump=n=>fs.writeFileSync(OUT(n),'<html><head><meta charset="utf-8"><style>'+fs.readFileSync(ROOT('src/styles.css'),'utf8')+'</style></head><body>'+q('#app').outerHTML+q('#modal-root').outerHTML+'</body></html>');
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const ck=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.checked=true;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 let blobs=[];w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 const blobText=b=>new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsText(b)});
 M().store.supply_orders.push({id:'sup1',clinic_id:'c1001',updated_at:new Date().toISOString(),created_at:new Date().toISOString(),data:{id:'sup1',number:'SUP-261008-AAA',clinicId:'c1001',items:[{name:'Urine collection kit',qty:25},{name:'Specimen bags',qty:50}],shipTo:{recipient:'Maria',address:'1 Main',city:'Irvine',state:'CA',zip:'92618',phone:''},urgency:'Routine',status:'New',createdAt:Date.now()-2*864e5,by:'Maria Lopez'}});
 await login('lab@fbg.com','labpassword12');
 // S1: SOF for every clinic without an agreement
 click('[data-a="go"][data-v="clinics"]');await sleep(20);
 console.log('S1 bulk SOF button:',!!q('[data-a="sofAll"]'));click('[data-a="sofAll"]');await sleep(1200);
 const c1=M().store.clinics.find(c=>c.id==='c1001').data;console.log('S2 Pacific Coast agreement:',JSON.stringify(c1.agreement&&{onFile:c1.agreement.onFile,by:c1.agreement.recordedBy}));
 // C1-C3: register Oratek from the lab profile: the login is created on the spot
 click('[data-a="addClinic"]');await sleep(20);
 console.log('C1 login section:',mtxt().includes('Clinic login'),!!q('#modal-root [data-b="clf.login.on"]')&&q('#modal-root [data-b="clf.login.on"]').checked);
 for(const [k,v] of [['name','Oratek Diagnostics'],['npi','1231231234'],['phone','480-555-0100'],['address','9 Oak St'],['city','Mesa'],['zip','85201'],['providers.0.name','Dr Ora Kim'],['providers.0.cred','MD'],['providers.0.npi','9991112223'],['notify.criticalPhone','480-555-0199'],['contactName','Julie Park'],['sof.signer','Julie Park']])type(`#modal-root [data-b="clf.${k}"]`,v);
 ck('#modal-root [data-b="clf.settings.supplies"]');ck('#modal-root [data-b="clf.settings.vialLabels"]');ck('#modal-root [data-b="clf.settings.analytics"]');ck('#modal-root [data-b="clf.approveNow"]');
 click('[data-a="saveClinicForm"]');await sleep(900);
 const ora=M().store.clinics.find(c=>c.data.name==='Oratek Diagnostics');
 console.log('C2 clinic:',ora&&ora.data.status,JSON.stringify(ora&&ora.data.settings),'| SOF',!!(ora&&ora.data.agreement&&ora.data.agreement.onFile));
 const lp=M().store.profiles.find(p=>p.clinic_id===(ora&&ora.id));console.log('C3 login:',lp&&lp.email,lp&&lp.name,lp&&lp.role,'| modal:',mtxt().slice(0,140));
 q('#modal-root').innerHTML='';
 // O1-O4: lab enters an Oratek order: vial barcode on the order, SOF covers the provider, photo optional
 nav('newReq');await sleep(20);type('[data-b="draft.clinicId"]',ora.id);await sleep(20);
 click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Vial'],['last','Patient'],['dob','1970-03-03']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','F');type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);
 click('[data-a="ordNext"]');await sleep(20);
 console.log('O1 vial barcode field:',!!q('[data-b="draft.vialBarcode"]'));type('[data-b="draft.vialBarcode"]','ORA-55501');
 click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="only"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(20);
 dump('order_sof.html');console.log('O2 step 3: photo optional',!!q('input[data-reqscan]'),'| SOF banner',/Signature on file \(SOF\)/.test(txt()),'| provider checkbox',!!q('[data-b="draft.provPaper"]'));
 click('[data-a="ordNext"]');await sleep(20);click('[data-a="ordNext"]');await sleep(700);
 const oo=M().store.orders.find(o=>o.clinic_id===ora.id);console.log('O3 order:',oo&&oo.data.accession,oo&&oo.data.vialBarcode,'| provider consent',JSON.stringify(oo&&oo.data.consents.provider&&{sof:oo.data.consents.provider.sof}),'| status',oo&&oo.data.status);
 console.log('O4 order page shows vial:',/Vial barcode ORA-55501/.test(txt().replace(/\s+/g,' ')),'| SOF wording',txt().includes('Signature on file (SOF)'));
 // V1-V4: lab links/changes the vial barcode, finds the order by it, and instrument files match it
 click('[data-a="linkVialAsk"]');await sleep(20);type('[data-b="rej.vial"]','ORA-55502');click('[data-a="linkVialSave"]');await sleep(400);
 const od=()=>M().store.orders.find(o=>o.clinic_id===ora.id).data;
 console.log('V1 relinked:',od().vialBarcode,'|',od().history.slice(-1)[0].note);
 type('[data-b="ui.gq"]','ora-55502');await sleep(30);console.log('V2 search by vial:',txt().includes(od().accession));type('[data-b="ui.gq"]','');await sleep(20);
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);
 const csv=['Type,Sample ID,Bar Code,Sample Type,Ordering Date,Chemistry,Result,Response,Replicates,Unit,Flag,Ref Range,Run Date','R,1,ORA-55502,Urine,10/8/2026,OXY,250,1,1,ng/mL,,,10/8/2026 9:00'].join('\n');
 type('[data-b="ui.paste_c560"]',csv);click('[data-a="doImport"][data-k="c560"]');await sleep(900);
 console.log('V3 C560 row matched by vial barcode:',mtxt().slice(0,120),'| OXY',JSON.stringify((od().results.UDS||{}).Oxycodone));
 q('#modal-root').innerHTML='';
 // T1-T3: supply shipped with carrier and tracking; the clinic sees a tracking link
 click('[data-a="logout"]');await sleep(600);await login('lab@fbg.com','labpassword12');click('[data-a="go"][data-v="supplies"]');await sleep(30);
 click('[data-a="supShip"][data-id="sup1"]');await sleep(20);console.log('T1 ship modal:',mtxt().slice(0,120));
 type('[data-b="rej.carrier"]','UPS');type('[data-b="rej.tracking"]','1Z999AA10123456784');click('[data-a="supShipSave"]');await sleep(400);
 const su=M().store.supply_orders.find(x=>x.id==='sup1').data;console.log('T2 shipped:',su.status,su.carrier,su.tracking,'| edit button',!!q('[data-a="supShip"][data-id="sup1"]'));
 // A1-A3: analytics for the lab, with CSV download
 click('[data-a="go"][data-v="analytics"]');await sleep(60);
 console.log('A1 lab analytics:',(txt().replace(/\s+/g,' ').match(/Kit volume, turnaround[^.]*\./)||['none'])[0],'| sections',['Normal vs abnormal findings','Turnaround','Kits and supplies sent'].map(s=>txt().includes(s)).join(','));
 console.log('A2 supplies row:',(txt().replace(/\s+/g,' ').match(/Kits and supplies sent.{0,200}/)||['none'])[0]);
 dump('analytics.html');blobs=[];click('[data-a="anExport"]');await sleep(100);const csvOut=blobs.length?await blobText(blobs[0]):'';
 console.log('A3 CSV sections:',['Normal vs abnormal findings','Turnaround','Kits and supplies sent','Orders'].map(s=>csvOut.includes('\n'+s)).join(','),'| lines',csvOut.split('\r\n').length>15);
 // E1: enable analytics for Pacific Coast from Clinics > Edit
 click('[data-a="go"][data-v="clinics"]');await sleep(20);click('[data-a="editClinic"][data-id="c1001"]');await sleep(20);ck('#modal-root [data-b="clf.settings.analytics"]');
 for(const [k,v] of [['npi','1639201847'],['phone','949'],['address','1 Main'],['city','Irvine'],['state','CA'],['zip','92618']])if(!q(`#modal-root [data-b="clf.${k}"]`).value)type(`#modal-root [data-b="clf.${k}"]`,v);
 click('[data-a="saveClinicForm"]');await sleep(400);console.log('E1 analytics on:',M().store.clinics.find(c=>c.id==='c1001').data.settings.analytics,'|',toasts().slice(-40));
 click('[data-a="logout"]');await sleep(600);
 // K1-K4: the clinic user: tracking link, analytics for their own clinic, optional photo on their orders
 await login('clinic@pc.com','clinicpass123');
 click('[data-a="go"][data-v="supplies"]');await sleep(30);const a=[...w.document.querySelectorAll('a')].find(x=>x.textContent.includes('1Z999AA10123456784'));
 dump('clinic_supplies.html');console.log('K1 clinic tracking link:',a&&a.getAttribute('href'));
 console.log('K2 clinic analytics nav:',!!q('[data-a="go"][data-v="analytics"]'));click('[data-a="go"][data-v="analytics"]');await sleep(60);
 console.log('K3 clinic analytics scoped:',txt().includes('for Pacific Coast Pain'),'| no clinic filter',!q('[data-b="an.clinic"]'),'| Oratek hidden',!txt().includes('Oratek'));
 click('[data-a="go"][data-v="order-new"]');await sleep(20);
 const pick=q('[data-a="draftPick"]');if(pick){pick.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10)}else{click('[data-a="draftNewPt"]');for(const [k,v] of [['first','Clin'],['last','Ic'],['dob','1980-01-01']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','F');type('[data-b="pt.ins.type"]','Self-pay')}
 click('[data-a="ordNext"]');await sleep(20);click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="only"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(20);
 console.log('K4 clinic order step 3: photo option',!!q('input[data-reqscan]'),'| SOF covers provider',/Signature on file \(SOF\)/.test(txt()),'| signature pad for provider',!!q('canvas.sigc[data-k="provider"]'));
 console.log('errors',errs,M().errors);process.exit(0)
})();
