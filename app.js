function saveDb(){localStorage.setItem(STORAGE_KEY,JSON.stringify(db)); if(typeof saveRemoteDb==='function')saveRemoteDb()}
function nextId(col){return col&&col.length?Math.max(...col.map(x=>Number(x.id)||0))+1:1}
function nowLocalString(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function formatDateTime(v){return v?v.replace('T',' '):'—'}
function getUserById(id){return db.users.find(x=>x.id===id)}
function getItemById(id){return db.items.find(x=>x.id===id)}
function hasPermission(p){if(!state.currentUser)return false; if(state.currentUser.role==='admin')return true; return (state.currentUser.permissions||[]).includes(p)}
function availableReportTabs(){return [['senior','تقرير الإدارة العليا','report_senior'],['inventory','المخزون العام','report_inventory'],['transactions','الصرف والحركات','report_transactions'],['needs','الاحتياج','report_needs'],['support','الدعم بين القطاعات','report_support'],['low','تحت الحد الأدنى','report_low']].filter(x=>hasPermission(x[2]))}
function isCentral(){return state.currentUser?.role==='admin'||state.currentUser?.college==='إدارة التجهيزات'}
function canAccessCollege(college){return isCentral()||state.currentUser?.college===college}
function hasDepartmentScope(){return !isCentral() && !!state.currentUser?.department && state.currentUser.department!=='الكل'}
function actorName(id){return getUserById(id)?.fullName||'—'}

function statusText(s){
  return {
    pending:'تحت الإجراء',
    pending_owner:'بانتظار موافقة الجهة المالكة',
    owner_approved:'موافقة الجهة المالكة',
    pending_equipment:'بانتظار اعتماد إدارة التجهيزات',
    approved:'معتمد',
    rejected:'مرفوض',
    completed:'مكتمل'
  }[s]||s||'تحت الإجراء'
}
function normalizeText(v){
  return String(v||'').toLowerCase()
    .replace(/[إأآا]/g,'ا').replace(/[ىي]/g,'ي').replace(/[ة]/g,'ه')
    .replace(/hydrochloric acid|hcl/gi,'حمض الكلوريدريك')
    .replace(/sodium hydroxide|naoh/gi,'هيدروكسيد الصوديوم')
    .replace(/ethanol/gi,'ايثانول')
    .replace(/[^\u0600-\u06FFa-z0-9%]+/gi,'')
}
function auditLog(action,targetType,targetId,details,college=null,department=null){
  if(!Array.isArray(db.auditLogs))db.auditLogs=[]
  db.auditLogs.unshift({
    id:nextId(db.auditLogs),
    action,targetType,targetId:String(targetId??'—'),
    college:college||state.currentUser?.college||'—',
    department:department||state.currentUser?.department||'—',
    details:details||'',
    createdAt:nowLocalString(),
    createdBy:state.currentUser?.id||null
  })
}
function visibleAuditLogs(){
  let rows=db.auditLogs||[]
  if(!isCentral())rows=rows.filter(r=>r.college===state.currentUser.college||r.createdBy===state.currentUser.id)
  if(state.collegeFilter!=='all')rows=rows.filter(r=>r.college===state.collegeFilter)
  if(state.sectionFilter!=='all')rows=rows.filter(r=>r.department===state.sectionFilter||r.department==='الكل')
  if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.action,r.targetType,r.targetId,r.college,r.department,r.details,actorName(r.createdBy)].join(' ').includes(q))}
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
}
function approvalPath(type,status){
  if(type==='support'){
    const steps=['تقديم الطلب','موافقة الجهة المالكة','اعتماد إدارة التجهيزات','إغلاق الطلب']
    const idx={pending_owner:0,owner_approved:1,pending_equipment:1,approved:3,rejected:3}[status||'pending_owner']??0
    return `<div class="workflow">${steps.map((s,i)=>`<span class="${i<=idx?'done':''}">${s}</span>`).join('')}</div>`
  }
  const steps=['تقديم الطلب','مراجعة المسؤول','اعتماد نهائي']
  const idx={pending:0,approved:2,rejected:2}[status||'pending']??0
  return `<div class="workflow">${steps.map((s,i)=>`<span class="${i<=idx?'done':''}">${s}</span>`).join('')}</div>`
}
function alertsHtml(){
  const lows=lowStock().length, pendingIssue=visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length
  const pendingNeeds=filteredNeeds().filter(n=>(n.status||'pending')==='pending').length
  const noEvidenceNeeds=filteredNeeds().filter(n=>evidenceCountForNeed(n.id)===0).length
  const pendingSupport=filteredSupport().filter(s=>String(s.status||'').startsWith('pending')||s.status==='owner_approved').length
  const cards=[
    ['مواد تحت الحد الأدنى',lows,'تحتاج معالجة أو رفع احتياج'],
    ['طلبات صرف معلقة',pendingIssue,'بانتظار قرار المسؤول'],
    ['طلبات احتياج معلقة',pendingNeeds,'بانتظار متابعة إدارة التجهيزات'],
    ['طلبات احتياج بلا شواهد',noEvidenceNeeds,'يفضل استكمالها قبل الاعتماد'],
    ['طلبات دعم بين القطاعات',pendingSupport,'بانتظار الموافقات']
  ]
  return `<div class="alert-grid">${cards.map(c=>`<div class="alert-card"><strong>${c[0]}</strong><b>${c[1]}</b><span>${c[2]}</span></div>`).join('')}</div>`
}


function collegeCode(college){
  return (db.settings?.colleges||[]).find(c=>c.name===college)?.code || {
    'كلية الصيدلة':'PHRM','كلية التمريض':'NURS','كلية الطب':'MED','كلية الأسنان':'DENT','إدارة التجهيزات':'EQPM'
  }[college] || 'UNIT'
}
function sectionCode(section){
  return (db.settings?.sections||[]).find(c=>c.name===section)?.code || {
    'المواد الكيميائية':'CHM','المستهلكات التعليمية':'CON','الأجهزة التعليمية':'DEV'
  }[section] || 'GEN'
}
function normalizeItemCodes(){
  const groups={}
  ;(db.items||[]).forEach(item=>{
    const key=`${item.college}||${item.section}`
    if(!groups[key])groups[key]=[]
    groups[key].push(item)
  })
  Object.values(groups).forEach(group=>{
    group.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')) || ((a.id||0)-(b.id||0)))
    group.forEach((item,idx)=>{
      item.code=`${collegeCode(item.college)}-${sectionCode(item.section)}-${String(idx+1).padStart(3,'0')}`
    })
  })
}
function generateItemCode(college,section,currentId=null){
  const siblings=(db.items||[])
    .filter(i=>i.college===college&&i.section===section&&(!currentId||i.id!==currentId))
    .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')) || ((a.id||0)-(b.id||0)))
  return `${collegeCode(college)}-${sectionCode(section)}-${String(siblings.length+1).padStart(3,'0')}`
}
function collegeFilterControl(forceCollege=false){
  if(!(isCentral()||forceCollege)) return ''
  return `<select class="select" onchange="setCollegeFilter(this.value)">${collegeOptions(state.collegeFilter,true)}</select>`
}
function deviceStatuses(){return ['يعمل','تحت الصيانة','متوقف','عهدة']}
function statusBadge(s){if(s==='approved')return '<span class="badge badge-ok">معتمد</span>'; if(s==='rejected')return '<span class="badge badge-danger">مرفوض</span>'; if(s==='pending_owner'||s==='owner_approved'||s==='pending_equipment')return '<span class="badge badge-warning">'+statusText(s)+'</span>'; return '<span class="badge badge-info">تحت الإجراء</span>'}
function itemName(i){return i?.nameAr||i?.name||'—'}
function visibleItems(all=false){let rows=db.items||[]; if(!all&&!isCentral())rows=rows.filter(i=>i.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(i=>i.section===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(i=>i.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(i=>i.section===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(i=>[i.code,i.college,i.section,itemName(i),i.nameEn,i.location,i.serialNumber].join(' ').includes(q))} return rows}
function visibleTransactions(){let rows=db.transactions||[]; if(!isCentral())rows=rows.filter(t=>t.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(t=>t.section===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(t=>t.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(t=>t.section===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(t=>[itemName(getItemById(t.itemId)),t.college,t.section,t.type,t.notes,t.status,actorName(t.createdBy),actorName(t.reviewedBy)].join(' ').includes(q))} return rows.sort((a,b)=>(b.transactionAt||'').localeCompare(a.transactionAt||''))}
function filteredNeeds(){let rows=db.needsRequests||[]; if(!isCentral())rows=rows.filter(r=>r.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(r=>r.section===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(r=>r.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.requestNo,r.college,r.section,r.itemNameAr,r.itemNameEn,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q))} return rows}
function filteredSupport(){let rows=db.supportRequests||[]; if(!isCentral())rows=rows.filter(r=>r.fromCollege===state.currentUser.college||r.toCollege===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(r=>r.section===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(r=>r.fromCollege===state.collegeFilter||r.toCollege===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.requestNo,r.fromCollege,r.toCollege,r.section,r.itemName,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q))} return rows}
function lowStock(){const rows=isCentral()?visibleItems(true):visibleItems(); return rows.filter(i=>i.qty<=i.minQty)}
function metrics(){const items=isCentral()?visibleItems(true):visibleItems(), tx=visibleTransactions(), needs=filteredNeeds(), support=filteredSupport(); return {items:items.length,colleges:new Set(items.map(i=>i.college)).size,low:items.filter(i=>i.qty<=i.minQty).length,devices:items.filter(i=>i.section==='الأجهزة التعليمية').length,pendingIssue:tx.filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,pendingNeeds:needs.filter(n=>(n.status||'pending')==='pending').length,pendingSupport:support.filter(s=>(s.status||'pending')==='pending').length,approvedSupport:support.filter(s=>s.status==='approved').length}}
function nextNo(prefix,col){const y=new Date().getFullYear(); const nums=(col||[]).filter(r=>String(r.requestNo||'').startsWith(`${prefix}-${y}-`)).map(r=>Number(String(r.requestNo).split('-').pop())||0); return `${prefix}-${y}-${String((nums.length?Math.max(...nums):0)+1).padStart(4,'0')}`}
function collegeOptions(selected, includeAll=false){return `${includeAll?`<option value="all" ${selected==='all'?'selected':''}>كل القطاعات</option>`:''}${COLLEGE_OPTIONS.map(c=>`<option value="${c}" ${selected===c?'selected':''}>${c}</option>`).join('')}`}
function sectionOptions(selected, includeAll=false){return `${includeAll?`<option value="all" ${selected==='all'?'selected':''}>كل الأقسام</option>`:''}${SECTION_OPTIONS.map(s=>`<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('')}`}
function userDepartmentOptions(selected){return `${USER_SECTION_OPTIONS.map(s=>`<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('')}`}
function setPage(p){state.currentPage=p;state.search='';state.collegeFilter='all';state.sectionFilter='all';state.sidebarOpen=false;render()}
let __searchRenderTimer=null
function setSearch(v,el=null){state.search=v; clearTimeout(__searchRenderTimer); __searchRenderTimer=setTimeout(()=>render(),180)}
function setCollegeFilter(v){state.collegeFilter=v;render()}
function setSectionFilter(v){state.sectionFilter=v;render()}
function toggleSidebar(){state.sidebarOpen=!state.sidebarOpen;render()}
function closeSidebar(){state.sidebarOpen=false;render()}
function logout(){state.currentUser=null;state.currentPage='executive';render()}
function doLogin(){
  if(typeof repairDbIfNeeded==='function')repairDbIfNeeded('before-login');
  const u=document.getElementById('login-username').value.trim(),p=document.getElementById('login-password').value.trim();
  let user=(db.users||[]).find(x=>x.username===u&&x.password===p&&x.isActive);
  if(!user && typeof freshDefaultDb==='function'){
    const fallback=freshDefaultDb();
    const fallbackUser=(fallback.users||[]).find(x=>x.username===u&&x.password===p&&x.isActive);
    if(fallbackUser){
      db=fallback;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
      user=(db.users||[]).find(x=>x.username===u&&x.password===p&&x.isActive);
    }
  }
  if(!user)return alert('اسم المستخدم أو كلمة المرور غير صحيحة');
  state.currentUser=user;render()
}
function openModal(type,id=null,txType='receive'){state.modal=type;state.editId=id;state.transactionType=txType;render()}
function closeModal(){state.modal=null;state.editId=null;render()}
function closeIfBackdrop(e){if(e.target.classList.contains('modal-backdrop'))closeModal()}
function renderLogin(){return `<div class="login-screen"><div class="login-card"><div class="login-title">جامعة طيبة</div><div class="login-subtitle">نظام إدارة القطاعات التعليمية<br>منصة موحدة للكليات والقطاعات التعليمية</div><div class="input-group"><label class="label">اسم المستخدم</label><input id="login-username" class="input" placeholder="أدخل اسم المستخدم"></div><div class="input-group"><label class="label">كلمة المرور</label><input id="login-password" type="password" class="input" placeholder="أدخل كلمة المرور"></div><button class="btn btn-primary" style="width:100%" onclick="doLogin()">تسجيل الدخول</button></div></div>`}
function navItems(){return [
{id:'executive',label:'اللوحة التنفيذية',icon:'🏛️',permission:'view_executive'},
{id:'dashboard',label:'لوحة القطاع',icon:'📊',permission:'view_dashboard'},
{id:'items',label:'الأصناف والمخزون',icon:'📦',permission:'view_items'},
{id:'transactions',label:'الإدخال والصرف',icon:'🔄',permission:'view_transactions'},
{id:'exchange',label:'طلب الدعم بين القطاعات',icon:'🤝',permission:'view_exchange'},
{id:'needs',label:'رفع الاحتياج',icon:'📝',permission:'view_needs'},
{id:'needEvidence',label:'شواهد الاحتياج',icon:'📚',permission:'view_need_evidence'},
...(isCentral()?[{id:'equipment',label:'إدارة التجهيزات',icon:'🏢',permission:'view_equipment'}]:[]),
{id:'reports',label:'التقارير',icon:'📋',permission:'view_reports'},
...(isCentral()?[{id:'audit',label:'سجل التدقيق',icon:'🧾',permission:'view_audit'}]:[]),
...(isCentral()?[{id:'org',label:'القطاعات والأقسام',icon:'🏷️',permission:'manage_org'}]:[]),
...(isCentral()?[{id:'users',label:'المستخدمون والصلاحيات',icon:'👥',permission:'manage_users'}]:[])
].filter(i=>hasPermission(i.permission))}
function getPageTitle(){return {executive:'اللوحة التنفيذية',dashboard:'لوحة القطاع',items:'الأصناف والمخزون',transactions:'الصرف والحركات',exchange:'طلب الدعم بين القطاعات',needs:'طلبات الاحتياج',equipment:'التحليل والمتابعة المركزية',reports:'التقارير',audit:'سجل التدقيق والعمليات',users:'المستخدمون والصلاحيات',org:'القطاعات والأقسام والترميز'}[state.currentPage]||''}
function filtersHtml(opts={college:true,section:true,search:true,forceCollege:false}){return `<div class="toolbar"><div class="toolbar-right">${opts.search?`<input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">`:''}${opts.college?collegeFilterControl(!!opts.forceCollege):''}${opts.section?`<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select>`:''}</div><div class="toolbar-left"></div></div>`}
function renderExecutive(){const m=metrics();return `<div class="executive-hero"><div class="executive-card"><div class="executive-title">جامعة طيبة — منصة موحدة للقطاعات التعليمية</div><div class="executive-text">تدير المنصة مخزون القطاعات، طلبات الصرف، رفع الاحتياج، وتبادل الدعم بين القطاعات، مع لوحة متابعة مركزية لإدارة التجهيزات.</div><div class="executive-list"><div class="executive-item">إتاحة رؤية المخزون بين القطاعات لدعم تبادل المنفعة وتقليل الهدر.</div><div class="executive-item">رفع الاحتياج لإدارة التجهيزات بناءً على بيانات فعلية من المخزون.</div><div class="executive-item">اعتماد أو رفض طلبات الصرف والدعم بسجل موثق قابل للتقرير.</div></div></div><div class="executive-card"><div class="executive-title">ملخص سريع</div><div class="executive-list"><div class="executive-item">القطاعات المفعلة: ${m.colleges}</div><div class="executive-item">الأصناف المسجلة: ${m.items}</div><div class="executive-item">طلبات دعم معلقة: ${m.pendingSupport}</div><div class="executive-item">احتياجات معلقة: ${m.pendingNeeds}</div></div></div></div>${kpisHtml(m)}${alertsHtml()}<div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">أصناف تحتاج متابعة</div><div class="panel-subtitle">أصناف وصلت للحد الأدنى أو أقل</div></div>${table(['القطاع','القسم','الصنف','الكمية','الحد الأدنى'],lowStock().slice(0,6).map(i=>[i.college,i.section,itemName(i),i.qty,i.minQty]))}</div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات دعم معلقة</div><div class="panel-subtitle">طلبات بين الكليات تنتظر الإجراء</div></div>${table(['رقم الطلب','من','إلى','الصنف','الكمية','الحالة'],filteredSupport().filter(r=>(r.status||'pending')==='pending').slice(0,6).map(r=>[r.requestNo,r.fromCollege,r.toCollege,r.itemName,r.qty,statusBadge(r.status)]))}</div></div>`}
function kpisHtml(m){return `<div class="grid"><div class="metric accent-blue"><div class="metric-label">إجمالي الأصناف</div><div class="metric-value">${m.items}</div><div class="metric-note">على مستوى النطاق المصرح</div></div><div class="metric accent-green"><div class="metric-label">الأجهزة التعليمية</div><div class="metric-value">${m.devices}</div><div class="metric-note">جاهزية وتشغيل</div></div><div class="metric accent-yellow"><div class="metric-label">طلبات معلقة</div><div class="metric-value">${m.pendingIssue}</div><div class="metric-note">بانتظار الاعتماد</div></div><div class="metric accent-pink"><div class="metric-label">مواد تحت الحد</div><div class="metric-value">${m.low}</div><div class="metric-note">تحتاج متابعة</div></div></div>`}
function renderDashboard(){return `<div class="hero"><div class="hero-title">لوحة متابعة ${isCentral()?'جامعة طيبة':state.currentUser.college}</div><div class="hero-text">تعرض مؤشرات المخزون والصرف والاحتياج والدعم بين القطاعات بصورة مختصرة.</div></div>${kpisHtml(metrics())}${alertsHtml()}<div class="table-panel"><div class="table-head"><div class="panel-title">حالة الأجهزة التعليمية</div></div>${table(['القطاع','الجهاز','الرقم التسلسلي','الحالة','الموقع','الكمية'],visibleItems(true).filter(i=>i.section==='الأجهزة التعليمية').map(i=>[i.college,itemName(i),i.serialNumber||'—',i.deviceStatus||'يعمل',i.location||'—',i.qty]))}</div>`}
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">لا توجد بيانات</td></tr>`}</tbody></table></div>`}
function renderItems(){const rows=visibleItems().map(i=>[i.college,i.code,itemName(i),i.nameEn||'—',i.section,i.unit,i.qty,i.minQty,i.location||'—',i.serialNumber||'—',i.section==='الأجهزة التعليمية'?(i.deviceStatus||'يعمل'):(i.qty<=i.minQty?'<span class="badge badge-low">منخفض</span>':'<span class="badge badge-ok">متوفر</span>'),hasPermission('edit_item')?`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('item',${i.id})">تعديل</button></div>`:'—']);return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('add_item')?`<button class="btn btn-primary" onclick="openModal('item')">+ إضافة صنف</button>`:''}${hasPermission('add_item')?`<button class="btn btn-secondary" onclick="openModal('importItems')">استيراد Excel</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">الأصناف والمخزون</div><div class="panel-subtitle">${isCentral()?'عرض مركزي للأصناف حسب القطاع والقسم.':'يعرض فقط أصناف ومخزون القطاع التابع للحساب الحالي.'}</div></div>${table(['القطاع','الرمز','العربي','English','القسم','الوحدة','الكمية','الحد الأدنى','الموقع','التسلسلي','الحالة','إجراءات'],rows)}</div>`}
function renderTransactions(){const rows=visibleTransactions().map(t=>{const i=getItemById(t.itemId); return [t.type==='receive'?'<span class="badge badge-ok">إدخال</span>':'<span class="badge badge-low">طلب صرف</span>',t.college,t.section,itemName(i),t.qty,t.unit,t.type==='issue'?statusBadge(t.status):'<span class="badge badge-ok">مكتمل</span>',formatDateTime(t.transactionAt),actorName(t.createdBy),transactionActions(t)]});return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('add_issue')?`<button class="btn btn-warning" onclick="openModal('transaction',null,'issue')">+ طلب صرف</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">سجلات الصرف والحركات</div><div class="panel-subtitle">${isCentral()?'عرض مركزي لحركات الصرف والحركات المسجلة على مستوى الجامعة.':'يعرض فقط حركات الصرف الخاصة بالقطاع التابع للحساب.'}</div></div>${table(['النوع','القطاع','القسم','الصنف','الكمية','الوحدة','الحالة','التاريخ','صاحب الإجراء','إجراء'],rows)}</div>`}
function renderExchange(){const items=visibleItems(true); const rows=items.map(i=>[i.college,i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',i.college!==state.currentUser.college&&hasPermission('request_support')?`<button class="btn btn-primary btn-sm" onclick="openSupportFromItem(${i.id})">طلب دعم</button>`:'—']); const reqRows=filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.itemName,r.qty,r.unit,statusBadge(r.status),approvalPath('support',r.status),formatDateTime(r.createdAt),supportActions(r)]);return `<div class="hero"><div class="hero-title">مخزون القطاعات التعليمية</div><div class="hero-text">تمكن الصفحة الكليات من رؤية الأصناف المتاحة لدى القطاعات الأخرى وطلب دعم/إعارة/سلفة تشغيلية وفق اعتماد القطاع المالكة للصنف.</div></div>${filtersHtml({forceCollege:true})}<div class="table-panel"><div class="table-head"><div class="panel-title">الأصناف المخزنة لدى جميع القطاعات</div><div class="panel-subtitle">يمكن البحث باسم الصنف بالعربية أو الإنجليزية أو الرمز، وتظهر النتائج من جميع القطاعات حسب الصلاحية.</div></div>${table(['القطاع','القسم','الصنف','English','المتاح','الوحدة','الموقع','طلب'],rows)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الدعم بين القطاعات</div></div>${table(['رقم الطلب','نوع الطلب','الجهة الطالبة','الجهة المالكة','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','تاريخ الطلب','إجراء'],reqRows)}</div>`}
function supportActions(r){const st=r.status||'pending_owner'; const owns=state.currentUser.college===r.toCollege; const buttons=[]; if(st==='pending_owner'&&owns&&hasPermission('approve_support')){buttons.push(`<button class="btn btn-success btn-sm" onclick="ownerApproveSupport(${r.id})">موافقة الجهة</button>`);buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectSupport(${r.id})">رفض</button>`)} if((st==='owner_approved'||st==='pending_equipment')&&isCentral()){buttons.push(`<button class="btn btn-success btn-sm" onclick="approveSupport(${r.id})">اعتماد نهائي</button>`);buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectSupport(${r.id})">رفض</button>`)} if((r.fromCollege===state.currentUser.college||owns||isCentral())&&hasPermission('request_support'))buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('supportEdit',${r.id})">تعديل</button>`); return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—'}
function renderNeeds(){const rows=filteredNeeds().map(r=>[r.requestNo,r.college,r.section,r.itemNameAr||'—',r.itemNameEn||'—',r.qty,r.unit,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)]);return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج</button>`:''}<button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الاحتياج الخاصة بالقطاع</div><div class="panel-subtitle">يعرض الطلبات المرفوعة من القطاع الحالي فقط، بينما تظهر المتابعة الشاملة في صفحة التحليل المركزية.</div></div>${table(['رقم الطلب','القطاع','القسم','العربي','English','الكمية','القياس','الحالة','شاهد الاحتياج','مسار الاعتماد','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}</div>`}
function needActions(r){const buttons=[]; if((r.status||'pending')==='pending'&&isCentral()&&hasPermission('approve_need')){buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${r.id})">اعتماد</button>`);buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${r.id})">رفض</button>`)} if((r.college===state.currentUser.college||isCentral())&&hasPermission('create_need'))buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('needEdit',${r.id})">تعديل</button>`); if((r.college===state.currentUser.college||isCentral())&&hasPermission('create_need_evidence'))buttons.push(`<button class="btn btn-warning btn-sm" onclick="openModal('evidence',${r.id})">شاهد</button>`); return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—'}
function renderEquipment(){const m=metrics();return `<div class="hero"><div class="hero-title">التحليل والمتابعة المركزية</div><div class="hero-text">لوحة مركزية لمتابعة إجراءات الكليات: المخزون، الصرف، الدعم بين القطاعات، وطلبات الاحتياج المرفوعة لسد النقص.</div></div><div class="grid"><div class="metric accent-blue"><div class="metric-label">كليات مفعلة</div><div class="metric-value">${COLLEGE_OPTIONS.length}</div><div class="metric-note">قطاعات تعليمية</div></div><div class="metric accent-green"><div class="metric-label">طلبات احتياج معلقة</div><div class="metric-value">${m.pendingNeeds}</div><div class="metric-note">تحتاج إجراء</div></div><div class="metric accent-yellow"><div class="metric-label">طلبات دعم معلقة</div><div class="metric-value">${m.pendingSupport}</div><div class="metric-note">بين الكليات</div></div><div class="metric accent-pink"><div class="metric-label">أصناف منخفضة</div><div class="metric-value">${m.low}</div><div class="metric-note">تحت الحد الأدنى</div></div></div>${alertsHtml()}<div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">تحليل المخزون حسب القطاع</div></div>${table(['القطاع','إجمالي الأصناف','تحت الحد','الأجهزة','طلبات دعم معلقة'],COLLEGE_OPTIONS.map(c=>{const items=db.items.filter(i=>i.college===c);return [c,items.length,items.filter(i=>i.qty<=i.minQty).length,items.filter(i=>i.section==='الأجهزة التعليمية').length,(db.supportRequests||[]).filter(r=>(r.status||'pending')==='pending'&&(r.fromCollege===c||r.toCollege===c)).length]}))}</div><div class="table-panel"><div class="table-head"><div class="panel-title">إجراءات تحتاج متابعة</div></div>${table(['النوع','الرقم/الصنف','القطاع','الحالة/الشاهد'],[...filteredNeeds().filter(r=>(r.status||'pending')==='pending').map(r=>['احتياج',r.requestNo,r.college,`${statusText(r.status)} - ${evidenceCountForNeed(r.id)>0?'يوجد شاهد':'لا يوجد شاهد'}`]),...filteredSupport().filter(r=>(r.status||'pending')==='pending').map(r=>['دعم بين القطاعات',r.requestNo,`${r.fromCollege} ← ${r.toCollege}`,statusBadge(r.status)])])}</div></div><div class="report-actions"><button class="btn btn-primary" onclick="printFullReport()">طباعة تقرير إداري شامل PDF</button><button class="btn btn-secondary" onclick="exportFullExcel()">تقرير شامل Excel</button></div>`}
function renderReports(){const tabs=availableReportTabs(); if(!tabs.length)return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">لم يتم منح هذا الحساب أي نوع من أنواع التقارير.</div></div>`; if(!tabs.some(t=>t[0]===state.reportTab))state.reportTab=tabs[0][0]; return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">تقارير موحدة على مستوى الجامعة أو القطاع حسب الصلاحية، مع إظهار صاحب الإجراء في كل حركة.</div></div><div class="report-tabs">${tabs.map(([id,l])=>`<button class="report-tab ${state.reportTab===id?'active':''}" onclick="state.reportTab='${id}';render()">${l}</button>`).join('')}</div>${filtersHtml()}<div class="report-actions"><button class="btn btn-primary" onclick="printCurrentReport()">استخراج PDF</button><button class="btn btn-secondary" onclick="exportCurrentExcel()">استخراج Excel</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">معاينة التقرير</div></div>${reportPreviewTable()}</div>`}
function reportData(){if(state.reportTab==='senior')return {title:'تقرير الإدارة العليا',headers:['المؤشر','القيمة','قراءة إدارية'],rows:[
['إجمالي الكليات المفعلة',COLLEGE_OPTIONS.length,'نطاق التشغيل الحالي للنظام'],
['إجمالي الأصناف',visibleItems(true).length,'حجم قاعدة بيانات المخزون'],
['الأصناف تحت الحد الأدنى',lowStock().length,'تتطلب معالجة أو رفع احتياج'],
['طلبات الصرف المعلقة',visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,'تتطلب اعتمادًا من المسؤول'],
['طلبات الاحتياج المعلقة',filteredNeeds().filter(r=>(r.status||'pending')==='pending').length,'تتطلب متابعة إدارة التجهيزات'],
['طلبات الدعم بين القطاعات',filteredSupport().filter(r=>String(r.status||'').startsWith('pending')||r.status==='owner_approved').length,'تتطلب موافقات تشغيلية'],
...COLLEGE_OPTIONS.map(c=>{const items=(db.items||[]).filter(i=>i.college===c);return [c,items.length+' صنف',`تحت الحد: ${items.filter(i=>i.qty<=i.minQty).length}`]})
]}; if(state.reportTab==='transactions')return {title:'تقرير الصرف والحركات',headers:['النوع','القطاع','القسم','الصنف','الكمية','الوحدة','الحالة','تاريخ الحركة','صاحب الإجراء','اعتمد بواسطة'],rows:visibleTransactions().map(t=>[t.type==='receive'?'إدخال':'صرف',t.college,t.section,itemName(getItemById(t.itemId)),t.qty,t.unit,statusText(t.status||'completed'),formatDateTime(t.transactionAt),actorName(t.createdBy),actorName(t.reviewedBy)])}; if(state.reportTab==='needs')return {title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','القطاع','القسم','العربي','English','الكمية','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','تمت المراجعة بواسطة'],rows:filteredNeeds().map(r=>[r.requestNo,r.college,r.section,r.itemNameAr,r.itemNameEn,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)])}; if(state.reportTab==='support')return {title:'تقرير الدعم بين القطاعات',headers:['رقم الطلب','نوع الطلب','من','إلى','القسم','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','موافقة الجهة','اعتماد التجهيزات'],rows:filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.section,r.itemName,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.ownerReviewedBy),actorName(r.reviewedBy)])}; if(state.reportTab==='low')return {title:'تقرير الأصناف تحت الحد الأدنى',headers:['القطاع','القسم','الصنف','الكمية','الحد الأدنى','الوحدة','آخر تحديث بواسطة'],rows:lowStock().map(i=>[i.college,i.section,itemName(i),i.qty,i.minQty,i.unit,actorName(i.createdBy)])}; return {title:'تقرير المخزون العام',headers:['القطاع','الرمز','القسم','العربي','English','الكمية','الوحدة','الموقع','صاحب الإجراء'],rows:(isCentral()?visibleItems(true):visibleItems()).map(i=>[i.college,i.code,i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',actorName(i.createdBy)])}}
function reportPreviewTable(){const tabs=availableReportTabs(); if(!tabs.length)return '<div class="panel" style="padding:18px">لا توجد أنواع تقارير مسموح بها لهذا الحساب.</div>'; const r=reportData();return table(r.headers,r.rows)}

function renderAudit(){const rows=visibleAuditLogs().map(r=>[formatDateTime(r.createdAt),actorName(r.createdBy),r.action,r.targetType,r.targetId,r.college,r.department,r.details]);return `<div class="hero"><div class="hero-title">سجل التدقيق والعمليات</div><div class="hero-text">سجل غير تشغيلي مخصص للحوكمة: يوضح من نفذ الإجراء، ونوعه، وتوقيته، والجهة المرتبطة به.</div></div>${filtersHtml({forceCollege:true})}<div class="report-actions"><button class="btn btn-primary" onclick="printAuditReport()">تقرير PDF</button><button class="btn btn-secondary" onclick="exportAuditExcel()">تقرير Excel</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">آخر العمليات</div></div>${table(['التاريخ','صاحب الإجراء','الإجراء','النوع','المرجع','القطاع','القسم','التفاصيل'],rows)}</div>`}


function transactionActions(t){
  const buttons=[]
  if(t.type==='issue'&&(t.status||'pending')==='pending'&&hasPermission('approve_issue')){
    buttons.push(`<button class="btn btn-success btn-sm" onclick="approveIssue(${t.id})">اعتماد</button>`)
    buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectIssue(${t.id})">رفض</button>`)
  }
  if(t.type==='issue'&&(canAccessCollege(t.college)||isCentral())&&hasPermission('add_issue')){
    buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('txEdit',${t.id})">تعديل</button>`)
  }
  return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—'
}
function normalizeCode(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}

function refreshSettingCaches(){
  COLLEGE_OPTIONS=(db.settings.colleges||[]).filter(x=>x.name!=='إدارة التجهيزات').map(x=>x.name)
  SECTION_OPTIONS=(db.settings.sections||[]).map(x=>x.name)
  USER_SECTION_OPTIONS=['الكل',...SECTION_OPTIONS]
}
function linkedCollegeStats(name){
  return {
    items:(db.items||[]).filter(i=>i.college===name).length,
    users:(db.users||[]).filter(u=>u.college===name).length,
    tx:(db.transactions||[]).filter(t=>t.college===name).length,
    needs:(db.needsRequests||[]).filter(r=>r.college===name).length,
    support:(db.supportRequests||[]).filter(r=>r.fromCollege===name||r.toCollege===name).length
  }
}
function linkedSectionStats(name){
  return {
    items:(db.items||[]).filter(i=>i.section===name).length,
    users:(db.users||[]).filter(u=>u.department===name).length,
    tx:(db.transactions||[]).filter(t=>t.section===name).length,
    needs:(db.needsRequests||[]).filter(r=>r.section===name).length,
    support:(db.supportRequests||[]).filter(r=>r.section===name).length
  }
}
function renderOrg(){
  const cr=(db.settings?.colleges||[]).map((c,idx)=>[
    c.name,
    c.code,
    `<div class="flex-actions">
      <button class="btn btn-secondary btn-sm" onclick="openModal('collegeEdit',${idx})">تعديل</button>
      <button class="btn btn-danger btn-sm" onclick="removeCollegeSetting(${idx})">حذف</button>
    </div>`
  ])
  const sr=(db.settings?.sections||[]).map((c,idx)=>[
    c.name,
    c.code,
    `<div class="flex-actions">
      <button class="btn btn-secondary btn-sm" onclick="openModal('sectionEdit',${idx})">تعديل</button>
      <button class="btn btn-danger btn-sm" onclick="removeSectionSetting(${idx})">حذف</button>
    </div>`
  ])
  return `<div class="hero"><div class="hero-title">إدارة القطاعات والأقسام والترميز</div><div class="hero-text">يمكن لمدير النظام إضافة قطاع أو قسم جديد وتعديل اسمه أو رمزه الإلكتروني. ستظهر القطاعات والأقسام الجديدة مباشرة في صفحات الأصناف والمخزون ونوافذ إضافة الأصناف وطلبات الاحتياج وسجلات الحركات.</div></div>
  <div class="section-split"><div class="panel"><div class="panel-title">إضافة قطاع</div><div class="form-grid"><div><label class="label">اسم القطاع</label><input id="new-college-name" class="input" placeholder="مثال: كلية العلوم الطبية التطبيقية"></div><div><label class="label">الرمز الإلكتروني</label><input id="new-college-code" class="input" placeholder="مثال: AMS"></div></div><button class="btn btn-primary" onclick="addCollegeSetting()">+ إضافة القطاع</button></div><div class="panel"><div class="panel-title">إضافة قسم</div><div class="form-grid"><div><label class="label">اسم القسم</label><input id="new-section-name" class="input" placeholder="مثال: الأدوات الزجاجية"></div><div><label class="label">الرمز الإلكتروني</label><input id="new-section-code" class="input" placeholder="مثال: GLS"></div></div><button class="btn btn-primary" onclick="addSectionSetting()">+ إضافة القسم</button></div></div>
  <div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">القطاعات الحالية</div></div>${table(['القطاع','الرمز','إجراء'],cr)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">الأقسام الحالية</div></div>${table(['القسم','الرمز','إجراء'],sr)}</div></div>`
}
function addCollegeSetting(){
  const name=document.getElementById('new-college-name').value.trim(), code=normalizeCode(document.getElementById('new-college-code').value)
  if(!name||!code)return alert('أدخل اسم القطاع والرمز الإلكتروني')
  if((db.settings.colleges||[]).some(c=>c.name===name||c.code===code))return alert('هذا القطاع أو رمزه موجود مسبقًا')
  db.settings.colleges.push({name,code})
  refreshSettingCaches()
  auditLog('إضافة قطاع','settings',name,`رمز القطاع: ${code}`,'جامعة طيبة','الكل')
  saveDb(); render()
}
function addSectionSetting(){
  const name=document.getElementById('new-section-name').value.trim(), code=normalizeCode(document.getElementById('new-section-code').value)
  if(!name||!code)return alert('أدخل اسم القسم والرمز الإلكتروني')
  if((db.settings.sections||[]).some(c=>c.name===name||c.code===code))return alert('هذا القسم أو رمزه موجود مسبقًا')
  db.settings.sections.push({name,code})
  refreshSettingCaches()
  auditLog('إضافة قسم','settings',name,`رمز القسم: ${code}`,'جامعة طيبة','الكل')
  saveDb(); render()
}
function saveCollegeSettingEdit(){
  const idx=state.editId, current=(db.settings.colleges||[])[idx]
  if(!current)return alert('القطاع غير موجود')
  const name=document.getElementById('edit-college-name').value.trim(), code=normalizeCode(document.getElementById('edit-college-code').value)
  if(!name||!code)return alert('أدخل اسم القطاع والرمز الإلكتروني')
  if((db.settings.colleges||[]).some((c,i)=>i!==idx&&(c.name===name||c.code===code)))return alert('اسم القطاع أو الرمز مستخدم مسبقًا')
  const oldName=current.name, oldCode=current.code
  current.name=name; current.code=code
  if(oldName!==name){
    ;(db.items||[]).forEach(i=>{if(i.college===oldName)i.college=name})
    ;(db.transactions||[]).forEach(t=>{if(t.college===oldName)t.college=name})
    ;(db.needsRequests||[]).forEach(r=>{if(r.college===oldName)r.college=name})
    ;(db.supportRequests||[]).forEach(r=>{if(r.fromCollege===oldName)r.fromCollege=name; if(r.toCollege===oldName)r.toCollege=name})
    ;(db.users||[]).forEach(u=>{if(u.college===oldName)u.college=name})
    if(state.currentUser?.college===oldName)state.currentUser.college=name
  }
  normalizeItemCodes()
  refreshSettingCaches()
  auditLog('تعديل قطاع','settings',name,`من ${oldName}/${oldCode} إلى ${name}/${code}`,'جامعة طيبة','الكل')
  saveDb(); closeModal()
}
function saveSectionSettingEdit(){
  const idx=state.editId, current=(db.settings.sections||[])[idx]
  if(!current)return alert('القسم غير موجود')
  const name=document.getElementById('edit-section-name').value.trim(), code=normalizeCode(document.getElementById('edit-section-code').value)
  if(!name||!code)return alert('أدخل اسم القسم والرمز الإلكتروني')
  if((db.settings.sections||[]).some((c,i)=>i!==idx&&(c.name===name||c.code===code)))return alert('اسم القسم أو الرمز مستخدم مسبقًا')
  const oldName=current.name, oldCode=current.code
  current.name=name; current.code=code
  if(oldName!==name){
    ;(db.items||[]).forEach(i=>{if(i.section===oldName)i.section=name})
    ;(db.transactions||[]).forEach(t=>{if(t.section===oldName)t.section=name})
    ;(db.needsRequests||[]).forEach(r=>{if(r.section===oldName)r.section=name})
    ;(db.supportRequests||[]).forEach(r=>{if(r.section===oldName)r.section=name})
    ;(db.users||[]).forEach(u=>{if(u.department===oldName)u.department=name})
    if(state.currentUser?.department===oldName)state.currentUser.department=name
  }
  normalizeItemCodes()
  refreshSettingCaches()
  auditLog('تعديل قسم','settings',name,`من ${oldName}/${oldCode} إلى ${name}/${code}`,'جامعة طيبة','الكل')
  saveDb(); closeModal()
}
function removeCollegeSetting(idx){
  const c=db.settings.colleges[idx]
  if(!c)return
  if(c.name==='إدارة التجهيزات' && c.code==='EQPM')return alert('لا يمكن حذف قطاع إدارة التجهيزات الأساسي')
  const stats=linkedCollegeStats(c.name)
  const total=stats.items+stats.users+stats.tx+stats.needs+stats.support
  if(total>0)return alert(`لا يمكن حذف هذا القطاع لأنه مرتبط ببيانات: أصناف ${stats.items}، مستخدمون ${stats.users}، حركات ${stats.tx}، احتياجات ${stats.needs}، دعم ${stats.support}. عدّل الارتباطات أو انقلها أولًا.`)
  if(confirm(`حذف القطاع "${c.name}"؟`)){
    db.settings.colleges.splice(idx,1)
    refreshSettingCaches()
    auditLog('حذف قطاع','settings',c.name,'تم حذف القطاع','جامعة طيبة','الكل')
    saveDb(); render()
  }
}
function removeSectionSetting(idx){
  const c=db.settings.sections[idx]
  if(!c)return
  const stats=linkedSectionStats(c.name)
  const total=stats.items+stats.users+stats.tx+stats.needs+stats.support
  if(total>0)return alert(`لا يمكن حذف هذا القسم لأنه مرتبط ببيانات: أصناف ${stats.items}، مستخدمون ${stats.users}، حركات ${stats.tx}، احتياجات ${stats.needs}، دعم ${stats.support}. عدّل الارتباطات أو انقلها أولًا.`)
  if(confirm(`حذف القسم "${c.name}"؟`)){
    db.settings.sections.splice(idx,1)
    refreshSettingCaches()
    auditLog('حذف قسم','settings',c.name,'تم حذف القسم','جامعة طيبة','الكل')
    saveDb(); render()
  }
}
function collegeEditModalHtml(){
  const c=(db.settings.colleges||[])[state.editId]; if(!c)return ''
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل قطاع</div><div class="panel-subtitle">سيتم تحديث الاسم والرمز في الصفحات والمرجعيات المرتبطة تلقائيًا.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">اسم القطاع</label><input id="edit-college-name" class="input" value="${c.name}"></div><div><label class="label">الرمز الإلكتروني</label><input id="edit-college-code" class="input" value="${c.code}"></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveCollegeSettingEdit()">حفظ التعديل</button></div></div></div>`
}
function sectionEditModalHtml(){
  const c=(db.settings.sections||[])[state.editId]; if(!c)return ''
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل قسم</div><div class="panel-subtitle">سيتم تحديث الاسم والرمز في الأصناف والحركات والاحتياج تلقائيًا.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">اسم القسم</label><input id="edit-section-name" class="input" value="${c.name}"></div><div><label class="label">الرمز الإلكتروني</label><input id="edit-section-code" class="input" value="${c.code}"></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveSectionSettingEdit()">حفظ التعديل</button></div></div></div>`
}
function renderUsers(){const rows=db.users.map(u=>[u.fullName,u.username,u.role==='admin'?'مدير النظام':'مستخدم',u.college,u.department,u.isActive?'نشط':'موقوف',`<button class="btn btn-secondary btn-sm" onclick="openModal('user',${u.id})">تعديل</button>`]);return `<div class="hero"><div class="hero-title">إدارة المستخدمين والصلاحيات</div><div class="hero-text">يمكن تخصيص كل إجراء على حدة، بما في ذلك أنواع التقارير التي تظهر لكل قطاع: كل التقارير أو تقارير محددة فقط.</div></div><div class="toolbar"><div></div><button class="btn btn-primary" onclick="openModal('user')">+ إضافة مستخدم</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">المستخدمون والصلاحيات</div></div>${table(['الاسم','المستخدم','النوع','القطاع','القسم','الحالة','إجراء'],rows)}</div>`}
function renderPageContent(){return {executive:renderExecutive,dashboard:renderDashboard,items:renderItems,transactions:renderTransactions,exchange:renderExchange,needs:renderNeeds,needEvidence:renderNeedEvidence,equipment:renderEquipment,reports:renderReports,audit:renderAudit,users:renderUsers,org:renderOrg}[state.currentPage]?.()||''}
function saveItem(){const id=state.editId, item=id?getItemById(id):{id:nextId(db.items),createdAt:nowLocalString(),createdBy:state.currentUser.id}; item.college=isCentral()?document.getElementById('item-college').value:state.currentUser.college; item.nameAr=document.getElementById('item-name').value.trim(); item.nameEn=document.getElementById('item-name-en').value.trim(); item.name=item.nameAr; item.section=document.getElementById('item-section').value; item.code=generateItemCode(item.college,item.section,id); item.unit=document.getElementById('item-unit').value; item.qty=Number(document.getElementById('item-qty').value||0); item.minQty=Number(document.getElementById('item-minQty').value||0); item.location=document.getElementById('item-location').value.trim(); item.serialNumber=document.getElementById('item-serialNumber').value.trim(); item.deviceStatus=document.getElementById('item-deviceStatus').value; item.notes=document.getElementById('item-notes').value.trim(); if(!item.nameAr)return alert('أدخل اسم الصنف'); if(item.section!=='الأجهزة التعليمية'){const keyAr=normalizeText(item.nameAr), keyEn=normalizeText(item.nameEn); const duplicate=(db.items||[]).find(x=>Number(x.id)!==Number(id||0)&&x.college===item.college&&x.section===item.section&&(normalizeText(itemName(x))===keyAr || (keyEn&&normalizeText(x.nameEn)===keyEn) || normalizeText(itemName(x)).includes(keyAr) || keyAr.includes(normalizeText(itemName(x))))); if(duplicate)return alert('هذا الصنف موجود أو مشابه مسبقًا في نفس القطاع والقسم. افتح الصنف الموجود وعدّل كميته بدل إنشاء صنف مكرر. التكرار مسموح فقط للأجهزة التعليمية.')} if(!id){db.items.push(item);auditLog('إضافة صنف','item',item.id,`تمت إضافة ${item.nameAr}`,item.college,item.section)}else{auditLog('تعديل صنف','item',item.id,`تم تعديل ${item.nameAr}`,item.college,item.section)} saveDb(); closeModal()}
function saveTransaction(){if(!hasPermission('add_issue'))return alert('لا تملك صلاحية إنشاء طلب الصرف'); const type=document.getElementById('tx-type').value, itemId=Number(document.getElementById('tx-item').value), qty=Number(document.getElementById('tx-qty').value||0), notes=document.getElementById('tx-notes').value.trim(); const item=getItemById(itemId); if(!item)return alert('اختر الصنف'); if(qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); if(type==='issue'&&item.qty<qty)return alert(`الكمية المطلوبة أعلى من المتاح. المتاح: ${item.qty} ${item.unit}`); const tx={id:nextId(db.transactions),type,status:type==='receive'?'approved':'pending',itemId:item.id,college:item.college,section:item.section,qty,unit:item.unit,transactionAt:nowLocalString(),notes,createdBy:state.currentUser.id}; if(type==='receive'){item.qty+=qty; item.createdBy=state.currentUser.id} db.transactions.unshift(tx); auditLog(type==='receive'?'إدخال كمية':'طلب صرف','transaction',tx.id,`${itemName(item)} - كمية ${qty} ${item.unit}`,item.college,item.section); saveDb(); closeModal()}
function approveIssue(id){if(!hasPermission('approve_issue'))return alert('لا تملك صلاحية اعتماد طلبات الصرف'); const t=db.transactions.find(x=>x.id===id); const i=getItemById(t.itemId); if(!i||i.qty<t.qty)return alert('لا يمكن الاعتماد لأن الكمية غير كافية'); i.qty-=t.qty; t.status='approved';t.approvedAt=nowLocalString();t.approvedBy=state.currentUser.id;t.reviewedBy=state.currentUser.id; auditLog('اعتماد طلب صرف','transaction',t.id,`${itemName(i)} - كمية ${t.qty}`,t.college,t.section);saveDb();render()}
function rejectIssue(id){if(!hasPermission('approve_issue'))return alert('لا تملك صلاحية رفض طلبات الصرف'); const t=db.transactions.find(x=>x.id===id);t.status='rejected';t.rejectedAt=nowLocalString();t.rejectedBy=state.currentUser.id;t.reviewedBy=state.currentUser.id; auditLog('رفض طلب صرف','transaction',t.id,`${t.qty} ${t.unit}`,t.college,t.section);saveDb();render()}
function saveNeed(){if(!hasPermission('create_need'))return alert('لا تملك صلاحية رفع الاحتياج'); const req={id:nextId(db.needsRequests),requestNo:nextNo('NR',db.needsRequests),college:document.getElementById('need-college').value,section:document.getElementById('need-section').value,itemNameAr:document.getElementById('need-name-ar').value.trim(),itemNameEn:document.getElementById('need-name-en').value.trim(),qty:Number(document.getElementById('need-qty').value||0),unit:document.getElementById('need-unit').value,notes:document.getElementById('need-notes').value.trim(),status:'pending',workflowStage:'مراجعة إدارة التجهيزات',createdAt:nowLocalString(),createdBy:state.currentUser.id}; if(!req.itemNameAr&&!req.itemNameEn)return alert('أدخل اسم الصنف'); if(req.qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); db.needsRequests.unshift(req); auditLog('رفع طلب احتياج','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - كمية ${req.qty}`,req.college,req.section);saveDb();closeModal()}
function approveNeed(id){
  if(!hasPermission('approve_need'))return alert('لا تملك صلاحية اعتماد طلبات الاحتياج');
  const r=db.needsRequests.find(x=>x.id===id); if(!r)return;
  const evidenceCount=evidenceCountForNeed(r.id);
  if(evidenceCount===0){
    const proceed=confirm('هذا الطلب لا يحتوي على شاهد احتياج. هل ترغب في اعتماده رغم ذلك؟');
    if(!proceed) return;
  }
  r.status='approved';
  r.workflowStage='معتمد من إدارة التجهيزات';
  r.reviewedAt=nowLocalString();
  r.reviewedBy=state.currentUser.id;
  auditLog('اعتماد طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} | شواهد: ${evidenceCount}`,r.college,r.section);
  saveDb();render()
}
function rejectNeed(id){if(!hasPermission('approve_need'))return alert('لا تملك صلاحية رفض طلبات الاحتياج'); const r=db.needsRequests.find(x=>x.id===id);r.status='rejected';r.workflowStage='مرفوض';r.reviewedAt=nowLocalString();r.reviewedBy=state.currentUser.id; auditLog('رفض طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn}`,r.college,r.section);saveDb();render()}
function openSupportFromItem(id){state.modal='support';state.editId=id;render()}
function saveSupport(){const item=getItemById(state.editId), qty=Number(document.getElementById('sup-qty').value||0); if(!item)return; if(qty<=0)return alert('أدخل كمية صحيحة'); if(qty>item.qty)return alert(`الكمية المطلوبة أعلى من المتاح: ${item.qty} ${item.unit}`); db.supportRequests.unshift({id:nextId(db.supportRequests),requestNo:nextNo('SR',db.supportRequests),itemId:item.id,itemName:itemName(item),section:item.section,fromCollege:state.currentUser.college,toCollege:item.college,qty,unit:item.unit,notes:document.getElementById('sup-notes').value.trim(),supportType:document.getElementById('sup-type').value,attachmentName:document.getElementById('sup-attachment')?.files?.[0]?.name||'',status:'pending_owner',workflowStage:'بانتظار موافقة الجهة المالكة',createdAt:nowLocalString(),createdBy:state.currentUser.id}); const sr=db.supportRequests[0]; auditLog('طلب دعم بين القطاعات','support',sr.requestNo,`${sr.supportType} - ${sr.itemName} - كمية ${sr.qty}`,sr.fromCollege,sr.section);saveDb();closeModal()}
function ownerApproveSupport(id){if(!hasPermission('approve_support'))return alert('لا تملك صلاحية اعتماد طلبات الدعم'); const r=db.supportRequests.find(x=>x.id===id);r.status='owner_approved';r.workflowStage='بانتظار اعتماد إدارة التجهيزات';r.ownerReviewedAt=nowLocalString();r.ownerReviewedBy=state.currentUser.id; auditLog('موافقة الجهة المالكة على الدعم','support',r.requestNo,r.itemName,r.toCollege,r.section);saveDb();render()}
function approveSupport(id){if(!hasPermission('approve_support'))return alert('لا تملك صلاحية الاعتماد النهائي لطلبات الدعم'); const r=db.supportRequests.find(x=>x.id===id), item=getItemById(r.itemId); if(!item||item.qty<r.qty)return alert('لا يمكن الاعتماد لأن الكمية غير كافية'); item.qty-=r.qty; r.status='approved'; r.workflowStage='معتمد نهائيًا'; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; db.transactions.unshift({id:nextId(db.transactions),type:'issue',status:'approved',itemId:item.id,college:item.college,section:item.section,qty:r.qty,unit:item.unit,transactionAt:nowLocalString(),notes:`دعم قطاعي لصالح ${r.fromCollege} - ${r.requestNo}`,createdBy:state.currentUser.id,approvedBy:state.currentUser.id}); auditLog('اعتماد نهائي لطلب دعم','support',r.requestNo,`${r.itemName} - ${r.qty} ${r.unit}`,r.toCollege,r.section);saveDb();render()}
function rejectSupport(id){if(!hasPermission('approve_support'))return alert('لا تملك صلاحية رفض طلبات الدعم'); const r=db.supportRequests.find(x=>x.id===id);r.status='rejected';r.workflowStage='مرفوض';r.reviewedAt=nowLocalString();r.reviewedBy=state.currentUser.id; auditLog('رفض طلب دعم','support',r.requestNo,r.itemName,r.toCollege,r.section);saveDb();render()}

function saveTxEdit(){const t=(db.transactions||[]).find(x=>x.id===state.editId), i=getItemById(t?.itemId); if(!t||!i)return; const oldQty=Number(t.qty)||0, qty=Number(document.getElementById('edit-tx-qty').value||0), notes=document.getElementById('edit-tx-notes').value.trim(); if(qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); if((t.status||'pending')==='pending' && qty>i.qty)return alert(`الكمية المطلوبة أعلى من المتاح: ${i.qty} ${i.unit}`); if(t.status==='approved'){const availableWithOld=(Number(i.qty)||0)+oldQty; if(qty>availableWithOld)return alert(`لا يمكن التعديل لأن الكمية الجديدة تتجاوز المتاح بعد احتساب الكمية السابقة: ${availableWithOld} ${i.unit}`); i.qty=availableWithOld-qty;} t.qty=qty; t.notes=notes; t.lastEditedAt=nowLocalString(); t.lastEditedBy=state.currentUser.id; auditLog('تعديل طلب صرف','transaction',t.id,`الكمية من ${oldQty} إلى ${qty}. ${notes}`,t.college,t.section); saveDb(); closeModal()}
function saveSupportEdit(){const r=(db.supportRequests||[]).find(x=>x.id===state.editId), item=getItemById(r?.itemId); if(!r)return; const oldQty=Number(r.qty)||0, qty=Number(document.getElementById('edit-sup-qty').value||0), notes=document.getElementById('edit-sup-notes').value.trim(); if(qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); if(r.status==='approved' && item){item.qty=(Number(item.qty)||0)+oldQty; db.transactions=(db.transactions||[]).filter(t=>!(t.type==='issue'&&String(t.notes||'').includes(r.requestNo)));} if(item && qty>item.qty)return alert(`الكمية المطلوبة أعلى من المتاح: ${item.qty} ${item.unit}`); r.qty=qty; r.notes=notes; r.supportType=document.getElementById('edit-sup-type').value; r.lastEditedAt=nowLocalString(); r.lastEditedBy=state.currentUser.id; if(r.status==='approved'){r.status='pending_owner'; r.workflowStage='أعيد للمسار بعد تعديل طلب معتمد'; r.reviewedBy=null; r.reviewedAt=null; r.ownerReviewedBy=null; r.ownerReviewedAt=null} auditLog('تعديل طلب دعم','support',r.requestNo,`الكمية من ${oldQty} إلى ${qty}. ${notes}`,r.toCollege,r.section); saveDb(); closeModal()}
function saveNeedEdit(){const r=(db.needsRequests||[]).find(x=>x.id===state.editId); if(!r)return; const wasApproved=r.status==='approved', oldQty=Number(r.qty)||0; r.section=document.getElementById('edit-need-section').value; r.itemNameAr=document.getElementById('edit-need-ar').value.trim(); r.itemNameEn=document.getElementById('edit-need-en').value.trim(); r.qty=Number(document.getElementById('edit-need-qty').value||0); r.unit=document.getElementById('edit-need-unit').value; r.notes=document.getElementById('edit-need-notes').value.trim(); if(!r.itemNameAr&&!r.itemNameEn)return alert('أدخل اسم الصنف'); if(r.qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); r.lastEditedAt=nowLocalString(); r.lastEditedBy=state.currentUser.id; if(wasApproved){r.status='pending'; r.workflowStage='أعيد لمنشئ الطلب بعد تعديل طلب معتمد ثم يستكمل مساره من جديد'; r.reviewedBy=null; r.reviewedAt=null} auditLog('تعديل طلب احتياج','need',r.requestNo,`الكمية من ${oldQty} إلى ${r.qty}. ${r.notes}`,r.college,r.section); saveDb(); closeModal()}

function saveUser(){const id=state.editId, u=id?getUserById(id):{id:nextId(db.users),createdAt:nowLocalString()}; u.fullName=document.getElementById('user-fullName').value.trim();u.username=document.getElementById('user-username').value.trim();u.password=document.getElementById('user-password').value.trim();u.role=document.getElementById('user-role').value;u.jobTitle=document.getElementById('user-jobTitle').value.trim();u.college=document.getElementById('user-college').value;u.department=document.getElementById('user-department').value; if(u.college==='إدارة التجهيزات'&&u.department!=='الكل')u.department='الكل';u.phone=document.getElementById('user-phone').value.trim();u.email=document.getElementById('user-email').value.trim();u.nationalId=document.getElementById('user-nationalId').value.trim();u.isActive=document.getElementById('user-active').checked;u.permissions=u.role==='admin'?['all']:[...document.querySelectorAll('.perm-box:checked')].map(x=>x.value); if(!id)db.users.push(u);saveDb();closeModal()}
function modalHtml(){if(!state.modal)return ''; if(state.modal==='item')return itemModalHtml(); if(state.modal==='transaction')return txModalHtml(); if(state.modal==='need')return needModalHtml(); if(state.modal==='support')return supportModalHtml(); if(state.modal==='supportEdit')return supportEditModalHtml(); if(state.modal==='needEdit')return needEditModalHtml(); if(state.modal==='evidence')return needEvidenceModalHtml(); if(state.modal==='evidenceEdit')return needEvidenceEditModalHtml(); if(state.modal==='txEdit')return txEditModalHtml(); if(state.modal==='user')return userModalHtml(); if(state.modal==='collegeEdit')return collegeEditModalHtml(); if(state.modal==='sectionEdit')return sectionEditModalHtml(); if(state.modal==='importItems')return importItemsModalHtml(); return ''}
function itemModalHtml(){const i=state.editId?getItemById(state.editId):{college:isCentral()?'كلية الصيدلة':state.currentUser.college,section:'المواد الكيميائية',unit:'حبة',qty:0,minQty:0,code:'',nameAr:'',nameEn:'',location:'',serialNumber:'',deviceStatus:'',notes:''};const generatedCode=generateItemCode(i.college,i.section,state.editId);return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">${state.editId?'تعديل صنف':'إضافة صنف'}</div><div class="panel-subtitle">إضافة الصنف على مستوى القطاع والقسم مع ترميز تلقائي حسب القطاع والقسم.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القطاع</label>${isCentral()?`<select id="item-college" class="select" onchange="document.getElementById('item-code').value=generateItemCode(this.value,document.getElementById('item-section').value,${state.editId||'null'})">${collegeOptions(i.college,false)}</select>`:`<input id="item-college" class="input" value="${state.currentUser.college}" readonly>`}</div><div><label class="label">القسم</label><select id="item-section" class="select" onchange="document.getElementById('item-code').value=generateItemCode(document.getElementById('item-college').value,this.value,${state.editId||'null'})">${sectionOptions(i.section,false)}</select></div><div><label class="label">اسم الصنف بالعربية</label><input id="item-name" class="input" value="${i.nameAr||''}"></div><div><label class="label">اسم الصنف بالإنجليزية</label><input id="item-name-en" class="input" value="${i.nameEn||''}"></div><div><label class="label">الرمز الإلكتروني</label><input id="item-code" class="input" value="${i.code||generatedCode}" readonly></div><div><label class="label">الوحدة</label><select id="item-unit" class="select">${UNIT_OPTIONS.map(u=>`<option ${i.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="label">الكمية الحالية</label><input id="item-qty" class="input" type="number" min="0" value="${i.qty||0}"></div><div><label class="label">الحد الأدنى</label><input id="item-minQty" class="input" type="number" min="0" value="${i.minQty||0}"></div><div><label class="label">الموقع</label><input id="item-location" class="input" value="${i.location||''}"></div><div><label class="label">الرقم التسلسلي</label><input id="item-serialNumber" class="input" value="${i.serialNumber||''}"></div><div><label class="label">حالة الجهاز</label><select id="item-deviceStatus" class="select"><option value="">غير مطبق</option>${deviceStatuses().map(s=>`<option value="${s}" ${(i.deviceStatus||'')===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="full"><label class="label">ملاحظات</label><textarea id="item-notes" class="textarea">${i.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveItem()">حفظ</button></div></div></div>`}
function txModalHtml(){const items=visibleItems().filter(i=>canAccessCollege(i.college));return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">إضافة طلب صرف</div><div class="panel-subtitle">اختر الصنف، وستظهر الكمية المتاحة قبل الحفظ. لا يتم الإدخال من هذه الصفحة.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">النوع</label><input id="tx-type" class="input" value="issue" type="hidden"><div class="alert">طلب صرف</div></div><div><label class="label">الصنف</label><select id="tx-item" class="select" onchange="document.getElementById('stock-hint').innerHTML='المتاح: '+(getItemById(Number(this.value))?.qty||0)+' '+(getItemById(Number(this.value))?.unit||'')">${items.map(i=>`<option value="${i.id}">${i.college} - ${i.section} - ${itemName(i)} - المتاح ${i.qty} ${i.unit}</option>`).join('')}</select></div><div><label class="label">الكمية</label><input id="tx-qty" class="input" type="number" min="1" value="1"></div><div><label class="label">الكمية المتاحة</label><div id="stock-hint" class="alert">المتاح: ${items[0]?.qty||0} ${items[0]?.unit||''}</div></div><div class="full"><label class="label">ملاحظات</label><textarea id="tx-notes" class="textarea"></textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveTransaction()">حفظ العملية</button></div></div></div>`}
function needModalHtml(){
  const currentCollege=isCentral() ? ((db.settings?.colleges||[]).find(c=>c.name!=='إدارة التجهيزات')?.name || state.currentUser.college) : state.currentUser.college;
  const itemRows=(db.items||[]).filter(i=>isCentral() || i.college===state.currentUser.college);
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">رفع طلب احتياج</div><div class="panel-subtitle">يرفع الطلب للمتابعة المركزية مع بقاء السجل خاصًا بالقطاع الحالي أو القطاع المختار.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القطاع</label>${isCentral()?`<select id="need-college" class="select">${(db.settings?.colleges||[]).filter(c=>c.name!=='إدارة التجهيزات').map(c=>`<option value="${c.name}" ${c.name===currentCollege?'selected':''}>${c.name}</option>`).join('')}</select>`:`<input id="need-college" class="input" value="${state.currentUser.college}" readonly>`}</div><div><label class="label">القسم</label>${hasDepartmentScope()?`<input id="need-section" class="input" value="${state.currentUser.department}" readonly>`:`<select id="need-section" class="select">${sectionOptions('المواد الكيميائية',false)}</select>`}</div><div><label class="label">اسم الصنف بالعربية</label><input id="need-name-ar" class="input" list="item-names-ar"><datalist id="item-names-ar">${itemRows.map(i=>`<option value="${itemName(i)}">`).join('')}</datalist></div><div><label class="label">اسم الصنف بالإنجليزية</label><input id="need-name-en" class="input" list="item-names-en"><datalist id="item-names-en">${itemRows.map(i=>`<option value="${i.nameEn||''}">`).join('')}</datalist></div><div><label class="label">الكمية</label><input id="need-qty" class="input" type="number" min="1" value="1"></div><div><label class="label">القياس</label><select id="need-unit" class="select">${UNIT_OPTIONS.map(u=>`<option>${u}</option>`).join('')}</select></div><div class="full"><label class="label">ملاحظات</label><textarea id="need-notes" class="textarea"></textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeed()">حفظ الطلب</button></div></div></div>`
}
function supportModalHtml(){const i=getItemById(state.editId);return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">طلب دعم من قطاع آخر</div><div class="panel-subtitle">سيتم إرسال الطلب إلى ${i.college} للاعتماد أو الرفض.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="alert">الصنف: ${itemName(i)} — المتاح: ${i.qty} ${i.unit} — الجهة المالكة: ${i.college}</div><div class="form-grid"><div><label class="label">نوع الطلب</label><select id="sup-type" class="select"><option>دعم تشغيلي</option><option>سلفة تشغيلية</option><option>نقل عهدة</option></select></div><div><label class="label">الكمية المطلوبة</label><input id="sup-qty" class="input" type="number" min="1" value="1"></div><div><label class="label">الجهة الطالبة</label><input class="input" value="${state.currentUser.college}" disabled></div><div><label class="label">مرفق اختياري</label><input id="sup-attachment" class="input" type="file"></div><div class="full"><label class="label">مبرر الطلب</label><textarea id="sup-notes" class="textarea" placeholder="سبب طلب الدعم أو السلفة التشغيلية"></textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveSupport()">إرسال الطلب</button></div></div></div>`}

function txEditModalHtml(){const t=(db.transactions||[]).find(x=>x.id===state.editId), i=getItemById(t?.itemId); if(!t||!i)return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل طلب الصرف</div><div class="panel-subtitle">يمكن تعديل الكمية والملاحظات قبل أو بعد الإجراء الإداري حسب الصلاحية.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="alert">الصنف: ${itemName(i)} — المتاح حاليًا: ${i.qty} ${i.unit}</div><div class="form-grid"><div><label class="label">الكمية المطلوبة</label><input id="edit-tx-qty" class="input" type="number" min="1" value="${t.qty}"></div><div><label class="label">الحالة</label><div class="alert">${statusText(t.status)}</div></div><div class="full"><label class="label">ملاحظات التعديل</label><textarea id="edit-tx-notes" class="textarea">${t.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveTxEdit()">حفظ التعديل</button></div></div></div>`}
function supportEditModalHtml(){const r=(db.supportRequests||[]).find(x=>x.id===state.editId), item=getItemById(r?.itemId); if(!r)return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل طلب الدعم</div><div class="panel-subtitle">يسمح بتعديل الكمية المطلوبة أو الكمية المراد صرفها وإضافة ملاحظات توضيحية.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="alert">الصنف: ${r.itemName} — المتاح لدى الجهة المالكة: ${item?.qty??'—'} ${r.unit}</div><div class="form-grid"><div><label class="label">نوع الطلب</label><select id="edit-sup-type" class="select"><option ${r.supportType==='دعم تشغيلي'?'selected':''}>دعم تشغيلي</option><option ${r.supportType==='سلفة تشغيلية'?'selected':''}>سلفة تشغيلية</option><option ${r.supportType==='نقل عهدة'?'selected':''}>نقل عهدة</option></select></div><div><label class="label">الكمية</label><input id="edit-sup-qty" class="input" type="number" min="1" value="${r.qty}"></div><div class="full"><label class="label">ملاحظات التعديل</label><textarea id="edit-sup-notes" class="textarea">${r.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveSupportEdit()">حفظ التعديل</button></div></div></div>`}
function needEditModalHtml(){const r=(db.needsRequests||[]).find(x=>x.id===state.editId); if(!r)return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل طلب الاحتياج</div><div class="panel-subtitle">إذا كان الطلب معتمدًا ثم تم تعديله فسيعاد تلقائيًا إلى مسار المراجعة من جديد مع حفظ سبب التعديل.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القسم</label><select id="edit-need-section" class="select">${sectionOptions(r.section,false)}</select></div><div><label class="label">العربي</label><input id="edit-need-ar" class="input" value="${r.itemNameAr||''}"></div><div><label class="label">English</label><input id="edit-need-en" class="input" value="${r.itemNameEn||''}"></div><div><label class="label">الكمية</label><input id="edit-need-qty" class="input" type="number" min="1" value="${r.qty}"></div><div><label class="label">القياس</label><select id="edit-need-unit" class="select">${UNIT_OPTIONS.map(u=>`<option ${r.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div class="full"><label class="label">سبب/ملاحظات التعديل</label><textarea id="edit-need-notes" class="textarea">${r.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEdit()">حفظ التعديل</button></div></div></div>`}

function userModalHtml(){const u=state.editId?getUserById(state.editId):{fullName:'',username:'',password:'123',role:'user',jobTitle:'',college:'كلية الصيدلة',department:'الكل',phone:'',email:'',nationalId:'',isActive:true,permissions:[]}; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div class="panel-title">${state.editId?'تعديل مستخدم':'إضافة مستخدم'}</div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid-3"><div><label class="label">الاسم</label><input id="user-fullName" class="input" value="${u.fullName}"></div><div><label class="label">اسم المستخدم</label><input id="user-username" class="input" value="${u.username}"></div><div><label class="label">كلمة المرور</label><input id="user-password" class="input" value="${u.password}"></div><div><label class="label">النوع</label><select id="user-role" class="select"><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option><option value="user" ${u.role==='user'?'selected':''}>User</option></select></div><div><label class="label">المسمى</label><input id="user-jobTitle" class="input" value="${u.jobTitle}"></div><div><label class="label">القطاع/الإدارة</label><select id="user-college" class="select"><option value="إدارة التجهيزات" ${u.college==='إدارة التجهيزات'?'selected':''}>إدارة التجهيزات</option>${collegeOptions(u.college,false)}</select></div><div><label class="label">القسم</label><select id="user-department" class="select">${userDepartmentOptions(u.department||'الكل')}</select></div><div><label class="label">الهاتف</label><input id="user-phone" class="input" value="${u.phone}"></div><div><label class="label">البريد</label><input id="user-email" class="input" value="${u.email}"></div><div><label class="label">الهوية</label><input id="user-nationalId" class="input" value="${u.nationalId}"></div><div><label class="checkbox"><input id="user-active" type="checkbox" ${u.isActive?'checked':''}> نشط</label></div><div class="full"><label class="label">الصلاحيات التشغيلية</label><div class="permissions-grid">${PERMISSIONS.filter(p=>!p.key.startsWith('report_')).map(p=>`<label class="checkbox"><input class="perm-box" type="checkbox" value="${p.key}" ${(u.permissions||[]).includes(p.key)||u.role==='admin'?'checked':''}>${p.label}</label>`).join('')}</div></div><div class="full"><label class="label">أنواع التقارير المسموح بها</label><div class="permissions-grid">${PERMISSIONS.filter(p=>p.key.startsWith('report_')).map(p=>`<label class="checkbox"><input class="perm-box" type="checkbox" value="${p.key}" ${(u.permissions||[]).includes(p.key)||u.role==='admin'?'checked':''}>${p.label}</label>`).join('')}</div></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveUser()">حفظ</button></div></div></div>`}
function reportHtml(data){return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${data.title}</title><style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:24px;color:#111144}.report-header{display:flex;justify-content:space-between;align-items:center;border:1px solid #d9e2ef;border-radius:18px;padding:18px 20px;margin-bottom:18px;background:linear-gradient(135deg,#f7fbff,#eef7f4)}.logo-mark{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;background:linear-gradient(135deg,#0a8e6e,#4056e3);color:#fff;font-weight:bold}.report-header h1{font-size:22px;margin:0 0 8px}.report-header p{margin:0;line-height:1.8;color:#555}.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 18px}.meta-card{border:1px solid #d9e2ef;border-radius:14px;padding:10px 12px;background:#fff}.meta-card strong{display:block;margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:8px;text-align:right;vertical-align:top}th{background:#f2f2f2}.footer{margin-top:14px;font-size:11px;color:#555}@media print{body{padding:8px}}</style></head><body><div class="report-header"><div><h1>${data.title}</h1><p>جامعة طيبة</p><p>نظام إدارة القطاعات التعليمية</p></div><div class="logo-mark">T</div></div><div class="meta-grid"><div class="meta-card"><strong>تاريخ الإنشاء</strong>${formatDateTime(nowLocalString())}</div><div class="meta-card"><strong>عدد السجلات</strong>${data.rows.length}</div><div class="meta-card"><strong>مستخرج التقرير</strong>${state.currentUser?.fullName||'—'}</div><div class="meta-card"><strong>النطاق</strong>${isCentral()?'جامعة طيبة':state.currentUser.college}</div></div><table><thead><tr>${data.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${data.rows.length?data.rows.map(r=>`<tr>${r.map(c=>`<td>${String(c??'—').replace(/<[^>]*>/g,'')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${data.headers.length}">لا توجد بيانات</td></tr>`}</tbody></table><div class="footer">ملاحظة: تم إنشاء هذا التقرير من نظام جامعة طيبة لإدارة القطاعات التعليمية.</div></body></html>`}

function needEvidenceExecutiveData(){
  const rows=visibleNeedEvidence();
  const total=rows.length;
  const complete=rows.filter(r=>r.courseName&&r.courseCode&&Number(r.estimatedNeed||0)>0).length;
  const incomplete=total-complete;
  const topCollege=(COLLEGE_OPTIONS.map(c=>({name:c,count:rows.filter(r=>r.college===c).length})).sort((a,b)=>b.count-a.count)[0]||{name:'—',count:0});
  const topItem=(rows.reduce((acc,r)=>{const k=r.itemNameAr||r.itemNameEn||'—';acc[k]=(acc[k]||0)+1;return acc;},{}));
  const topItemName=Object.keys(topItem).sort((a,b)=>topItem[b]-topItem[a])[0]||'—';
  const totalDeficit=rows.reduce((s,r)=>s+Number(r.deficit||0),0);
  return {
    title:'التقرير التنفيذي لشواهد الاحتياج',
    headers:['المؤشر','القيمة','قراءة إدارية'],
    rows:[
      ['إجمالي الشواهد',total,'عدد السجلات الداعمة لطلبات الاحتياج'],
      ['الشواهد المكتملة',complete,'تتضمن مقررًا ورمزًا واحتياجًا محسوبًا'],
      ['الشواهد غير المكتملة',incomplete,'تحتاج استكمال البيانات أو المراجعة'],
      ['أعلى قطاع من حيث الشواهد',`${topCollege.name} (${topCollege.count})`,'القطاع الأكثر رفعًا لشواهد الاحتياج'],
      ['أكثر صنف تكرارًا في الشواهد',topItemName,'يعكس نمط الطلب التشغيلي أو الأكاديمي'],
      ['إجمالي العجز التقديري',totalDeficit,'حجم العجز المحسوب في جميع الشواهد الظاهرة']
    ].concat(rows.map(r=>[
      `طلب ${r.requestNo}`,
      `${r.college} | ${r.section} | عجز ${r.deficit||0} ${r.unit||''}`,
      `${r.courseName||'—'} - ${r.courseCode||'—'}`
    ]))
  }
}
function exportNeedEvidenceExecutive(){exportExcel(needEvidenceExecutiveData(),'need-evidence-executive-report.xlsx')}
function printNeedEvidenceExecutive(){openPrint(needEvidenceExecutiveData())}
function needEvidenceDetailData(id){
  const r=(db.needEvidence||[]).find(x=>Number(x.id)===Number(id));
  if(!r) return null;
  return {
    title:`التقرير التفصيلي لشاهد الاحتياج - ${r.requestNo}`,
    headers:['البند','القيمة'],
    rows:[
      ['رقم طلب الاحتياج',r.requestNo],
      ['القطاع',r.college],
      ['القسم',r.section],
      ['الصنف',r.itemNameAr||r.itemNameEn||'—'],
      ['اسم المقرر',r.courseName||'—'],
      ['رمز المقرر',r.courseCode||'—'],
      ['السنة الدراسية',r.academicYear||'—'],
      ['الفصل الدراسي',r.semester||'—'],
      ['عدد الشعب',r.sectionsCount||0],
      ['عدد الطلاب',r.studentsCount||0],
      ['عدد مرات الاستخدام',r.usesCount||0],
      ['الكمية لكل طالب في كل مرة',r.qtyPerStudent||0],
      ['الاحتياج النظري',`${r.estimatedNeed||0} ${r.unit||''}`],
      ['الرصيد الحالي',`${r.stockAvailable||0} ${r.unit||''}`],
      ['العجز الفعلي',`${r.deficit||0} ${r.unit||''}`],
      ['مبررات الاحتياج',r.justification||'—'],
      ['التوصية النهائية',r.recommendation||'—'],
      ['ملاحظات إضافية',r.notes||'—'],
      ['صاحب الإجراء',actorName(r.createdBy)],
      ['تاريخ الإنشاء',formatDateTime(r.createdAt)]
    ]
  }
}
function printNeedEvidenceDetail(id){
  const d=needEvidenceDetailData(id);
  if(!d) return alert('الشاهد غير موجود');
  openPrint(d);
}


function importItemsModalHtml(){
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">استيراد أصناف من Excel</div><div class="panel-subtitle">يدعم ملف الاستيراد الذي أُعدّ من محاضر الاستلام. يمكن استيراد ورقة "جاهز للاستيراد" فقط أو مع "مراجعة مطلوبة". يمنع التكرار في غير الأجهزة التعليمية ويولّد الرموز تلقائيًا.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid">
    <div class="full"><label class="label">ملف Excel</label><input id="import-items-file" class="input" type="file" accept=".xlsx,.xls"></div>
    <div><label class="label">نطاق الاستيراد</label><select id="import-items-scope" class="select"><option value="ready">جاهز للاستيراد فقط</option><option value="all">الورقتان: جاهز + مراجعة</option></select></div>
    <div><label class="label">طريقة التعامل مع التكرار</label><select id="import-items-duplicates" class="select"><option value="skip">تخطي المكرر</option><option value="merge">دمج الكمية مع الصنف الموجود</option></select></div>
    <div><label class="label">القطاع الافتراضي عند الفراغ</label><select id="import-items-default-college" class="select">${collegeOptions(isCentral()?((state.currentUser?.college && state.currentUser.college!=='إدارة التجهيزات')?state.currentUser.college:'كلية الصيدلة'):state.currentUser.college,false)}</select></div>
    <div><label class="label">القسم الافتراضي عند الفراغ</label><select id="import-items-default-section" class="select">${sectionOptions('المواد الكيميائية',false)}</select></div>
    <div class="full"><div class="alert">الأعمدة المتوقعة: القطاع | القسم | اسم الصنف بالعربية | اسم الصنف بالإنجليزية | الوحدة | الكمية | ملاحظات | حالة المراجعة</div></div>
    <div class="full"><div id="import-items-result" class="alert">بعد اختيار الملف اضغط "استيراد" لقراءة السجلات وإضافتها للمخزون.</div></div>
  </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="importItemsFromExcel()">استيراد</button></div></div></div>`
}
function normalizeImportedValue(v){ return String(v??'').trim() }
function findSheetInsensitive(wb,name){
  return wb.SheetNames.find(n=>String(n).trim()===name) || wb.SheetNames.find(n=>String(n).trim().toLowerCase()===name.toLowerCase())
}
function importRowsFromSheet(sheet){
  const rows = XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  return rows.map(r=>({
    college: normalizeImportedValue(r['القطاع']),
    section: normalizeImportedValue(r['القسم']),
    nameAr: normalizeImportedValue(r['اسم الصنف بالعربية']),
    nameEn: normalizeImportedValue(r['اسم الصنف بالإنجليزية']),
    unit: normalizeImportedValue(r['الوحدة']),
    qty: Number(r['الكمية']||0),
    notes: normalizeImportedValue(r['ملاحظات']),
    review: normalizeImportedValue(r['حالة المراجعة'])
  })).filter(r=>r.nameAr || r.nameEn)
}
function importedDuplicate(existing,row){
  const keyAr=normalizeText(row.nameAr||'');
  const keyEn=normalizeText(row.nameEn||'');
  return (existing||[]).find(x =>
    x.college===row.college &&
    x.section===row.section &&
    (
      (keyAr && normalizeText(itemName(x))===keyAr) ||
      (keyEn && normalizeText(x.nameEn||'')===keyEn)
    )
  );
}
async function importItemsFromExcel(){
  if(typeof XLSX==='undefined') return alert('مكتبة Excel غير محملة. تأكد من الاتصال بالإنترنت.');
  const file=document.getElementById('import-items-file')?.files?.[0];
  if(!file) return alert('اختر ملف Excel أولًا');
  const scope=document.getElementById('import-items-scope').value;
  const dupMode=document.getElementById('import-items-duplicates').value;
  const fallbackCollege=document.getElementById('import-items-default-college').value;
  const fallbackSection=document.getElementById('import-items-default-section').value;
  const resultBox=document.getElementById('import-items-result');
  try{
    resultBox.innerHTML='جاري قراءة الملف...';
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const readySheetName=findSheetInsensitive(wb,'جاهز للاستيراد');
    const reviewSheetName=findSheetInsensitive(wb,'مراجعة مطلوبة');
    let importedRows=[];
    if(readySheetName) importedRows=importedRows.concat(importRowsFromSheet(wb.Sheets[readySheetName]));
    if(scope==='all' && reviewSheetName) importedRows=importedRows.concat(importRowsFromSheet(wb.Sheets[reviewSheetName]));
    if(!importedRows.length) return alert('لم يتم العثور على صفوف قابلة للاستيراد في الملف');
    let added=0, merged=0, skipped=0, errors=0;
    const unknownColleges=new Set(), unknownSections=new Set();
    importedRows.forEach(row=>{
      try{
        row.college = row.college || fallbackCollege;
        row.section = row.section || fallbackSection;
        if(!isCentral()) row.college = state.currentUser.college;
        if(!COLLEGE_OPTIONS.includes(row.college)){ unknownColleges.add(row.college); row.college=fallbackCollege; }
        if(!SECTION_OPTIONS.includes(row.section)){ unknownSections.add(row.section); row.section=fallbackSection; }
        if(!row.unit) row.unit='حبة';
        if(!(row.qty>0)) row.qty=1;
        if(!(row.nameAr||row.nameEn)){ skipped++; return; }

        const duplicate = importedDuplicate(db.items,row);
        const isDevice = row.section==='الأجهزة التعليمية';
        if(duplicate && !isDevice){
          if(dupMode==='merge'){
            duplicate.qty = Number(duplicate.qty||0) + Number(row.qty||0);
            duplicate.notes = [duplicate.notes||'', row.notes||''].filter(Boolean).join(' | ');
            auditLog('دمج كمية عبر استيراد Excel','item',duplicate.id,`${itemName(duplicate)} +${row.qty} ${duplicate.unit}`,duplicate.college,duplicate.section);
            merged++;
          }else{
            skipped++;
          }
          return;
        }

        const item={
          id: nextId(db.items),
          createdAt: nowLocalString(),
          createdBy: state.currentUser.id,
          college: row.college,
          section: row.section,
          nameAr: row.nameAr || row.nameEn || 'صنف مستورد',
          nameEn: row.nameEn || '',
          name: row.nameAr || row.nameEn || 'صنف مستورد',
          code: generateItemCode(row.college,row.section,null),
          unit: row.unit,
          qty: Number(row.qty||0),
          minQty: 0,
          location: '',
          serialNumber: '',
          deviceStatus: row.section==='الأجهزة التعليمية' ? 'يعمل' : '',
          notes: [row.notes, row.review ? `حالة المراجعة: ${row.review}` : ''].filter(Boolean).join(' | ')
        };
        db.items.push(item);
        auditLog('استيراد صنف من Excel','item',item.id,`${item.nameAr} - كمية ${item.qty} ${item.unit}`,item.college,item.section);
        added++;
      }catch(e){
        console.error(e);
        errors++;
      }
    });
    normalizeItemCodes();
    saveDb();
    const warn=[];
    if(unknownColleges.size) warn.push(`تم تحويل بعض القطاعات غير المعروفة إلى القطاع الافتراضي: ${Array.from(unknownColleges).join('، ')}`);
    if(unknownSections.size) warn.push(`تم تحويل بعض الأقسام غير المعروفة إلى القسم الافتراضي: ${Array.from(unknownSections).join('، ')}`);
    resultBox.innerHTML=`تم الاستيراد بنجاح. <b>مضاف:</b> ${added} | <b>مدمج:</b> ${merged} | <b>متخطى:</b> ${skipped} | <b>أخطاء:</b> ${errors}${warn.length?'<br>'+warn.join('<br>'):''}`;
    state.modal=null;
    render();
    alert(`اكتمل الاستيراد.\nمضاف: ${added}\nمدمج: ${merged}\nمتخطى: ${skipped}\nأخطاء: ${errors}`);
  }catch(err){
    console.error(err);
    resultBox.innerHTML='تعذر قراءة الملف: '+(err.message||String(err));
    alert('تعذر قراءة ملف Excel. تأكد من أن الملف بصيغة xlsx وبهيكل الأعمدة المتوقع.');
  }
}

function openPrint(data){const w=window.open('','_blank'); if(!w)return alert('اسمح بالنوافذ المنبثقة'); w.document.write(reportHtml(data)); w.document.close(); setTimeout(()=>w.print(),300)}
function printCurrentReport(){openPrint(reportData())}
function printFullReport(){openPrint({title:'تقرير إداري شامل للمتابعة المركزية',headers:['المؤشر','القيمة'],rows:Object.entries(metrics()).map(([k,v])=>[k,v])})}
function printNeeds(){openPrint({title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','القطاع','القسم','الصنف','الكمية','الوحدة','الحالة','صاحب الإجراء'],rows:filteredNeeds().map(r=>[r.requestNo,r.college,r.section,r.itemNameAr||r.itemNameEn,r.qty,r.unit,statusText(r.status),actorName(r.createdBy)])})}
function cleanExcelCell(value){return String(value??'').replace(/<[^>]*>/g,'').trim()}
function excelSheetName(title){const name=cleanExcelCell(title||'تقرير')||'تقرير'; return name.slice(0,31)}
function applyWorksheetLayout(ws,widths=[]){ws['!sheetViews']=[{rightToLeft:true,showGridLines:true}]; if(widths.length) ws['!cols']=widths.map(w=>({wch:w})); if(ws['!ref']) ws['!autofilter']=ws['!autofilter']||{ref:ws['!ref']}; return ws}
function exportExcel(data,filename){if(typeof XLSX==='undefined')return alert('مكتبة Excel غير محملة. تأكد من الاتصال بالإنترنت.'); const cleanRows=(data.rows||[]).map(r=>r.map(c=>cleanExcelCell(c)||'—')); const meta=[['جامعة طيبة'],['نظام إدارة القطاعات التعليمية'],[data.title],[],['تاريخ الإنشاء',formatDateTime(nowLocalString())],['مستخرج التقرير',state.currentUser?.fullName||'—'],['النطاق',isCentral()?'جامعة طيبة':state.currentUser.college],[]]; const aoa=[...meta,data.headers,...cleanRows]; const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:Math.max(data.headers.length-1,1)}},{s:{r:1,c:0},e:{r:1,c:Math.max(data.headers.length-1,1)}},{s:{r:2,c:0},e:{r:2,c:Math.max(data.headers.length-1,1)}}]; const headerRow=meta.length; ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:headerRow,c:0},e:{r:Math.max(headerRow+cleanRows.length,headerRow),c:data.headers.length-1}})}; const widths=data.headers.map((h,idx)=>Math.min(Math.max(String(h).length+6,...cleanRows.map(r=>String(r[idx]||'').length+4),16),40)); applyWorksheetLayout(ws,widths); const wb=XLSX.utils.book_new(); wb.Workbook={Views:[{RTL:true}]}; XLSX.utils.book_append_sheet(wb,ws,excelSheetName(data.title)); XLSX.writeFile(wb,filename,{compression:true})}
function exportCurrentExcel(){const d=reportData();exportExcel(d,'taibah-report.xlsx')}
function exportFullExcel(){exportExcel({title:'تقرير إداري شامل للمتابعة المركزية',headers:['المؤشر','القيمة'],rows:Object.entries(metrics()).map(([k,v])=>[k,v])},'central-monitoring-report.xlsx')}
function detailedNeedsTemplateData(){const headers=['الفئة','البند','وحدة القياس','وصف البند','المواصفات','منتج من القائمة الإلزامية','الرمز الإنشائي','بند متماثل','المبررات و الاسباب','تم ذكر علامة تجارية','المبرات والأسباب لذكر علامة تجارية','السنة الاولى','السنة الثانية','السنة الثالثة']; const subHeaders=['','','','','','','','','','','','الكمية','الكمية','الكمية']; const rows=filteredNeeds().map(r=>[r.section||'',r.itemNameAr||'',r.unit||'',r.description||'',r.specifications||'',r.mandatoryProduct||'لا',r.constructionCode||'',r.similarItem||'',r.justification||'',r.brandMention||'لا',r.brandReason||'',Number(r.year1Qty||0),Number(r.year2Qty||0),Number(r.year3Qty||0)]); return {title:'جدول الكميات سنتين فأكثر',headers,subHeaders,rows}}
function exportNeedsDetailedExact(){if(typeof XLSX==='undefined')return alert('مكتبة Excel غير محملة. تأكد من الاتصال بالإنترنت.'); const data=detailedNeedsTemplateData(); const aoa=[data.headers,data.subHeaders,...data.rows]; const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!merges']=data.headers.map((h,idx)=>idx<11?{s:{r:0,c:idx},e:{r:1,c:idx}}:null).filter(Boolean); ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(2+data.rows.length,2),c:data.headers.length-1}})}; applyWorksheetLayout(ws,[20,26,14,28,32,22,18,18,28,18,28,12,12,12]); const wb=XLSX.utils.book_new(); wb.Workbook={Views:[{RTL:true}]}; XLSX.utils.book_append_sheet(wb,ws,'جدول الكميات سنتين فأكثر'); const info=XLSX.utils.aoa_to_sheet([['جامعة طيبة'],['تقرير مفصل مطابق لجدول الكميات المعتمد'],['القطاع',isCentral()?(state.collegeFilter!=='all'?state.collegeFilter:'جامعة طيبة'):state.currentUser.college],['تاريخ الإنشاء',formatDateTime(nowLocalString())],['عدد البنود',data.rows.length]]); info['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:1,c:0},e:{r:1,c:2}}]; applyWorksheetLayout(info,[22,24,18]); XLSX.utils.book_append_sheet(wb,info,'معلومات التقرير'); XLSX.writeFile(wb,'needs-detailed-template.xlsx',{compression:true})}
function exportNeeds(){exportExcel({title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','العربي','English','السنة الأولى','السنة الثانية','السنة الثالثة','الإجمالي','الوحدة','الحالة','صاحب الإجراء','راجعه'],rows:filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr,r.itemNameEn,Number(r.year1Qty||0),Number(r.year2Qty||0),Number(r.year3Qty||0),r.qty,r.unit,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)])},'needs-report.xlsx')}

function printAuditReport(){openPrint({title:'تقرير سجل التدقيق والعمليات',headers:['التاريخ','صاحب الإجراء','الإجراء','النوع','المرجع','القطاع','القسم','التفاصيل'],rows:visibleAuditLogs().map(r=>[formatDateTime(r.createdAt),actorName(r.createdBy),r.action,r.targetType,r.targetId,r.college,r.department,r.details])})}
function exportAuditExcel(){exportExcel({title:'تقرير سجل التدقيق والعمليات',headers:['التاريخ','صاحب الإجراء','الإجراء','النوع','المرجع','القطاع','القسم','التفاصيل'],rows:visibleAuditLogs().map(r=>[formatDateTime(r.createdAt),actorName(r.createdBy),r.action,r.targetType,r.targetId,r.college,r.department,r.details])},'audit-log-report.xlsx')}

function renderApp(){const nav=navItems(); if(!nav.some(n=>n.id===state.currentPage))state.currentPage=nav[0]?.id||'executive'; return `<div class="mobile-overlay ${state.sidebarOpen?'show':''}" onclick="closeSidebar()"></div><div class="app"><aside class="sidebar ${state.sidebarOpen?'open':''}"><div class="brand-wrap"><div class="brand-title">جامعة طيبة</div><div class="brand-subtitle">نظام إدارة القطاعات التعليمية</div></div><div class="nav">${nav.map(n=>`<div class="nav-item ${state.currentPage===n.id?'active':''}" onclick="setPage('${n.id}')"><div>${n.icon}</div><div>${n.label}</div></div>`).join('')}</div><div class="user-panel"><div class="user-card"><div class="user-name">${state.currentUser.fullName}</div><div class="user-role">${state.currentUser.role==='admin'?'مدير النظام':state.currentUser.jobTitle}</div><div class="user-meta">الجهة: ${state.currentUser.college}<br>القسم: ${state.currentUser.department}</div><button class="btn logout-btn" onclick="logout()">تسجيل الخروج</button></div></div></aside><main class="main"><div class="topbar"><div><div class="page-title">${getPageTitle()}</div><div class="page-subtitle">واجهة موحدة للعمل على الجوال والتابلت والكمبيوتر.</div></div><div class="mobile-top-actions"><button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button></div><div style="display:flex;gap:10px;flex-wrap:wrap"><div class="tag">جامعة طيبة</div><div class="tag">${state.currentUser.college}</div></div></div><div class="content">${renderPageContent()}<div class="footer-note">${typeof syncStatusText==='function'?syncStatusText():'يتم حفظ البيانات محليًا داخل المتصفح عبر localStorage، مع تأريخ فعلي للإجراءات.'}</div></div></main>${modalHtml()}</div>`}

function cleanupDuplicateNonDevices(){
  const seen={}
  db.items=(db.items||[]).filter(item=>{
    if(item.section==='الأجهزة التعليمية')return true
    const key=[item.college,item.section,normalizeText(itemName(item)),normalizeText(item.nameEn)].join('|')
    if(seen[key]){
      const keeper=seen[key]
      keeper.qty=(Number(keeper.qty)||0)+(Number(item.qty)||0)
      keeper.notes=[keeper.notes,item.notes,'تم دمج كمية صنف مكرر تلقائيًا'].filter(Boolean).join(' | ')
      return false
    }
    seen[key]=item
    return true
  })
}
cleanupDuplicateNonDevices();

normalizeItemCodes();
saveDb();
function render(){const root=document.getElementById('root'); const active=document.activeElement; const focusMeta=active&&active.classList&&active.classList.contains('search-input')?{selector:'.search-input', value:active.value, start:active.selectionStart, end:active.selectionEnd}:null; root.innerHTML=state.currentUser?renderApp():renderLogin(); if(focusMeta){ const el=document.querySelector(focusMeta.selector); if(el){ el.focus(); try{ const pos=Math.min(String(focusMeta.value||'').length, el.value.length); el.setSelectionRange(pos,pos); }catch(e){} } }}
if(typeof initRemoteSync==='function'){initRemoteSync().then(()=>render())}else{render()};


function getNeedById(id){return (db.needsRequests||[]).find(x=>Number(x.id)===Number(id))}
function visibleNeedEvidence(){
  let rows=db.needEvidence||[];
  if(!isCentral()) rows=rows.filter(r=>r.college===state.currentUser.college);
  if(state.collegeFilter!=='all') rows=rows.filter(r=>r.college===state.collegeFilter);
  if(state.sectionFilter!=='all') rows=rows.filter(r=>r.section===state.sectionFilter);
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[r.requestNo,r.college,r.section,r.itemNameAr,r.itemNameEn,r.courseName,r.courseCode,r.academicYear,r.semester,r.justification,r.recommendation].join(' ').includes(q))
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
}
function evidenceNeedOptions(selected){
  const rows=(db.needsRequests||[]).filter(r=>isCentral()||r.college===state.currentUser.college);
  return rows.map(r=>`<option value="${r.id}" ${Number(selected)===Number(r.id)?'selected':''}>${r.requestNo} - ${r.college} - ${r.section} - ${r.itemNameAr||r.itemNameEn}</option>`).join('')
}
function stockForNeed(need){
  if(!need) return 0;
  const item=(db.items||[]).find(i=>i.college===need.college&&i.section===need.section&&(normalizeText(itemName(i))===normalizeText(need.itemNameAr||'') || normalizeText(i.nameEn)===normalizeText(need.itemNameEn||'')));
  return Number(item?.qty||0);
}
function calcEvidenceMetrics(){
  const need=getNeedById(Number(document.getElementById('ev-need-id')?.value||0));
  const students=Number(document.getElementById('ev-students')?.value||0);
  const sections=Number(document.getElementById('ev-sections')?.value||0);
  const uses=Number(document.getElementById('ev-uses')?.value||0);
  const qtyPerStudent=Number(document.getElementById('ev-qtyPerStudent')?.value||0);
  const stockManual=Number(document.getElementById('ev-stock')?.value||0);
  const estimated=Math.ceil(students*uses*qtyPerStudent);
  const deficit=Math.max(estimated-stockManual,0);
  const hint=document.getElementById('ev-metrics');
  if(hint) hint.innerHTML=`الاحتياج النظري: <b>${estimated}</b> | المتاح: <b>${stockManual}</b> | العجز: <b>${deficit}</b> ${need?.unit||''}`;
}

function evidenceCountForNeed(needId){
  return (db.needEvidence||[]).filter(x=>Number(x.needId)===Number(needId)).length
}
function needEvidenceBadge(needId){
  const c=evidenceCountForNeed(needId)
  return c>0?`<span class="badge badge-success">يوجد شاهد (${c})</span>`:`<span class="badge badge-warning">لا يوجد شاهد</span>`
}

function renderNeedEvidence(){
  const rows=visibleNeedEvidence().map(r=>[
    r.requestNo,
    r.college,
    r.section,
    r.itemNameAr||r.itemNameEn,
    r.courseName,
    r.courseCode,
    `${r.academicYear||'—'} / ${r.semester||'—'}`,
    `${r.studentsCount||0} طالب`,
    `${r.sectionsCount||0} شعبة`,
    `${r.estimatedNeed||0} ${r.unit||''}`,
    `${r.stockAvailable||0} ${r.unit||''}`,
    `${r.deficit||0} ${r.unit||''}`,
    actorName(r.createdBy),
    evidenceActions(r)
  ]);
  return `<div class="hero"><div class="hero-title">شواهد الاحتياج</div><div class="hero-text">صفحة مخصصة لربط طلبات الاحتياج بأدلة أكاديمية وتشغيلية، مثل المقرر الدراسي، عدد الطلبة، عدد الشعب، ومعدل الاستخدام، بما يدعم القرار الإداري عند المراجعة والاعتماد.</div></div>
  <div class="panel evidence-guidance"><div class="panel-title">ما القيمة المضافة؟</div><div class="panel-subtitle">أُضيف نوعان من التقارير: تقرير تنفيذي يقدّم ملخصًا إداريًا للشواهد، وتقرير تفصيلي لكل شاهد يوضّح أساس التقدير والعجز والتوصية النهائية.</div></div>
  <div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة شاهد احتياج</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل شواهد الاحتياج</div><div class="panel-subtitle">كل شاهد مرتبط بطلب احتياج محدد ويُظهر أساس التقدير الأكاديمي أو التشغيلي.</div></div>${table(['رقم الطلب','القطاع','القسم','الصنف','اسم المقرر','رمز المقرر','السنة/الفصل','عدد الطلاب','عدد الشعب','الاحتياج النظري','المتاح','العجز','صاحب الإجراء','إجراء'],rows)}</div>`
}
function evidenceActions(r){
  const btns=[];
  btns.push(`<button class="btn btn-warning btn-sm" onclick="printNeedEvidenceDetail(${r.id})">تفصيلي PDF</button>`);
  if(hasPermission('create_need_evidence') && (isCentral() || r.college===state.currentUser.college)){
    btns.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('evidenceEdit',${r.id})">تعديل</button>`);
  }
  return btns.length?`<div class="flex-actions">${btns.join('')}</div>`:'—';
}
function needEvidenceModalHtml(){
  const firstNeed=(db.needsRequests||[]).find(r=>isCentral()||r.college===state.currentUser.college);
  if(!firstNeed)return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">شواهد الاحتياج</div><div class="panel-subtitle">لا يمكن إضافة شاهد قبل وجود طلب احتياج واحد على الأقل.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div></div></div>`;
  const need=getNeedById(state.editId)||firstNeed;
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">إضافة شاهد احتياج</div><div class="panel-subtitle">تدعيم الطلب ببيانات أكاديمية وتشغيلية تسهّل المراجعة والاعتماد.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid">
  <div class="full"><label class="label">طلب الاحتياج المرتبط</label><select id="ev-need-id" class="select" onchange="fillEvidenceNeedDefaults();calcEvidenceMetrics()">${evidenceNeedOptions(need.id)}</select></div>
  <div><label class="label">اسم المقرر</label><input id="ev-courseName" class="input" placeholder="مثال: الكيمياء الصيدلية" ></div>
  <div><label class="label">رمز المقرر</label><input id="ev-courseCode" class="input" placeholder="PHAR301"></div>
  <div><label class="label">السنة الدراسية</label><input id="ev-academicYear" class="input" placeholder="1447/1448 أو 2026/2027"></div>
  <div><label class="label">الفصل الدراسي</label><select id="ev-semester" class="select"><option>الأول</option><option>الثاني</option><option>الصيفي</option></select></div>
  <div><label class="label">عدد الشعب</label><input id="ev-sections" class="input" type="number" min="1" value="1" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">عدد الطلاب</label><input id="ev-students" class="input" type="number" min="1" value="1" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">عدد مرات الاستخدام خلال الفصل</label><input id="ev-uses" class="input" type="number" min="1" value="1" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">الكمية التقديرية لكل طالب في كل مرة</label><input id="ev-qtyPerStudent" class="input" type="number" min="0" step="0.01" value="1" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">الرصيد الحالي المتاح</label><input id="ev-stock" class="input" type="number" min="0" step="0.01" value="${stockForNeed(need)}" oninput="calcEvidenceMetrics()"></div>
  <div class="full"><div id="ev-metrics" class="alert">الاحتياج النظري: 0 | المتاح: 0 | العجز: 0</div></div>
  <div class="full"><label class="label">مبررات الاحتياج</label><textarea id="ev-justification" class="textarea" placeholder="مثال: المقرر يعتمد على تطبيقات معملية أسبوعية تتطلب استهلاكًا متكررًا للصنف."></textarea></div>
  <div class="full"><label class="label">التوصية النهائية</label><textarea id="ev-recommendation" class="textarea" placeholder="مثال: يوصى بتأمين الكمية المطلوبة قبل بداية الفصل أو قبل بداية التطبيق العملي."></textarea></div>
  <div class="full"><label class="label">ملاحظات إضافية</label><textarea id="ev-notes" class="textarea"></textarea></div>
  </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEvidence()">حفظ الشاهد</button></div></div></div>`
}
function fillEvidenceNeedDefaults(){
  const need=getNeedById(Number(document.getElementById('ev-need-id')?.value||0));
  const stock=stockForNeed(need);
  const stockInput=document.getElementById('ev-stock');
  if(stockInput) stockInput.value=stock;
}
function needEvidenceEditModalHtml(){
  const ev=(db.needEvidence||[]).find(x=>Number(x.id)===Number(state.editId)); if(!ev) return '';
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">تعديل شاهد احتياج</div><div class="panel-subtitle">يمكن تحديث الشاهد متى ما ظهرت بيانات أكاديمية أو تشغيلية أحدث.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid">
  <div class="full"><label class="label">طلب الاحتياج المرتبط</label><select id="ev-need-id" class="select" onchange="fillEvidenceNeedDefaults();calcEvidenceMetrics()">${evidenceNeedOptions(ev.needId)}</select></div>
  <div><label class="label">اسم المقرر</label><input id="ev-courseName" class="input" value="${ev.courseName||''}"></div>
  <div><label class="label">رمز المقرر</label><input id="ev-courseCode" class="input" value="${ev.courseCode||''}"></div>
  <div><label class="label">السنة الدراسية</label><input id="ev-academicYear" class="input" value="${ev.academicYear||''}"></div>
  <div><label class="label">الفصل الدراسي</label><select id="ev-semester" class="select">${['الأول','الثاني','الصيفي'].map(s=>`<option ${ev.semester===s?'selected':''}>${s}</option>`).join('')}</select></div>
  <div><label class="label">عدد الشعب</label><input id="ev-sections" class="input" type="number" min="1" value="${ev.sectionsCount||1}" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">عدد الطلاب</label><input id="ev-students" class="input" type="number" min="1" value="${ev.studentsCount||1}" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">عدد مرات الاستخدام خلال الفصل</label><input id="ev-uses" class="input" type="number" min="1" value="${ev.usesCount||1}" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">الكمية التقديرية لكل طالب في كل مرة</label><input id="ev-qtyPerStudent" class="input" type="number" min="0" step="0.01" value="${ev.qtyPerStudent||1}" oninput="calcEvidenceMetrics()"></div>
  <div><label class="label">الرصيد الحالي المتاح</label><input id="ev-stock" class="input" type="number" min="0" step="0.01" value="${ev.stockAvailable||0}" oninput="calcEvidenceMetrics()"></div>
  <div class="full"><div id="ev-metrics" class="alert">الاحتياج النظري: ${ev.estimatedNeed||0} | المتاح: ${ev.stockAvailable||0} | العجز: ${ev.deficit||0}</div></div>
  <div class="full"><label class="label">مبررات الاحتياج</label><textarea id="ev-justification" class="textarea">${ev.justification||''}</textarea></div>
  <div class="full"><label class="label">التوصية النهائية</label><textarea id="ev-recommendation" class="textarea">${ev.recommendation||''}</textarea></div>
  <div class="full"><label class="label">ملاحظات إضافية</label><textarea id="ev-notes" class="textarea">${ev.notes||''}</textarea></div>
  </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEvidenceEdit()">حفظ التعديل</button></div></div></div>`
}
function saveNeedEvidence(){
  if(!hasPermission('create_need_evidence')) return alert('لا تملك صلاحية إضافة شواهد الاحتياج');
  const need=getNeedById(Number(document.getElementById('ev-need-id').value||0)); if(!need) return alert('اختر طلب احتياج صحيح');
  const students=Number(document.getElementById('ev-students').value||0), sections=Number(document.getElementById('ev-sections').value||0), uses=Number(document.getElementById('ev-uses').value||0), qtyPerStudent=Number(document.getElementById('ev-qtyPerStudent').value||0), stock=Number(document.getElementById('ev-stock').value||0);
  const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0);
  const ev={id:nextId(db.needEvidence),needId:need.id,requestNo:need.requestNo,college:need.college,section:need.section,itemNameAr:need.itemNameAr,itemNameEn:need.itemNameEn,unit:need.unit,courseName:(document.getElementById('ev-courseName').value||'').trim()||'غير محدد',courseCode:(document.getElementById('ev-courseCode').value||'').trim()||'غير محدد',academicYear:document.getElementById('ev-academicYear').value.trim(),semester:document.getElementById('ev-semester').value,sectionsCount:sections,studentsCount:students,usesCount:uses,qtyPerStudent,stockAvailable:stock,estimatedNeed:estimated,deficit,justification:document.getElementById('ev-justification').value.trim(),recommendation:document.getElementById('ev-recommendation').value.trim(),notes:document.getElementById('ev-notes').value.trim(),createdAt:nowLocalString(),createdBy:state.currentUser.id};
  db.needEvidence.unshift(ev);
  auditLog('إضافة شاهد احتياج','evidence',ev.requestNo,`${ev.courseName} - عجز ${ev.deficit} ${ev.unit}`,ev.college,ev.section);
  saveDb(); state.currentPage='needEvidence'; closeModal(); alert('تم حفظ شاهد الاحتياج بنجاح');
}
function saveNeedEvidenceEdit(){
  const ev=(db.needEvidence||[]).find(x=>Number(x.id)===Number(state.editId)); if(!ev) return alert('الشاهد غير موجود');
  const need=getNeedById(Number(document.getElementById('ev-need-id').value||0)); if(!need) return alert('اختر طلب احتياج صحيح');
  const students=Number(document.getElementById('ev-students').value||0), sections=Number(document.getElementById('ev-sections').value||0), uses=Number(document.getElementById('ev-uses').value||0), qtyPerStudent=Number(document.getElementById('ev-qtyPerStudent').value||0), stock=Number(document.getElementById('ev-stock').value||0);
  const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0);
  Object.assign(ev,{needId:need.id,requestNo:need.requestNo,college:need.college,section:need.section,itemNameAr:need.itemNameAr,itemNameEn:need.itemNameEn,unit:need.unit,courseName:(document.getElementById('ev-courseName').value||'').trim()||'غير محدد',courseCode:(document.getElementById('ev-courseCode').value||'').trim()||'غير محدد',academicYear:document.getElementById('ev-academicYear').value.trim(),semester:document.getElementById('ev-semester').value,sectionsCount:sections,studentsCount:students,usesCount:uses,qtyPerStudent,stockAvailable:stock,estimatedNeed:estimated,deficit,justification:document.getElementById('ev-justification').value.trim(),recommendation:document.getElementById('ev-recommendation').value.trim(),notes:document.getElementById('ev-notes').value.trim(),updatedAt:nowLocalString(),updatedBy:state.currentUser.id});
  auditLog('تعديل شاهد احتياج','evidence',ev.requestNo,`${ev.courseName} - عجز ${ev.deficit} ${ev.unit}`,ev.college,ev.section);
  saveDb(); state.currentPage='needEvidence'; closeModal(); alert('تم تحديث شاهد الاحتياج بنجاح');
}

/* ===== v5.8 customizations for sector/main-department/subcategory, need form, evidence rows, and locations ===== */
function departmentsList(){ return (db.settings?.departments||[]).map(x=>x.name).filter(Boolean) }
function departmentOptions(selected, includeAll=false){ const rows=departmentsList(); return `${includeAll?`<option value="all" ${selected==='all'?'selected':''}>كل الأقسام الرئيسية</option>`:''}${rows.map(s=>`<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('')}` }
function userDepartmentOptions(selected){return `<option value="الكل" ${selected==='الكل'?'selected':''}>الكل</option>${departmentsList().map(s=>`<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('')}`}
function currentDepartmentName(){ return isCentral() ? ((departmentsList()[0])||'القسم العام') : (state.currentUser?.department && state.currentUser.department!=='الكل' ? state.currentUser.department : ((departmentsList()[0])||'القسم العام')) }
function migrateAdvancedModel(){
  if(!db.settings) db.settings={}
  if(!Array.isArray(db.settings.departments) || !db.settings.departments.length) db.settings.departments=[{name:'القسم العام'}]
  if(!Array.isArray(db.settings.locations)) db.settings.locations=[]
  ;(db.items||[]).forEach(i=>{ if(!i.mainDepartment) i.mainDepartment=(getUserById(i.createdBy)?.department&&getUserById(i.createdBy)?.department!=='الكل'?getUserById(i.createdBy)?.department:'القسم العام') })
  ;(db.transactions||[]).forEach(t=>{ if(!t.mainDepartment) t.mainDepartment=getItemById(t.itemId)?.mainDepartment||'القسم العام' })
  ;(db.supportRequests||[]).forEach(r=>{ if(!r.mainDepartment) r.mainDepartment=getItemById(r.itemId)?.mainDepartment||'القسم العام' })
  ;(db.needsRequests||[]).forEach(r=>{ if(!r.mainDepartment) r.mainDepartment='القسم العام'; if(!r.erpCode) r.erpCode=r.requestNo||''; if(!r.category) r.category=r.section||''; if(!r.itemNameAr && r.itemName) r.itemNameAr=r.itemName; if(!r.year1Qty && r.qty) r.year1Qty=r.qty; if(!r.requestOrderNo) r.requestOrderNo=''; if(!r.sendGrouping) r.sendGrouping='subsection'; if(!r.targetEntity) r.targetEntity='إدارة التجهيزات'; if(!r.status || r.status==='pending') r.status='pending_sector_approval'; if(!r.workflowStage) r.workflowStage='بانتظار اعتماد مسؤول القطاع' })
  ;(db.needEvidence||[]).forEach(ev=>{ if(!ev.mainDepartment) ev.mainDepartment=getNeedById(ev.needId)?.mainDepartment||'القسم العام'; if(!ev.section && getNeedById(ev.needId)) ev.section=getNeedById(ev.needId).section })
  db.users=(db.users||[]).map(u=>{ if(u.college==='إدارة التجهيزات') return {...u,department:'الكل'}; if(!u.department || SECTION_OPTIONS.includes(u.department)) return {...u,department:'القسم العام'}; return u })
  refreshSettingCaches()
}
function refreshSettingCaches(){ COLLEGE_OPTIONS=(db.settings.colleges||[]).filter(x=>x.name!=='إدارة التجهيزات').map(x=>x.name); SECTION_OPTIONS=(db.settings.sections||[]).map(x=>x.name); USER_SECTION_OPTIONS=['الكل',...(db.settings.departments||[]).map(x=>x.name)] }
migrateAdvancedModel()

function hasDepartmentScope(){return !isCentral() && !!state.currentUser?.department && state.currentUser.department!=='الكل'}
function statusText(s){ return {draft:'مسودة',pending_sector_approval:'بانتظار اعتماد مسؤول القطاع',pending_equipment_review:'بانتظار إجراء إدارة التجهيزات',returned_to_sector:'معاد للقطاع للتعديل',pending_owner:'بانتظار موافقة الجهة المالكة',owner_approved:'موافقة الجهة المالكة',pending_equipment:'بانتظار اعتماد إدارة التجهيزات',approved:'معتمد',rejected:'مرفوض',completed:'مكتمل'}[s]||s||'تحت الإجراء' }
function statusBadge(s){ if(s==='approved')return '<span class="badge badge-ok">معتمد</span>'; if(s==='rejected')return '<span class="badge badge-danger">مرفوض</span>'; if(['pending_sector_approval','pending_equipment_review','returned_to_sector','pending_owner','owner_approved','pending_equipment'].includes(s))return '<span class="badge badge-warning">'+statusText(s)+'</span>'; if(s==='draft')return '<span class="badge badge-info">مسودة</span>'; return '<span class="badge badge-info">تحت الإجراء</span>' }
function approvalPath(type,status){ if(type==='support'){ const steps=['تقديم الطلب','موافقة الجهة المالكة','اعتماد إدارة التجهيزات','إغلاق الطلب']; const idx={pending_owner:0,owner_approved:1,pending_equipment:1,approved:3,rejected:3}[status||'pending_owner']??0; return `<div class="workflow">${steps.map((s,i)=>`<span class="${i<=idx?'done':''}">${s}</span>`).join('')}</div>` } const steps=['إنشاء الطلب','اعتماد مسؤول القطاع','مراجعة إدارة التجهيزات','الإغلاق']; const idx={draft:0,pending_sector_approval:0,returned_to_sector:0,pending_equipment_review:1,approved:3,rejected:3}[status||'pending_sector_approval']??0; return `<div class="workflow">${steps.map((s,i)=>`<span class="${i<=idx?'done':''}">${s}</span>`).join('')}</div>` }
function visibleItems(all=false){ let rows=db.items||[]; if(!all&&!isCentral())rows=rows.filter(i=>i.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(i=>(i.mainDepartment||'القسم العام')===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(i=>i.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(i=>i.section===state.sectionFilter || (i.mainDepartment||'')===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(i=>[i.code,i.college,i.mainDepartment,i.section,itemName(i),i.nameEn,i.location,i.serialNumber].join(' ').includes(q))} return rows }
function visibleTransactions(){ let rows=db.transactions||[]; if(!isCentral())rows=rows.filter(t=>t.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(t=>(t.mainDepartment||'القسم العام')===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(t=>t.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(t=>t.section===state.sectionFilter || (t.mainDepartment||'')===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(t=>[itemName(getItemById(t.itemId)),t.college,t.mainDepartment,t.section,t.type,t.notes,t.status,actorName(t.createdBy),actorName(t.reviewedBy)].join(' ').includes(q))} return rows.sort((a,b)=>(b.transactionAt||'').localeCompare(a.transactionAt||'')) }
function filteredNeeds(){ let rows=db.needsRequests||[]; if(!isCentral())rows=rows.filter(r=>r.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(r=>r.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.requestNo,r.erpCode,r.college,r.mainDepartment,r.section,r.itemNameAr,r.itemNameEn,r.description,r.specifications,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q))} return rows }
function filteredSupport(){ let rows=db.supportRequests||[]; if(!isCentral())rows=rows.filter(r=>r.fromCollege===state.currentUser.college||r.toCollege===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(r=>r.fromCollege===state.collegeFilter||r.toCollege===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.requestNo,r.fromCollege,r.toCollege,r.mainDepartment,r.section,r.itemName,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q))} return rows }
function metrics(){const items=isCentral()?visibleItems(true):visibleItems(), tx=visibleTransactions(), needs=filteredNeeds(), support=filteredSupport(); return {items:items.length,colleges:new Set(items.map(i=>i.college)).size,low:items.filter(i=>i.qty<=i.minQty).length,devices:items.filter(i=>i.section==='الأجهزة التعليمية').length,pendingIssue:tx.filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,pendingNeeds:needs.filter(n=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(n.status||'pending_sector_approval')).length,pendingSupport:support.filter(s=>['pending_owner','owner_approved','pending_equipment'].includes(s.status||'pending_owner')).length,approvedSupport:support.filter(s=>s.status==='approved').length}}
function alertsHtml(){ const lows=lowStock().length, pendingIssue=visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length; const pendingNeeds=filteredNeeds().filter(n=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(n.status||'pending_sector_approval')).length; const noEvidenceNeeds=filteredNeeds().filter(n=>evidenceCountForNeed(n.id)===0).length; const pendingSupport=filteredSupport().filter(s=>['pending_owner','owner_approved','pending_equipment'].includes(s.status||'pending_owner')).length; const cards=[['مواد تحت الحد الأدنى',lows,'تحتاج معالجة أو رفع احتياج'],['طلبات صرف معلقة',pendingIssue,'بانتظار قرار المسؤول'],['طلبات احتياج قيد الإجراء',pendingNeeds,'بين القطاع وإدارة التجهيزات'],['طلبات احتياج بلا شواهد',noEvidenceNeeds,'يفضل استكمالها قبل الاعتماد'],['طلبات دعم بين القطاعات',pendingSupport,'بانتظار الموافقات']]; return `<div class="alert-grid">${cards.map(c=>`<div class="alert-card"><strong>${c[0]}</strong><b>${c[1]}</b><span>${c[2]}</span></div>`).join('')}</div>` }
function locationOptionsForCollege(college){ return (db.settings?.locations||[]).filter(x=>!x.college || x.college===college).map(x=>x.name) }
function itemModalHtml(){ const item=state.editId?getItemById(state.editId):{college:isCentral()?COLLEGE_OPTIONS[0]:state.currentUser.college,mainDepartment:currentDepartmentName(),section:SECTION_OPTIONS[0],unit:UNIT_OPTIONS[0],qty:0,minQty:0,location:'',serialNumber:'',deviceStatus:'يعمل',nameAr:'',nameEn:'',notes:''}; const college=item.college||(!isCentral()?state.currentUser.college:COLLEGE_OPTIONS[0]); const locs=locationOptionsForCollege(college); return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">${state.editId?'تعديل صنف':'إضافة صنف'}</div><div class="panel-subtitle">تمت إضافة القسم الرئيسي وربط المواقع بقائمة قابلة للاختيار أو الإدخال اليدوي.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القطاع</label>${isCentral()?`<select id="item-college" class="select">${collegeOptions(college,false)}</select>`:`<input id="item-college" class="input" value="${state.currentUser.college}" readonly>`}</div><div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="item-mainDepartment" class="input" value="${state.currentUser.department}" readonly>`:`<select id="item-mainDepartment" class="select">${departmentOptions(item.mainDepartment||currentDepartmentName(),false)}</select>`}</div><div><label class="label">القسم الفرعي</label><select id="item-section" class="select">${sectionOptions(item.section,false)}</select></div><div><label class="label">اسم الصنف بالعربية</label><input id="item-name" class="input" value="${item.nameAr||''}"></div><div><label class="label">اسم الصنف بالإنجليزية</label><input id="item-name-en" class="input" value="${item.nameEn||''}"></div><div><label class="label">الوحدة</label><select id="item-unit" class="select">${UNIT_OPTIONS.map(u=>`<option ${item.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="label">الكمية</label><input id="item-qty" class="input" type="number" min="0" value="${item.qty||0}"></div><div><label class="label">الحد الأدنى</label><input id="item-minQty" class="input" type="number" min="0" value="${item.minQty||0}"></div><div><label class="label">الموقع</label><input id="item-location" class="input" list="item-location-list" value="${item.location||''}"><datalist id="item-location-list">${locs.map(x=>`<option value="${x}">`).join('')}</datalist></div><div><label class="label">الرقم التسلسلي</label><input id="item-serialNumber" class="input" value="${item.serialNumber||''}"></div><div><label class="label">حالة الجهاز</label><select id="item-deviceStatus" class="select">${deviceStatuses().map(s=>`<option ${item.deviceStatus===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="full"><label class="label">ملاحظات</label><textarea id="item-notes" class="textarea">${item.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveItem()">حفظ</button></div></div></div>` }
function saveItem(){ const id=state.editId, item=id?getItemById(id):{id:nextId(db.items),createdAt:nowLocalString(),createdBy:state.currentUser.id}; item.college=isCentral()?document.getElementById('item-college').value:state.currentUser.college; item.mainDepartment=document.getElementById('item-mainDepartment')?.value || currentDepartmentName(); item.nameAr=document.getElementById('item-name').value.trim(); item.nameEn=document.getElementById('item-name-en').value.trim(); item.name=item.nameAr; item.section=document.getElementById('item-section').value; item.code=generateItemCode(item.college,item.section,id); item.unit=document.getElementById('item-unit').value; item.qty=Number(document.getElementById('item-qty').value||0); item.minQty=Number(document.getElementById('item-minQty').value||0); item.location=document.getElementById('item-location').value.trim(); item.serialNumber=document.getElementById('item-serialNumber').value.trim(); item.deviceStatus=document.getElementById('item-deviceStatus').value; item.notes=document.getElementById('item-notes').value.trim(); if(!item.nameAr)return alert('أدخل اسم الصنف'); if(item.section!=='الأجهزة التعليمية'){ const keyAr=normalizeText(item.nameAr), keyEn=normalizeText(item.nameEn); const duplicate=(db.items||[]).find(x=>Number(x.id)!==Number(id||0)&&x.college===item.college&&(x.mainDepartment||'القسم العام')===item.mainDepartment&&x.section===item.section&&(normalizeText(itemName(x))===keyAr || (keyEn&&normalizeText(x.nameEn)===keyEn))); if(duplicate)return alert('هذا الصنف موجود مسبقًا في نفس القطاع والقسم الرئيسي والقسم الفرعي.') } if(!id){db.items.push(item);auditLog('إضافة صنف','item',item.id,`تمت إضافة ${item.nameAr}`,item.college,item.mainDepartment)}else{auditLog('تعديل صنف','item',item.id,`تم تعديل ${item.nameAr}`,item.college,item.mainDepartment)} saveDb(); closeModal() }
function itemActionButtons(i){
  const actions=[]
  if(hasPermission('edit_item'))actions.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('item',${i.id})">تعديل</button>`)
  if(hasPermission('delete_item'))actions.push(`<button class="btn btn-danger btn-sm" onclick="removeItem(${i.id})">حذف</button>`)
  return actions.length?`<div class="flex-actions">${actions.join('')}</div>`:'—'
}
function renderItems(){ const rows=visibleItems().map(i=>[i.college,i.mainDepartment||'القسم العام',i.code,itemName(i),i.nameEn||'—',i.section,i.unit,i.qty,i.minQty,i.location||'—',i.serialNumber||'—',i.section==='الأجهزة التعليمية'?(i.deviceStatus||'يعمل'):(i.qty<=i.minQty?'<span class="badge badge-low">منخفض</span>':'<span class="badge badge-ok">متوفر</span>'),itemActionButtons(i)]); return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('add_item')?`<button class="btn btn-primary" onclick="openModal('item')">+ إضافة صنف</button>`:''}${hasPermission('add_item')?`<button class="btn btn-secondary" onclick="openModal('importItems')">استيراد Excel</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">الأصناف والمخزون</div><div class="panel-subtitle">تمت إضافة القسم الرئيسي والقسم الفرعي وربط الموقع بقائمة مواقع قابلة للاختيار.</div></div>${table(['القطاع','القسم الرئيسي','الرمز','العربي','English','القسم الفرعي','الوحدة','الكمية','الحد الأدنى','الموقع','التسلسلي','الحالة','إجراءات'],rows)}</div>` }
function removeItem(id){
  if(!hasPermission('delete_item'))return alert('لا تملك صلاحية حذف الصنف')
  const idx=(db.items||[]).findIndex(x=>Number(x.id)===Number(id))
  if(idx<0)return alert('الصنف غير موجود')
  const item=db.items[idx]
  const txCount=(db.transactions||[]).filter(t=>Number(t.itemId)===Number(id)).length
  const supportCount=(db.supportRequests||[]).filter(r=>Number(r.itemId)===Number(id)).length
  const needCount=(db.needsRequests||[]).filter(r=>(r.erpCode&&item.code&&r.erpCode===item.code) || (normalizeText(r.itemNameAr||'')===normalizeText(itemName(item)) && (r.section||'')===(item.section||'') && (r.college||'')===(item.college||''))).length
  const evidenceCount=(db.needEvidence||[]).filter(e=>Number(e.itemId)===Number(id)).length
  const totalLinks=txCount+supportCount+needCount+evidenceCount
  if(totalLinks>0)return alert(`لا يمكن حذف الصنف لأنه مرتبط ببيانات: حركات ${txCount}، طلبات دعم ${supportCount}، طلبات احتياج ${needCount}، شواهد ${evidenceCount}.`)
  if(!confirm(`حذف الصنف "${itemName(item)}"؟`))return
  db.items.splice(idx,1)
  auditLog('حذف صنف','item',item.id,`تم حذف ${itemName(item)}`,item.college,item.section)
  saveDb()
  render()
}
function renderTransactions(){ const rows=visibleTransactions().map(t=>{const i=getItemById(t.itemId); return [t.type==='receive'?'<span class="badge badge-ok">إدخال</span>':'<span class="badge badge-low">طلب صرف</span>',t.college,t.mainDepartment||'القسم العام',t.section,itemName(i),t.qty,t.unit,t.type==='issue'?statusBadge(t.status):'<span class="badge badge-ok">مكتمل</span>',formatDateTime(t.transactionAt),actorName(t.createdBy),transactionActions(t)]}); return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('add_issue')?`<button class="btn btn-warning" onclick="openModal('transaction',null,'issue')">+ طلب صرف</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">سجلات الصرف والحركات</div></div>${table(['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','التاريخ','صاحب الإجراء','إجراء'],rows)}</div>` }
function saveTransaction(){ if(!hasPermission('add_issue'))return alert('لا تملك صلاحية إنشاء طلب الصرف'); const type=document.getElementById('tx-type').value, itemId=Number(document.getElementById('tx-item').value), qty=Number(document.getElementById('tx-qty').value||0), notes=document.getElementById('tx-notes').value.trim(); const item=getItemById(itemId); if(!item)return alert('اختر الصنف'); if(qty<=0)return alert('الكمية يجب أن تكون أكبر من صفر'); if(type==='issue'&&item.qty<qty)return alert(`الكمية المطلوبة أعلى من المتاح. المتاح: ${item.qty} ${item.unit}`); const tx={id:nextId(db.transactions),type,status:type==='receive'?'approved':'pending',itemId:item.id,college:item.college,mainDepartment:item.mainDepartment||'القسم العام',section:item.section,qty,unit:item.unit,transactionAt:nowLocalString(),notes,createdBy:state.currentUser.id}; if(type==='receive'){item.qty+=qty; item.createdBy=state.currentUser.id} db.transactions.unshift(tx); auditLog(type==='receive'?'إدخال كمية':'طلب صرف','transaction',tx.id,`${itemName(item)} - كمية ${qty} ${item.unit}`,item.college,item.mainDepartment); saveDb(); closeModal() }
function getNeedPrefillByErp(code){ const q=String(code||'').trim(); if(!q) return null; const need=(db.needsRequests||[]).find(r=>String(r.erpCode||'').trim()===q); if(need) return {itemNameAr:need.itemNameAr||'',itemNameEn:need.itemNameEn||'',unit:need.unit||'',category:need.section||'',description:need.description||'',specifications:need.specifications||''}; const item=(db.items||[]).find(i=>String(i.erpCode||i.code||'').trim()===q); if(item) return {itemNameAr:item.nameAr||'',itemNameEn:item.nameEn||'',unit:item.unit||'',category:item.section||'',description:item.notes||'',specifications:item.notes||''}; return null }
function fillNeedFromErp(){ const erp=document.getElementById('need-erpCode')?.value; const pref=getNeedPrefillByErp(erp); if(!pref) return; if(document.getElementById('need-itemNameAr')) document.getElementById('need-itemNameAr').value=pref.itemNameAr||''; if(document.getElementById('need-itemNameEn')) document.getElementById('need-itemNameEn').value=pref.itemNameEn||''; if(document.getElementById('need-unit')) document.getElementById('need-unit').value=pref.unit||UNIT_OPTIONS[0]; if(document.getElementById('need-section') && pref.category) document.getElementById('need-section').value=pref.category; if(document.getElementById('need-description')) document.getElementById('need-description').value=pref.description||''; if(document.getElementById('need-specifications')) document.getElementById('need-specifications').value=pref.specifications||'' }
function toggleMandatoryConstructionCode(prefix='need'){ const yn=document.getElementById(`${prefix}-mandatoryProduct`)?.value; const box=document.getElementById(`${prefix}-construction-wrap`); const input=document.getElementById(`${prefix}-constructionCode`); if(box) box.style.display = yn==='نعم' ? 'block' : 'none'; if(input && yn!=='نعم') input.value='' }
function needModalHtml(){ const currentCollege=!isCentral()?state.currentUser.college:(state.collegeFilter!=='all'?state.collegeFilter:COLLEGE_OPTIONS[0]); return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-xl"><div class="modal-header"><div><div class="panel-title">رفع طلب احتياج رسمي</div><div class="panel-subtitle">تمت مواءمة النموذج مع جدول الكميات: ERP، الفئة/البند، القائمة الإلزامية، سنوات الكميات، ورقم أمر الاحتياج.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القطاع</label>${isCentral()?`<select id="need-college" class="select">${(db.settings?.colleges||[]).filter(c=>c.name!=='إدارة التجهيزات').map(c=>`<option value="${c.name}" ${c.name===currentCollege?'selected':''}>${c.name}</option>`).join('')}</select>`:`<input id="need-college" class="input" value="${state.currentUser.college}" readonly>`}</div><div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="need-mainDepartment" class="input" value="${state.currentUser.department}" readonly>`:`<select id="need-mainDepartment" class="select">${departmentOptions(currentDepartmentName(),false)}</select>`}</div><div><label class="label">القسم الفرعي (الفئة)</label><select id="need-section" class="select">${sectionOptions(SECTION_OPTIONS[0],false)}</select></div><div><label class="label">رمز ERP</label><input id="need-erpCode" class="input" list="erp-suggestions" onblur="fillNeedFromErp()" placeholder="يدويًا أو مرتبط بصنف/طلب سابق"><datalist id="erp-suggestions">${[...(db.items||[]).map(i=>i.erpCode||i.code).filter(Boolean),...(db.needsRequests||[]).map(r=>r.erpCode).filter(Boolean)].map(x=>`<option value="${x}">`).join('')}</datalist></div><div><label class="label">البند بالعربي</label><input id="need-itemNameAr" class="input"></div><div><label class="label">البند بالإنجليزية</label><input id="need-itemNameEn" class="input"></div><div><label class="label">وحدة القياس</label><select id="need-unit" class="select">${UNIT_OPTIONS.map(u=>`<option>${u}</option>`).join('')}</select></div><div><label class="label">منتج من القائمة الإلزامية</label><select id="need-mandatoryProduct" class="select" onchange="toggleMandatoryConstructionCode('need')"><option>لا</option><option>نعم</option></select></div><div id="need-construction-wrap" style="display:none"><label class="label">الرمز الإنشائي</label><input id="need-constructionCode" class="input"></div><div><label class="label">بند متماثل</label><input id="need-similarItem" class="input"></div><div><label class="label">تم ذكر علامة تجارية</label><select id="need-brandMention" class="select"><option>لا</option><option>نعم</option></select></div><div><label class="label">عدد السنوات المطلوبة</label><select id="need-yearsCount" class="select" onchange="toggleNeedYears()"><option value="1">سنة واحدة</option><option value="2">سنتان</option><option value="3">ثلاث سنوات</option></select></div><div><label class="label">السنة الأولى - الكمية</label><input id="need-year1Qty" class="input" type="number" min="0" value="0"></div><div id="need-year2-wrap" style="display:none"><label class="label">السنة الثانية - الكمية</label><input id="need-year2Qty" class="input" type="number" min="0" value="0"></div><div id="need-year3-wrap" style="display:none"><label class="label">السنة الثالثة - الكمية</label><input id="need-year3Qty" class="input" type="number" min="0" value="0"></div><div><label class="label">رقم أمر الاحتياج</label><input id="need-requestOrderNo" class="input"></div><div><label class="label">طريقة إرسال الطلب</label><select id="need-sendGrouping" class="select"><option value="subsection">مقسم حسب القسم الفرعي</option><option value="department">مقسم حسب القسم الرئيسي</option></select></div><div><label class="label">الجهة المستفيدة</label><input id="need-targetEntity" class="input" value="إدارة التجهيزات" readonly></div><div class="full"><label class="label">وصف البند</label><textarea id="need-description" class="textarea"></textarea></div><div class="full"><label class="label">المواصفات</label><textarea id="need-specifications" class="textarea"></textarea></div><div class="full"><label class="label">المبررات والأسباب</label><textarea id="need-justification" class="textarea"></textarea></div><div class="full"><label class="label">مبررات ذكر العلامة التجارية</label><textarea id="need-brandReason" class="textarea"></textarea></div><div class="full"><label class="label">ملاحظات إضافية</label><textarea id="need-notes" class="textarea"></textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeed()">رفع الطلب</button></div></div></div>` }
function toggleNeedYears(prefix='need'){ const c=Number(document.getElementById(`${prefix}-yearsCount`)?.value||1); const w2=document.getElementById(`${prefix}-year2-wrap`), w3=document.getElementById(`${prefix}-year3-wrap`); if(w2) w2.style.display = c>=2 ? 'block':'none'; if(w3) w3.style.display = c>=3 ? 'block':'none' }
function needEditModalHtml(){ const r=(db.needsRequests||[]).find(x=>x.id===state.editId); if(!r)return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-xl"><div class="modal-header"><div><div class="panel-title">تعديل طلب الاحتياج</div><div class="panel-subtitle">عند تعديل الطلب بعد الإرجاع أو الاعتماد يعاد للمسار المناسب مع الاحتفاظ بالملاحظات.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="edit-need-mainDepartment" class="input" value="${state.currentUser.department}" readonly>`:`<select id="edit-need-mainDepartment" class="select">${departmentOptions(r.mainDepartment||'القسم العام',false)}</select>`}</div><div><label class="label">القسم الفرعي</label><select id="edit-need-section" class="select">${sectionOptions(r.section,false)}</select></div><div><label class="label">رمز ERP</label><input id="edit-need-erpCode" class="input" value="${r.erpCode||''}"></div><div><label class="label">البند بالعربي</label><input id="edit-need-ar" class="input" value="${r.itemNameAr||''}"></div><div><label class="label">البند بالإنجليزية</label><input id="edit-need-en" class="input" value="${r.itemNameEn||''}"></div><div><label class="label">وحدة القياس</label><select id="edit-need-unit" class="select">${UNIT_OPTIONS.map(u=>`<option ${r.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="label">منتج من القائمة الإلزامية</label><select id="edit-need-mandatoryProduct" class="select" onchange="toggleMandatoryConstructionCode('edit-need')"><option ${r.mandatoryProduct==='لا'?'selected':''}>لا</option><option ${r.mandatoryProduct==='نعم'?'selected':''}>نعم</option></select></div><div id="edit-need-construction-wrap" style="${r.mandatoryProduct==='نعم'?'display:block':'display:none'}"><label class="label">الرمز الإنشائي</label><input id="edit-need-constructionCode" class="input" value="${r.constructionCode||''}"></div><div><label class="label">بند متماثل</label><input id="edit-need-similarItem" class="input" value="${r.similarItem||''}"></div><div><label class="label">تم ذكر علامة تجارية</label><select id="edit-need-brandMention" class="select"><option ${r.brandMention==='لا'?'selected':''}>لا</option><option ${r.brandMention==='نعم'?'selected':''}>نعم</option></select></div><div><label class="label">عدد السنوات المطلوبة</label><select id="edit-need-yearsCount" class="select" onchange="toggleNeedYears('edit-need')"><option value="1" ${Number(r.yearsCount||1)===1?'selected':''}>سنة واحدة</option><option value="2" ${Number(r.yearsCount||1)===2?'selected':''}>سنتان</option><option value="3" ${Number(r.yearsCount||1)===3?'selected':''}>ثلاث سنوات</option></select></div><div><label class="label">السنة الأولى - الكمية</label><input id="edit-need-year1Qty" class="input" type="number" min="0" value="${r.year1Qty||0}"></div><div id="edit-need-year2-wrap" style="${Number(r.yearsCount||1)>=2?'display:block':'display:none'}"><label class="label">السنة الثانية - الكمية</label><input id="edit-need-year2Qty" class="input" type="number" min="0" value="${r.year2Qty||0}"></div><div id="edit-need-year3-wrap" style="${Number(r.yearsCount||1)>=3?'display:block':'display:none'}"><label class="label">السنة الثالثة - الكمية</label><input id="edit-need-year3Qty" class="input" type="number" min="0" value="${r.year3Qty||0}"></div><div><label class="label">رقم أمر الاحتياج</label><input id="edit-need-requestOrderNo" class="input" value="${r.requestOrderNo||''}"></div><div><label class="label">طريقة الإرسال</label><select id="edit-need-sendGrouping" class="select"><option value="subsection" ${r.sendGrouping==='subsection'?'selected':''}>مقسم حسب القسم الفرعي</option><option value="department" ${r.sendGrouping==='department'?'selected':''}>مقسم حسب القسم الرئيسي</option></select></div><div class="full"><label class="label">وصف البند</label><textarea id="edit-need-description" class="textarea">${r.description||''}</textarea></div><div class="full"><label class="label">المواصفات</label><textarea id="edit-need-specifications" class="textarea">${r.specifications||''}</textarea></div><div class="full"><label class="label">المبررات والأسباب</label><textarea id="edit-need-justification" class="textarea">${r.justification||''}</textarea></div><div class="full"><label class="label">مبررات ذكر العلامة التجارية</label><textarea id="edit-need-brandReason" class="textarea">${r.brandReason||''}</textarea></div><div class="full"><label class="label">ملاحظات التعديل / ملاحظات عامة</label><textarea id="edit-need-notes" class="textarea">${r.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEdit()">حفظ التعديل</button></div></div></div>` }
function totalNeedQty(prefix){ const years=Number(document.getElementById(`${prefix}-yearsCount`)?.value||1); let total=Number(document.getElementById(`${prefix}-year1Qty`)?.value||0); if(years>=2) total+=Number(document.getElementById(`${prefix}-year2Qty`)?.value||0); if(years>=3) total+=Number(document.getElementById(`${prefix}-year3Qty`)?.value||0); return total }
function saveNeed(){ if(!hasPermission('create_need'))return alert('لا تملك صلاحية رفع الاحتياج'); const req={id:nextId(db.needsRequests),requestNo:nextNo('NR',db.needsRequests),erpCode:document.getElementById('need-erpCode').value.trim(),college:document.getElementById('need-college').value,mainDepartment:document.getElementById('need-mainDepartment')?.value || currentDepartmentName(),section:document.getElementById('need-section').value,category:document.getElementById('need-section').value,itemNameAr:document.getElementById('need-itemNameAr').value.trim(),itemNameEn:document.getElementById('need-itemNameEn').value.trim(),unit:document.getElementById('need-unit').value,mandatoryProduct:document.getElementById('need-mandatoryProduct').value,constructionCode:document.getElementById('need-constructionCode').value.trim(),similarItem:document.getElementById('need-similarItem').value.trim(),brandMention:document.getElementById('need-brandMention').value,yearsCount:Number(document.getElementById('need-yearsCount').value||1),year1Qty:Number(document.getElementById('need-year1Qty').value||0),year2Qty:Number(document.getElementById('need-year2Qty')?.value||0),year3Qty:Number(document.getElementById('need-year3Qty')?.value||0),qty:totalNeedQty('need'),requestOrderNo:document.getElementById('need-requestOrderNo').value.trim(),sendGrouping:document.getElementById('need-sendGrouping').value,targetEntity:'إدارة التجهيزات',description:document.getElementById('need-description').value.trim(),specifications:document.getElementById('need-specifications').value.trim(),justification:document.getElementById('need-justification').value.trim(),brandReason:document.getElementById('need-brandReason').value.trim(),notes:document.getElementById('need-notes').value.trim(),status:'pending_sector_approval',workflowStage:'بانتظار اعتماد مسؤول القطاع',createdAt:nowLocalString(),createdBy:state.currentUser.id}; if(!req.itemNameAr && !req.itemNameEn) return alert('أدخل اسم البند'); if(req.qty<=0) return alert('أدخل كمية صحيحة لسنة واحدة أو أكثر'); if(req.mandatoryProduct==='نعم' && !req.constructionCode) return alert('عند اختيار "نعم" للقائمة الإلزامية يجب إدخال الرمز الإنشائي'); db.needsRequests.unshift(req); auditLog('رفع طلب احتياج','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - إجمالي ${req.qty} ${req.unit}`,req.college,req.mainDepartment); saveDb(); closeModal() }
function saveNeedEdit(){ const r=(db.needsRequests||[]).find(x=>x.id===state.editId); if(!r)return; const oldQty=Number(r.qty)||0; r.mainDepartment=document.getElementById('edit-need-mainDepartment')?.value || currentDepartmentName(); r.section=document.getElementById('edit-need-section').value; r.category=r.section; r.erpCode=document.getElementById('edit-need-erpCode').value.trim(); r.itemNameAr=document.getElementById('edit-need-ar').value.trim(); r.itemNameEn=document.getElementById('edit-need-en').value.trim(); r.unit=document.getElementById('edit-need-unit').value; r.mandatoryProduct=document.getElementById('edit-need-mandatoryProduct').value; r.constructionCode=document.getElementById('edit-need-constructionCode').value.trim(); r.similarItem=document.getElementById('edit-need-similarItem').value.trim(); r.brandMention=document.getElementById('edit-need-brandMention').value; r.yearsCount=Number(document.getElementById('edit-need-yearsCount').value||1); r.year1Qty=Number(document.getElementById('edit-need-year1Qty').value||0); r.year2Qty=Number(document.getElementById('edit-need-year2Qty')?.value||0); r.year3Qty=Number(document.getElementById('edit-need-year3Qty')?.value||0); r.qty=totalNeedQty('edit-need'); r.requestOrderNo=document.getElementById('edit-need-requestOrderNo').value.trim(); r.sendGrouping=document.getElementById('edit-need-sendGrouping').value; r.description=document.getElementById('edit-need-description').value.trim(); r.specifications=document.getElementById('edit-need-specifications').value.trim(); r.justification=document.getElementById('edit-need-justification').value.trim(); r.brandReason=document.getElementById('edit-need-brandReason').value.trim(); r.notes=document.getElementById('edit-need-notes').value.trim(); if(!r.itemNameAr && !r.itemNameEn) return alert('أدخل اسم البند'); if(r.qty<=0) return alert('أدخل كمية صحيحة'); if(r.mandatoryProduct==='نعم' && !r.constructionCode) return alert('أدخل الرمز الإنشائي'); r.lastEditedAt=nowLocalString(); r.lastEditedBy=state.currentUser.id; if(isCentral()){ r.status='pending_equipment_review'; r.workflowStage='تم تعديل الطلب ويحتاج مراجعة إدارة التجهيزات' } else { r.status='pending_sector_approval'; r.workflowStage='أعيد لمرحلة اعتماد مسؤول القطاع بعد التعديل'; r.reviewedBy=null; r.reviewedAt=null } auditLog('تعديل طلب احتياج','need',r.requestNo,`الكمية من ${oldQty} إلى ${r.qty}. ${r.notes}`,r.college,r.mainDepartment); saveDb(); closeModal() }
function renderNeeds(){ const rows=filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',`${r.year1Qty||0}${Number(r.yearsCount||1)>=2?` / ${r.year2Qty||0}`:''}${Number(r.yearsCount||1)>=3?` / ${r.year3Qty||0}`:''}`,r.qty,r.unit,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)]); return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج</button>`:''}<button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الاحتياج</div><div class="panel-subtitle">المسار الحالي: منشئ الطلب ← مسؤول القطاع ← إدارة التجهيزات، مع إمكانية الإرجاع للتعديل بملاحظة.</div></div>${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','كميات السنوات','الإجمالي','الوحدة','الحالة','الشواهد','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}</div>` }
function needActions(r){ const buttons=[]; const sameCollege=r.college===state.currentUser.college; const sectorApprover=sameCollege && !isCentral() && hasPermission('approve_need'); if((r.status||'pending_sector_approval')==='pending_sector_approval' && sectorApprover){ buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${r.id})">اعتماد القطاع</button>`); buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${r.id})">رفض</button>`); buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${r.id})">إعادة للتعديل</button>`) } if((r.status||'pending_sector_approval')==='pending_equipment_review' && isCentral() && hasPermission('approve_need')){ buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${r.id})">اعتماد</button>`); buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${r.id})">رفض</button>`); buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${r.id})">إعادة للقطاع</button>`) } if((sameCollege||isCentral())&&hasPermission('create_need'))buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('needEdit',${r.id})">تعديل</button>`); if((sameCollege||isCentral())&&hasPermission('create_need_evidence'))buttons.push(`<button class="btn btn-warning btn-sm" onclick="openModal('evidence',${r.id})">شاهد</button>`); return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—' }
function approveNeed(id){ if(!hasPermission('approve_need'))return alert('لا تملك صلاحية اعتماد طلبات الاحتياج'); const r=db.needsRequests.find(x=>x.id===id); if(!r)return; const evidenceCount=evidenceCountForNeed(r.id); if((r.status||'pending_sector_approval')==='pending_sector_approval' && !isCentral()){ r.status='pending_equipment_review'; r.workflowStage='أحيل إلى إدارة التجهيزات بعد اعتماد مسؤول القطاع'; r.sectorApprovedAt=nowLocalString(); r.sectorApprovedBy=state.currentUser.id; auditLog('اعتماد طلب احتياج من مسؤول القطاع','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} | شواهد: ${evidenceCount}`,r.college,r.mainDepartment); saveDb();render(); return } if(evidenceCount===0){ const proceed=confirm('هذا الطلب لا يحتوي على شاهد احتياج. هل ترغب في اعتماده رغم ذلك؟'); if(!proceed) return } r.status='approved'; r.workflowStage='معتمد من إدارة التجهيزات'; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; auditLog('اعتماد طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} | شواهد: ${evidenceCount}`,r.college,r.mainDepartment); saveDb();render() }
function rejectNeed(id){ if(!hasPermission('approve_need'))return alert('لا تملك صلاحية رفض طلبات الاحتياج'); const r=db.needsRequests.find(x=>x.id===id); if(!r)return; const note=prompt('أدخل سبب الرفض','')||''; r.status='rejected'; r.workflowStage='مرفوض'; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; r.returnNote=note; auditLog('رفض طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} ${note?'- '+note:''}`,r.college,r.mainDepartment); saveDb();render() }
function returnNeed(id){ if(!hasPermission('approve_need'))return alert('لا تملك صلاحية إعادة الطلب'); const r=db.needsRequests.find(x=>x.id===id); if(!r)return; const note=prompt('أدخل ملاحظة الإعادة للتعديل','')||''; r.status='returned_to_sector'; r.workflowStage='معاد للقطاع للتعديل'; r.returnNote=note; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; auditLog('إعادة طلب احتياج للتعديل','need',r.requestNo,note||'بدون ملاحظة',r.college,r.mainDepartment); saveDb();render() }
function visibleNeedEvidence(){ let rows=db.needEvidence||[]; if(!isCentral())rows=rows.filter(r=>r.college===state.currentUser.college); if(hasDepartmentScope())rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department); if(state.collegeFilter!=='all')rows=rows.filter(r=>r.college===state.collegeFilter); if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter); if(state.search){const q=state.search.trim(); rows=rows.filter(r=>[r.requestNo,r.college,r.mainDepartment,r.section,r.itemNameAr,r.itemNameEn,r.courseName,r.courseCode,r.academicYear,r.semester,r.justification,r.recommendation,r.notes].join(' ').includes(q))} return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')) }
function renderNeedEvidence(){ const rows=visibleNeedEvidence().map(r=>[r.requestNo,r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.courseName||'—',r.courseCode||'—',r.academicYear||'—',r.semester||'—',r.studentsCount||0,r.sectionsCount||0,r.estimatedNeed||0,r.stockAvailable||0,r.deficit||0,actorName(r.createdBy),`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('evidenceEdit',${r.id})">تعديل</button></div>`]); return `<div class="hero"><div class="hero-title">شواهد الاحتياج</div><div class="hero-text">يمكنك الآن إضافة أكثر من شاهد في نفس العملية قبل الحفظ؛ مثل تعدد المقررات أو الأدلة أو الجهات المستفيدة للصنف نفسه.</div></div><div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة شاهد احتياج</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div><div class="table-panel"><div class="table-head"><div class="panel-title">سجل شواهد الاحتياج</div><div class="panel-subtitle">كل سطر يمثل شاهدًا مستقلًا مرتبطًا بطلب احتياج محدد.</div></div>${table(['رقم الطلب','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','اسم المقرر/الدليل','رمز المقرر','السنة','الفصل','عدد الطلاب','عدد الشعب','الاحتياج النظري','المتاح','العجز','صاحب الإجراء','إجراء'],rows)}</div>` }
function evidenceNeedOptions(selected){ const rows=filteredNeeds(); return rows.map(r=>`<option value="${r.id}" ${Number(selected)===Number(r.id)?'selected':''}>${r.requestNo} - ${r.college} - ${r.mainDepartment||'القسم العام'} - ${r.section} - ${r.itemNameAr||r.itemNameEn}</option>`).join('') }
function needEvidenceModalHtml(){ const firstNeed=filteredNeeds()[0]; if(!firstNeed)return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">شواهد الاحتياج</div><div class="panel-subtitle">لا يمكن إضافة شاهد قبل وجود طلب احتياج واحد على الأقل.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div></div></div>`; const need=getNeedById(state.editId)||firstNeed; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-xl"><div class="modal-header"><div><div class="panel-title">إضافة شواهد احتياج</div><div class="panel-subtitle">يمكنك إضافة أكثر من شاهد أو مقرر قبل الحفظ النهائي عبر زر (+).</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div class="full"><label class="label">طلب الاحتياج المرتبط</label><select id="ev-need-id" class="select" onchange="fillEvidenceNeedDefaults();calcEvidenceMetrics()">${evidenceNeedOptions(need.id)}</select></div></div><div id="evidence-rows"></div><button class="btn btn-secondary" type="button" onclick="addEvidenceRow()">+ إضافة شاهد آخر</button></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEvidence()">حفظ الشواهد</button></div></div></div>` }
function evidenceRowHtml(idx, ev={}){ return `<div class="panel" data-ev-row="${idx}" style="margin-bottom:12px"><div class="panel-title">شاهد رقم ${idx+1}</div><div class="form-grid"><div><label class="label">اسم المقرر / الدليل</label><input class="input ev-courseName" value="${ev.courseName||''}" placeholder="مثال: الكيمياء الصيدلية أو دليل تشغيلي"></div><div><label class="label">رمز المقرر</label><input class="input ev-courseCode" value="${ev.courseCode||''}" placeholder="PHAR301"></div><div><label class="label">السنة الدراسية</label><input class="input ev-academicYear" value="${ev.academicYear||''}" placeholder="2026/2027"></div><div><label class="label">الفصل الدراسي</label><select class="select ev-semester"><option ${(ev.semester||'الأول')==='الأول'?'selected':''}>الأول</option><option ${ev.semester==='الثاني'?'selected':''}>الثاني</option><option ${ev.semester==='الصيفي'?'selected':''}>الصيفي</option></select></div><div><label class="label">عدد الشعب</label><input class="input ev-sections" type="number" min="1" value="${ev.sectionsCount||1}" oninput="calcEvidenceMetrics()"></div><div><label class="label">عدد الطلاب</label><input class="input ev-students" type="number" min="1" value="${ev.studentsCount||1}" oninput="calcEvidenceMetrics()"></div><div><label class="label">عدد مرات الاستخدام خلال الفصل</label><input class="input ev-uses" type="number" min="1" value="${ev.usesCount||1}" oninput="calcEvidenceMetrics()"></div><div><label class="label">الكمية التقديرية لكل طالب</label><input class="input ev-qtyPerStudent" type="number" min="0" step="0.01" value="${ev.qtyPerStudent||1}" oninput="calcEvidenceMetrics()"></div><div><label class="label">الرصيد الحالي المتاح</label><input class="input ev-stock" type="number" min="0" step="0.01" value="${ev.stockAvailable||stockForNeed(getNeedById(Number(document.getElementById('ev-need-id')?.value||0)))}" oninput="calcEvidenceMetrics()"></div><div class="full"><div class="alert ev-metrics">الاحتياج النظري: 0 | المتاح: 0 | العجز: 0</div></div><div class="full"><label class="label">مبررات الاحتياج</label><textarea class="textarea ev-justification">${ev.justification||''}</textarea></div><div class="full"><label class="label">التوصية النهائية</label><textarea class="textarea ev-recommendation">${ev.recommendation||''}</textarea></div><div class="full"><label class="label">ملاحظات إضافية</label><textarea class="textarea ev-notes">${ev.notes||''}</textarea></div><div class="full" style="text-align:left"><button class="btn btn-danger btn-sm" type="button" onclick="removeEvidenceRow(${idx})">حذف هذا الشاهد</button></div></div></div>` }
function ensureEvidenceRows(){ const box=document.getElementById('evidence-rows'); if(box && !box.children.length){ addEvidenceRow(); calcEvidenceMetrics() } }
function addEvidenceRow(prefill={}){ const box=document.getElementById('evidence-rows'); if(!box) return; const idx=box.children.length; box.insertAdjacentHTML('beforeend', evidenceRowHtml(idx,prefill)); calcEvidenceMetrics() }
function removeEvidenceRow(idx){ const row=document.querySelector(`[data-ev-row="${idx}"]`); if(row) row.remove(); calcEvidenceMetrics() }
function fillEvidenceNeedDefaults(){ document.querySelectorAll('.ev-stock').forEach(inp=>{ inp.value=stockForNeed(getNeedById(Number(document.getElementById('ev-need-id')?.value||0))) }); calcEvidenceMetrics() }
function calcEvidenceMetrics(){ document.querySelectorAll('[data-ev-row]').forEach(row=>{ const students=Number(row.querySelector('.ev-students')?.value||0), uses=Number(row.querySelector('.ev-uses')?.value||0), qtyPerStudent=Number(row.querySelector('.ev-qtyPerStudent')?.value||0), stock=Number(row.querySelector('.ev-stock')?.value||0); const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0); const hint=row.querySelector('.ev-metrics'); if(hint) hint.innerHTML=`الاحتياج النظري: <b>${estimated}</b> | المتاح: <b>${stock}</b> | العجز: <b>${deficit}</b>` }) }
function saveNeedEvidence(){ if(!hasPermission('create_need_evidence')) return alert('لا تملك صلاحية إضافة شواهد الاحتياج'); const need=getNeedById(Number(document.getElementById('ev-need-id').value||0)); if(!need) return alert('اختر طلب احتياج صحيح'); const rows=[...document.querySelectorAll('[data-ev-row]')]; if(!rows.length) return alert('أضف شاهدًا واحدًا على الأقل'); rows.forEach(row=>{ const students=Number(row.querySelector('.ev-students')?.value||0), sections=Number(row.querySelector('.ev-sections')?.value||0), uses=Number(row.querySelector('.ev-uses')?.value||0), qtyPerStudent=Number(row.querySelector('.ev-qtyPerStudent')?.value||0), stock=Number(row.querySelector('.ev-stock')?.value||0); const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0); const ev={id:nextId(db.needEvidence),needId:need.id,requestNo:need.requestNo,college:need.college,mainDepartment:need.mainDepartment,section:need.section,itemNameAr:need.itemNameAr,itemNameEn:need.itemNameEn,unit:need.unit,courseName:(row.querySelector('.ev-courseName')?.value||'').trim()||'غير محدد',courseCode:(row.querySelector('.ev-courseCode')?.value||'').trim()||'غير محدد',academicYear:(row.querySelector('.ev-academicYear')?.value||'').trim(),semester:row.querySelector('.ev-semester')?.value,sectionsCount:sections,studentsCount:students,usesCount:uses,qtyPerStudent,stockAvailable:stock,estimatedNeed:estimated,deficit,justification:(row.querySelector('.ev-justification')?.value||'').trim(),recommendation:(row.querySelector('.ev-recommendation')?.value||'').trim(),notes:(row.querySelector('.ev-notes')?.value||'').trim(),createdAt:nowLocalString(),createdBy:state.currentUser.id}; db.needEvidence.unshift(ev); auditLog('إضافة شاهد احتياج','evidence',ev.requestNo,`${ev.courseName} - عجز ${ev.deficit} ${ev.unit}`,ev.college,ev.mainDepartment) }); saveDb(); state.currentPage='needEvidence'; closeModal(); alert('تم حفظ الشواهد بنجاح') }
function needEvidenceEditModalHtml(){ const ev=(db.needEvidence||[]).find(x=>Number(x.id)===Number(state.editId)); if(!ev) return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">تعديل شاهد احتياج</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div class="full"><label class="label">طلب الاحتياج المرتبط</label><select id="ev-need-id" class="select">${evidenceNeedOptions(ev.needId)}</select></div><div><label class="label">اسم المقرر / الدليل</label><input id="ev-courseName" class="input" value="${ev.courseName||''}"></div><div><label class="label">رمز المقرر</label><input id="ev-courseCode" class="input" value="${ev.courseCode||''}"></div><div><label class="label">السنة الدراسية</label><input id="ev-academicYear" class="input" value="${ev.academicYear||''}"></div><div><label class="label">الفصل الدراسي</label><select id="ev-semester" class="select">${['الأول','الثاني','الصيفي'].map(s=>`<option ${ev.semester===s?'selected':''}>${s}</option>`).join('')}</select></div><div><label class="label">عدد الشعب</label><input id="ev-sections" class="input" type="number" min="1" value="${ev.sectionsCount||1}" oninput="calcEvidenceSingleEdit()"></div><div><label class="label">عدد الطلاب</label><input id="ev-students" class="input" type="number" min="1" value="${ev.studentsCount||1}" oninput="calcEvidenceSingleEdit()"></div><div><label class="label">عدد مرات الاستخدام</label><input id="ev-uses" class="input" type="number" min="1" value="${ev.usesCount||1}" oninput="calcEvidenceSingleEdit()"></div><div><label class="label">الكمية التقديرية لكل طالب</label><input id="ev-qtyPerStudent" class="input" type="number" min="0" step="0.01" value="${ev.qtyPerStudent||1}" oninput="calcEvidenceSingleEdit()"></div><div><label class="label">الرصيد الحالي المتاح</label><input id="ev-stock" class="input" type="number" min="0" step="0.01" value="${ev.stockAvailable||0}" oninput="calcEvidenceSingleEdit()"></div><div class="full"><div id="ev-metrics" class="alert">الاحتياج النظري: ${ev.estimatedNeed||0} | المتاح: ${ev.stockAvailable||0} | العجز: ${ev.deficit||0}</div></div><div class="full"><label class="label">مبررات الاحتياج</label><textarea id="ev-justification" class="textarea">${ev.justification||''}</textarea></div><div class="full"><label class="label">التوصية النهائية</label><textarea id="ev-recommendation" class="textarea">${ev.recommendation||''}</textarea></div><div class="full"><label class="label">ملاحظات إضافية</label><textarea id="ev-notes" class="textarea">${ev.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveNeedEvidenceEdit()">حفظ التعديل</button></div></div></div>` }
function calcEvidenceSingleEdit(){ const students=Number(document.getElementById('ev-students')?.value||0), uses=Number(document.getElementById('ev-uses')?.value||0), qtyPerStudent=Number(document.getElementById('ev-qtyPerStudent')?.value||0), stock=Number(document.getElementById('ev-stock')?.value||0); const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0); const hint=document.getElementById('ev-metrics'); if(hint) hint.innerHTML=`الاحتياج النظري: ${estimated} | المتاح: ${stock} | العجز: ${deficit}` }
function saveNeedEvidenceEdit(){ const ev=(db.needEvidence||[]).find(x=>Number(x.id)===Number(state.editId)); if(!ev) return alert('الشاهد غير موجود'); const need=getNeedById(Number(document.getElementById('ev-need-id').value||0)); if(!need) return alert('اختر طلب احتياج صحيح'); const students=Number(document.getElementById('ev-students').value||0), sections=Number(document.getElementById('ev-sections').value||0), uses=Number(document.getElementById('ev-uses').value||0), qtyPerStudent=Number(document.getElementById('ev-qtyPerStudent').value||0), stock=Number(document.getElementById('ev-stock').value||0); const estimated=Math.ceil(students*uses*qtyPerStudent), deficit=Math.max(estimated-stock,0); Object.assign(ev,{needId:need.id,requestNo:need.requestNo,college:need.college,mainDepartment:need.mainDepartment,section:need.section,itemNameAr:need.itemNameAr,itemNameEn:need.itemNameEn,unit:need.unit,courseName:(document.getElementById('ev-courseName').value||'').trim()||'غير محدد',courseCode:(document.getElementById('ev-courseCode').value||'').trim()||'غير محدد',academicYear:document.getElementById('ev-academicYear').value.trim(),semester:document.getElementById('ev-semester').value,sectionsCount:sections,studentsCount:students,usesCount:uses,qtyPerStudent,stockAvailable:stock,estimatedNeed:estimated,deficit,justification:document.getElementById('ev-justification').value.trim(),recommendation:document.getElementById('ev-recommendation').value.trim(),notes:document.getElementById('ev-notes').value.trim(),updatedAt:nowLocalString(),updatedBy:state.currentUser.id}); auditLog('تعديل شاهد احتياج','evidence',ev.requestNo,`${ev.courseName} - عجز ${ev.deficit} ${ev.unit}`,ev.college,ev.mainDepartment); saveDb(); state.currentPage='needEvidence'; closeModal(); alert('تم تحديث شاهد الاحتياج بنجاح') }
function linkedDepartmentStats(name){ return {items:(db.items||[]).filter(i=>(i.mainDepartment||'القسم العام')===name).length,users:(db.users||[]).filter(u=>u.department===name).length,tx:(db.transactions||[]).filter(t=>(t.mainDepartment||'القسم العام')===name).length,needs:(db.needsRequests||[]).filter(r=>(r.mainDepartment||'القسم العام')===name).length,support:(db.supportRequests||[]).filter(r=>(r.mainDepartment||'القسم العام')===name).length} }
function renderOrg(){ const colleges=(db.settings?.colleges||[]).map((c,idx)=>[c.name,c.code,`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('collegeEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeCollegeSetting(${idx})">حذف</button></div>`]); const departments=(db.settings?.departments||[]).map((d,idx)=>[d.name,`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('departmentEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeDepartmentSetting(${idx})">حذف</button></div>`]); const sections=(db.settings?.sections||[]).map((c,idx)=>[c.name,c.code,`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('sectionEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeSectionSetting(${idx})">حذف</button></div>`]); const locations=(db.settings?.locations||[]).map((l,idx)=>[l.name,l.college||'عام',`<div class="flex-actions"><button class="btn btn-danger btn-sm" onclick="removeLocationSetting(${idx})">حذف</button></div>`]); return `<div class="hero"><div class="hero-title">القطاعات والأقسام والترميز</div><div class="hero-text">أصبحت البنية ثلاثية: قطاع ← قسم رئيسي ← قسم فرعي. الترميز يقتصر على القطاع والقسم الفرعي، مع إدارة مستقلة للمواقع.</div></div><div class="section-split"><div class="panel"><div class="panel-title">إضافة قطاع</div><div class="form-grid"><div><label class="label">اسم القطاع</label><input id="new-college-name" class="input"></div><div><label class="label">الرمز</label><input id="new-college-code" class="input"></div></div><button class="btn btn-primary" onclick="addCollegeSetting()">+ إضافة القطاع</button></div><div class="panel"><div class="panel-title">إضافة قسم رئيسي</div><div class="form-grid"><div><label class="label">اسم القسم الرئيسي</label><input id="new-department-name" class="input"></div></div><button class="btn btn-primary" onclick="addDepartmentSetting()">+ إضافة القسم الرئيسي</button></div><div class="panel"><div class="panel-title">إضافة قسم فرعي</div><div class="form-grid"><div><label class="label">اسم القسم الفرعي</label><input id="new-section-name" class="input"></div><div><label class="label">الرمز</label><input id="new-section-code" class="input"></div></div><button class="btn btn-primary" onclick="addSectionSetting()">+ إضافة القسم الفرعي</button></div></div><div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">القطاعات الحالية</div></div>${table(['القطاع','الرمز','إجراء'],colleges)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">الأقسام الرئيسية</div></div>${table(['القسم الرئيسي','إجراء'],departments)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">الأقسام الفرعية</div></div>${table(['القسم الفرعي','الرمز','إجراء'],sections)}</div></div><div class="panel"><div class="panel-title">إضافة موقع</div><div class="form-grid"><div><label class="label">اسم الموقع</label><input id="new-location-name" class="input" placeholder="مثال: 129 SSL 008 - معمل الكيمياء"></div><div><label class="label">القطاع</label><select id="new-location-college" class="select"><option value="">عام</option>${collegeOptions('',false)}</select></div></div><button class="btn btn-primary" onclick="addLocationSetting()">+ إضافة موقع</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">المواقع المتاحة</div></div>${table(['الموقع','القطاع','إجراء'],locations)}</div>` }
function addDepartmentSetting(){ const name=document.getElementById('new-department-name').value.trim(); if(!name)return alert('أدخل اسم القسم الرئيسي'); if((db.settings.departments||[]).some(c=>c.name===name))return alert('اسم القسم الرئيسي موجود مسبقًا'); db.settings.departments.push({name}); refreshSettingCaches(); auditLog('إضافة قسم رئيسي','settings',name,'تمت الإضافة','جامعة طيبة','الكل'); saveDb(); render() }
function saveDepartmentSettingEdit(){ const idx=state.editId, current=(db.settings.departments||[])[idx]; if(!current)return alert('القسم الرئيسي غير موجود'); const name=document.getElementById('edit-department-name').value.trim(); if(!name)return alert('أدخل اسم القسم الرئيسي'); if((db.settings.departments||[]).some((c,i)=>i!==idx&&c.name===name))return alert('اسم القسم الرئيسي مستخدم مسبقًا'); const oldName=current.name; current.name=name; if(oldName!==name){ ;(db.items||[]).forEach(i=>{if((i.mainDepartment||'القسم العام')===oldName)i.mainDepartment=name}); ;(db.transactions||[]).forEach(t=>{if((t.mainDepartment||'القسم العام')===oldName)t.mainDepartment=name}); ;(db.needsRequests||[]).forEach(r=>{if((r.mainDepartment||'القسم العام')===oldName)r.mainDepartment=name}); ;(db.supportRequests||[]).forEach(r=>{if((r.mainDepartment||'القسم العام')===oldName)r.mainDepartment=name}); ;(db.users||[]).forEach(u=>{if(u.department===oldName)u.department=name}); if(state.currentUser?.department===oldName)state.currentUser.department=name } refreshSettingCaches(); auditLog('تعديل قسم رئيسي','settings',name,`من ${oldName} إلى ${name}`,'جامعة طيبة','الكل'); saveDb(); closeModal() }
function removeDepartmentSetting(idx){ const c=db.settings.departments[idx]; if(!c)return; const stats=linkedDepartmentStats(c.name), total=stats.items+stats.users+stats.tx+stats.needs+stats.support; if(total>0)return alert(`لا يمكن حذف هذا القسم الرئيسي لأنه مرتبط ببيانات: أصناف ${stats.items}، مستخدمون ${stats.users}، حركات ${stats.tx}، احتياجات ${stats.needs}، دعم ${stats.support}.`); if(confirm(`حذف القسم الرئيسي "${c.name}"؟`)){ db.settings.departments.splice(idx,1); refreshSettingCaches(); auditLog('حذف قسم رئيسي','settings',c.name,'تم الحذف','جامعة طيبة','الكل'); saveDb(); render() } }
function departmentEditModalHtml(){ const c=(db.settings.departments||[])[state.editId]; if(!c)return ''; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">تعديل قسم رئيسي</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid"><div><label class="label">اسم القسم الرئيسي</label><input id="edit-department-name" class="input" value="${c.name}"></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveDepartmentSettingEdit()">حفظ</button></div></div></div>` }
function addLocationSetting(){ const name=document.getElementById('new-location-name').value.trim(), college=document.getElementById('new-location-college').value.trim(); if(!name)return alert('أدخل اسم الموقع'); if((db.settings.locations||[]).some(x=>x.name===name && (x.college||'')===(college||''))) return alert('هذا الموقع موجود مسبقًا'); db.settings.locations.push({name,college}); auditLog('إضافة موقع','settings',name,`القطاع: ${college||'عام'}`,'جامعة طيبة','الكل'); saveDb(); render() }
function removeLocationSetting(idx){ const loc=(db.settings.locations||[])[idx]; if(!loc)return; if(confirm(`حذف الموقع "${loc.name}"؟`)){ db.settings.locations.splice(idx,1); auditLog('حذف موقع','settings',loc.name,'تم الحذف','جامعة طيبة','الكل'); saveDb(); render() } }
function modalHtml(){ if(!state.modal)return ''; if(state.modal==='item')return itemModalHtml(); if(state.modal==='transaction')return txModalHtml(); if(state.modal==='need')return needModalHtml(); if(state.modal==='support')return supportModalHtml(); if(state.modal==='supportEdit')return supportEditModalHtml(); if(state.modal==='needEdit')return needEditModalHtml(); if(state.modal==='evidence')return needEvidenceModalHtml(); if(state.modal==='evidenceEdit')return needEvidenceEditModalHtml(); if(state.modal==='txEdit')return txEditModalHtml(); if(state.modal==='user')return userModalHtml(); if(state.modal==='collegeEdit')return collegeEditModalHtml(); if(state.modal==='departmentEdit')return departmentEditModalHtml(); if(state.modal==='sectionEdit')return sectionEditModalHtml(); if(state.modal==='importItems')return importItemsModalHtml(); return '' }
openModal=function(type,id=null,txType='receive'){ state.modal=type; state.editId=id; state.transactionType=txType; render(); setTimeout(()=>{ if(type==='evidence') ensureEvidenceRows(); if(type==='need') toggleNeedYears('need'); if(type==='needEdit') toggleNeedYears('edit-need') },0) }
function renderUsers(){const rows=db.users.map(u=>[u.fullName,u.username,u.role==='admin'?'مدير النظام':'مستخدم',u.college,u.department,u.isActive?'نشط':'موقوف',`<button class="btn btn-secondary btn-sm" onclick="openModal('user',${u.id})">تعديل</button>`]);return `<div class="hero"><div class="hero-title">إدارة المستخدمين والصلاحيات</div><div class="hero-text">القسم في حساب المستخدم أصبح يمثل القسم الرئيسي، أما القسم الفرعي فيدار داخل الأصناف والطلبات.</div></div><div class="toolbar"><div></div><button class="btn btn-primary" onclick="openModal('user')">+ إضافة مستخدم</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">المستخدمون والصلاحيات</div></div>${table(['الاسم','المستخدم','النوع','القطاع','القسم الرئيسي','الحالة','إجراء'],rows)}</div>` }
function userModalHtml(){const u=state.editId?getUserById(state.editId):{fullName:'',username:'',password:'123',role:'user',jobTitle:'',college:'كلية الصيدلة',department:'القسم العام',phone:'',email:'',nationalId:'',isActive:true,permissions:[]}; return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div class="panel-title">${state.editId?'تعديل مستخدم':'إضافة مستخدم'}</div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="form-grid-3"><div><label class="label">الاسم</label><input id="user-fullName" class="input" value="${u.fullName}"></div><div><label class="label">اسم المستخدم</label><input id="user-username" class="input" value="${u.username}"></div><div><label class="label">كلمة المرور</label><input id="user-password" class="input" value="${u.password}"></div><div><label class="label">النوع</label><select id="user-role" class="select"><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option><option value="user" ${u.role==='user'?'selected':''}>User</option></select></div><div><label class="label">المسمى</label><input id="user-jobTitle" class="input" value="${u.jobTitle}"></div><div><label class="label">القطاع/الإدارة</label><select id="user-college" class="select"><option value="إدارة التجهيزات" ${u.college==='إدارة التجهيزات'?'selected':''}>إدارة التجهيزات</option>${collegeOptions(u.college,false)}</select></div><div><label class="label">القسم الرئيسي</label><select id="user-department" class="select">${userDepartmentOptions(u.department||'القسم العام')}</select></div><div><label class="label">الهاتف</label><input id="user-phone" class="input" value="${u.phone}"></div><div><label class="label">البريد</label><input id="user-email" class="input" value="${u.email}"></div><div><label class="label">الهوية</label><input id="user-nationalId" class="input" value="${u.nationalId}"></div><div><label class="checkbox"><input id="user-active" type="checkbox" ${u.isActive?'checked':''}> نشط</label></div><div class="full"><label class="label">الصلاحيات التشغيلية</label><div class="permissions-grid">${PERMISSIONS.filter(p=>!p.key.startsWith('report_')).map(p=>`<label class="checkbox"><input class="perm-box" type="checkbox" value="${p.key}" ${(u.permissions||[]).includes(p.key)||u.role==='admin'?'checked':''}>${p.label}</label>`).join('')}</div></div><div class="full"><label class="label">أنواع التقارير المسموح بها</label><div class="permissions-grid">${PERMISSIONS.filter(p=>p.key.startsWith('report_')).map(p=>`<label class="checkbox"><input class="perm-box" type="checkbox" value="${p.key}" ${(u.permissions||[]).includes(p.key)||u.role==='admin'?'checked':''}>${p.label}</label>`).join('')}</div></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveUser()">حفظ</button></div></div></div>` }
function reportData(){ if(state.reportTab==='senior')return {title:'تقرير الإدارة العليا',headers:['المؤشر','القيمة','قراءة إدارية'],rows:[['إجمالي القطاعات المفعلة',COLLEGE_OPTIONS.length,'نطاق التشغيل الحالي للنظام'],['إجمالي الأصناف',visibleItems(true).length,'حجم قاعدة بيانات المخزون'],['الأصناف تحت الحد الأدنى',lowStock().length,'تتطلب معالجة أو رفع احتياج'],['طلبات الصرف المعلقة',visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,'تتطلب اعتمادًا من المسؤول'],['طلبات الاحتياج المعلقة',filteredNeeds().filter(r=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(r.status||'pending_sector_approval')).length,'بين القطاع وإدارة التجهيزات'],['طلبات الدعم بين القطاعات',filteredSupport().filter(r=>['pending_owner','owner_approved','pending_equipment'].includes(r.status||'pending_owner')).length,'تتطلب موافقات تشغيلية'],...COLLEGE_OPTIONS.map(c=>{const items=(db.items||[]).filter(i=>i.college===c);return [c,items.length+' صنف',`تحت الحد: ${items.filter(i=>i.qty<=i.minQty).length}`]})]}; if(state.reportTab==='transactions')return {title:'تقرير الصرف والحركات',headers:['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','تاريخ الحركة','صاحب الإجراء','اعتمد بواسطة'],rows:visibleTransactions().map(t=>[t.type==='receive'?'إدخال':'صرف',t.college,t.mainDepartment||'القسم العام',t.section,itemName(getItemById(t.itemId)),t.qty,t.unit,statusText(t.status||'completed'),formatDateTime(t.transactionAt),actorName(t.createdBy),actorName(t.reviewedBy)])}; if(state.reportTab==='needs')return {title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','العربي','English','كميات السنوات','الإجمالي','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','تمت المراجعة بواسطة'],rows:filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr,r.itemNameEn,`${r.year1Qty||0}${Number(r.yearsCount||1)>=2?` / ${r.year2Qty||0}`:''}${Number(r.yearsCount||1)>=3?` / ${r.year3Qty||0}`:''}`,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)])}; if(state.reportTab==='support')return {title:'تقرير الدعم بين القطاعات',headers:['رقم الطلب','نوع الطلب','من','إلى','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','موافقة الجهة','اعتماد التجهيزات'],rows:filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.mainDepartment||'القسم العام',r.section,r.itemName,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.ownerReviewedBy),actorName(r.reviewedBy)])}; if(state.reportTab==='low')return {title:'تقرير الأصناف تحت الحد الأدنى',headers:['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الحد الأدنى','الوحدة','آخر تحديث بواسطة'],rows:lowStock().map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.qty,i.minQty,i.unit,actorName(i.createdBy)])}; return {title:'تقرير المخزون العام',headers:['القطاع','القسم الرئيسي','الرمز','القسم الفرعي','العربي','English','الكمية','الوحدة','الموقع','صاحب الإجراء'],rows:(isCentral()?visibleItems(true):visibleItems()).map(i=>[i.college,i.mainDepartment||'القسم العام',i.code,i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',actorName(i.createdBy)])} }
/* ===== end v5.8 customizations ===== */


/* ===== v5.8.6 transaction/status report filters ===== */
function txTypeFilterOptions(selected='all'){
  const opts=[['all','كل الأنواع'],['issue','صرف'],['receive','إدخال']]
  return opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')
}
function txStatusFilterOptions(selected='all'){
  const opts=[['all','كل الحالات'],['pending','تحت الإجراء'],['approved','معتمد'],['rejected','مرفوض'],['completed','مكتمل']]
  return opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')
}
function ensureExtendedReportState(){
  if(typeof state.transactionTypeFilter==='undefined') state.transactionTypeFilter='all'
  if(typeof state.transactionStatusFilter==='undefined') state.transactionStatusFilter='all'
}
function setTransactionTypeFilter(v){ ensureExtendedReportState(); state.transactionTypeFilter=v; render() }
function setTransactionStatusFilter(v){ ensureExtendedReportState(); state.transactionStatusFilter=v; render() }
const __oldSetPage = setPage
setPage=function(p){ ensureExtendedReportState(); __oldSetPage(p); state.transactionTypeFilter='all'; state.transactionStatusFilter='all' }
visibleTransactions=function(){
  ensureExtendedReportState()
  let rows=db.transactions||[]
  if(!isCentral())rows=rows.filter(t=>t.college===state.currentUser.college)
  if(hasDepartmentScope())rows=rows.filter(t=>(t.mainDepartment||t.section)===state.currentUser.department || t.section===state.currentUser.department)
  if(state.collegeFilter!=='all')rows=rows.filter(t=>t.college===state.collegeFilter)
  if(state.sectionFilter!=='all')rows=rows.filter(t=>t.section===state.sectionFilter || (t.mainDepartment||'')===state.sectionFilter)
  if(state.transactionTypeFilter!=='all')rows=rows.filter(t=>String(t.type||'')===state.transactionTypeFilter)
  if(state.transactionStatusFilter!=='all')rows=rows.filter(t=>{
    const effective=(t.type==='receive') ? 'completed' : String(t.status||'pending')
    return effective===state.transactionStatusFilter
  })
  if(state.search){const q=state.search.trim(); rows=rows.filter(t=>[itemName(getItemById(t.itemId)),t.college,t.mainDepartment,t.section,t.type,t.notes,t.status,actorName(t.createdBy),actorName(t.reviewedBy)].join(' ').includes(q))}
  return rows.sort((a,b)=>(b.transactionAt||'').localeCompare(a.transactionAt||''))
}
renderTransactions=function(){
  ensureExtendedReportState()
  const rows=visibleTransactions().map(t=>{const i=getItemById(t.itemId); return [t.type==='receive'?'<span class="badge badge-ok">إدخال</span>':'<span class="badge badge-low">طلب صرف</span>',t.college,t.mainDepartment||'القسم العام',t.section,itemName(i),t.qty,t.unit,t.type==='issue'?statusBadge(t.status):'<span class="badge badge-ok">مكتمل</span>',formatDateTime(t.transactionAt),actorName(t.createdBy),transactionActions(t)]})
  return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select><select class="select" onchange="setTransactionTypeFilter(this.value)">${txTypeFilterOptions(state.transactionTypeFilter)}</select><select class="select" onchange="setTransactionStatusFilter(this.value)">${txStatusFilterOptions(state.transactionStatusFilter)}</select></div><div class="toolbar-left">${hasPermission('add_issue')?`<button class="btn btn-warning" onclick="openModal('transaction',null,'issue')">+ طلب صرف</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">سجلات الصرف والحركات</div><div class="panel-subtitle">أضيفت فلاتر مستقلة للنوع والحالة لتمكين استخراج تقرير خاص بالإدخال أو الصرف أو بحالة محددة.</div></div>${table(['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','التاريخ','صاحب الإجراء','إجراء'],rows)}</div>`
}
filtersHtml=function(opts={college:true,section:true,search:true,forceCollege:false,txType:false,txStatus:false}){
  ensureExtendedReportState()
  return `<div class="toolbar"><div class="toolbar-right">${opts.search?`<input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">`:''}${opts.college?collegeFilterControl(!!opts.forceCollege):''}${opts.section?`<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select>`:''}${opts.txType?`<select class="select" onchange="setTransactionTypeFilter(this.value)">${txTypeFilterOptions(state.transactionTypeFilter)}</select>`:''}${opts.txStatus?`<select class="select" onchange="setTransactionStatusFilter(this.value)">${txStatusFilterOptions(state.transactionStatusFilter)}</select>`:''}</div><div class="toolbar-left"></div></div>`
}
renderReports=function(){
  ensureExtendedReportState()
  const tabs=availableReportTabs(); if(!tabs.length)return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">لم يتم منح هذا الحساب أي نوع من أنواع التقارير.</div></div>`
  if(!tabs.some(t=>t[0]===state.reportTab))state.reportTab=tabs[0][0]
  const needTxFilters = state.reportTab==='transactions'
  return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">تقارير موحدة على مستوى الجامعة أو القطاع حسب الصلاحية، مع دعم التصفية حسب النوع والحالة في تقرير الصرف والحركات.</div></div><div class="report-tabs">${tabs.map(([id,l])=>`<button class="report-tab ${state.reportTab===id?'active':''}" onclick="state.reportTab='${id}';render()">${l}</button>`).join('')}</div>${filtersHtml({txType:needTxFilters,txStatus:needTxFilters})}<div class="report-actions"><button class="btn btn-primary" onclick="printCurrentReport()">استخراج PDF</button><button class="btn btn-secondary" onclick="exportCurrentExcel()">استخراج Excel</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">معاينة التقرير</div></div>${reportPreviewTable()}</div>`
}
reportData=function(){
  if(state.reportTab==='senior')return {title:'تقرير الإدارة العليا',headers:['المؤشر','القيمة','قراءة إدارية'],rows:[['إجمالي القطاعات المفعلة',COLLEGE_OPTIONS.length,'نطاق التشغيل الحالي للنظام'],['إجمالي الأصناف',visibleItems(true).length,'حجم قاعدة بيانات المخزون'],['الأصناف تحت الحد الأدنى',lowStock().length,'تتطلب معالجة أو رفع احتياج'],['طلبات الصرف المعلقة',visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,'تتطلب اعتمادًا من المسؤول'],['طلبات الاحتياج المعلقة',filteredNeeds().filter(r=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(r.status||'pending_sector_approval')).length,'بين القطاع وإدارة التجهيزات'],['طلبات الدعم بين القطاعات',filteredSupport().filter(r=>['pending_owner','owner_approved','pending_equipment'].includes(r.status||'pending_owner')).length,'تتطلب موافقات تشغيلية'],...COLLEGE_OPTIONS.map(c=>{const items=(db.items||[]).filter(i=>i.college===c);return [c,items.length+' صنف',`تحت الحد: ${items.filter(i=>i.qty<=i.minQty).length}`]})]}
  if(state.reportTab==='transactions')return {title:'تقرير الصرف والحركات',headers:['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','تاريخ الحركة','صاحب الإجراء','اعتمد بواسطة'],rows:visibleTransactions().map(t=>[t.type==='receive'?'إدخال':'صرف',t.college,t.mainDepartment||'القسم العام',t.section,itemName(getItemById(t.itemId)),t.qty,t.unit,statusText((t.type==='receive'?'completed':(t.status||'pending'))),formatDateTime(t.transactionAt),actorName(t.createdBy),actorName(t.reviewedBy)])}
  if(state.reportTab==='needs')return {title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','العربي','English','كميات السنوات','الإجمالي','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','تمت المراجعة بواسطة'],rows:filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr,r.itemNameEn,`${r.year1Qty||0}${Number(r.yearsCount||1)>=2?` / ${r.year2Qty||0}`:''}${Number(r.yearsCount||1)>=3?` / ${r.year3Qty||0}`:''}`,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)])}
  if(state.reportTab==='support')return {title:'تقرير الدعم بين القطاعات',headers:['رقم الطلب','نوع الطلب','من','إلى','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','موافقة الجهة','اعتماد التجهيزات'],rows:filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.mainDepartment||'القسم العام',r.section,r.itemName,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.ownerReviewedBy),actorName(r.reviewedBy)])}
  if(state.reportTab==='low')return {title:'تقرير الأصناف تحت الحد الأدنى',headers:['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الحد الأدنى','الوحدة','آخر تحديث بواسطة'],rows:lowStock().map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.qty,i.minQty,i.unit,actorName(i.createdBy)])}
  return {title:'تقرير المخزون العام',headers:['القطاع','القسم الرئيسي','الرمز','القسم الفرعي','العربي','English','الكمية','الوحدة','الموقع','صاحب الإجراء'],rows:(isCentral()?visibleItems(true):visibleItems()).map(i=>[i.college,i.mainDepartment||'القسم العام',i.code,i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',actorName(i.createdBy)])}
}
ensureExtendedReportState()
/* ===== end v5.8.6 transaction/status report filters ===== */
/* ===== v5.8.6.2 broader item delete actions ===== */
function canManageListedItem(i){
  if(!i || !state.currentUser) return false
  if(isCentral()) return true
  if((i.college||'') !== (state.currentUser.college||'')) return false
  if(hasDepartmentScope() && (i.mainDepartment||'القسم العام') !== state.currentUser.department) return false
  return true
}
function itemActionButtons(i){
  const actions=[]
  if(canManageListedItem(i) && hasPermission('edit_item')) actions.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('item',${i.id})">تعديل</button>`)
  if(canManageListedItem(i) && hasPermission('delete_item')) actions.push(`<button class="btn btn-danger btn-sm" onclick="removeItem(${i.id})">حذف</button>`)
  return actions.length?`<div class="flex-actions">${actions.join('')}</div>`:'—'
}
function exchangeItemActions(i){
  const actions=[]
  if(i.college!==state.currentUser.college && hasPermission('request_support')) actions.push(`<button class="btn btn-primary btn-sm" onclick="openSupportFromItem(${i.id})">طلب دعم</button>`)
  if(canManageListedItem(i) && hasPermission('edit_item')) actions.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('item',${i.id})">تعديل</button>`)
  if(canManageListedItem(i) && hasPermission('delete_item')) actions.push(`<button class="btn btn-danger btn-sm" onclick="removeItem(${i.id})">حذف</button>`)
  return actions.length?`<div class="flex-actions">${actions.join('')}</div>`:'—'
}
renderExecutive=function(){
  const m=metrics()
  const lowRows=lowStock().slice(0,6).map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.qty,i.minQty,itemActionButtons(i)])
  const supportRows=filteredSupport().filter(r=>['pending_owner','owner_approved','pending_equipment'].includes(r.status||'pending_owner')).slice(0,6).map(r=>[r.requestNo,r.fromCollege,r.toCollege,r.itemName,r.qty,statusBadge(r.status)])
  return `<div class="executive-hero"><div class="executive-card"><div class="executive-title">جامعة طيبة — منصة موحدة للقطاعات التعليمية</div><div class="executive-text">تدير المنصة مخزون القطاعات، طلبات الصرف، رفع الاحتياج، وتبادل الدعم بين القطاعات، مع لوحة متابعة مركزية لإدارة التجهيزات.</div><div class="executive-list"><div class="executive-item">إتاحة رؤية المخزون بين القطاعات لدعم تبادل المنفعة وتقليل الهدر.</div><div class="executive-item">رفع الاحتياج لإدارة التجهيزات بناءً على بيانات فعلية من المخزون.</div><div class="executive-item">اعتماد أو رفض طلبات الصرف والدعم بسجل موثق قابل للتقرير.</div></div></div><div class="executive-card"><div class="executive-title">ملخص سريع</div><div class="executive-list"><div class="executive-item">القطاعات المفعلة: ${m.colleges}</div><div class="executive-item">الأصناف المسجلة: ${m.items}</div><div class="executive-item">طلبات دعم معلقة: ${m.pendingSupport}</div><div class="executive-item">طلبات احتياج معلقة: ${m.pendingNeeds}</div></div></div></div>${kpisHtml(m)}${alertsHtml()}<div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">أصناف تحتاج متابعة</div><div class="panel-subtitle">أصناف وصلت للحد الأدنى أو أقل</div></div>${table(['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الحد الأدنى','إجراء'],lowRows)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات دعم معلقة</div><div class="panel-subtitle">طلبات بين الكليات تنتظر الإجراء</div></div>${table(['رقم الطلب','من','إلى','الصنف','الكمية','الحالة'],supportRows)}</div></div>`
}
renderDashboard=function(){
  const deviceRows=visibleItems(true).filter(i=>i.section==='الأجهزة التعليمية').map(i=>[i.college,itemName(i),i.serialNumber||'—',i.deviceStatus||'يعمل',i.location||'—',i.qty,itemActionButtons(i)])
  return `<div class="hero"><div class="hero-title">لوحة متابعة ${isCentral()?'جامعة طيبة':state.currentUser.college}</div><div class="hero-text">تعرض مؤشرات المخزون والصرف والاحتياج والدعم بين القطاعات بصورة مختصرة.</div></div>${kpisHtml(metrics())}${alertsHtml()}<div class="table-panel"><div class="table-head"><div class="panel-title">حالة الأجهزة التعليمية</div></div>${table(['القطاع','الجهاز','الرقم التسلسلي','الحالة','الموقع','الكمية','إجراءات'],deviceRows)}</div>`
}
renderExchange=function(){
  const items=visibleItems(true)
  const rows=items.map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',exchangeItemActions(i)])
  const reqRows=filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.itemName,r.qty,r.unit,statusBadge(r.status),approvalPath('support',r.status),formatDateTime(r.createdAt),supportActions(r)])
  return `<div class="hero"><div class="hero-title">مخزون القطاعات التعليمية</div><div class="hero-text">تمكن الصفحة الكليات من رؤية الأصناف المتاحة لدى القطاعات الأخرى وطلب دعم/إعارة/سلفة تشغيلية وفق اعتماد القطاع المالكة للصنف، مع إتاحة تعديل أو حذف الصنف من القوائم التي يظهر فيها إذا كانت الصلاحية تسمح بذلك.</div></div>${filtersHtml({forceCollege:true})}<div class="table-panel"><div class="table-head"><div class="panel-title">الأصناف المخزنة لدى جميع القطاعات</div><div class="panel-subtitle">يمكن البحث باسم الصنف بالعربية أو الإنجليزية أو الرمز، وتظهر النتائج من جميع القطاعات حسب الصلاحية.</div></div>${table(['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','English','المتاح','الوحدة','الموقع','إجراء'],rows)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الدعم بين القطاعات</div></div>${table(['رقم الطلب','نوع الطلب','الجهة الطالبة','الجهة المالكة','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','تاريخ الطلب','إجراء'],reqRows)}</div>`
}
/* ===== end v5.8.6.2 broader item delete actions ===== */

/* ===== v5.8.7 need delete + date filters ===== */
function ensureAdvancedFilterState(){
  ensureExtendedReportState && ensureExtendedReportState();
  if(typeof state.needStatusFilter==='undefined') state.needStatusFilter='all';
  if(typeof state.dateFrom==='undefined') state.dateFrom='';
  if(typeof state.dateTo==='undefined') state.dateTo='';
}
function setNeedStatusFilter(v){ ensureAdvancedFilterState(); state.needStatusFilter=v; render(); }
function setDateFrom(v){ ensureAdvancedFilterState(); state.dateFrom=v||''; render(); }
function setDateTo(v){ ensureAdvancedFilterState(); state.dateTo=v||''; render(); }
(function(){
  const __oldSetPage2=setPage;
  setPage=function(p){
    ensureAdvancedFilterState();
    __oldSetPage2(p);
    state.needStatusFilter='all';
    state.dateFrom='';
    state.dateTo='';
  }
})();
function needStatusFilterOptions(selected='all'){
  const opts=[
    ['all','كل الحالات'],
    ['pending','تحت الإجراء'],
    ['approved','معتمد'],
    ['rejected','مرفوض'],
    ['returned_to_sector','معاد للقطاع'],
  ];
  return opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
}
function rowWithinDateRange(value){
  ensureAdvancedFilterState();
  if(!state.dateFrom && !state.dateTo) return true;
  const raw=String(value||'').trim();
  if(!raw) return false;
  const dPart=raw.includes(' ')?raw.split(' ')[0]:raw;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dPart)) return true;
  if(state.dateFrom && dPart < state.dateFrom) return false;
  if(state.dateTo && dPart > state.dateTo) return false;
  return true;
}
function effectiveNeedStatus(r){
  const s=r.status||'pending_sector_approval';
  if(['approved','rejected','returned_to_sector'].includes(s)) return s;
  return 'pending';
}
visibleAuditLogs=function(){
  ensureAdvancedFilterState();
  let rows=db.auditLogs||[];
  if(!isCentral()) rows=rows.filter(r=>r.college===state.currentUser.college||r.createdBy===state.currentUser.id);
  if(state.collegeFilter!=='all') rows=rows.filter(r=>r.college===state.collegeFilter);
  if(state.sectionFilter!=='all') rows=rows.filter(r=>r.department===state.sectionFilter||r.department==='الكل');
  rows=rows.filter(r=>rowObjectWithinDateRange(r,['createdAt','actionAt','updatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[r.action,r.targetType,r.targetId,r.college,r.department,r.details,actorName(r.createdBy)].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
visibleTransactions=function(){
  ensureAdvancedFilterState();
  let rows=db.transactions||[];
  if(!isCentral())rows=rows.filter(t=>t.college===state.currentUser.college);
  if(hasDepartmentScope())rows=rows.filter(t=>(t.mainDepartment||t.section)===state.currentUser.department || t.section===state.currentUser.department);
  if(state.collegeFilter!=='all')rows=rows.filter(t=>t.college===state.collegeFilter);
  if(state.sectionFilter!=='all')rows=rows.filter(t=>t.section===state.sectionFilter || (t.mainDepartment||'')===state.sectionFilter);
  if(state.transactionTypeFilter!=='all')rows=rows.filter(t=>String(t.type||'')===state.transactionTypeFilter);
  if(state.transactionStatusFilter!=='all')rows=rows.filter(t=>{
    const effective=t.type==='receive'?'completed':(t.status||'pending');
    return effective===state.transactionStatusFilter;
  });
  rows=rows.filter(t=>rowObjectWithinDateRange(t,['transactionAt','actionAt','requestedAt','createdAt','updatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(t=>[itemName(getItemById(t.itemId)),t.college,t.mainDepartment,t.section,t.type,t.notes,t.status,actorName(t.createdBy),actorName(t.reviewedBy)].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.transactionAt||b.createdAt||'').localeCompare(a.transactionAt||a.createdAt||''));
}
filteredNeeds=function(){
  ensureAdvancedFilterState();
  let rows=db.needsRequests||[];
  if(!isCentral())rows=rows.filter(r=>r.college===state.currentUser.college);
  if(hasDepartmentScope())rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department);
  if(state.collegeFilter!=='all')rows=rows.filter(r=>r.college===state.collegeFilter);
  if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter);
  if(state.needStatusFilter!=='all')rows=rows.filter(r=>effectiveNeedStatus(r)===state.needStatusFilter);
  rows=rows.filter(r=>rowObjectWithinDateRange(r,['createdAt','actionAt','updatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[r.requestNo,r.erpCode,r.college,r.mainDepartment,r.section,r.itemNameAr,r.itemNameEn,r.description,r.specifications,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
filteredSupport=function(){
  ensureAdvancedFilterState();
  let rows=db.supportRequests||[];
  if(!isCentral())rows=rows.filter(r=>r.fromCollege===state.currentUser.college||r.toCollege===state.currentUser.college);
  if(hasDepartmentScope())rows=rows.filter(r=>(r.mainDepartment||r.section)===state.currentUser.department || r.section===state.currentUser.department);
  if(state.collegeFilter!=='all')rows=rows.filter(r=>r.fromCollege===state.collegeFilter||r.toCollege===state.collegeFilter);
  if(state.sectionFilter!=='all')rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter);
  rows=rows.filter(r=>rowObjectWithinDateRange(r,['createdAt','actionAt','updatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[r.requestNo,r.fromCollege,r.toCollege,r.mainDepartment,r.section,r.itemName,r.notes,statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
filtersHtml=function(opts={college:true,section:true,search:true,forceCollege:false,txType:false,txStatus:false,needStatus:false,date:true}){
  ensureAdvancedFilterState();
  return `<div class="toolbar"><div class="toolbar-right">${opts.search?`<input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">`:''}${opts.college?collegeFilterControl(!!opts.forceCollege):''}${opts.section?`<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select>`:''}${opts.txType?`<select class="select" onchange="setTransactionTypeFilter(this.value)">${txTypeFilterOptions(state.transactionTypeFilter)}</select>`:''}${opts.txStatus?`<select class="select" onchange="setTransactionStatusFilter(this.value)">${txStatusFilterOptions(state.transactionStatusFilter)}</select>`:''}${opts.needStatus?`<select class="select" onchange="setNeedStatusFilter(this.value)">${needStatusFilterOptions(state.needStatusFilter)}</select>`:''}${opts.date!==false?`<input class="input" type="date" value="${state.dateFrom}" onchange="setDateFrom(this.value)" title="من تاريخ"><input class="input" type="date" value="${state.dateTo}" onchange="setDateTo(this.value)" title="إلى تاريخ">`:''}</div><div class="toolbar-left"></div></div>`
}
function canDeleteNeed(r){
  if(!hasPermission('create_need')) return false;
  if(!r) return false;
  if(r.college!==state.currentUser.college && !isCentral()) return false;
  return (r.status||'pending_sector_approval')==='rejected';
}
function removeNeed(id){
  const idx=(db.needsRequests||[]).findIndex(x=>Number(x.id)===Number(id));
  if(idx<0) return alert('طلب الاحتياج غير موجود');
  const r=db.needsRequests[idx];
  if(!canDeleteNeed(r)) return alert('يسمح بحذف طلبات الاحتياج المرفوضة فقط ولمنشئيها أو الإدارة المركزية.');
  if(!confirm(`حذف طلب الاحتياج ${r.requestNo||id}؟`)) return;
  db.needsRequests.splice(idx,1);
  db.needEvidence=(db.needEvidence||[]).filter(e=>Number(e.needId)!==Number(id));
  auditLog('حذف طلب احتياج','need',r.requestNo||id,`${r.itemNameAr||r.itemNameEn||''} | حالة سابقة: ${statusText(r.status)}`,r.college,r.mainDepartment||r.section);
  saveDb();
  render();
}
needActions=function(r){
  const buttons=[];
  const sameCollege=r.college===state.currentUser.college;
  const sectorApprover=sameCollege && !isCentral() && hasPermission('approve_need');
  if((r.status||'pending_sector_approval')==='pending_sector_approval' && sectorApprover){
    buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${r.id})">اعتماد القطاع</button>`);
    buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${r.id})">رفض</button>`);
    buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${r.id})">إعادة للتعديل</button>`);
  }
  if((r.status||'pending_sector_approval')==='pending_equipment_review' && isCentral() && hasPermission('approve_need')){
    buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${r.id})">اعتماد</button>`);
    buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${r.id})">رفض</button>`);
    buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${r.id})">إعادة للقطاع</button>`);
  }
  if((sameCollege||isCentral())&&hasPermission('create_need'))buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('needEdit',${r.id})">تعديل</button>`);
  if((sameCollege||isCentral())&&hasPermission('create_need_evidence'))buttons.push(`<button class="btn btn-warning btn-sm" onclick="openModal('evidence',${r.id})">شاهد</button>`);
  if(canDeleteNeed(r))buttons.push(`<button class="btn btn-danger btn-sm" onclick="removeNeed(${r.id})">حذف</button>`);
  return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—';
}
renderTransactions=function(){
  ensureAdvancedFilterState();
  const rows=visibleTransactions().map(t=>{const i=getItemById(t.itemId); return [t.type==='receive'?'<span class="badge badge-ok">إدخال</span>':'<span class="badge badge-low">طلب صرف</span>',t.college,t.mainDepartment||'القسم العام',t.section,itemName(i),t.qty,t.unit,t.type==='issue'?statusBadge(t.status):'<span class="badge badge-ok">مكتمل</span>',formatDateTime(t.transactionAt),actorName(t.createdBy),transactionActions(t)]});
  return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select><select class="select" onchange="setTransactionTypeFilter(this.value)">${txTypeFilterOptions(state.transactionTypeFilter)}</select><select class="select" onchange="setTransactionStatusFilter(this.value)">${txStatusFilterOptions(state.transactionStatusFilter)}</select><input class="input" type="date" value="${state.dateFrom}" onchange="setDateFrom(this.value)"><input class="input" type="date" value="${state.dateTo}" onchange="setDateTo(this.value)"></div><div class="toolbar-left">${hasPermission('add_issue')?`<button class="btn btn-warning" onclick="openModal('transaction',null,'issue')">+ طلب صرف</button>`:''}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">سجلات الصرف والحركات</div><div class="panel-subtitle">يمكن الآن تصفية السجلات حسب النوع والحالة والتاريخ حتى لا تمتلئ الشاشة بالبيانات غير المطلوبة.</div></div>${table(['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','التاريخ','صاحب الإجراء','إجراء'],rows)}</div>`;
}
renderNeeds=function(){
  ensureAdvancedFilterState();
  const rows=filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',`${r.year1Qty||0}${Number(r.yearsCount||1)>=2?` / ${r.year2Qty||0}`:''}${Number(r.yearsCount||1)>=3?` / ${r.year3Qty||0}`:''}`,r.qty,r.unit,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)]);
  return `<div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select><select class="select" onchange="setNeedStatusFilter(this.value)">${needStatusFilterOptions(state.needStatusFilter)}</select><input class="input" type="date" value="${state.dateFrom}" onchange="setDateFrom(this.value)"><input class="input" type="date" value="${state.dateTo}" onchange="setDateTo(this.value)"></div><div class="toolbar-left">${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج</button>`:''}<button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الاحتياج</div><div class="panel-subtitle">يمكنك الآن فرز الطلبات حسب الحالة والتاريخ، وحذف الطلبات المرفوضة فقط حتى يبقى السجل التشغيلي أنظف وأسهل في المتابعة.</div></div>${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','كميات السنوات','الإجمالي','الوحدة','الحالة','الشواهد','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}</div>`;
}
renderAudit=function(){
  ensureAdvancedFilterState();
  const rows=visibleAuditLogs().map(r=>[formatDateTime(r.createdAt),actorName(r.createdBy),r.action,r.targetType,r.targetId,r.college,r.department,r.details]);
  return `<div class="hero"><div class="hero-title">سجل التدقيق والعمليات</div><div class="hero-text">سجل غير تشغيلي مخصص للحوكمة: يوضح من نفذ الإجراء، ونوعه، وتوقيته، والجهة المرتبطة به، مع إمكانية التصفية حسب التاريخ.</div></div>${filtersHtml({forceCollege:true,date:true})}<div class="report-actions"><button class="btn btn-primary" onclick="printAuditReport()">تقرير PDF</button><button class="btn btn-secondary" onclick="exportAuditExcel()">تقرير Excel</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">آخر العمليات</div></div>${table(['التاريخ','صاحب الإجراء','الإجراء','النوع','المرجع','القطاع','القسم','التفاصيل'],rows)}</div>`;
}
renderReports=function(){
  ensureAdvancedFilterState();
  const tabs=availableReportTabs();
  if(!tabs.length)return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">لم يتم منح هذا الحساب أي نوع من أنواع التقارير.</div></div>`;
  if(!tabs.some(t=>t[0]===state.reportTab))state.reportTab=tabs[0][0];
  const needTxFilters = state.reportTab==='transactions';
  const needNeedsFilters = state.reportTab==='needs';
  return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">أصبح بالإمكان استخراج التقارير وفق الفترة الزمنية، كما يمكن فصل تقرير الاحتياج بين المعتمد والمرفوض وتحت الإجراء.</div></div><div class="report-tabs">${tabs.map(([id,l])=>`<button class="report-tab ${state.reportTab===id?'active':''}" onclick="state.reportTab='${id}';render()">${l}</button>`).join('')}</div>${filtersHtml({txType:needTxFilters,txStatus:needTxFilters,needStatus:needNeedsFilters,date:true})}<div class="report-actions"><button class="btn btn-primary" onclick="printCurrentReport()">استخراج PDF</button><button class="btn btn-secondary" onclick="exportCurrentExcel()">استخراج Excel</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">معاينة التقرير</div></div>${reportPreviewTable()}</div>`;
}
printNeeds=function(){
  openPrint({title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الإجمالي','الوحدة','الحالة','تاريخ الرفع','صاحب الإجراء'],rows:filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||r.itemNameEn,r.qty,r.unit,statusText(r.status),formatDateTime(r.createdAt),actorName(r.createdBy)])});
}
reportData=function(){
  if(state.reportTab==='senior')return {title:'تقرير الإدارة العليا',headers:['المؤشر','القيمة','قراءة إدارية'],rows:[['إجمالي القطاعات المفعلة',COLLEGE_OPTIONS.length,'نطاق التشغيل الحالي للنظام'],['إجمالي الأصناف',visibleItems(true).length,'حجم قاعدة بيانات المخزون'],['الأصناف تحت الحد الأدنى',lowStock().length,'تتطلب معالجة أو رفع احتياج'],['طلبات الصرف المعلقة',visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,'تتطلب اعتمادًا من المسؤول'],['طلبات الاحتياج المعلقة',filteredNeeds().filter(r=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(r.status||'pending_sector_approval')).length,'بين القطاع وإدارة التجهيزات'],['طلبات الدعم بين القطاعات',filteredSupport().filter(r=>['pending_owner','owner_approved','pending_equipment'].includes(r.status||'pending_owner')).length,'تتطلب موافقات تشغيلية'],...COLLEGE_OPTIONS.map(c=>{const items=(db.items||[]).filter(i=>i.college===c);return [c,items.length+' صنف',`تحت الحد: ${items.filter(i=>i.qty<=i.minQty).length}`]})]};
  if(state.reportTab==='transactions')return {title:'تقرير الصرف والحركات',headers:['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','تاريخ الحركة','صاحب الإجراء','اعتمد بواسطة'],rows:visibleTransactions().map(t=>[t.type==='receive'?'إدخال':'صرف',t.college,t.mainDepartment||'القسم العام',t.section,itemName(getItemById(t.itemId)),t.qty,t.unit,statusText((t.type==='receive'?'completed':(t.status||'pending'))),formatDateTime(t.transactionAt),actorName(t.createdBy),actorName(t.reviewedBy)])};
  if(state.reportTab==='needs')return {title:'تقرير طلبات الاحتياج',headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','العربي','English','كميات السنوات','الإجمالي','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','تمت المراجعة بواسطة'],rows:filteredNeeds().map(r=>[r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr,r.itemNameEn,`${r.year1Qty||0}${Number(r.yearsCount||1)>=2?` / ${r.year2Qty||0}`:''}${Number(r.yearsCount||1)>=3?` / ${r.year3Qty||0}`:''}`,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)])};
  if(state.reportTab==='support')return {title:'تقرير الدعم بين القطاعات',headers:['رقم الطلب','نوع الطلب','من','إلى','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','مسار الاعتماد','صاحب الإجراء','موافقة الجهة','اعتماد التجهيزات'],rows:filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.mainDepartment||'القسم العام',r.section,r.itemName,r.qty,r.unit,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.ownerReviewedBy),actorName(r.reviewedBy)])};
  if(state.reportTab==='low')return {title:'تقرير الأصناف تحت الحد الأدنى',headers:['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الحد الأدنى','الوحدة','آخر تحديث بواسطة'],rows:lowStock().map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.qty,i.minQty,i.unit,actorName(i.createdBy)])};
  return {title:'تقرير المخزون العام',headers:['القطاع','القسم الرئيسي','الرمز','القسم الفرعي','العربي','English','الكمية','الوحدة','الموقع','صاحب الإجراء'],rows:(isCentral()?visibleItems(true):visibleItems()).map(i=>[i.college,i.mainDepartment||'القسم العام',i.code,i.section,itemName(i),i.nameEn||'—',i.qty,i.unit,i.location||'—',actorName(i.createdBy)])};
}
/* ===== end v5.8.7 need delete + date filters ===== */

/* ===== v5.8.8 date parsing + org page fixes ===== */
function ensureOrgSettingsArrays(){
  if(!db.settings || typeof db.settings!=='object') db.settings={};
  if(!Array.isArray(db.settings.colleges)) db.settings.colleges=[];
  if(!Array.isArray(db.settings.departments)) db.settings.departments=[];
  if(!Array.isArray(db.settings.sections)) db.settings.sections=[];
  if(!Array.isArray(db.settings.locations)) db.settings.locations=[];
}
function normalizeDateValueForCompare(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  const cleaned=raw.split(' ')[0].replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[.]/g,'-').replace(/[\\]/g,'-');
  if(/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  let m=cleaned.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if(m) return `${m[3]}-${m[2]}-${m[1]}`;
  m=cleaned.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  return '';
}
rowWithinDateRange=function(value){
  ensureAdvancedFilterState();
  if(!state.dateFrom && !state.dateTo) return true;
  const normalized=normalizeDateValueForCompare(value);
  if(!normalized) return false;
  if(state.dateFrom && normalized < state.dateFrom) return false;
  if(state.dateTo && normalized > state.dateTo) return false;
  return true;
}
refreshSettingCaches=function(){
  ensureOrgSettingsArrays();
  COLLEGE_OPTIONS=(db.settings.colleges||[]).filter(x=>x && x.name && x.name!=='إدارة التجهيزات').map(x=>x.name);
  SECTION_OPTIONS=(db.settings.sections||[]).filter(x=>x && x.name).map(x=>x.name);
  USER_SECTION_OPTIONS=['الكل',...(db.settings.departments||[]).filter(x=>x && x.name).map(x=>x.name)];
}
renderOrg=function(){
  ensureOrgSettingsArrays();
  const colleges=(db.settings.colleges||[]).map((c,idx)=>[c.name||'—',c.code||'—',`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('collegeEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeCollegeSetting(${idx})">حذف</button></div>`]);
  const departments=(db.settings.departments||[]).map((d,idx)=>[d.name||'—',`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('departmentEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeDepartmentSetting(${idx})">حذف</button></div>`]);
  const sections=(db.settings.sections||[]).map((s,idx)=>[s.name||'—',s.code||'—',`<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('sectionEdit',${idx})">تعديل</button><button class="btn btn-danger btn-sm" onclick="removeSectionSetting(${idx})">حذف</button></div>`]);
  const locations=(db.settings.locations||[]).map((l,idx)=>[l.name||'—',l.college||'عام',`<div class="flex-actions"><button class="btn btn-danger btn-sm" onclick="removeLocationSetting(${idx})">حذف</button></div>`]);
  return `<div class="hero"><div class="hero-title">القطاعات والأقسام والترميز</div><div class="hero-text">الإضافات هنا مستقلة بالكامل: يمكنك إضافة قطاع فقط، أو قسم رئيسي فقط، أو قسم فرعي فقط، دون اشتراط ربطها أثناء الإضافة. يبقى الربط الفعلي عند استخدام هذه القيم داخل المستخدمين والأصناف والطلبات.</div></div>
  <div class="section-split">
    <div class="panel"><div class="panel-title">إضافة قطاع</div><div class="form-grid"><div><label class="label">اسم القطاع</label><input id="new-college-name" class="input" placeholder="مثال: وحدة المختبرات المركزية"></div><div><label class="label">الرمز</label><input id="new-college-code" class="input" placeholder="مثال: LABU"></div></div><button type="button" class="btn btn-primary" onclick="addCollegeSetting()">+ إضافة القطاع</button></div>
    <div class="panel"><div class="panel-title">إضافة قسم رئيسي</div><div class="form-grid"><div><label class="label">اسم القسم الرئيسي</label><input id="new-department-name" class="input" placeholder="مثال: وحدة المستودعات"></div></div><button type="button" class="btn btn-primary" onclick="addDepartmentSetting()">+ إضافة القسم الرئيسي</button></div>
    <div class="panel"><div class="panel-title">إضافة قسم فرعي</div><div class="form-grid"><div><label class="label">اسم القسم الفرعي</label><input id="new-section-name" class="input" placeholder="مثال: المواد الكيميائية"></div><div><label class="label">الرمز</label><input id="new-section-code" class="input" placeholder="مثال: CHM"></div></div><button type="button" class="btn btn-primary" onclick="addSectionSetting()">+ إضافة القسم الفرعي</button></div>
  </div>
  <div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">القطاعات الحالية</div></div>${table(['القطاع','الرمز','إجراء'],colleges)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">الأقسام الرئيسية</div></div>${table(['القسم الرئيسي','إجراء'],departments)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">الأقسام الفرعية</div></div>${table(['القسم الفرعي','الرمز','إجراء'],sections)}</div></div>
  <div class="panel"><div class="panel-title">إضافة موقع</div><div class="form-grid"><div><label class="label">اسم الموقع</label><input id="new-location-name" class="input" placeholder="مثال: 129 SSL 008 - معمل الكيمياء"></div><div><label class="label">القطاع</label><select id="new-location-college" class="select"><option value="">عام</option>${collegeOptions('',false)}</select></div></div><button type="button" class="btn btn-primary" onclick="addLocationSetting()">+ إضافة موقع</button></div><div class="table-panel"><div class="table-head"><div class="panel-title">المواقع المتاحة</div></div>${table(['الموقع','القطاع','إجراء'],locations)}</div>`;
}
addCollegeSetting=function(){
  ensureOrgSettingsArrays();
  const name=document.getElementById('new-college-name')?.value.trim();
  const code=normalizeCode(document.getElementById('new-college-code')?.value);
  if(!name || !code) return alert('أدخل اسم القطاع والرمز');
  if((db.settings.colleges||[]).some(c=>String(c.name||'').trim()===name || String(c.code||'').trim()===code)) return alert('اسم القطاع أو رمزه موجود مسبقًا');
  db.settings.colleges.push({name,code});
  refreshSettingCaches();
  auditLog('إضافة قطاع','settings',name,`رمز القطاع: ${code}`,'جامعة طيبة','الكل');
  saveDb();
  render();
}
addDepartmentSetting=function(){
  ensureOrgSettingsArrays();
  const input=document.getElementById('new-department-name');
  const name=String(input?.value||'').trim();
  if(!name) return alert('أدخل اسم القسم الرئيسي');
  if((db.settings.departments||[]).some(d=>String(d.name||'').trim()===name)) return alert('اسم القسم الرئيسي موجود مسبقًا');
  db.settings.departments.push({name});
  refreshSettingCaches();
  auditLog('إضافة قسم رئيسي','settings',name,'تمت الإضافة','جامعة طيبة','الكل');
  saveDb();
  render();
}
addSectionSetting=function(){
  ensureOrgSettingsArrays();
  const name=document.getElementById('new-section-name')?.value.trim();
  const code=normalizeCode(document.getElementById('new-section-code')?.value);
  if(!name || !code) return alert('أدخل اسم القسم الفرعي والرمز');
  if((db.settings.sections||[]).some(s=>String(s.name||'').trim()===name || String(s.code||'').trim()===code)) return alert('اسم القسم الفرعي أو رمزه موجود مسبقًا');
  db.settings.sections.push({name,code});
  refreshSettingCaches();
  auditLog('إضافة قسم فرعي','settings',name,`رمز القسم الفرعي: ${code}`,'جامعة طيبة','الكل');
  saveDb();
  render();
}


/* ===== v5.8.9 date binding + support request redesign ===== */
function parseAnyDateValue(value){
  const raw=String(value||'').trim();
  if(!raw) return null;
  let cleaned=raw
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/‏|‎/g,'')
    .replace(/[.\\]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
  const datePart=cleaned.split(/[ T]/)[0];
  let y,m,d;
  let mt=datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(mt){
    y=Number(mt[1]); m=Number(mt[2]); d=Number(mt[3]);
  }else{
    mt=datePart.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if(mt){
      d=Number(mt[1]); m=Number(mt[2]); y=Number(mt[3]);
    }else{
      mt=datePart.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
      if(mt){
        y=Number(mt[1]); m=Number(mt[2]); d=Number(mt[3]);
      }else{
        return null;
      }
    }
  }
  if(!y||!m||!d) return null;
  const dt=new Date(y,m-1,d);
  if(Number.isNaN(dt.getTime())) return null;
  dt.setHours(0,0,0,0);
  return dt;
}
function extractRecordDate(record,candidates=[]){
  if(!record || typeof record!=='object') return '';
  for(const key of candidates){
    const val=record[key];
    if(parseAnyDateValue(val)) return String(val);
  }
  for(const [k,val] of Object.entries(record)){
    if(/date|at|time/i.test(k) && parseAnyDateValue(val)) return String(val);
  }
  return '';
}
function rowObjectWithinDateRange(record,candidates=[]){
  return rowWithinDateRange(extractRecordDate(record,candidates));
}

rowWithinDateRange=function(value){
  ensureAdvancedFilterState();
  if(!state.dateFrom && !state.dateTo) return true;
  const current=parseAnyDateValue(value);
  if(!current) return false;
  const from=state.dateFrom?parseAnyDateValue(state.dateFrom):null;
  const to=state.dateTo?parseAnyDateValue(state.dateTo):null;
  if(from && current.getTime()<from.getTime()) return false;
  if(to && current.getTime()>to.getTime()) return false;
  return true;
}
function supportSearchResults(){
  const q=String(state.search||'').trim();
  let rows=visibleItems(true).filter(i=>Number(i.qty||0)>0);
  rows=rows.filter(i=>i.college!==state.currentUser.college || isCentral());
  if(state.collegeFilter!=='all') rows=rows.filter(i=>i.college===state.collegeFilter);
  if(state.sectionFilter!=='all') rows=rows.filter(i=>i.section===state.sectionFilter || (i.mainDepartment||'')===state.sectionFilter);
  if(q){
    rows=rows.filter(i=>[itemName(i),i.nameEn||'',i.code||'',i.college||'',i.mainDepartment||'',i.section||'',i.location||''].join(' ').toLowerCase().includes(q.toLowerCase()));
  }else{
    rows=[];
  }
  rows.sort((a,b)=>String(a.college||'').localeCompare(String(b.college||'')) || String(a.section||'').localeCompare(String(b.section||'')) || String(itemName(a)||'').localeCompare(String(itemName(b)||'')));
  return rows;
}
renderExchange=function(){
  const results=supportSearchResults();
  const resultRows=results.map(i=>[
    itemName(i),
    i.nameEn||'—',
    i.college,
    i.mainDepartment||'القسم العام',
    i.section,
    i.qty,
    i.unit,
    i.location||'—',
    hasPermission('request_support')?`<button class="btn btn-primary btn-sm" onclick="openSupportFromItem(${i.id})">إنشاء طلب دعم</button>`:'—'
  ]);
  const reqRows=filteredSupport().map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.itemName,r.fromCollege,r.toCollege,r.qty,r.unit,statusBadge(r.status),approvalPath('support',r.status),formatDateTime(r.createdAt),supportActions(r)]);
  return `<div class="hero"><div class="hero-title">طلب الدعم بين القطاعات</div><div class="hero-text">بدل عرض كامل الأصناف بشكل دائم، أصبح التقديم من خلال بحث مباشر عن الصنف. اكتب اسم الصنف أو رمزه، وستظهر لك الجهات التي تملكه والكمية المتاحة والموقع، ثم أنشئ طلب الدعم بالكميّة المطلوبة وملاحظاتك.</div></div>
  <div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="ابحث باسم الصنف أو الرمز..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(true)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left"></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">نتائج البحث عن الصنف</div><div class="panel-subtitle">${String(state.search||'').trim()?`عدد النتائج: ${results.length}`:'ابدأ بكتابة اسم الصنف أو الرمز ليتم عرض الجهات المالكة والكمية المتاحة.'}</div></div>${table(['الصنف','English','القطاع المالك','القسم الرئيسي','القسم الفرعي','المتاح','الوحدة','الموقع','إجراء'],resultRows)}</div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الدعم بين القطاعات</div></div>${table(['رقم الطلب','نوع الطلب','الصنف','الجهة الطالبة','الجهة المالكة','الكمية','الوحدة','الحالة','مسار الاعتماد','تاريخ الطلب','إجراء'],reqRows)}</div>`
}
supportModalHtml=function(){
  const item=getItemById(state.editId);
  if(!item) return '';
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">إنشاء طلب دعم</div><div class="panel-subtitle">سترسل الطلب إلى الجهة المالكة للصنف بعد تحديد الكمية والملاحظات المطلوبة.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><div class="alert">الصنف: <strong>${itemName(item)}</strong> — القطاع المالك: <strong>${item.college}</strong> — المتاح: <strong>${item.qty} ${item.unit}</strong> — الموقع: <strong>${item.location||'—'}</strong></div><div class="form-grid"><div><label class="label">نوع الطلب</label><select id="sup-type" class="select"><option>دعم تشغيلي</option><option>سلفة تشغيلية</option><option>نقل عهدة</option></select></div><div><label class="label">الكمية المطلوبة</label><input id="sup-qty" class="input" type="number" min="1" max="${item.qty}" placeholder="أدخل الكمية"></div><div><label class="label">القطاع المالك</label><div class="alert">${item.college}</div></div><div><label class="label">القسم الرئيسي</label><div class="alert">${item.mainDepartment||'القسم العام'}</div></div><div><label class="label">القسم الفرعي</label><div class="alert">${item.section}</div></div><div><label class="label">الموقع</label><div class="alert">${item.location||'—'}</div></div><div class="full"><label class="label">ملاحظات الطلب</label><textarea id="sup-notes" class="textarea" placeholder="اكتب سبب طلب الدعم أو أي تفاصيل تشغيلية لازمة"></textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveSupport()">إرسال طلب الدعم</button></div></div></div>`;
}
saveSupport=function(){
  const item=getItemById(state.editId), qty=Number(document.getElementById('sup-qty')?.value||0);
  if(!item) return alert('الصنف غير موجود');
  if(qty<=0) return alert('أدخل كمية صحيحة');
  if(qty>Number(item.qty||0)) return alert(`الكمية المطلوبة أعلى من المتاح: ${item.qty} ${item.unit}`);
  const notes=document.getElementById('sup-notes')?.value.trim()||'';
  const supportType=document.getElementById('sup-type')?.value||'دعم تشغيلي';
  const sr={
    id:nextId(db.supportRequests),
    requestNo:nextNo('SR',db.supportRequests),
    itemId:item.id,
    itemName:itemName(item),
    mainDepartment:item.mainDepartment||'القسم العام',
    section:item.section,
    fromCollege:state.currentUser.college,
    toCollege:item.college,
    qty,
    unit:item.unit,
    notes,
    supportType,
    attachmentName:'',
    status:'pending_owner',
    workflowStage:'بانتظار موافقة الجهة المالكة',
    createdAt:nowLocalString(),
    createdBy:state.currentUser.id,
    sourceLocation:item.location||''
  };
  db.supportRequests.unshift(sr);
  auditLog('طلب دعم بين القطاعات','support',sr.requestNo,`${sr.supportType} - ${sr.itemName} - كمية ${sr.qty}`,sr.fromCollege,sr.section);
  saveDb();
  closeModal();
}
/* ===== end v5.8.9 date binding + support request redesign ===== */
