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
 const T=()=>txt().replace(/\s+/g,' ');
 // Peak Panel's account, one order that arrived through the interface (released, not yet collected) and one cancel request.
 M().store.clinics.push({id:'c2001',data:{id:'c2001',acct:'FBG-2001',name:'Peak Panel Laboratory',status:'active',settings:{ordering:true},providers:[{id:'pp1',name:'Lee Park',cred:'NP',npi:'1234567893'}],notify:{email:false,sms:false,fax:false},address:'1830 S. Alma School Rd',city:'Mesa',state:'AZ',zip:'85210'}});
 M().store.patients.push({id:'ptP',clinic_id:'c2001',data:{id:'ptP',clinicId:'c2001',mrn:'FBPX1',first:'Ana',last:'Ruiz',dob:'1985-04-12',sex:'F',ins:{type:'Commercial',payer:'Mercy Care',member:'A1',group:''}}});
 const now=Date.now();
 M().store.orders.push({id:'oxpp1',clinic_id:'c2001',updated_at:new Date().toISOString(),data:{id:'oxpp1',accession:'FBG261029-1101',clinicId:'c2001',patientId:'ptP',providerId:'pp1',tests:['UDS'],confirm:[],meds:[],icd:['Z79.891'],toxSpec:'Urine',screen:'only',status:'Received',source:'partner',partner:{lab:'c2001',orderId:'PP-1001',barcode:'PP1001U'},vialBarcode:'PP1001U',createdAt:now-36e5,collectedAt:now-72e5,history:[{s:'Ordered',at:now-36e5,by:'Peak Panel Laboratory interface'},{s:'Received',at:now-18e5,by:'x'}],results:{},consents:{patient:{method:'file',at:1},provider:{sof:true,at:1,attest:true}}}});
 M().store.orders.push({id:'oxpp2',clinic_id:'c2001',updated_at:new Date().toISOString(),data:{id:'oxpp2',accession:'FBG261029-1102',clinicId:'c2001',patientId:'ptP',providerId:'pp1',tests:['UDS'],confirm:[],meds:[],icd:['Z79.891'],toxSpec:'Urine',screen:'only',status:'Released',releasedAt:now-6e5,reportVersion:1,source:'partner',partner:{lab:'c2001',orderId:'PP-1000'},createdAt:now-864e5,collectedAt:now-864e5,history:[],results:{},consents:{}}});
 M().store.partner_log.push({id:'lg1',clinic_id:'c2001',kind:'order',partner_order_id:'PP-1001',order_id:'oxpp1',accession:'FBG261029-1101',ok:true,created_at:new Date(now-36e5).toISOString()},
  {id:'lg2',clinic_id:'c2001',kind:'order',partner_order_id:'PP-BAD',ok:false,note:'provider.npi must be the 10-digit NPI.',created_at:new Date(now-30e5).toISOString()},
  {id:'lg3',clinic_id:'c2001',kind:'cancel',partner_order_id:'PP-1001',order_id:'oxpp1',accession:'FBG261029-1101',ok:true,note:'Duplicate order',created_at:new Date(now-6e5).toISOString()});
 await login('lab@fbg.com','labpassword12');
 nav('go','partners');await sleep(100);
 console.log('P1 nav + empty page:',!!q('[data-v="partners"]'),'|',/Set up a partner lab/.test(T()));
 const sel=q('#pl-new');sel.value='c2001';click('[data-a="plEnable"]');await sleep(400);
 const cl=M().store.clinics.find(c=>c.id==='c2001').data;
 console.log('P2 interface on:',JSON.stringify({enabled:cl.partner.enabled,tests:cl.partner.catalog.tests.length>10,hasUDS:cl.partner.catalog.tests.includes('UDS'),urine:cl.partner.catalog.urine.length,oral:cl.partner.catalog.oral.length,by:cl.partner.updatedBy}));
 console.log('P3 stats:',(T().match(/\d+Orders received, last 30 days\d+Open orders\d+Reports waiting for pickup\d+Cancel requests to handle/)||['none'])[0]);
 console.log('P4 cancel banner:',/1 cancel request from Peak Panel Laboratory\..*FBG261029-1101 \(their PP-1001\) · Duplicate order · Received/.test(T()),'| refused shown',/1 refused in the last 7 days/.test(T()),'| log rows',(T().match(/Order refused|Order received|Cancel request/g)||[]).length);
 console.log('P5 endpoint:',q('input[readonly]').value);
 if(!w.crypto.subtle)Object.defineProperty(w.crypto,'subtle',{value:require('crypto').webcrypto.subtle});if(!w.TextEncoder)w.TextEncoder=TextEncoder;click('[data-a="plKey"]');await sleep(400);
 const dev=M().store.instrument_devices.find(d=>d.scope==='partner');
 console.log('P6 key:',JSON.stringify({name:dev&&dev.name,clinic:dev&&dev.clinic_id,hashed:dev&&/^[0-9a-f]{64}$/.test(dev.token_hash)}),'| shown once',/^[0-9a-f]{64}$/.test(q('#modal-root input[readonly]').value),'| endpoint in modal',!!q('#modal-root input[readonly]+*, #modal-root .field:nth-of-type(2) input'));
 click('#modal-root [data-a="closeModal"]');await sleep(150);
 type('[data-b="pl.newMap.from"]','PP-UTI');const ms=q('select[data-b="pl.newMap.to"]');ms.value='UTIABR';ms.dispatchEvent(new w.Event('change',{bubbles:true}));click('[data-a="plMap"]');await sleep(1500);
 console.log('P7 mapping:',JSON.stringify(M().store.clinics.find(c=>c.id==='c2001').data.partner.map),'| listed',/PP-UTI.*UTIABR/.test(T()));
 // P7b-P7d: toxicology profile mapping (a panel), results delivery to their webhook, Send now
 const addMap=async(code,target)=>{type('[data-b="pl.newMap.from"]',code);const s2=q('select[data-b="pl.newMap.to"]');s2.value=target;s2.dispatchEvent(new w.Event('change',{bubbles:true}));click('[data-a="plMap"]');await sleep(200)};
 await addMap('TOX_PANEL_URINE','UDS:reflex');await addMap('TOX_PANEL_URINE','CONF:Fentanyl');await sleep(1300);
 console.log('P7b panel mapping:',JSON.stringify(M().store.clinics.find(c=>c.id==='c2001').data.partner.map.TOX_PANEL_URINE),'| shown',/TOX_PANEL_URINEUrine screen with reflexUrine definitive: Fentanyl/.test(T()),'| options',[...q('select[data-b="pl.newMap.to"]').querySelectorAll('optgroup')].map(g=>g.label).join(' / '));
 click('[data-a="plMode"][data-val="push"]');await sleep(100);
 console.log('P7c push settings:',!!q('[data-b="pl.push.url"]'),'| default secret',q('[data-b="pl.push.tokenSecret"]').value);
 type('[data-b="pl.push.url"]','http://insecure.example');click('[data-a="plPushSave"]');await sleep(50);const httpRefused=/Enter their https:\/\/ results address/.test(toasts());
 type('[data-b="pl.push.url"]','https://peakpanel.example/api/lab-results');click('[data-a="plPushSave"]');await sleep(1300);
 console.log('P7d saved:',httpRefused,JSON.stringify(M().store.clinics.find(c=>c.id==='c2001').data.partner.push));
 click('[data-a="plPushNow"]');await sleep(600);
 console.log('P7e send now:',JSON.stringify(M().partnerCalls),'|',toasts().split(' | ').slice(-1)[0]);
 let blob=null;w.URL.createObjectURL=b=>{blob=b;return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 click('[data-a="plGuide"]');await sleep(200);
 const guide=blob?await new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsText(blob)}):'';
 console.log('P8 developer guide:',/^# First Bio Genetics order and results interface/.test(guide),'| for',/Developer guide for \*\*Peak Panel Laboratory\*\*/.test(guide),'| endpoint',guide.includes('POST https://abc.supabase.co/functions/v1/partner-api'),'| actions',['ping','catalog','order.create','order.status','order.cancel','results.pull','results.ack'].every(a=>guide.includes('"'+a+'"')));
 click('[data-a="plHandled"]');await sleep(200);
 console.log('P9 cancel handled:',!!M().store.partner_log.find(l=>l.id==='lg3').handled_at,'| banner gone',!/cancel request from/.test(T()));
 nav('go','queue');await sleep(60);type('[data-b="ui.qq"]','PP-1001');await sleep(60);
 console.log('Q1 queue finds their order number:',/FBG261029-1101/.test(T()),'| Interface tag',!!q('.tag[title*="their order PP-1001"]'));
 nav('openOrder',null,'oxpp1');await sleep(60);
 console.log('Q2 order page:',(T().match(/Partner orderPeak Panel Laboratory order PP-1001Tube PP1001U/)||['none'])[0]);
 click('[data-a="reject"]');await sleep(30);const rs=q('#modal-root [data-b="rej.reason"]');rs.value=rs.options[1].value;rs.dispatchEvent(new w.Event('change',{bubbles:true}));click('#modal-root [data-a="confirmReject"]');await sleep(1200);
 console.log('Q3 rejection sent to their system right away:',JSON.stringify(M().partnerCalls.slice(-1)));

 nav('go','partners');await sleep(100);q('[data-a="plOn"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(1500);
 console.log('P10 interface off:',M().store.clinics.find(c=>c.id==='c2001').data.partner.enabled);
 console.log('errors',errs,M().errors);process.exit(0)
})();
