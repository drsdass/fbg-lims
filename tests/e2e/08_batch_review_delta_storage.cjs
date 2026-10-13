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
 // seed: one patient with a released chemistry order (K 4.0) and an in-process one
 const st=M().store,now=Date.now();
 st.patients.push({id:'ptH',clinic_id:'c1001',data:{id:'ptH',clinicId:'c1001',mrn:'H1',first:'Hal',last:'History',dob:'1970-01-01',sex:'M',phone:'',email:'',address:'',city:'',state:'AZ',zip:'',ins:{type:'Self-pay',payer:'',member:'',group:''}}});
 const mk=(id,acc,days,status,K,Na)=>({id,clinic_id:'c1001',data:{id,accession:acc,clinicId:'c1001',patientId:'ptH',providerId:'p1',tests:['CMP'],confirm:[],meds:[],icd:['Z00.00'],collectedAt:now-days*864e5,createdAt:now-days*864e5,status,consents:{},history:[{s:'Ordered',at:now-days*864e5,by:'x'},{s:'Received',at:now-days*864e5+36e5,by:'x'}],results:{CMP:{Potassium:{v:String(K)},Sodium:{v:String(Na)}}},releasedAt:status==='Released'?now-days*864e5+72e5:null}});
 st.orders.push(mk('oH1','FBGH-1',3,'Released',4.0,140));st.orders.push(mk('oH2','FBGH-2',0,'In Process',5.6,141));
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const mt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 let lastConfirm='';w.confirm=m=>{lastConfirm=m;return true};
 await login('luna@fbg.com','lunapassword12');
 console.log('N0 nav has storage:',[...w.document.querySelectorAll('.nav button')].some(b=>/Specimen storage/.test(b.textContent)));
 // ---- batch review
 click('[data-a="go"][data-v="instruments"]');await sleep(20);click('[data-a="setUi"][data-k="itab"][data-val="sciex"]');await sleep(20);
 await upload('sciex',FIX('batch_review.csv'),'batch_review.csv');
 console.log('B1 summary:',(mt().match(/Batch review[^]{0,420}/)||['none'])[0].slice(0,420));
 const o3=st.orders.find(o=>o.data.accession==='60000003')||st.orders.find(o=>/60000003/.test(JSON.stringify(o.data.samples||'')));
 const id3=(S=>S)(o3&&o3.id);console.log('B2 order 60000003 review:',o3?JSON.stringify(Object.entries(o3.data.results[Object.keys(o3.data.results).find(k=>k!=='UDS')]||{}).filter(([k,v])=>v.review&&v.review.length).map(([k,v])=>k+': '+v.review.join('; '))):'not found');
 const o4=st.orders.find(o=>o.data.accession==='60000004');console.log('B3 order 60000004 IS flags:',o4?Object.values(o4.data.results.CONF||{}).filter(v=>v.review&&v.review.length).length:'n/a');
 q('#modal-root').innerHTML='';
 // entry page shows the batch review note; verify asks for acknowledgement
 if(o3){click('[data-a="go"][data-v="queue"]');await sleep(20);const b=w.document.querySelector(`[data-a="openOrder"][data-id="${o3.id}"]`);if(b){b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);click('[data-a="go"][data-v="entry"]');await sleep(30);
  console.log('B4 entry shows note:',/Batch review: Amphetamine: ion ratio/.test(txt()));click('[data-a="verifyResults"]');await sleep(700);console.log('B5 verify asked to confirm:',lastConfirm.slice(0,160).replace(/\n/g,' | '));
  console.log('B6 verified:',!!st.orders.find(o=>o.id===o3.id).data.verified,'| history note:',(st.orders.find(o=>o.id===o3.id).data.history.find(h=>/Reviewed before verify/.test(h.note||''))||{}).note?.slice(0,120),'| toasts:',toasts().slice(-90))}}
 // ---- delta check
 lastConfirm='';click('[data-a="go"][data-v="queue"]');await sleep(20);const bh=w.document.querySelector('[data-a="openOrder"][data-id="oH2"]');bh.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);click('[data-a="go"][data-v="entry"]');await sleep(30);
 console.log('D1 previous shown:',/Previous 4 on/.test(txt()),'| delta flag:',!!w.document.querySelector('.flag.A[title^="Delta"]'));
 console.log('D2 review items text:',(txt().match(/Previous 140 on [A-Z][a-z]{2} \d{1,2}, \d{4}/)||[''])[0].trim());
 // ---- patient history
 click('[data-a="go"][data-v="queue"]');await sleep(20);w.document.querySelector('[data-a="openOrder"][data-id="oH2"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);const pb=w.document.querySelector('[data-a="openPatient"][data-id="ptH"]');pb.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 console.log('H1 result history:',/Result history/.test(txt()),'| potassium row:',(txt().replace(/\s+/g,' ').match(/Potassium[^A-Z]{0,30}/)||[''])[0]);
 // ---- storage
 click('[data-a="go"][data-v="storage"]');await sleep(30);console.log('S1 needs storing:',(txt().match(/Needs storing \(\d+\)/)||[''])[0]);
 const sb2=w.document.querySelector('[data-a="sgStore"]');const sid=sb2.dataset.id;sb2.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 type('#modal-root [data-b="stf.unit"]','Specimen fridge 1');type('#modal-root [data-b="stf.rack"]','Rack A');type('#modal-root [data-b="stf.position"]','B4');const def=q('#modal-root [data-b="stf.retainUntil"]').value;type('#modal-root [data-b="stf.retainUntil"]',REL(-30));click('#modal-root [data-a="sgSave"]');await sleep(800);
 const so=st.orders.find(o=>o.id===sid).data.storage;console.log('S2 stored:',so.unit,so.rack,so.position,'| default keep-until was',def);
 click('[data-a="sgTab"][data-val="due"]');await sleep(10);click(`[data-a="sgSel"][data-id="${sid}"]`);await sleep(5);click('[data-a="sgDispose"]');await sleep(10);click('#modal-root [data-a="sgDisposeConfirm"]');await sleep(800);
 console.log('S3 disposed:',JSON.stringify((({disposalMethod,disposedBy})=>({disposalMethod,disposedBy}))(st.orders.find(o=>o.id===sid).data.storage)));
 // ---- lab settings show the new sections
 click('[data-a="logout"]');await sleep(500);await login('lab@fbg.com','labpassword12');click('[data-a="go"][data-v="labset"]');await sleep(30);
 console.log('L1 settings sections:',['Specimen retention','LC-MS/MS batch review','Delta checks'].map(k=>txt().includes(k)).join(','),'| delta rows:',w.document.querySelectorAll('[data-b^="labf.deltaRules."][data-b$=".analyte"]').length);
 type('[data-b="labf.deltaRules.1.limit"]','0.8');click('[data-a="saveLab"]');await sleep(800);const lr=st.settings.find(x=>x.key==='lab');console.log('L2 saved K limit:',JSON.stringify((lr.value||lr.data).deltaRules[1]));
 // add-on test
 const rel=st.orders.find(o=>o.data.status==='Released'&&o.id==='oH1');click('[data-a="go"][data-v="queue"]');await sleep(10);
 w.eval(`void 0`);
 console.log('errors',errs,M().errors);process.exit(0)
})();
