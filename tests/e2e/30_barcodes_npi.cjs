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
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 let confirms=[];w.confirm=m=>{confirms.push(m);return false};
 {const c0=M().store.clinics.find(c=>c.id==='c1001');const d=JSON.parse(JSON.stringify(c0.data));Object.assign(d,{id:'c2002',acct:'FBG-2002',name:'Curana Health of Arizona',npi:'1467187237',phone:'480-555-0101',address:'1 Main',city:'Mesa',state:'AZ',zip:'85201'});M().store.clinics.push({...c0,id:'c2002',data:d})}
 await login('lab@fbg.com','labpassword12');
 // R1-R3: requisition labels carry the same compact tube codes as the printed labels
 w.confirm=()=>true;click('[data-a="go"][data-v="clinics"]');await sleep(20);click('[data-a="sofAll"]');await sleep(1200);nav('newReq');await sleep(20);type('[data-b="draft.clinicId"]','c1001');await sleep(20);
 click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Bar'],['last','Code'],['dob','1970-03-03']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','F');type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);
 click('[data-a="ordNext"]');await sleep(20);
 click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="only"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(20);
 click('[data-a="ordNext"]');await sleep(20);click('[data-a="ordNext"]');await sleep(700);w.confirm=m=>{confirms.push(m);return false};
 if(!M().store.orders.length){console.log('no order',errs,txt().slice(0,300));process.exit(1)}const o=M().store.orders.slice(-1)[0].data;console.log('R0 order:',o.accession,o.tests.join('+'));
 nav('req',null,o.id);await sleep(50);
 const bcs=[...w.document.querySelectorAll('#modal-root svg.bc')].map(s=>s.dataset.v);
 console.log('R1 header barcode:',bcs[0],'| accession shown',mtxt().includes(o.accession));
 console.log('R2 label barcodes:',bcs.slice(1).join(', '),'| all 10 chars or less',bcs.every(v=>v.length<=10));
 console.log('R3 label text:',[...w.document.querySelectorAll('#modal-root .label')].map(l=>l.textContent.replace(/\s+/g,' ').split('·').slice(-2).join('·').trim()).join(' | '));
 q('#modal-root').innerHTML='';
 // N1-N5: NPI checks
 click('[data-a="go"][data-v="clinics"]');await sleep(20);
 console.log('N1 invalid NPI flags in list:',w.document.querySelectorAll('.flag[title^="Fails the NPI"]').length);
 click('[data-a="editClinic"][data-id="c1001"]');await sleep(30);
 const warn=k=>(q(`#modal-root [data-npiw="${k}"]`)||{}).textContent;
 console.log('N2 current NPI warning:',JSON.stringify(warn('npi')));
 for(const [k,v] of [['phone','480-555-0100'],['address','1 Main'],['city','Irvine'],['state','CA'],['zip','92618'],['notify.criticalPhone','480-555-0199']])if(!q(`#modal-root [data-b="clf.${k}"]`).value)type(`#modal-root [data-b="clf.${k}"]`,v);
 type('#modal-root [data-b="clf.npi"]','1234567890');console.log('N3 fake NPI:',warn('npi'));
 const other=M().store.clinics.map(c=>c.data).find(c=>c.id!=='c1001'&&/^\d{10}$/.test(c.npi||''));
 if(other){type('#modal-root [data-b="clf.npi"]',other.npi);console.log('N4 duplicate NPI:',warn('npi'))}else console.log('N4 no other clinic');
 type('#modal-root [data-b="clf.providers.0.npi"]','1234567897');console.log('N5 provider fake NPI:',!!warn('providers.0.npi'));
 const before=JSON.stringify(M().store.clinics.find(c=>c.id==='c1001').data.npi);
 click('#modal-root [data-a="saveClinicForm"]');await sleep(300);
 console.log('N6 confirm asked:',confirms.length,'|',(confirms[0]||'').split('\n').filter(Boolean).length,'lines | cancelled, NPI unchanged:',JSON.stringify(M().store.clinics.find(c=>c.id==='c1001').data.npi)===before);
 console.log('errors',errs,M().errors);process.exit(0)
})();
