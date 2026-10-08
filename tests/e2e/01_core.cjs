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
 await sleep(80);console.log('1 login screen:',txt().includes('Sign in'),'no demo:',!txt().includes('demo'));
 await signIn('clinic@pc.com','wrong');console.log('2 bad pw toast:',toasts().includes("don't match"));
 await signIn('clinic@pc.com','clinicpass123');console.log('3 clinic signs in without two-step:',!txt().includes('Two-step'));
 if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(120);
 console.log('4 clinic dashboard:',txt().includes('Pacific Coast Pain'));
 // add patient
 click('[data-a="newPatient"]');await sleep(10);
 for(const [k,v] of [['first','Ana'],['last','Diaz'],['dob','1970-02-03']])type(`#modal-root [data-b="pt.${k}"]`,v);
 type('#modal-root [data-b="pt.sex"]','F');type('#modal-root [data-b="pt.ins.type"]','Medicare');await sleep(5);
 type('#modal-root [data-b="pt.ins.payer"]','Medicare Part B');type('#modal-root [data-b="pt.ins.member"]','1EG4TE5MK73');
 click('#modal-root [data-a="savePatient"]');await sleep(500);
 console.log('5 patient saved to server:',M().store.patients.length,M().store.patients[0]&&M().store.patients[0].clinic_id);
 const pid=M().store.patients[0].id;
 // order
 w.eval(`void 0`);
 click('[data-a="orderFor"]');await sleep(10);
 click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="reflex"]');
 click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(10);
 console.log('6 consent step:',txt().includes('Patient consent and responsibility'));
 click('[data-a="ordNext"]');await sleep(10);console.log('7 requires signature:',toasts().includes('signature'));
 sign('patient');sign('provider');const att=q('[data-b="draft.provAttest"]');att.checked=true;att.dispatchEvent(new w.Event('input',{bubbles:true}));
 if(q('canvas.sigc[data-k="abn"]'))console.log('abn shown');
 click('[data-a="ordNext"]');await sleep(10);click('[data-a="ordNext"]');await sleep(600);
 console.log('8pre toasts:',toasts(),'| step text:',txt().replace(/\s+/g,' ').slice(0,300));const o=M().store.orders[0];console.log('8 order on server:',o&&o.data.accession,o&&o.clinic_id,o&&o.data.tests.join('+'),'lab note:',M().store.notes.filter(n=>n.aud==='lab').length);
 // clinic tries to tamper: set status released locally -> should be blocked
 console.log('9 audit views:',M().store.audit_log.length);
 click('[data-a="logout"]');await sleep(600);
 await signIn('lab@fbg.com','labpassword12');if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(200);
 console.log('10 lab dashboard:',txt().includes('Lab dashboard'),'sees clinic order:',txt().includes(o.data.accession));
 w.document.querySelector(`[data-a="openOrder"][data-id="${o.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(20);
 click('[data-a="receive"]');await sleep(20);if(q('#modal-root [data-a="receiveConfirm"]'))click('#modal-root [data-a="receiveConfirm"]');await sleep(20);await sleep(500);console.log('11 received on server:',M().store.orders[0].data.status);
 click('[data-a="go"][data-v="instruments"]');await sleep(20);
 const acc=o.data.accession;const csv='SampleID,Assay,Result\n'+['AMP','OXY','BZO'].map(c=>`${acc},${c},${c==='OXY'?300:0}`).join('\n');
 type('[data-b="ui.paste_c560"]',csv);click('[data-a="doImport"][data-k="c560"]');await sleep(500);
 console.log('12 reflex added:',M().store.orders[0].data.confirm.join(','),M().store.orders[0].data.tests.join('+'));
 w.document.querySelector('#modal-root').innerHTML='';
 w.eval('void 0');
 const oid=o.id;
 // go to entry, fill normals, release (reflex CONF now needs results -> fill normals covers)
 [...w.document.querySelectorAll('[data-a="go"]')].find(b=>b.dataset.v==='queue').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 w.document.querySelector(`[data-a="openOrder"][data-id="${oid}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 click('[data-a="go"][data-v="entry"]');await sleep(10);click('[data-a="fillNormals"]');await sleep(5);click('[data-a="release"]');await sleep(600);
 console.log('13b alerts:',JSON.stringify(M().store.outbox.map(r=>r.data.channel+':'+r.data.status)),'invoked',M().invoked);fs.writeFileSync(OUT('report.json'),JSON.stringify(M().lastFax||null));
 console.log('13 released:',M().store.orders[0].data.status,'claim:',M().store.claims.map(c=>c.id+':'+c.data.lines.map(l=>l.cpt).join('/')).join(),'outbox:',M().store.outbox.length,'clinic note:',M().store.notes.filter(n=>n.aud==='c1001').length);
 click('[data-a="go"][data-v="clinics"]');await sleep(10);
 click('[data-a="logout"]');await sleep(600);
 // clinic sees the result
 await signIn('clinic@pc.com','clinicpass123');if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(200);
 console.log('14 clinic sees released result:',txt().includes(acc),'new-results count:',q('.stats .v')&&q('.stats .v').textContent);
 w.document.querySelector(`[data-a="openOrder"][data-id="${oid}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(500);
 console.log('15 readAt saved:',!!M().store.orders[0].data.readAt,'mock write errors:',JSON.stringify(M().errors));
 click('[data-a="logout"]');await sleep(600);
 // ---- lab enters a paper requisition ----
 await signIn('lab@fbg.com','labpassword12');if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(200);
 click('[data-a="newReq"]');await sleep(10);
 console.log('P1 clinic picker:',!!q('[data-b="draft.clinicId"]'),txt().includes('Enter paper requisition'));
 click('[data-a="ordNext"]');await sleep(5);console.log('P2 needs clinic:',toasts().includes('Choose the clinic'));
 type('[data-b="draft.clinicId"]','c1001');await sleep(10);
 console.log('P3 clinic patients listed:',!!q('[data-a="draftPick"]'));
 click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Paper'],['last','Patient'],['dob','1966-06-06']])type(`[data-b="pt.${k}"]`,v);
 type('[data-b="pt.sex"]','M');type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);
 click('[data-a="ordNext"]');await sleep(10);
 console.log('P4 step2, provider:',w.eval ? '' : '', txt().includes('Daniel Reyes'));
 click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="only"]');
 click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(10);
 console.log('P5 paper consent options:',txt().includes('Patient signed the paper requisition'),txt().includes('Paper requisition'));
 click('[data-a="ordNext"]');await sleep(5);console.log('P6 needs scan:',toasts().includes('Attach a photo'));
 // attach a scan via the file input
 const fi=q('input[data-reqscan]');
 w.Image=class{set src(v){setTimeout(()=>{this.width=1000;this.height=1300;this.onload&&this.onload()},1)}};w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};
 Object.defineProperty(fi,'files',{value:[new w.File(['x'],'req.jpg',{type:'image/jpeg'})]});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(30);
 console.log('P7 scan attached:',w.document.querySelectorAll('img[alt^="Requisition page"]').length);
 click('[data-a="ordNext"]');await sleep(5);console.log('P8 needs provider paper sig:',toasts().includes('provider signed'));
 const pp=q('[data-b="draft.provPaper"]');pp.checked=true;pp.dispatchEvent(new w.Event('input',{bubbles:true}));
 click('[data-a="ordNext"]');await sleep(10);console.log('P9 review:',txt().includes('The specimen arrived with this requisition'));
 click('[data-a="ordNext"]');await sleep(600);
 const po=M().store.orders.find(o=>o.data.source==='paper');
 console.log('P10 saved:',po&&po.data.accession,po&&po.data.status,po&&po.clinic_id,'scans',po&&po.data.scans.length,'patient clinic',M().store.patients.find(x=>x.data.first==='Paper').clinic_id,'consent',po&&po.data.consents.patient.method,po&&po.data.consents.provider.paper);
 console.log('P11 detail shows scan:',!!q('img[alt="Requisition page 1"]'),txt().includes('Entered from paper requisition'),txt().includes('Signed on paper requisition'));
 click('[data-a="go"][data-v="audit"]');await sleep(300);
 console.log('A1 audit page rows:',w.document.querySelectorAll('.tbl tbody tr').length,'| actions:',[...new Set(M().store.audit_log.map(a=>a.action))].join(','));
 console.log('A2 sample:',[...w.document.querySelectorAll('.tbl tbody tr')].slice(0,4).map(r=>r.textContent.replace(/\s+/g,' ').trim().slice(0,110)).join(' || '));
 const acc2=M().store.orders.find(o=>o.data.source==='paper').data.accession;
 type('[data-b="au.q"]',acc2);click('[data-a="auditSearch"]');await sleep(300);
 console.log('A3 filtered by accession rows:',w.document.querySelectorAll('.tbl tbody tr').length);
 click('[data-a="auditExport"]');await sleep(50);console.log('A4 export logged:',M().store.audit_log.some(a=>a.action==='export'));
 click('[data-a="logout"]');await sleep(600);
 // registration
 click('[data-a="startReg"]');await sleep(10);
 for(const [k,v] of [['name','Desert Pain Clinic'],['npi','1234567890'],['taxId','86-1'],['phone','480'],['address','1 Main'],['city','Mesa'],['zip','85210']])type(`[data-b="reg.${k}"]`,v);
 click('[data-a="regNext"]');await sleep(10);
 for(const [k,v] of [['name','Dr Kay'],['npi','1234567891'],['email','kay@dp.com']])type(`[data-b="reg.providers.0.${k}"]`,v);
 click('[data-a="regNext"]');await sleep(10);
 for(const [k,v] of [['name','Pat Admin'],['email','admin@dp.com'],['pw','longpassword1'],['title','Manager']])type(`[data-b="reg.user.${k}"]`,v);type('[data-b="reg.notify.criticalPhone"]','480-1');
 click('[data-a="regNext"]');await sleep(10);
 for(const k of ['agree','baa']){const c=q(`[data-b="reg.${k}"]`);c.checked=true;c.dispatchEvent(new w.Event('input',{bubbles:true}))}
 sign('reg');click('[data-a="regNext"]');await sleep(300);
 console.log('16 registered clinic:',JSON.stringify(M().store.clinics.map(c=>c.id+':'+c.data.status+':'+c.data.acct)),'screen:',txt().slice(0,60));
 console.log('toasts:',toasts());console.log('errors',errs);process.exit(0)
})();
