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
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(250)};
 const nav=()=>[...w.document.querySelectorAll('.nav button')].map(b=>b.textContent.replace(/\d+$/,'').trim()).join(', ');
 // clinic places an order with a CBC so the reporting flow has something to verify
 await login('clinic@pc.com','clinicpass123');
 click('[data-a="newPatient"]');await sleep(10);
 for(const [k,v] of [['first','Ana'],['last','Diaz'],['dob','1970-02-03']])type(`#modal-root [data-b="pt.${k}"]`,v);
 type('#modal-root [data-b="pt.sex"]','F');type('#modal-root [data-b="pt.ins.type"]','Self-pay');await sleep(5);click('#modal-root [data-a="savePatient"]');await sleep(500);
 click('[data-a="orderFor"]');await sleep(10);click('[data-a="toggleTest"][data-id="CBC"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(10);
 sign('patient');sign('provider');const att=q('[data-b="draft.provAttest"]');att.checked=true;att.dispatchEvent(new w.Event('input',{bubbles:true}));
 click('[data-a="ordNext"]');await sleep(10);click('[data-a="ordNext"]');await sleep(600);
 const oid=M().store.orders[0].id;click('[data-a="logout"]');await sleep(600);

 // Rocky (sales)
 await login('rocky@fbg.com','rockypassword1');
 console.log('S1 sales nav:',nav());
 click('[data-a="go"][data-v="clinics"]');await sleep(10);
 console.log('S2 add clinic button:',!!q('[data-a="addClinic"]'),'approve buttons:',!!q('[data-a="approveClinic"]'));
 click('[data-a="addClinic"]');await sleep(10);
 for(const [k,v] of [['name','Mesa Spine Center'],['npi','1112223334'],['phone','480'],['address','5 Main'],['city','Mesa'],['zip','85201'],['providers.0.name','Dr Lee'],['providers.0.npi','9998887776'],['notify.criticalPhone','480-2']])type(`#modal-root [data-b="clf.${k}"]`,v);
 click('#modal-root [data-a="saveClinicForm"]');await sleep(400);
 console.log('S3 clinic created:',JSON.stringify(M().store.clinics.map(c=>c.data.name+':'+c.data.status)));
 w.document.querySelector(`[data-a="go"][data-v="queue"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 console.log('S4 no findings column:',!txt().includes('Findings'));
 w.eval('void 0');
 const r0=w.document.querySelector(`[data-a="openOrder"][data-id="${oid}"]`);r0.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 console.log('S5 no receive button for sales:',!q('[data-a="receive"]'));
 click('[data-a="logout"]');await sleep(600);

 // Luna (scientist): receive, start, enter, verify (no release)
 await login('luna@fbg.com','lunapassword12');
 console.log('T1 scientist nav:',nav());
 w.document.querySelector(`[data-a="go"][data-v="queue"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 w.document.querySelector(`[data-a="openOrder"][data-id="${oid}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 click('[data-a="receive"]');await sleep(20);if(q('#modal-root [data-a="receiveConfirm"]'))click('#modal-root [data-a="receiveConfirm"]');await sleep(20);await sleep(20);click('[data-a="startTesting"]');await sleep(20);click('[data-a="go"][data-v="entry"]');await sleep(10);
 click('[data-a="fillNormals"]');await sleep(5);click('[data-a="verifyResults"]');await sleep(600);
 console.log('T2 verified on server:',JSON.stringify(M().store.orders[0].data.verified&&M().store.orders[0].data.verified.by),M().store.orders[0].data.status);
 click('[data-a="logout"]');await sleep(600);

 // Rita (reporting): read-only results, report out
 await login('rita@fbg.com','ritapassword12');
 console.log('R1 reporting nav:',nav());
 w.document.querySelector(`[data-a="go"][data-v="queue"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 w.document.querySelector(`[data-a="openOrder"][data-id="${oid}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(10);
 console.log('R2 verified banner + report button:',txt().includes('Verified'),!!q('[data-a="go"][data-v="entry"]'));
 click('[data-a="go"][data-v="entry"]');await sleep(10);
 console.log('R3 read-only (no inputs):',!q('[data-b^="res."]'),'report out btn:',!!q('[data-a="release"]'),'no verify btn:',!q('[data-a="verifyResults"]'));
 click('[data-a="release"]');await sleep(700);
 await sleep(2500);console.log('R4 clinic0',JSON.stringify(M().store.clinics[0]).slice(0,400));console.log('R4 clinic notify',JSON.stringify(M().store.clinics[0].data.notify),M().store.clinics[0].data.fax,JSON.stringify(M().store.orders[0].data.providerId));console.log('R4 invoked',M().invoked,'outbox',M().store.outbox.length,'notes',M().store.notes.length);console.log('R4 errors so far',JSON.stringify(M().errors),toasts());console.log('R4 released by reporting:',M().store.orders[0].data.status,'claims',M().store.claims.length,'outbox',M().store.outbox.length);
 click('[data-a="logout"]');await sleep(600);

 // Admin: users page, create Luna-style user, approve Rocky's clinic
 await login('lab@fbg.com','labpassword12');
 console.log('U1 admin nav:',nav());
 click('[data-a="go"][data-v="users"]');await sleep(300);
 console.log('U2 users listed:',w.document.querySelectorAll('.tbl tbody tr').length);
 click('[data-a="addUser"]');await sleep(10);
 type('#modal-root [data-b="uf.email"]','jaime@fbg.com');type('#modal-root [data-b="uf.name"]','Jaime Supervisor');
 click('#modal-root [data-a="ufRole"][data-val="admin"]');click('#modal-root [data-a="saveUser"]');await sleep(300);
 console.log('U3 temp password shown:',q('#modal-root').textContent.includes('TempPass12345678'),'profile:',JSON.stringify(M().store.profiles.find(p=>p.email==='jaime@fbg.com').lab_roles));
 q('#modal-root').innerHTML='';
 click('[data-a="go"][data-v="clinics"]');await sleep(10);
 const ap=w.document.querySelector('[data-a="approveClinic"]');console.log('U4 admin sees approve:',!!ap);
 click('[data-a="logout"]');await sleep(600);
 // New user first sign-in: MFA then forced password change
 await signIn('jaime@fbg.com','TempPass12345678');if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(250);
 console.log('N1 forced password screen:',txt().includes('Choose your own password'));
 type('[data-b="lf.pw1"]','JaimeNewPassword1');type('[data-b="lf.pw2"]','JaimeNewPassword1');click('[data-a="setNewPw"]');await sleep(300);
 console.log('N2 lands on lab dashboard:',txt().includes('Lab dashboard'),'flag cleared:',M().store.profiles.find(p=>p.email==='jaime@fbg.com').must_change_pw);
 console.log('toasts:',toasts());console.log('errors',errs,M().errors);process.exit(0)
})();
