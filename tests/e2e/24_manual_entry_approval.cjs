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
 {const L=M().store.settings.find(x=>x.key==='lab').data;L.address='1830 S. Alma School Rd Ste 134, Mesa, AZ 85210';L.director='Dr. Guihua Cao';}
 const st=acc=>M().store.orders.find(o=>o.data.accession===acc).data;
 st('50018186').status='Released';st('50018188').status='Ordered';
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(700)};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const R=acc=>st(acc).results;
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const row=name=>[...w.document.querySelectorAll('.re-test tr')].find(tr=>{const n=tr.querySelector('.nm');return n&&n.textContent.trim().startsWith(name)});
 const typeIn=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}))};
 await login('luna@fbg.com','lunapassword12');
 // J1-J3: Jaime's C560 file exactly as exported (columns A-M), with specific reasons for samples that can't post
 click('[data-a="go"][data-v="instruments"]');await sleep(20);
 await upload('c560',FIX('CSV_Screening_Tox_Patient_Samples_1.xlsx'),'CSV_Screening_Tox_Patient_Samples_1.xlsx');
 console.log('J1 summary:',mtxt().slice(0,900));
 console.log('J2 posted 50018185 OXY / 50018189 validity:',JSON.stringify((R('50018185').UDS||{}).Oxycodone),JSON.stringify((R('50018189').UDS||{})['Specimen validity']));
 q('#modal-root').innerHTML='';
 // J3: the same layout saved with semicolons (Excel in some regions)
 const semi=['Type;Sample ID;Bar Code;Sample Type;Ordering Date;Chemistry;Result;Response;Replicates;Unit;Flag;Ref Range;Run Date',
  'R;1;50018190U1;Urine;10/27/2025;OXY;"1234,5";100;1;ng/mL;;;10/27/2025 12:33','R;2;50018190U1;Urine;10/27/2025;THC;3.1;100;1;ng/mL;;;10/27/2025 12:33','R;3;50018190U1;Urine;10/27/2025;CREAT-U;88;100;1;mg/dL;;;10/27/2025 12:33'].join('\r\n');
 fs.writeFileSync(OUT('semi.csv'),semi);await upload('c560',OUT('semi.csv'),'semi.csv');
 console.log('J3 semicolon file:',mtxt().slice(0,200),'| OXY',JSON.stringify((R('50018190').UDS||{}).Oxycodone),'| THC',JSON.stringify((R('50018190').UDS||{})['Cannabinoids (THC)']));
 q('#modal-root').innerHTML='';
 // M1-M4: manual screen entry with measured values and automatic validity
 nav('openOrder',null,'ox50018184');await sleep(30);
 console.log('M1 received order offers manual entry:',!!q('[data-a="manualEntry"]'));
 click('[data-a="manualEntry"]');await sleep(30);
 console.log('M2 entry page:',(txt().match(/Enter results/)||['no'])[0],'| status',st('50018184').status);
 const ox=row('Oxycodone');typeIn(ox.querySelector('input[data-b$=".c"]'),'150');await sleep(10);
 const bu=row('Buprenorphine');typeIn(bu.querySelector('input[data-b$=".c"]'),'2');await sleep(10);
 typeIn(row('Urine creatinine').querySelector('input'),'12');typeIn(row('Urine specific gravity').querySelector('input'),'1.002');typeIn(row('Urine pH').querySelector('input'),'6');await sleep(10);
 const re=()=>row('Oxycodone').closest('.re-test').textContent.replace(/\s+/g,' ');
 console.log('M3 auto results: OXY',row('Oxycodone').querySelector('select').value,'| BUP',row('Buprenorphine').querySelector('select').value,'| validity',row('Specimen validity').querySelector('select').value,'| note',/Entered manually by/.test(re()));
 click('[data-a="fillNormals"]');await sleep(10);click('[data-a="verifyResults"]');await sleep(1500);
 const o84=st('50018184');console.log('M4 verified:',!!o84.verified,o84.verified&&o84.verified.by,o84.verified&&/^[A-Z]{1,3}-[A-Z0-9]{2,4}$/.test(o84.verified.code),'| OXY',JSON.stringify(o84.results.UDS.Oxycodone&&{v:o84.results.UDS.Oxycodone.v,c:o84.results.UDS.Oxycodone.c,src:o84.results.UDS.Oxycodone.src}),'| history',o84.history.slice(-1)[0].note);
 // D1-D2: manual definitive entry, one box per analyte
 nav('openOrder',null,'ox60000004');await sleep(30);click('[data-a="manualEntry"]');await sleep(30);
 click(`[data-a="toggleConc"][data-v="${row('Oxycodone').querySelector('[data-a="toggleConc"]').dataset.v}"]`);await sleep(20);
 const cin=[...row('Oxycodone').querySelectorAll('.conc-grid label')];console.log('D1 oxycodone components:',cin.map(l=>l.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 typeIn(cin[0].querySelector('input'),'1240');await sleep(10);
 click(`[data-a="toggleConc"][data-v="${row('Alprazolam').querySelector('[data-a="toggleConc"]').dataset.v}"]`);await sleep(20);
 const al=[...row('Alprazolam').querySelectorAll('.conc-grid input')];console.log('D1b alprazolam components:',[...row('Alprazolam').querySelectorAll('.conc-grid label')].map(l=>l.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 typeIn(al[0],'3');await sleep(10);if(al[1])typeIn(row('Alprazolam').querySelectorAll('.conc-grid input')[1],'99999');await sleep(10);
 const ro=w.__S?null:null;
 click('[data-a="saveResults"]');await sleep(1500);
 console.log('D2 stored:',JSON.stringify(st('60000004').results.CONF.Oxycodone,(k,v)=>k==='at'?undefined:v),'|',JSON.stringify(st('60000004').results.CONF.Alprazolam,(k,v)=>k==='at'?undefined:v));
 click('[data-a="logout"]');await sleep(600);
 // A1-A4: a different person reports out; the report names the approver with ID and time
 await login('rita@fbg.com','ritapassword12');
 nav('openOrder',null,'ox50018184');await sleep(30);
 console.log('A1 order page:',(txt().replace(/\s+/g,' ').match(/Verified by[^.]{0,80}/)||['none'])[0]);
 nav('go','entry','ox50018184');await sleep(30);click('[data-a="release"]');await sleep(300);q('#esig-pw').value='ritapassword12';click('#modal-root [data-a="esigRelease"]');await sleep(1400);
 console.log('A2 status:',st('50018184').status,'| released by',st('50018184').released&&st('50018184').released.by);
 click('[data-a="report"]');await sleep(60);
 const rp=q('#modal-root .rp').textContent.replace(/\s+/g,' ');
 console.log('A3 header:',(rp.match(/First Bio Genetics.{0,170}/)||['none'])[0]);
 console.log('A4 approval:',(rp.match(/Results reviewed and approved by.{0,140}?(?= Flags:|Electronically signed)/)||['none'])[0]);
 console.log('A5 footer repeats director:',/Laboratory Director:/.test(rp),'| e-signature:',/Electronically signed by Rita Reporter/.test(rp));
 let bs=0,bb=null;w.URL.createObjectURL=b=>{bs=b.size;bb=b;return 'blob:x'};w.URL.revokeObjectURL=()=>{};click('#modal-root [data-a="dlReport"]');await sleep(2500);console.log('A6 PDF built:',bs>1000);if(bb){const fr=new w.FileReader();const ab=await new Promise(r=>{fr.onload=()=>r(fr.result);fr.readAsArrayBuffer(bb)});fs.writeFileSync(OUT('report17.pdf'),Buffer.from(ab))}
 console.log('errors',errs,M().errors);process.exit(0)
})();
