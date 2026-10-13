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
 let blobs=[];w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:x'};w.URL.revokeObjectURL=()=>{};
 const blobText=b=>new Promise(r=>{const fr=new w.FileReader();fr.onload=()=>r(fr.result);fr.readAsText(b)});
 const cards={'ppo_card.jpg':'BlueCross BlueShield of Arizona\nPPO BlueCard\nMember Name: JOHN Q SMITH\nMember ID: XYZ123456789\nGroup No: 0012345\nDOB: 03/04/1980','scan.pdf':'Humana\nGold Plus HMO\nMedicare Advantage\nMember: MARIA GARCIA\nID: H12345678'};
 w.__ocrStub=f=>Promise.resolve(cards[f&&f.name]||'');
 const rowsTxt=()=>[...w.document.querySelectorAll('[data-insres]')].map(td=>{const tr=td.closest('tr'),v=k=>(tr.querySelector(`[data-b$=".${k}"]`)||{}).value||'';return `${v('first')} ${v('last')}|${v('dob')}|${v('payer')}|${v('memberId')}|${v('plan')} => ${td.querySelector('.dec').textContent} (${td.querySelector('b').textContent}${/from payer/.test(td.textContent)?' · payer':''})`});
 const upload=async files=>{const inp=q('[data-insfile]');Object.defineProperty(inp,'files',{value:files,configurable:true});inp.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(400)};
 await login('lab@fbg.com','labpassword12');
 // P1: page and nav
 console.log('P1 nav item:',!!q('[data-a="go"][data-v="insurance"]'));
 click('[data-a="go"][data-v="insurance"]');await sleep(100);
 console.log('P2 page:',/Insurance check/.test(txt()),'| payer checks off:',/isn't set up yet/.test(txt())||'(no rows yet)');
 // T1: typed lines, one per patient
 type('[data-b="ins.name"]','Curana Health of Arizona');
 type('[data-b="ins.paste"]','Smith, John · 03/04/1980 · Aetna PPO · W111\nJane Doe, 1975-05-05, BCBS of Arizona HMO, H222\nRobert Nguyen | 7/21/1954 | Medicare Part B | 1EG4TE5MK73\nAna Ruiz · 1/2/1990 · Mercy Care · A99887766');
 click('[data-a="insAddPaste"]');await sleep(50);
 console.log('T1 typed rows:\n '+rowsTxt().join('\n '));
 // T2: Excel rows with a header
 type('[data-b="ins.paste"]','Patient Name\tDOB\tInsurance\tMember ID\tGroup #\tPlan Type\nLee, Kim\t12/31/1985\tCigna\tU555666777\t3344\tOpen Access Plus\nPark, Julie\t02/14/1979\tUnitedHealthcare\t912345678\t7788\tNavigate HMO');
 click('[data-a="insAddPaste"]');await sleep(50);
 console.log('T2 Excel rows:\n '+rowsTxt().slice(4).join('\n '));
 // U1-U2: a CSV, a card photo and a PDF uploaded together
 const csv=new w.File(['First,Last,DOB,Payer,Member ID,Plan\nOmar,Haddad,1966-08-09,Oscar,OSC123456,EPO\nLiz,Grant,1959-11-30,Humana,H998877,Medicare Advantage PPO\n'],'roster.csv',{type:'text/csv'});
 const img=new w.File([new Uint8Array([1,2,3])],'ppo_card.jpg',{type:'image/jpeg'}),pdf=new w.File([new Uint8Array([1,2,3])],'scan.pdf',{type:'application/pdf'}),heic=new w.File([new Uint8Array([1])],'IMG_1.heic',{type:'image/heic'});
 await upload([csv,img,pdf,heic]);
 console.log('U1 uploaded rows:\n '+rowsTxt().slice(6).join('\n '));
 console.log('U2 toast:',toasts().replace(/\s+/g,' ').slice(-170));
 // E1: correcting a row updates its result as you type
 const n=w.document.querySelectorAll('[data-insres]').length;type(`[data-b="ins.rows.${n-1}.plan"]`,'Choice Plus');await sleep(20);
 console.log('E1 after edit:',q(`[data-insres="${n-1}"]`).textContent.replace(/\s+/g,' ').trim().slice(0,60));
 // S1: summary
 const st=[...w.document.querySelectorAll('.stat')].map(s=>s.textContent.replace(/\s+/g,' ').trim());console.log('S1 summary:',st.join(' | '));
 // C1-C3: payer checks once the eligibility function is set up
 M().eligOn=true;click('[data-a="insEligRetry"]');await sleep(100);
 console.log('C1 Check all button:',!!q('[data-a="insEligAll"]'),'| per-row buttons',w.document.querySelectorAll('[data-a="insElig"]').length);
 w.confirm=()=>true;click('[data-a="insEligAll"]');await sleep(600);
 console.log('C2 after payer checks:\n '+rowsTxt().join('\n '));
 console.log('C3 error shown for unknown member:',/Subscriber\/Insured Not Found/.test(q('[data-insres="2"]').textContent),'| calls',M().elig.filter(x=>x==='check').length);
 // X1: CSV and print
 click('[data-a="insCsv"]');await sleep(20);const csvOut=await blobText(blobs.slice(-1)[0]);console.log('X1 CSV:',csvOut.split('\r\n').length-1,'rows |',csvOut.split('\r\n')[1]);
 click('[data-a="insPrint"]');await sleep(20);console.log('X2 report:',/Insurance check: Curana Health of Arizona/.test(mtxt()),'|',(mtxt().match(/\d+ patients: [^.]+\./)||[''])[0]);q('#modal-root').innerHTML='';
 // V1-V3: save, reopen
 click('[data-a="insSave"]');await sleep(200);
 const rec=M().store.insurance_checks[0];console.log('V1 saved:',!!rec,rec&&rec.data.name,JSON.stringify(rec&&rec.data.summary),'| clinic matched',rec&&rec.data.clinicId||'(none)');
 w.confirm=()=>true;click('[data-a="insClear"]');await sleep(50);console.log('V2 cleared:',w.document.querySelectorAll('[data-insres]').length);
 click('[data-a="insOpen"]');await sleep(50);console.log('V3 reopened rows:',w.document.querySelectorAll('[data-insres]').length,'| name',q('[data-b="ins.name"]').value);
 // O1-O3: order-time flag for an HMO patient
 click('[data-a="go"][data-v="clinics"]');await sleep(20);click('[data-a="sofAll"]');await sleep(1200);
 nav('newReq');await sleep(20);type('[data-b="draft.clinicId"]','c1001');await sleep(20);click('[data-a="draftNewPt"]');await sleep(5);
 for(const [k,v] of [['first','Hank'],['last','Moe'],['dob','1970-03-03']])type(`[data-b="pt.${k}"]`,v);type('[data-b="pt.sex"]','M');type('[data-b="pt.ins.type"]','Commercial');await sleep(10);
 console.log('O1 plan field on patient form:',!!q('[data-b="pt.ins.plan"]'));
 type('[data-b="pt.ins.payer"]','Aetna');type('[data-b="pt.ins.member"]','H222');type('[data-b="pt.ins.plan"]','Aetna HMO');
 click('[data-a="ordNext"]');await sleep(20);
 click('[data-a="draftSet"][data-k="toxSpec"][data-val="Urine"]');click('[data-a="draftSet"][data-k="screen"][data-val="only"]');click('[data-a="toggleArr"][data-k="icd"]');click('[data-a="ordNext"]');await sleep(20);
 click('[data-a="ordNext"]');await sleep(20);click('[data-a="ordNext"]');await sleep(700);
 click('[data-a="go"][data-v="queue"]');await sleep(50);console.log('O2 accessioning tag:',(txt().match(/HMO: out of network/)||['none'])[0]);
 const od=M().store.orders.slice(-1)[0];if(od){nav('openOrder',null,od.id);await sleep(60);console.log('O3 order page:',(txt().replace(/\s+/g,' ').match(/Out of network: decline HMO[^C]*Check insurance/)||['none'])[0]);
  click('[data-a="patInsCheck"]');await sleep(400);const pt=M().store.patients.find(x=>x.data.last==='Moe');console.log('O4 payer check saved:',JSON.stringify(pt&&pt.data.ins.check&&{label:pt.data.ins.check.label,via:pt.data.ins.check.via,active:pt.data.ins.check.active}))}
 else console.log('O2 no order created');
 console.log('errors',errs,M().errors);process.exit(0)
})();
