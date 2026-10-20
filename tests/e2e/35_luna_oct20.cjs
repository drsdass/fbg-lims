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
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 Object.assign(st('50018190'),{tests:['UTIABR'],toxSpec:'',status:'In Process',results:{}});
 Object.assign(st('50018191'),{tests:['UTIABR'],toxSpec:'',status:'In Process',results:{},files:[{id:'fz',path:'c1001/ox50018191/x.pdf',name:'x.pdf',size:1000,kind:'Reference lab report',inReport:true,by:'x',at:1}]});
 await login('lab@fbg.com','labpassword12');
 // N1-N4: Native Health coverage, changed from the order page
 nav('openOrder',null,'ox50018186');await sleep(40);
 console.log('N1 change coverage link on a received order:',!!q('[data-a="editPatient"]'),'| billing before:',st('50018186').billType);
 click('[data-a="editPatient"]');await sleep(30);
 const sel=q('#modal-root select[data-b="pt.ins.type"]');console.log('N2 coverage options:',[...sel.options].map(o=>o.value).filter(Boolean).join(' | '));
 sel.value='Native Health';sel.dispatchEvent(new w.Event('change',{bubbles:true}));sel.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(30);
 type('#modal-root [data-b="pt.ins.payer"]','NATIVE HEALTH');type('#modal-root [data-b="pt.ins.member"]','NH123456');
 click('#modal-root [data-a="savePatient"]');await sleep(300);
 const o86=st('50018186'),pt=M().store.patients.find(x=>x.id==='ptA').data;
 console.log('N3 saved:',pt.ins.type,pt.ins.payer,'| order billing',o86.billType,'| history',o86.history.slice(-1)[0].note,'| still on order page',/50018186/.test(q('.crumb')?q('.crumb').textContent:''));
 console.log('N4 order page billing shows:',(txt().replace(/\s+/g,' ').match(/Billing\s*Native Health[^C]*/)||['none'])[0].slice(0,60));
 // O1-O3: "Other" adds a new coverage that is offered from then on
 click('[data-a="editPatient"]');await sleep(30);
 let sl=q('#modal-root select[data-b="pt.ins.type"]');sl.value='__other';sl.dispatchEvent(new w.Event('change',{bubbles:true}));sl.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(30);
 console.log('O1 new coverage box:',!!q('#modal-root [data-b="pt._covName"]'));
 click('#modal-root [data-a="savePatient"]');await sleep(100);console.log('O2 blank name refused:',/Type the name of the new coverage/.test(toasts()));
 type('#modal-root [data-b="pt._covName"]','  Tricare  West ');click('#modal-root [data-a="savePatient"]');await sleep(1500);
 const pt2=M().store.patients.find(x=>x.id==='ptA').data;
 console.log('O3 saved:',JSON.stringify(pt2.ins.type),'| no temp field',!('_covName' in pt2),'| order billing',st('50018186').billType,'| lab settings',JSON.stringify((((M().store.settings||[]).find(r=>r.key==='lab')||{}).data||{}).coverages||null));
 nav('openOrder',null,'ox50018187');await sleep(40);click('[data-a="editPatient"]');await sleep(30);
 console.log('O5 offered next time:',[...q('#modal-root select[data-b="pt.ins.type"]').options].map(o=>o.textContent).join(' | '));
 q('#modal-root').innerHTML='';nav('openOrder',null,'ox50018186');await sleep(40);
 // U1-U3: upload a results document (a phone photo) from the order page
 console.log('U1 upload results button:',!!q('input[data-okind="Results document"]'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 const fl=new w.File([png],'results photo.png',{type:'image/png'});fl.arrayBuffer=async()=>png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength);
 const fi=q('input[data-okind="Results document"]');Object.defineProperty(fi,'files',{value:[fl],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(600);
 console.log('U2 attached:',JSON.stringify((st('50018186').files||[]).map(f=>({name:f.name,kind:f.kind,inReport:f.inReport}))),'| panel lists it',/results photo\.pdf/.test(txt()));
 const tf=new w.File(['x'],'notes.txt',{type:'text/plain'});const fi2=q('input[data-okind="Results document"]');Object.defineProperty(fi2,'files',{value:[tf],configurable:true});fi2.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(100);
 console.log('U3 other files refused:',/Upload a PDF, or a photo/.test(toasts()));
 // X1-X5: a send-out UTI panel reported by the attached Amico PDF can be verified and released
 const {PDFDocument}=require('pdf-lib');const pd=await PDFDocument.create();pd.addPage([300,300]);const pdfb=Buffer.from(await pd.save());
 nav('openOrder',null,'ox50018190');await sleep(40);
 const pf=new w.File([pdfb],'J BROYLES - RESULTS.pdf',{type:'application/pdf'});pf.arrayBuffer=async()=>pdfb.buffer.slice(pdfb.byteOffset,pdfb.byteOffset+pdfb.byteLength);
 const pfi=q('input[data-ofile]:not([data-okind])');Object.defineProperty(pfi,'files',{value:[pf],configurable:true});pfi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(500);
 nav('go','entry','ox50018190');await sleep(60);
 console.log('X1 entry page:',/Results for this test are in the attached report: J BROYLES - RESULTS\.pdf/.test(txt().replace(/\s+/g,' ')),'| no blank inputs',!q('.re-test input, .re-test select'));
 click('[data-a="verifyResults"]');await sleep(300);console.log('X2 verify:','|',toasts().split(' | ').slice(-1)[0]);
 nav('go','entry','ox50018190');await sleep(60);click('[data-a="release"]');await sleep(300);
 if(q('#esig-pw')){q('#esig-pw').value='labpassword12';click('#modal-root [data-a="esigRelease"]');await sleep(1200)}
 console.log('X3 released:',st('50018190').status,'|',toasts().split(' | ').slice(-1)[0]);
 nav('openOrder',null,'ox50018190');await sleep(40);click('[data-a="report"]');await sleep(80);
 const rt=q('#modal-root').textContent.replace(/\s+/g,' ');console.log('X4 report:',(rt.match(/See attached report/g)||[]).length,'tests say See attached report |',/are reported in the attached report from [^,]*, which follows this report/.test(rt));
 q('#modal-root').innerHTML='';
 // X5: switch back to typing results in the portal
 nav('go','entry','ox50018191');await sleep(60);click('[data-a="extToggle"]');await sleep(60);
 console.log('X5 enter here instead:',JSON.stringify(st('50018191').extTests),'| inputs shown',!!q('.re-test select, .re-test input'),'| button to switch back',!!q('[data-a="extToggle"]'));
 console.log('errors',errs,M().errors);process.exit(0)
})();
