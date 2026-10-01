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
 const ck=(sel,on=true)=>{const c=q(sel);c.checked=on;c.dispatchEvent(new w.Event('input',{bubbles:true}));c.dispatchEvent(new w.Event('change',{bubbles:true}))};
 const mt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 console.log('L0 login screen: no self-registration:',!txt().includes('Register your clinic'),'keep-signed-in option:',!!q('[data-b="lf.trust"]'),'username label:',txt().includes('Email or username'));
 await login('lab@fbg.com','labpassword12');
 console.log('L1 lab nav:',[...w.document.querySelectorAll('.nav button')].map(b=>b.textContent.replace(/\d+$/,'').trim()).join(', '));
 // 1: add clinic from paper onboarding with SOF, ordering off
 click('[data-a="go"][data-v="clinics"]');await sleep(10);click('[data-a="addClinic"]');await sleep(10);
 for(const [k,v] of [['name','Oratek Health'],['npi','1231231234'],['phone','480'],['address','9 Oak'],['city','Mesa'],['zip','85201'],['providers.0.name','Dr Ora'],['providers.0.npi','9991112223'],['notify.criticalPhone','480-9'],['sof.signer','Ann Ora']])type(`#modal-root [data-b="clf.${k}"]`,v);
 ck('#modal-root [data-b="clf.settings.supplies"]');ck('#modal-root [data-b="clf.approveNow"]');
 console.log('L2 settings shown:',mt().includes('Clinic can place orders'),mt().includes('Signed paper onboarding is on file'));
 click('#modal-root [data-a="saveClinicForm"]');await sleep(500);
 const ora=M().store.clinics.find(c=>c.data.name==='Oratek Health');console.log('L3 clinic saved:',ora&&ora.data.status,JSON.stringify(ora&&ora.data.settings),JSON.stringify(ora&&ora.data.agreement&&{onFile:ora.data.agreement.onFile,signer:ora.data.agreement.signer}));
 // 1/2: create a username clinic user linked to a provider
 click('[data-a="go"][data-v="users"]');await sleep(300);click('[data-a="addUser"]');await sleep(10);
 click('#modal-root [data-a="ufSet"][data-k="kind"][data-val="clinic"]');await sleep(5);click('#modal-root [data-a="ufSet"][data-k="signin"][data-val="username"]');await sleep(5);
 type('#modal-root [data-b="uf.username"]','pcp.ma1');type('#modal-root [data-b="uf.name"]','Pat MA');const sel=q('#modal-root [data-b="uf.clinicId"]');sel.value='c1001';sel.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(10);
 console.log('L4 provider links offered:',!!q('#modal-root [data-a="ufProv"]'));
 click('#modal-root [data-a="ufProv"]');click('#modal-root [data-a="saveUser"]');await sleep(300);
 const nu=M().store.profiles.find(p=>p.email==='pcp.ma1@users.firstbiogenetics.com');console.log('L5 username user:',!!nu,JSON.stringify(nu&&nu.provider_ids),'temp pw shown:',mt().includes('TempPass12345678'));
 q('#modal-root').innerHTML='';
 // 3: lab new order with partial CBC, then edit it
 click('[data-a="newReq"]'.replace('newReq','go"][data-v="dash'));await sleep(10);click('[data-a="newReq"]');await sleep(10);
 type('[data-b="draft.clinicId"]','c1001');await sleep(10);click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Lab'],['last','Entry'],['dob','1966-06-06']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','M');type('[data-b="pt.ins.type"]','Self-pay');await sleep(5);
 click('[data-a="ordNext"]');await sleep(10);click('[data-a="toggleTest"][data-id="CBC"]');await sleep(5);click('[data-a="partsToggle"][data-id="CBC"]');await sleep(5);
 for(const n of ['MCV','MCH','MCHC','RDW','MPV','Immature Granulocytes'])click(`[data-a="partPick"][data-id="CBC"][data-val="${n}"]`);
 console.log('L6 partial label:',txt().match(/\d+ of 21 tests selected/)&&txt().match(/\d+ of 21 tests selected/)[0]);
 click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(10);
 console.log('L7 consent step: photo optional:',txt().includes('Optional'));
 const pp=q('[data-b="draft.provPaper"]');pp.checked=true;pp.dispatchEvent(new w.Event('input',{bubbles:true}));
 click('[data-a="ordNext"]');await sleep(10);click('[data-a="ordNext"]');await sleep(600);
 const lo=M().store.orders.find(o=>o.data.source==='paper');console.log('L8 order saved without photo:',lo&&lo.data.accession,lo&&lo.data.status,'parts:',lo&&JSON.stringify(Object.keys(lo.data.parts||{})),lo&&(lo.data.parts.CBC||[]).length);
 click('[data-a="editOrder"]');await sleep(10);console.log('L9 edit screen:',txt().includes('Edit order'),'starts at step 2:',!!q('[data-a="toggleTest"]'));
 click('[data-a="toggleTest"][data-id="TSH"]'.replace('TSH','THYROID'));click('[data-a="ordNext"]');await sleep(10);console.log('L10 skipped consents to review:',txt().includes('Review')||txt().includes('Billing type'));
 click('[data-a="ordNext"]');await sleep(500);
 const lo2=M().store.orders.find(o=>o.id===lo.id).data;console.log('L11 edited:',lo2.tests.join('+'),'history:',lo2.history.map(h=>h.note).filter(Boolean).join(' | '),'accession unchanged:',lo2.accession===lo.data.accession);
 // 4d: result, release, correct, re-release
 click('[data-a="startTesting"]');await sleep(20);click('[data-a="go"][data-v="entry"]');await sleep(10);
 console.log('L12 partial CBC rows in entry:',w.document.querySelectorAll('.re-test')[0].querySelectorAll('tbody tr').length);
 click('[data-a="fillNormals"]');click('[data-a="release"]');await sleep(800);
 console.log('L13 released:',M().store.orders.find(o=>o.id===lo.id).data.status);
 click('[data-a="startCorrect"]');await sleep(10);type('#modal-root [data-b="rej.reason"]','Wrong WBC transcribed');click('#modal-root [data-a="confirmCorrect"]');await sleep(500);
 const lo3=M().store.orders.find(o=>o.id===lo.id).data;console.log('L14 reopened:',lo3.status,'corrections:',(lo3.corrections||[]).length);
 click('[data-a="fillNormals"]');click('[data-a="release"]');await sleep(900);
 click('[data-a="report"]');await sleep(40);console.log('L15 corrected report:',mt().includes('CORRECTED'),mt().includes('Wrong WBC transcribed'),'alerts corrected flag:',M().store.outbox.filter(x=>x.data.corrected).length>0);
 q('#modal-root').innerHTML='';
 click('[data-a="changePw"]');await sleep(10);type('#modal-root [data-b="lf.pw1"]','AnotherPassword12');type('#modal-root [data-b="lf.pw2"]','AnotherPassword12');click('#modal-root [data-a="saveMyPw"]');await sleep(100);console.log('L16 change password:',toasts().includes('Password changed'));
 click('[data-a="logout"]');await sleep(600);
 // 5: clinic supplies
 await login('clinic@pc.com','clinicpass123');
 console.log('S1 clinic nav:',[...w.document.querySelectorAll('.nav button')].map(b=>b.textContent.replace(/\d+$/,'').trim()).join(', '));
 click('[data-a="go"][data-v="supplies"]');await sleep(20);for(const [k,v] of [['address','2 Park Plaza'],['city','Irvine'],['state','CA'],['zip','92614']])type(`[data-b="spf.${k}"]`,v);type('[data-b="spf.qty.0"]','50');type('[data-b="spf.qty.5"]','20');click('[data-a="supUrg"][data-val="STAT"]');await sleep(5);click('[data-a="supSubmit"]');await sleep(500);
 const so=M().store.supply_orders[0];console.log('S2 supply order:',so&&so.data.number,so&&so.data.urgency,so&&JSON.stringify(so.data.items),so&&so.data.shipTo.address);
 click('[data-a="logout"]');await sleep(600);
 await login('lab@fbg.com','labpassword12');click('[data-a="go"][data-v="supplies"]');await sleep(20);w.prompt=()=>'1Z999';click('[data-a="supShip"]');await sleep(500);
 console.log('S3 shipped:',M().store.supply_orders[0].data.status,M().store.supply_orders[0].data.tracking);
 click('[data-a="logout"]');await sleep(600);
 // 2: username sign-in with forced password change
 await signIn('pcp.ma1','TempPass12345678');if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300);
 console.log('N1 username sign-in reaches password change:',txt().includes('Choose your own password'));
 console.log('toasts:',toasts());console.log('errors',errs,M().errors);process.exit(0)
})();
