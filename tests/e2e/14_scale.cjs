const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.__RPTSEED=true;w.eval(fs.readFileSync(BUNDLE,'utf8'));
const sign=k=>{const c=w.document.querySelector(`canvas.sigc[data-k="${k}"]`);if(!c)return false;for(const t of ['pointerdown','pointermove','pointerup'])c.dispatchEvent(new w.MouseEvent(t,{bubbles:true,clientX:10,clientY:10}));return true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>w.document.querySelector(s),txt=()=>w.document.querySelector('#app').textContent;
const click=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const type=(s,v)=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const M=()=>w.__mock;
const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
async function signIn(email,pw){type('[data-b="lf.email"]',email);type('[data-b="lf.pw"]',pw);click('[data-a="login"]');await sleep(80)}
(async()=>{
 await sleep(10);
 const st=M().store,now=Date.now(),D=864e5;
 st.patients.push({id:'ptOld',clinic_id:'c1001',updated_at:new Date(now-200*D).toISOString(),data:{id:'ptOld',clinicId:'c1001',mrn:'OLD1',first:'Olga',last:'Oldman',dob:'1950-01-01',sex:'F',phone:'',email:'',address:'',city:'',state:'AZ',zip:'',ins:{type:'Self-pay',payer:'',member:'',group:''}}});
 const mk=(i,days)=>({id:'oOld'+i,clinic_id:'c1001',updated_at:new Date(now-days*D).toISOString(),data:{id:'oOld'+i,accession:'FBGOLD-'+String(i).padStart(4,'0'),clinicId:'c1001',patientId:'ptOld',providerId:'p1',tests:i%2?['CMP']:['UDS'],confirm:[],meds:[],icd:['Z00.00'],billType:'Self pay',collectedAt:now-days*D,createdAt:now-days*D,status:'Released',releasedAt:now-days*D+36e5,consents:{},history:[{s:'Ordered',at:now-days*D,by:'x'},{s:'Received',at:now-days*D+18e5,by:'x'}],results:i%2?{CMP:{Potassium:{v:String(3.8+i%10/10)},Sodium:{v:'140'}}}:{UDS:{'Amphetamines':{v:i%4?'Negative':'Positive'},'Opiates':{v:'Negative'}}}}});
 for(let i=0;i<40;i++)st.orders.push(mk(i,i<20?100:200));
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(500)};
 await login('lab@fbg.com','labpassword12');
 const accs=()=>txt();
 click('[data-a="go"][data-v="queue"]');await sleep(20);
 console.log('W1 store orders:',st.orders.length,'| old orders on the server:',st.orders.filter(o=>o.id.startsWith('oOld')).length);
 // search finds old records on the server
 type('[data-b="ui.gq"]','Oldman');await sleep(800);
 console.log('W2 search:',(txt().match(/all records searched|searching all records/)||['none'])[0],'| old orders found:',w.document.querySelectorAll('[data-a="openOrder"]').length,'| patient found:',/Oldman, Olga|Olga Oldman/.test(txt()));
 click('[data-a="clearSearch"]');await sleep(20);
 // patient page pulls full history
 type('[data-b="ui.gq"]','Olga');await sleep(800);const pb=q('[data-a="openPatient"][data-id="ptOld"]');if(pb){pb.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))}await sleep(800);
 console.log('W3 patient page orders listed:',(txt().match(/FBGOLD-\d{4}/g)||[]).length,'| result history:',/Result history/.test(txt()));
 // reports cover the whole period through server facts
 click('[data-a="go"][data-v="reports"]');await sleep(500);click('[data-a="rpMonths"][data-val="12"]');await sleep(800);
 console.log('W4 reports 12 months, orders counted:',(txt().replace(/\s+/g,' ').match(/(\d+)Orders/)||[])[1],'| expected at least',40);
 // statistics rebuild for old orders
 const btn=q('[data-a="rpRebuild"]');console.log('W5 rebuild button:',btn&&btn.textContent.trim());if(btn){click('[data-a="rpRebuild"]');await sleep(2500)}
 console.log('W6 summaries stored:',st.orders.filter(o=>o.data.summary).length,'| toasts:',toasts().slice(-70));
 // incremental refresh picks up a change made elsewhere
 const tgt=st.orders.find(o=>o.id==='oRPT');if(tgt){tgt.data.notes='changed by another user';tgt.data.stat=true;tgt.updated_at=new Date(Date.now()+1000).toISOString()}
 console.log('W7a target:',tgt&&tgt.id,tgt&&tgt.data.accession);w.dispatchEvent(new w.Event('focus'));await sleep(800);
 click('[data-a="go"][data-v="queue"]');await sleep(20);if(tgt){const ob=q(`[data-a="openOrder"][data-id="${tgt.id}"]`);console.log('W7b order link:',!!ob);if(ob){ob.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await sleep(30)}console.log('W7c STAT shown:',/STAT/.test(txt()))}
 console.log('W7 refresh brought the change:',/changed by another user/.test(txt()));
 console.log('errors',errs,M().errors);process.exit(0)
})();
