const USERS=[{id:'uS',email:'rocky@fbg.com',pw:'rockypassword1',user_metadata:{},factors:[]},{id:'uR',email:'rita@fbg.com',pw:'ritapassword12',user_metadata:{},factors:[]},{id:'uT',email:'luna@fbg.com',pw:'lunapassword12',user_metadata:{},factors:[]},{id:'uL',email:'lab@fbg.com',pw:'labpassword12',user_metadata:{},factors:[]},{id:'uC',email:'clinic@pc.com',pw:'clinicpass123',user_metadata:{},factors:[]}];
const store={profiles:[{user_id:'uL',role:'lab',lab_roles:['admin'],active:true,clinic_id:null,name:'Jordan Ellis',email:'lab@fbg.com'},{user_id:'uS',role:'lab',lab_roles:['sales'],active:true,clinic_id:null,name:'Rocky Mungia',email:'rocky@fbg.com'},{user_id:'uR',role:'lab',lab_roles:['reporting'],active:true,clinic_id:null,name:'Rita Reporter',email:'rita@fbg.com'},{user_id:'uT',role:'lab',lab_roles:['scientist'],active:true,clinic_id:null,name:'Luna Sci',email:'luna@fbg.com'},{user_id:'uC',role:'clinic',active:true,clinic_id:'c1001',name:'Maria Lopez',email:'clinic@pc.com'}],
 clinics:[{id:'c1001',data:{id:'c1001',acct:'FBG-1001',name:'Pacific Coast Pain',status:'active',settings:{ordering:true,supplies:true},providers:[{id:'p1',name:'Daniel Reyes',cred:'MD',npi:'1639201847',email:'d@pc.com',phone:'(949) 555-0150'}],notify:{email:true,sms:true,fax:true,criticalPhone:'555'},fax:'(949) 555-0143',contactName:'Maria Lopez',contactEmail:'clinic@pc.com',createdAt:1}}],
 patients:[],orders:[],notes:[],claims:[],outbox:[],supply_orders:[],qc_materials:[],qc_results:[],report_versions:[],qms_records:[],instrument_inbox:[],instrument_devices:[],referrals:[],pickups:[],invoices:[],settings:[{key:'lab',data:{name:'First Bio Genetics',phone:'(480) 847-1916',clia:'03D2287865'}}],audit_log:[]};
let user=null,aal='aal1',seq=5000,acc=1000;

// RPTSEED: an order like Jaime's positive sample
(()=>{if(!globalThis.__RPTSEED)return;const id='oRPT';
 store.patients.push({id:'ptJ',clinic_id:'c1001',data:{id:'ptJ',clinicId:'c1001',mrn:'61664',first:'Jane',last:'Doe',dob:'2000-08-26',sex:'F',phone:'',email:'',address:'',city:'',state:'AZ',zip:'',ins:{type:'Self-pay',payer:'',member:'',group:''}}});
 const scr={};[['Amphetamines','Positive'],['Barbiturates'],['Buprenorphine'],['Benzodiazepines'],['Cocaine'],['Ethyl glucuronide (EtG), screen only'],['MDMA'],['Methadone'],['Opiates'],['Oxycodone','Positive'],['PCP'],['Fentanyl'],['Cannabinoids (THC)','Positive'],['Heroin (6-MAM)']].forEach(([n,v])=>scr[n]={v:v||'Negative'});
 Object.assign(scr,{'Urine creatinine (validity)':{v:'108'},'Urine pH (validity)':{v:'6'},'Urine specific gravity (validity)':{v:'1.011'},'Specimen validity':{v:'Normal'}});
 const P=(t,k,v)=>({v:'Positive',c:t,comps:{[k]:{pos:true,text:v}}}),Ng={v:'Negative',c:''};
 store.orders.push({id,clinic_id:'c1001',data:{id,accession:'239575',clinicId:'c1001',patientId:'ptJ',providerId:'p1',tests:['UDS','CONF'],
  confirm:['Oxycodone','Oxymorphone','Amphetamine','Methamphetamine','Alprazolam','THC (Cannabinoids)','Cocaine / Benzoylecgonine','Morphine','Fentanyl'],meds:[],rxMeds:['Percocet','Gabapentin','Vyvanse','Xanax'],medsText:'',icd:['Z79.891'],toxSpec:'Urine',screen:'reflex',reflex:true,poct:{},collector:'',recollect:false,billType:'Self pay',
  collectedAt:Date.now()-86400e3,createdAt:Date.now()-86400e3,stat:false,fasting:false,notes:'',consents:{patient:{method:'paper',at:1},provider:{paper:true,at:1,attest:true}},status:'In Process',
  history:[{s:'Ordered',at:Date.now()-86400e3,by:'x'},{s:'Received',at:Date.now()-80000e3,by:'Jaime'},{s:'In Process',at:Date.now()-70000e3,by:'Luna'}],
  results:{UDS:scr,CONF:{'Oxycodone':P('Oxycodone 352','oxycodone','352'),'Oxymorphone':P('Oxymorphone 189','oxymorphone','189'),'Amphetamine':P('Amphetamine 1,063','amphetamine','1,063'),'Methamphetamine':Ng,'Alprazolam':Ng,'THC (Cannabinoids)':P('THC-COOH 77','thccooh','77'),'Cocaine / Benzoylecgonine':Ng,'Morphine':Ng,'Fentanyl':Ng}},readAt:null,releasedAt:null}});
})();

// TOXSEED: orders matching the real instrument export files
(()=>{if(!globalThis.__TOXSEED)return;const mkP=(id,first,last,sex)=>store.patients.push({id,clinic_id:'c1001',data:{id,clinicId:'c1001',mrn:'M'+id,first,last,dob:'1980-01-01',sex,phone:'',email:'',address:'',city:'',state:'AZ',zip:'',ins:{type:'Self-pay',payer:'',member:'',group:''}}});
 const mkO=(acc,pid,tests,extra)=>{const id='ox'+acc;store.orders.push({id,clinic_id:'c1001',data:{id,accession:acc,clinicId:'c1001',patientId:pid,providerId:'p1',tests,confirm:[],meds:[],medsText:'',icd:['Z79.891'],toxSpec:'Urine',screen:tests.includes('UDS')?'only':'none',reflex:false,poct:{},collector:'',recollect:false,billType:'Self pay',collectedAt:Date.now()-3600e3,createdAt:Date.now()-3600e3,stat:false,fasting:false,notes:'',consents:{patient:{method:'paper',at:1},provider:{paper:true,at:1,attest:true}},status:'Received',history:[{s:'Ordered',at:1,by:'x'},{s:'Received',at:2,by:'x'}],results:{},readAt:null,releasedAt:null,...extra}})};
 mkP('ptA','Tox','One','M');
 for(const a of ['50018184','50018185','50018186','50018187','50018188','50018189','50018190','50018191','50018192'])mkO(a,'ptA',['UDS']);
 const U=['Amphetamine','Methamphetamine','Alprazolam','Clonazepam','Buprenorphine','Codeine','Fentanyl','Heroin / 6-AM','Hydrocodone','Hydromorphone','Methadone','Morphine','Oxycodone','Oxymorphone','Tramadol','Cocaine / Benzoylecgonine','THC (Cannabinoids)'];
 mkO('60000003','ptA',['CONF'],{confirm:U,meds:['Morphine']});mkO('60000004','ptA',['CONF'],{confirm:U});
 mkO('70000001','ptA',['CONFOF'],{toxSpec:'Oral fluid',confirm:['Amphetamine','Methamphetamine','Alprazolam','Fentanyl','Morphine','Oxycodone','THC (Cannabinoids)','ETG / ETS','Cocaine / Benzoylecgonine'],meds:[]});
})();
const errors=[];
globalThis.__mock={store,errors,get user(){return user}};
const prof=()=>user&&store.profiles.find(p=>p.user_id===user.id);
function visible(t){const p=prof();if(!p)return t==='profiles'?[]:[];if(aal!=='aal2'&&!['clinic','patient'].includes(p.role)&&t!=='profiles')return[];
 if(p.role==='patient'){if(t==='profiles')return store.profiles.filter(x=>x.user_id===user.id);if(t==='settings')return store.settings.filter(x=>x.key==='lab');if(t==='report_versions')return store.report_versions.filter(v=>{const o=store.orders.find(x=>x.id===v.order_id);return o&&(p.patient_ids||[]).includes(o.data.patientId)&&o.data.patientPortal!==false});return []}
 if(t==='profiles')return store.profiles.filter(x=>x.user_id===user.id||p.role==='lab');
 if(t==='audit_log')return p.role==='lab'&&aal==='aal2'?store.audit_log:[];
 if(p.role==='lab')return store[t];
 const c=p.clinic_id;
 if(t==='clinics')return store.clinics.filter(x=>x.id===c);
 if(t==='patients'||t==='orders')return store[t].filter(x=>x.clinic_id===c);
 if(t==='notes')return store.notes.filter(x=>x.aud===c);
 if(t==='supply_orders')return store.supply_orders.filter(x=>x.clinic_id===c);
 if(t==='pickups'||t==='invoices')return store[t].filter(x=>x.clinic_id===c);
 if(t==='settings')return store.settings.filter(x=>x.key==='lab');
 return[];}
function canWrite(t,row,op){const p=prof();if(!p||(aal!=='aal2'&&p.role!=='clinic'))return false;if(p.role==='lab')return true;
 if(['claims','outbox','settings'].includes(t))return false;
 if(t==='clinics')return op==='update'&&row.id===p.clinic_id&&(()=>{const old=store.clinics.find(x=>x.id===row.id);return old.data.status===row.data.status&&old.data.acct===row.data.acct})();
 if(t==='patients')return row.data.clinicId===p.clinic_id;
 if(t==='orders'){if(row.data.clinicId!==p.clinic_id)return false;if(op==='insert')return row.data.status==='Ordered'&&JSON.stringify(row.data.results||{})==='{}';const old=store.orders.find(x=>x.id===row.id);const strip=d=>{const x={...d};delete x.readAt;delete x.flags;return JSON.stringify(x)};return strip(old.data)===strip(row.data)}
 if(t==='notes')return op==='insert'?row.data.aud==='lab':row.data.aud===p.clinic_id;
 if(t==='supply_orders')return op==='insert'&&row.data.clinicId===p.clinic_id;
 if(t==='pickups')return row.data.clinicId===p.clinic_id&&['Requested','Cancelled'].includes(row.data.status);
 if(t==='invoices')return false;
 if(t==='audit_log')return true;return false}
const thenable=v=>({then:(a,b)=>Promise.resolve(v).then(a,b)});
export function createClient(){
 const auth={async getSession(){return{data:{session:user?{user}:null}}},
  async signInWithPassword({email,password}){const u=USERS.find(x=>x.email===email&&x.pw===password);if(!u)return{error:{message:'Invalid login credentials'}};user=u;aal='aal1';return{error:null}},
  async signOut(){user=null;aal='aal1'},async getUser(){return{data:{user}}},onAuthStateChange(){},async resetPasswordForEmail(){return{}},async updateUser(){return{error:null}},
  async signUp({email,password,options}){const u={id:'u'+(++seq),email,pw:password,user_metadata:options.data,factors:[]};USERS.push(u);user=u;aal='aal1';return{data:{session:{user:u},user:u},error:null}},
  mfa:{async getAuthenticatorAssuranceLevel(){return{data:{currentLevel:aal,nextLevel:'aal2'}}},
   async listFactors(){return{data:{totp:user.factors,all:user.factors}}},async unenroll(){return{}},
   async enroll(){return{data:{id:'f-'+user.id,totp:{qr_code:'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'JBSWY3DP'}}}},
   async challenge(){return{data:{id:'ch'}}},
   async verify({factorId,code}){if(code!=='123456')return{error:{message:'Invalid TOTP code'}};user.factors=[{id:factorId,status:'verified'}];aal='aal2';return{error:null}}}};
 function from(t){const q={_eq:null,_range:null,_f:[],gte(c,v){q._f.push(x=>x[c]>=v);return q},lte(c,v){q._f.push(x=>x[c]<=v);return q},order(){q._ord=1;return q},in(c,v){q._f.push(x=>v.includes(x[c]));return q},select(){return q},eq(c,v){q._eq=[c,v];return q},range(a,b){q._range=[a,b];return q},limit(n){q._lim=n;return q},async single(){let r=visible(t).filter(x=>q._f.every(f=>f(x)));if(q._eq)r=r.filter(x=>x[q._eq[0]]===q._eq[1]);return r[0]?{data:JSON.parse(JSON.stringify(r[0])),error:null}:{data:null,error:{message:'not found'}}},
  async maybeSingle(){const r=visible(t).filter(x=>x[q._eq[0]]===q._eq[1]);return{data:r[0]||null,error:null}},
  then(res,rej){let r=visible(t);r=r.filter(x=>q._f.every(f=>f(x)));if(q._ord)r=[...r].reverse();if(q._eq)r=r.filter(x=>x[q._eq[0]]===q._eq[1]);if(q._range)r=r.slice(q._range[0],q._range[1]+1);if(q._lim)r=r.slice(0,q._lim);return Promise.resolve({data:JSON.parse(JSON.stringify(r)),error:null}).then(res,rej)},
  insert(rows){if(!store[t]){const e={error:{code:'PGRST205',message:`Could not find the table 'public.${t}' in the schema cache`}};return{...e,select(){return{single:async()=>e,then:(r,j)=>Promise.resolve(e).then(r,j)}},then:(r,j)=>Promise.resolve(e).then(r,j)}}rows=[].concat(rows);for(const r of rows){if(t==='audit_log'){store.audit_log.push({id:store.audit_log.length+1,at:new Date().toISOString(),actor:user&&user.id,...r});continue}const row={...r};if(row.id===undefined&&t!=='settings')row.id='auto'+Math.random().toString(36).slice(2,10);if(['patients','orders','supply_orders','pickups','invoices'].includes(t))row.clinic_id=row.data.clinicId;if(t==='notes')row.aud=row.data.aud;
    if(!canWrite(t,row,'insert')){const e={message:`new row violates row-level security policy for table "${t}"`};errors.push(e);return thenable({error:e})}
    if(store[t].some(x=>x.id===row.id)){const e={message:'duplicate key'};errors.push(e);return thenable({error:e})}
    row.updated_at=new Date().toISOString();store[t].push(JSON.parse(JSON.stringify(row)))}return thenable({error:null})},
  delete(){const q={eq(c,v){q.c=c;q.v=v;return q},select(){return q},then(res,rej){const i=store[t].findIndex(x=>x[q.c]===q.v);const p=prof();let out={data:[],error:null};if(i>=0&&visible(t).includes(store[t][i])){if(t==='clinics'&&!(p&&p.role==='lab'&&(p.lab_roles||[]).includes('admin')))out={data:[],error:null};else if(t==='clinics'&&(store.orders.some(o=>o.clinic_id===q.v)||store.patients.some(o=>o.clinic_id===q.v)||store.profiles.some(o=>o.clinic_id===q.v)))out={data:[],error:null};else{const [r]=store[t].splice(i,1);out={data:[{id:r.id}],error:null}}}return Promise.resolve(out).then(res,rej)}};return q},
  update(patch){return{eq:async(c,v)=>{const i=store[t].findIndex(x=>x[c]===v);if(i<0||!visible(t).includes(store[t][i]))return{error:null};const row={...store[t][i],...patch,updated_at:new Date().toISOString()};
    if(!canWrite(t,row,'update')){const e={message:`update blocked on ${t}`};errors.push(e);return{error:e}}store[t][i]=JSON.parse(JSON.stringify(row));return{error:null}}}},
  upsert(rows,opts){rows=[].concat(rows);for(const r of rows){if(!canWrite(t,r,'upsert')){const e={message:'settings blocked'};errors.push(e);return thenable({error:e})}const i=r.id!==undefined?store[t].findIndex(x=>x.id===r.id):store[t].findIndex(x=>x.key===r.key);if(i>=0){if(!(opts&&opts.ignoreDuplicates))store[t][i]=JSON.parse(JSON.stringify(r))}else store[t].push(JSON.parse(JSON.stringify(r)))}return thenable({error:null})}};return q}
 function rpc(name,args){const pr=rpcImpl(name,args);const b={_r:null,range(a,z){b._r=[a,z];return b},then(res,rej){return pr.then(r=>{if(b._r&&r&&Array.isArray(r.data))r={...r,data:r.data.slice(b._r[0],b._r[1]+1)};return r}).then(res,rej)}};return b}
 async function rpcImpl(name,args){if(globalThis.__mock&&globalThis.__mock.noScale&&/^(server_now|doc_window|changes_since|search_|patient_orders|orders_|patients_by|client_bill|order_facts|claims_since|patient_facts)/.test(name))return{error:{code:'PGRST202',message:'Could not find the function'}};
  const rows=t=>visible(t).map(r=>({id:r.id,data:r.data,updated_at:r.updated_at||'2020-01-01T00:00:00Z'}));
  if(name==='clinic_usage'){const c=args.p_clinic;return{data:{patients:store.patients.filter(x=>x.clinic_id===c).length,orders:store.orders.filter(x=>x.clinic_id===c).length,users:store.profiles.filter(x=>x.clinic_id===c).length},error:null}}
  if(name==='mfa_required'){const p=prof();if(p&&p.role==='patient')return{data:false,error:null};if(p&&p.role==='clinic'){const c=store.clinics.find(x=>x.id===p.clinic_id);const v=c&&c.data.settings&&c.data.settings.mfa;return{data:v===undefined?false:!!v,error:null}}return{data:true,error:null}}
  if(name==='server_now')return{data:new Date().toISOString(),error:null};
  if(name==='doc_window'){const since=Date.now()-args.p_days*864e5;const act=['Ordered','Received','In Process'];return{data:rows(args.p_table).filter(r=>!r.updated_at||new Date(r.updated_at).getTime()>=since||act.includes(r.data.status)||(r.data.storage&&!r.data.storage.disposedAt)||(['claims','outbox'].includes(args.p_table)&&r.data.status!=='Sent')||(args.p_table==='patients'&&visible('orders').some(o=>o.data.patientId===r.id&&(new Date(o.updated_at||0).getTime()>=since||act.includes(o.data.status))))),error:null}}
  if(name==='changes_since')return{data:rows(args.p_table).filter(r=>r.updated_at>args.p_since),error:null};
  if(name==='search_orders'){const q=args.p_q.toLowerCase(),pids=visible('patients').filter(p=>(p.data.last||'').toLowerCase().includes(q)||(p.data.first||'').toLowerCase().includes(q)).map(p=>p.id);return{data:rows('orders').filter(r=>(r.data.accession||'').toLowerCase().includes(q)||pids.includes(r.data.patientId)),error:null}}
  if(name==='search_patients'){const q=args.p_q.toLowerCase();return{data:rows('patients').filter(r=>(r.data.last||'').toLowerCase().includes(q)||(r.data.first||'').toLowerCase().includes(q)||(r.data.mrn||'').toLowerCase().startsWith(q)),error:null}}
  if(name==='patient_orders')return{data:rows('orders').filter(r=>r.data.patientId===args.p_patient),error:null};
  if(name==='orders_by_ids')return{data:rows('orders').filter(r=>args.p_ids.includes(r.id)),error:null};
  if(name==='patients_by_ids')return{data:rows('patients').filter(r=>args.p_ids.includes(r.id)),error:null};
  if(name==='orders_before')return{data:rows('orders').filter(r=>r.data.collectedAt<args.p_before).sort((a,b)=>b.data.collectedAt-a.data.collectedAt).slice(0,args.p_limit),error:null};
  if(name==='client_bill_orders')return{data:rows('orders').filter(r=>r.data.billType==='Client bill'&&r.data.status==='Released'&&r.data.collectedAt>=args.p_from&&r.data.collectedAt<args.p_to),error:null};
  if(name==='order_facts')return{data:visible('orders').filter(r=>(r.data.createdAt||0)>=args.p_from&&(!args.p_clinic||r.clinic_id===args.p_clinic)).map(r=>{const d=r.data,rc=(d.history||[]).find(h=>h.s==='Received');return{id:r.id,clinic_id:r.clinic_id,patient_id:d.patientId,created_at:new Date(d.createdAt||Date.now()).toISOString(),status:d.status,tests:d.tests,bill_type:d.billType,collected_at:d.collectedAt,released_at:d.releasedAt||null,received_at:rc?rc.at:null,reject_reason:d.rejectReason||null,corrections:(d.corrections||[]).length,summary:d.summary||null}}),error:null};
  if(name==='claims_since')return{data:rows('claims'),error:null};
  if(name==='patient_facts')return{data:visible('patients').map(r=>({id:r.id,clinic_id:r.clinic_id,first:r.data.first,last:r.data.last,dob:r.data.dob,merged:r.data.mergedInto||null})),error:null};
  if(name==='orders_missing_summary')return{data:rows('orders').filter(r=>r.data.status==='Released'&&!r.data.summary).slice(0,args.p_limit),error:null};
if(name==='next_seq'){if(!prof()||(aal!=='aal2'&&prof().role!=='clinic'))return{error:{message:'Not authorized'}};return{data:++acc,error:null}}
  if(name==='create_clinic'){seq++;const id='c'+seq;store.clinics.push({id,data:{...args.p_clinic,id,acct:'FBG-'+seq,status:prof().lab_roles.includes('admin')&&args.p_clinic.status==='active'?'active':'pending',createdAt:Date.now()}});return{data:id,error:null}}
  if(name==='mfa_required'){const p=prof();return{data:!(p&&['clinic','patient'].includes(p.role)),error:null}}
  if(name==='password_changed'){prof().must_change_pw=false;return{data:null,error:null}}
  if(name==='register_clinic'){if(prof())return{error:{message:'already'}};seq++;const id='c'+seq;store.clinics.push({id,data:{...args.p_clinic,id,acct:'FBG-'+seq,status:'pending',createdAt:Date.now()}});store.profiles.push({user_id:user.id,role:'clinic',clinic_id:id,name:args.p_name,email:user.email});store.notes.push({id:'nr'+seq,aud:'lab',data:{id:'nr'+seq,aud:'lab',title:'New clinic registration',body:'x',level:'info',at:Date.now(),read:false}});return{data:id,error:null}}}
 const functions={async invoke(name,opts){if(name==='patient-access'){const b=opts.body,code=String(b.code||'').toUpperCase().replace(/[^A-Z0-9]/g,''),o=store.orders.find(x=>x.data.accessCode===code),pt=o&&store.patients.find(x=>x.id===o.data.patientId),nn=v=>String(v||'').toLowerCase().replace(/[^a-z]/g,'');
  const bad={data:null,error:{message:'x',context:{json:async()=>({error:"We couldn't match that code, last name and date of birth. Check them against your paperwork and try again."})}}};
  if(!pt||nn(pt.data.last)!==nn(b.lastName)||pt.data.dob!==b.dob)return bad;
  if(b.action==='link'){const p=prof();p.patient_ids=[...new Set([...(p.patient_ids||[]),pt.id])];return{data:{ok:true},error:null}}
  const id='uP'+USERS.length;USERS.push({id,email:b.email,pw:b.password,user_metadata:{},factors:[]});store.profiles.push({user_id:id,role:'patient',name:pt.data.first+' '+pt.data.last,email:b.email,active:true,patient_ids:[pt.id],lab_roles:[]});return{data:{ok:true},error:null}}
if(name==='send-alerts'&&opts&&opts.body&&opts.body.action==='referral'){globalThis.__mock.refNotes=(globalThis.__mock.refNotes||[]).concat([opts.body]);return{data:{ok:true,detail:'Emailed lab@amicodx.test'},error:null}}if(name==='send-alerts'&&opts&&opts.body&&opts.body.action==='status')return{data:{email:false,text:false,fax:false,portalUrl:true},error:null};if(name==='send-alerts'&&opts&&opts.body&&opts.body.action==='test')return{data:{ok:false,error:"Texting isn't set up: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM."},error:null};if(name==='manage-users'){const b=opts.body;globalThis.__mock.mu=(globalThis.__mock.mu||[]).concat([b.action]);if(b.action==='list')return{data:{users:store.profiles.map(p=>({id:p.user_id,email:p.email,name:p.name,kind:p.role,roles:p.lab_roles||[],clinicId:p.clinic_id,active:p.active!==false,linked:true,mfa:true,lastSignIn:null}))},error:null};if(b.action==='create'){if(b.username)b.email=b.username.toLowerCase()+'@users.firstbiogenetics.com';const id='uN'+store.profiles.length;store.profiles.push({user_id:id,role:b.kind,lab_roles:b.roles,clinic_id:b.clinicId||null,provider_ids:b.providerIds||[],name:b.name,email:b.email,active:true,must_change_pw:true});USERS.push({id,email:b.email,pw:'TempPass12345678',user_metadata:{},factors:[]});return{data:{ok:true,tempPassword:'TempPass12345678'},error:null}}if(b.action==='update'){const p=store.profiles.find(x=>x.user_id===b.userId);p.lab_roles=b.roles;p.role=b.kind;return{data:{ok:true},error:null}}return{data:{ok:true},error:null}}globalThis.__mock.invoked=(globalThis.__mock.invoked||0)+1;let n=0;for(const r of store.outbox){if(r.data.status==='Queued'){globalThis.__mock.lastFax=r.data.channel==='Fax'?r.data.report:globalThis.__mock.lastFax;r.data={...r.data,status:'Sent',detail:'ok',sentAt:Date.now()};if(r.data.channel==='Fax')delete r.data.report;n++}}return{data:{processed:n,sent:n,failed:0},error:null}}};
 const storage={from(b){return{async upload(path,file){globalThis.__mock.uploads=(globalThis.__mock.uploads||[]).concat([path]);return{error:null}},async createSignedUrl(path){return{data:{signedUrl:'https://signed/'+path},error:null}}}}};
 return{auth,from,rpc,functions,storage};}
