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
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const row=name=>[...w.document.querySelectorAll('.re-test tr')].find(tr=>{const n=tr.querySelector('.nm');return n&&n.textContent.trim().startsWith(name)});
 const typeIn=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}))};
 const {PDFDocument}=require('pdf-lib');
 const mkPdf=async n=>{const d=await PDFDocument.create();for(let i=0;i<n;i++)d.addPage([300,300]);return Buffer.from(await d.save())};
 await login('lab@fbg.com','labpassword12');
 // Q1: Jaime's oral fluid QC target sheet
 click('[data-a="go"][data-v="qc"]');await sleep(300);
 await upload('qctargets',FIX('QC_OF_Parameters.xlsx'),'QC_OF Parameters.xlsx');
 console.log('Q1 oral fluid targets:',(mtxt().match(/\d+ targets? read[^.]*/)||['none'])[0],'| SCIEX controls',(mtxt().match(/SCIEX 4500\s*\d+\s*\d+/)||['none'])[0]);
 const of=M().store.qc_materials.map(x=>x.data).find(m=>m.control==='OFQC1A'&&m.analyte==='Fentanyl');console.log('Q2 OFQC1A fentanyl:',JSON.stringify(of&&{mean:of.mean,sd:of.sd,lot:of.lot,expires:of.expires,units:of.units}));
 q('#modal-root').innerHTML='';
 // P1-P4: signing PIN
 click('[data-a="changePw"]');await sleep(20);console.log('P1 PIN option in account:',!!q('#modal-root [data-a="setPinOpen"]'));
 click('#modal-root [data-a="setPinOpen"]');await sleep(20);
 type('#modal-root [data-b="lf.pinPw"]','labpassword12');type('#modal-root [data-b="lf.pin1"]','1234');type('#modal-root [data-b="lf.pin2"]','1234');click('#modal-root [data-a="setPinSave"]');await sleep(100);
 console.log('P2 sequential PIN refused:',/repeated or sequential/.test(toasts()));
 type('#modal-root [data-b="lf.pin1"]','4071');type('#modal-root [data-b="lf.pin2"]','4071');type('#modal-root [data-b="lf.pinPw"]','wrongpassword');click('#modal-root [data-a="setPinSave"]');await sleep(200);
 console.log('P3 wrong password refused:',!(M().pins||{}).uL);
 type('#modal-root [data-b="lf.pinPw"]','labpassword12');click('#modal-root [data-a="setPinSave"]');await sleep(200);
 console.log('P4 PIN saved:',!!(M().pins||{}).uL,'|',toasts().split(' | ').slice(-1)[0]);
 // A1-A3: attach the Amico report to a received send-out order
 nav('openOrder',null,'ox50018184');await sleep(40);
 console.log('A1 attachments panel:',/Attachments and reference lab reports/.test(txt()),'| attach button',!!q('input[data-ofile]:not([data-okind])'));
 const pdf2=await mkPdf(2);const fl=new w.File([pdf2],'Amico report 50018184.pdf',{type:'application/pdf'});fl.arrayBuffer=async()=>pdf2.buffer.slice(pdf2.byteOffset,pdf2.byteOffset+pdf2.byteLength);
 const fi=q('input[data-ofile]:not([data-okind])');Object.defineProperty(fi,'files',{value:[fl],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(400);
 const o84=st('50018184');console.log('A2 attached:',JSON.stringify((o84.files||[]).map(f=>({name:f.name,kind:f.kind,inReport:f.inReport,path:/^c1001\/ox50018184\//.test(f.path)}))),'| history',o84.history.slice(-1)[0].note);
 const txtFile=new w.File(['x'],'notes.txt',{type:'text/plain'});Object.defineProperty(q('input[data-ofile]:not([data-okind])'),'files',{value:[txtFile],configurable:true});q('input[data-ofile]:not([data-okind])').dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(100);
 console.log('A3 non-PDF refused:',/Attach a PDF file/.test(toasts()));
 // R1-R3: verify, then release signed with the PIN (one wrong PIN first)
 click('[data-a="manualEntry"]');await sleep(30);
 for(const [n,v] of [['Oxycodone','20'],['Buprenorphine','1']]){const r=row(n);if(r)typeIn(r.querySelector('input[data-b$=".c"]'),v)}
 typeIn(row('Urine creatinine').querySelector('input'),'80');typeIn(row('Urine specific gravity').querySelector('input'),'1.015');typeIn(row('Urine pH').querySelector('input'),'6');await sleep(10);
 click('[data-a="fillNormals"]');await sleep(10);
 click('[data-a="release"]');await sleep(400);
 console.log('R1 sign box asks for PIN:',/Your signing PIN/.test(mtxt()),'| password option',!!q('#modal-root [data-a="esigUse"][data-val="password"]'));
 q('#esig-pw').value='9999';click('#modal-root [data-a="esigRelease"]');await sleep(300);
 console.log('R2 wrong PIN:',/That PIN isn't right/.test(toasts()),'| still open',!!q('#esig-pw'));
 q('#esig-pw').value='4071';click('#modal-root [data-a="esigRelease"]');await sleep(1500);
 const rel=st('50018184');const h=rel.history.find(x=>x.sig);console.log('R3 released:',rel.status,'| signed by',rel.signature&&rel.signature.by,'| method',rel.signature&&rel.signature.method,h&&h.sig.method);
 // D1: the downloaded report PDF ends with the attached report's pages
 let bb=null;w.URL.createObjectURL=b=>{bb=b;return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 click('[data-a="report"]');await sleep(60);console.log('S1 report header specimen:',(q('#modal-root .rp-pt').textContent.replace(/\s+/g,' ').match(/Specimen:\s*[^:]*?(?=$)/)||['none'])[0]);click('#modal-root [data-a="dlReport"]');await sleep(2500);
 if(bb){const ab=await new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsArrayBuffer(bb)});const doc=await PDFDocument.load(new Uint8Array(ab));console.log('D1 report PDF pages (report + 2 attached):',doc.getPageCount()>=3)}else console.log('D1 no PDF');
 q('#modal-root').innerHTML='';
 // C1-C2: the clinic sees and opens the report
 click('[data-a="logout"]');await sleep(600);
 await login('clinic@pc.com','clinicpass123');
 nav('openOrder',null,'ox50018184');await sleep(60);
 console.log('C1 clinic sees reference lab report:',/Reference lab reports/.test(txt()),'| file',/Amico report 50018184\.pdf/.test(txt()),'| no remove button',!q('[data-a="ofRemove"]'));
 let opened='';w.open=u=>{opened=u};click('[data-a="ofView"]');await sleep(100);console.log('C2 opens signed link:',/^https:\/\/signed\/c1001\/ox50018184\//.test(opened));
 console.log('errors',errs,M().errors);process.exit(0)
})();
