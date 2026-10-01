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
 const st=M().store,now=Date.now(),sep15=MID_LAST_MONTH;
 const lab=st.settings.find(x=>x.key==='lab');lab.data={...(lab.data||{}),npi:'1234567893',taxId:'86-1234567',address:'1830 S. Alma School Rd Ste 134, Mesa, AZ 85210',x12Submitter:'FBG123',x12Receiver:'CLEARHOUSE',x12ReceiverName:'Office Ally'};
 const c1=st.clinics.find(c=>c.id==='c1001');c1.data.providers.forEach(p=>p.npi='1234567893');c1.data.clientPricesText='80307=25';c1.data.address='2 Park Plaza';c1.data.city='Irvine';c1.data.state='CA';c1.data.zip='92614';
 st.patients.push({id:'ptB',clinic_id:'c1001',data:{id:'ptB',clinicId:'c1001',mrn:'B1',first:'Bill',last:'Payer',dob:'1975-05-05',sex:'M',phone:'4805550101',email:'',address:'5 Main St',city:'Mesa',state:'AZ',zip:'85201',ins:{type:'Commercial',payer:'Aetna',member:'W123456789',group:'G55',payerId:'60054'}}});
 const mkO=(id,acc,bt,status,col)=>({id,clinic_id:'c1001',data:{id,accession:acc,clinicId:'c1001',patientId:'ptB',providerId:'p1',tests:['UDS'],confirm:[],meds:[],icd:['Z79.891','F11.20'],billType:bt,collectedAt:col,createdAt:col,status,consents:{},history:[{s:'Ordered',at:col,by:'x'}],results:{UDS:{}},releasedAt:status==='Released'?col+864e5:null}});
 st.orders.push(mkO('oCB','FBG260915-0001','Client bill','Released',sep15));st.orders.push(mkO('oCB2','FBG260916-0002','Client bill','Released',sep15+864e5));
 st.orders.push(mkO('oINS','FBG260917-0003','Commercial insurance','Released',sep15+2*864e5));
 st.claims.push({id:'CLM-FBG260917-0003',data:{id:'CLM-FBG260917-0003',orderId:'oINS',patientId:'ptB',lines:[{code:'UDS',cpt:'80307',mod:'',units:1,billTo:'Payer'}],createdAt:now,status:'Created'}});
 st.orders.push(mkO('oNEW','FBG261001-0009','Commercial insurance','Ordered',now-36e5));st.orders.push(mkO('oREJ','FBG261001-0010','Commercial insurance','Ordered',now-36e5));
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const mt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 let saved=[];w.URL.createObjectURL=b=>{saved.push(b);return 'blob:x'};w.URL.revokeObjectURL=()=>{};const lastBlob=()=>new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsText(saved[saved.length-1])});
 w.prompt=()=> 'CHK-1001';w.confirm=()=>true;
 // ---- clinic requests a pickup
 await login('clinic@pc.com','clinicpass123');
 click('[data-a="go"][data-v="pickups"]');await sleep(20);type('[data-b="pkf.count"]','3');click('[data-a="pkType"][data-val="Urine"]');await sleep(5);type('[data-b="pkf.notes"]','Back door, ring bell');click('[data-a="pkSubmit"]');await sleep(800);
 const pk=st.pickups[0];console.log('K1 clinic pickup:',pk&&pk.data.number,pk&&pk.data.status,pk&&pk.data.count,JSON.stringify(pk&&pk.data.types),'| lab note:',st.notes.some(n=>n.data.title==='Pickup requested'));
 click('[data-a="logout"]');await sleep(500);
 // ---- lab dispatch, pickup, receipt
 await login('lab@fbg.com','labpassword12');
 click('[data-a="go"][data-v="pickups"]');await sleep(300);
 click(`[data-a="pkAssign"][data-id="${pk.id}"]`);await sleep(10);type('#modal-root [data-b="rej.collector"]','Carl Collector');click('#modal-root [data-a="pkAssignSave"]');await sleep(10);
 click(`[data-a="pkPicked"][data-id="${pk.id}"]`);await sleep(10);type('#modal-root [data-b="rej.count"]','3');click('#modal-root [data-a="pkPickedSave"]');await sleep(800);
 console.log('K2 dispatch:',st.pickups[0].data.status,st.pickups[0].data.collector,'| custody steps:',st.pickups[0].data.history.map(h=>h.s).join(' > '));
 click('[data-a="go"][data-v="queue"]');await sleep(20);w.document.querySelector('[data-a="openOrder"][data-id="oNEW"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);click('[data-a="receive"][data-id="oNEW"]');await sleep(20);
 console.log('K3 receipt check:',/Labeled correctly/.test(mt()),'| pickup offered:',/PU-/.test(mt()));click('#modal-root [data-a="receiveConfirm"]');await sleep(800);
 const on=st.orders.find(o=>o.id==='oNEW').data;console.log('K4 received:',on.status,'| receipt:',JSON.stringify(on.receipt&&{c:on.receipt.condition,p:!!on.receipt.pickup}),'| pickup now:',st.pickups[0].data.status,'| history:',on.history.slice(-1)[0].note.slice(0,90));
 // ---- rejection with recollection
 click('[data-a="go"][data-v="queue"]');await sleep(20);w.document.querySelector('[data-a="openOrder"][data-id="oNEW"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 click('[data-a="go"][data-v="queue"]');await sleep(10);w.document.querySelector('[data-a="openOrder"][data-id="oREJ"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);click('[data-a="receive"][data-id="oREJ"]');await sleep(10);click('#modal-root [data-a="receiveReject"]');await sleep(10);const rs=q('#modal-root [data-b="rej.reason"]');rs.value='Temperature out of range';rs.dispatchEvent(new w.Event('change',{bubbles:true}));type('#modal-root [data-b="rej.detail"]','Arrived warm, 31 C');click('#modal-root [data-a="confirmReject"]');await sleep(800);
 const rn=st.notes.filter(n=>n.data.orderId==='oREJ').slice(-1)[0];console.log('J1 rejected:',st.orders.find(o=>o.id==='oREJ').data.status,'| clinic note:',rn&&rn.data.title,'|',rn&&rn.data.body.slice(0,110));
 // ---- reports
 click('[data-a="go"][data-v="reports"]');await sleep(40);console.log('R1 reports:',/Orders by month/.test(txt()),'| bars:',w.document.querySelectorAll('svg[aria-label="Orders by month"] rect').length,'| sections:',['Clinics','Test mix','Payer mix','Screen positivity','Turnaround by month'].map(k=>txt().includes(k)).join(','));
 click('[data-a="rpExport"]');await sleep(100);console.log('R2 CSV first line:',(await lastBlob()).split('\r\n')[0]);
 // ---- quality indicators show rejection reasons
 click('[data-a="go"][data-v="qms"]');await sleep(200);click('[data-a="qmsTab"][data-val="quality"]');await sleep(20);console.log('Q1 rejection reasons:',(txt().replace(/\s+/g,' ').match(/Rejections by reason.{0,80}/)||['none'])[0]);
 // ---- client invoices
 click('[data-a="go"][data-v="billing"]');await sleep(30);click('[data-a="setUi"][data-k="btab"][data-val="invoices"]');await sleep(20);
 console.log('V1 candidates:',(txt().replace(/\s+/g,' ').match(/Create \d+ invoices?/)||['none'])[0]);click('[data-a="invCreate"]');await sleep(800);
 const inv=st.invoices[0];console.log('V2 invoice:',inv&&inv.data.id,inv&&inv.data.lines.length,'lines total',inv&&inv.data.total,'| orders tagged:',st.orders.filter(o=>o.data.invoiceId).length);
 click(`[data-a="invView"][data-id="${inv.data.id}"]`);await sleep(20);console.log('V3 invoice doc:',/Total due/.test(mt()),/Bill to/.test(mt()));q('#modal-root').innerHTML='';
 click(`[data-a="invPaid"][data-id="${inv.data.id}"]`);await sleep(800);console.log('V4 paid:',st.invoices[0].data.status,st.invoices[0].data.payRef);
 // ---- 837P
 click('[data-a="setUi"][data-k="btab"][data-val="hold"]');await sleep(20);console.log('X-1 hold:',txt().replace(/\s+/g,' ').match(/CLM-FBG260917-0003.{0,260}/)?.[0]);click('[data-a="setUi"][data-k="btab"][data-val="ready"]');await sleep(20);console.log('X0 ready claims:',(txt().match(/Ready \(\d+\)/)||[''])[0],'| on hold reason:',(txt().replace(/\s+/g,' ').match(/On hold[^]{0,0}/)||[''])[0]);
 click('[data-a="selectAllReady"]');await sleep(10);const sel=q('[data-b="ui.bfmt"]');sel.value='837';sel.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(10);click('[data-a="exportClaims"]');await sleep(300);
 const x=await lastBlob();const ids=x.split('~\n').map(s=>s.split('*')[0]);console.log('X1 837 segments:',ids.join(','));
 console.log('X2 key segments:',x.split('~\n').filter(s=>/^(ISA|CLM|SV1|NM1\*PR|HI|N4)/.test(s)).join(' | ').slice(0,400));
 const seCount=+x.split('~\n').find(s=>s.startsWith('SE*')).split('*')[1],stToSe=x.split('~\n').filter((s,i,a)=>i>=a.findIndex(z=>z.startsWith('ST*'))&&i<=a.findIndex(z=>z.startsWith('SE*'))).length;console.log('X3 SE count correct:',seCount===stToSe,seCount,stToSe,'| ISA length:',x.split('~\n')[0].length);
 click('[data-a="logout"]');await sleep(500);
 await login('clinic@pc.com','clinicpass123');console.log('C1 clinic nav:',[...w.document.querySelectorAll('.nav button')].map(b=>b.textContent.replace(/\d+$/,'').trim()).join(', '));
 console.log('errors',errs,M().errors);process.exit(0)
})();
