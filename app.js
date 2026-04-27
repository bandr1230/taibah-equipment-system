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
function rejectNeed(id){ if(!hasPermission('approve_need'))return alert('لا تملك صلاحية رفض طلبات الاحتياج'); const r=db.needsRequests.find(x=>x.id===id); if(!r)return; const note=prompt('أدخل سبب الرفض',''); if(note===null)return; r.status='rejected'; r.workflowStage='مرفوض'; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; r.returnNote=note; auditLog('رفض طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} ${note?'- '+note:''}`,r.college,r.mainDepartment); saveDb();render() }
function returnNeed(id){ if(!hasPermission('approve_need'))return alert('لا تملك صلاحية إعادة الطلب'); const r=db.needsRequests.find(x=>x.id===id); if(!r)return; const note=prompt('أدخل ملاحظة الإعادة للتعديل',''); if(note===null)return; r.status='returned_to_sector'; r.workflowStage='معاد للقطاع للتعديل'; r.returnNote=note; r.reviewedAt=nowLocalString(); r.reviewedBy=state.currentUser.id; auditLog('إعادة طلب احتياج للتعديل','need',r.requestNo,note||'بدون ملاحظة',r.college,r.mainDepartment); saveDb();render() }
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
supportSearchResults=function(){
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

/* ===== Executive Demo Edition ===== */
const DEMO_DATA_VERSION='executive-demo-2026-04-24-operational-reset';

function demoAllPermissions(){
  return (PERMISSIONS||[]).map(p=>p.key);
}

function buildExecutiveDemoDb(){
  const all=demoAllPermissions();
  const collegePerms=[
    'view_executive','view_dashboard','view_items','add_item','edit_item',
    'view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support',
    'view_needs','create_need','approve_need','view_need_evidence','create_need_evidence',
    'view_reports','report_inventory','report_transactions','report_needs','report_support','report_low'
  ];
  const reportPerms=['view_executive','view_dashboard','view_items','view_transactions','view_exchange','view_needs','view_need_evidence','view_reports','report_senior','report_inventory','report_transactions','report_needs','report_support','report_low'];
  return {
    demoMeta:{version:DEMO_DATA_VERSION,label:'نسخة عرض للمديرين',seededAt:'2026-04-23T08:00'},
    settings:{
      colleges:[
        {name:'كلية الصيدلة',code:'PHRM'},
        {name:'كلية الطب',code:'MED'},
        {name:'كلية التمريض',code:'NURS'},
        {name:'كلية الأسنان',code:'DENT'},
        {name:'كلية العلوم الطبية التطبيقية',code:'AMS'},
        {name:'كلية العلوم',code:'SCI'},
        {name:'إدارة التجهيزات',code:'EQPM'}
      ],
      departments:[
        {name:'القسم العام'},
        {name:'المعامل والمختبرات'},
        {name:'المستودعات'},
        {name:'العيادات التعليمية'},
        {name:'الفصول الذكية'},
        {name:'السلامة والتجهيز'}
      ],
      sections:[
        {name:'المواد الكيميائية',code:'CHM'},
        {name:'المستهلكات التعليمية',code:'CON'},
        {name:'الأجهزة التعليمية',code:'DEV'},
        {name:'الأثاث التعليمي',code:'FUR'},
        {name:'مستلزمات السلامة',code:'SFT'}
      ],
      locations:[
        {name:'129 SSL 008 - معمل الكيمياء',college:'كلية الصيدلة'},
        {name:'129 SSL 009 - معمل الصيدلانيات',college:'كلية الصيدلة'},
        {name:'125 FW 004 - مستودع المستهلكات',college:'كلية الصيدلة'},
        {name:'MED-LAB-214 - معمل التشريح',college:'كلية الطب'},
        {name:'MED-SIM-102 - مركز المحاكاة',college:'كلية الطب'},
        {name:'NUR-SK-015 - معمل المهارات',college:'كلية التمريض'},
        {name:'DENT-CLN-03 - عيادة تعليمية',college:'كلية الأسنان'},
        {name:'AMS-LAB-07 - معمل التحاليل',college:'كلية العلوم الطبية التطبيقية'},
        {name:'SCI-CHM-11 - مستودع الكواشف',college:'كلية العلوم'},
        {name:'EQPM-WH-01 - مستودع التجهيزات المركزي',college:'إدارة التجهيزات'}
      ]
    },
    users:[
      {id:1,fullName:'مدير منصة التجهيزات',username:'admin',password:'123',role:'admin',jobTitle:'مدير النظام',college:'إدارة التجهيزات',department:'الكل',phone:'0500000000',email:'admin@taibahu.edu.sa',nationalId:'1000000000',isActive:true,permissions:['all'],createdAt:'2026-04-10T08:00'},
      {id:2,fullName:'إدارة التجهيزات - اعتماد',username:'equipment',password:'123',role:'user',jobTitle:'إدارة التجهيزات',college:'إدارة التجهيزات',department:'الكل',phone:'0505555555',email:'equipment@taibahu.edu.sa',nationalId:'1000000005',isActive:true,permissions:all,createdAt:'2026-04-10T08:10'},
      {id:3,fullName:'مسؤول كلية الصيدلة',username:'pharmacy',password:'123',role:'user',jobTitle:'مسؤول مخزون الكلية',college:'كلية الصيدلة',department:'المعامل والمختبرات',phone:'0501111111',email:'pharmacy@taibahu.edu.sa',nationalId:'1000000001',isActive:true,permissions:collegePerms,createdAt:'2026-04-10T08:20'},
      {id:4,fullName:'مسؤول كلية الطب',username:'medicine',password:'123',role:'user',jobTitle:'مسؤول التجهيزات التعليمية',college:'كلية الطب',department:'المعامل والمختبرات',phone:'0503333333',email:'medicine@taibahu.edu.sa',nationalId:'1000000003',isActive:true,permissions:collegePerms,createdAt:'2026-04-10T08:30'},
      {id:5,fullName:'مسؤول كلية التمريض',username:'nursing',password:'123',role:'user',jobTitle:'مسؤول معامل المهارات',college:'كلية التمريض',department:'العيادات التعليمية',phone:'0502222222',email:'nursing@taibahu.edu.sa',nationalId:'1000000002',isActive:true,permissions:collegePerms,createdAt:'2026-04-10T08:40'},
      {id:6,fullName:'مشاهد التقارير التنفيذية',username:'reports',password:'123',role:'user',jobTitle:'مشاهد تقارير',college:'إدارة التجهيزات',department:'الكل',phone:'0506666666',email:'reports@taibahu.edu.sa',nationalId:'1000000006',isActive:true,permissions:reportPerms,createdAt:'2026-04-10T08:50'}
    ],
    items:[
      {id:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'حمض الهيدروكلوريك HCl',nameAr:'حمض الهيدروكلوريك HCl',nameEn:'Hydrochloric Acid 37%',code:'PHRM-CHM-001',unit:'لتر',qty:42,minQty:18,location:'129 SSL 008 - معمل الكيمياء',notes:'كاشف أساسي لتجارب التحليل',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T09:00',createdBy:3},
      {id:2,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'إيثانول 96%',nameAr:'إيثانول 96%',nameEn:'Ethanol 96%',code:'PHRM-CHM-002',unit:'لتر',qty:14,minQty:25,location:'129 SSL 009 - معمل الصيدلانيات',notes:'استهلاك مرتفع في تحضير العينات',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T09:20',createdBy:3},
      {id:3,college:'كلية الصيدلة',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',name:'قفازات نيتريل M',nameAr:'قفازات نيتريل M',nameEn:'Nitrile Gloves M',code:'PHRM-CON-001',unit:'صندوق',qty:38,minQty:20,location:'125 FW 004 - مستودع المستهلكات',notes:'مخزون فصل دراسي',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T09:35',createdBy:3},
      {id:4,college:'كلية الصيدلة',mainDepartment:'السلامة والتجهيز',section:'مستلزمات السلامة',name:'نظارات سلامة مخبرية',nameAr:'نظارات سلامة مخبرية',nameEn:'Laboratory Safety Goggles',code:'PHRM-SFT-001',unit:'قطعة',qty:9,minQty:18,location:'125 FW 004 - مستودع المستهلكات',notes:'تحتاج دعم قبل بداية التدريب الصيفي',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T09:45',createdBy:3},
      {id:5,college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',name:'مجهر تعليمي ثلاثي العدسات',nameAr:'مجهر تعليمي ثلاثي العدسات',nameEn:'Trinocular Teaching Microscope',code:'MED-DEV-001',unit:'جهاز',qty:11,minQty:6,location:'MED-LAB-214 - معمل التشريح',notes:'جاهز للتدريب العملي',serialNumber:'MIC-TA-2026-011',deviceStatus:'يعمل',createdAt:'2026-04-12T10:00',createdBy:4},
      {id:6,college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',name:'جهاز طرد مركزي تعليمي',nameAr:'جهاز طرد مركزي تعليمي',nameEn:'Teaching Centrifuge',code:'MED-DEV-002',unit:'جهاز',qty:2,minQty:3,location:'MED-SIM-102 - مركز المحاكاة',notes:'جهاز واحد تحت الصيانة',serialNumber:'CEN-TA-2026-002',deviceStatus:'تحت الصيانة',createdAt:'2026-04-12T10:15',createdBy:4},
      {id:7,college:'كلية الطب',mainDepartment:'المستهلكات التعليمية',section:'المستهلكات التعليمية',name:'شرائح زجاجية للعينات',nameAr:'شرائح زجاجية للعينات',nameEn:'Microscope Slides',code:'MED-CON-001',unit:'علبة',qty:6,minQty:12,location:'MED-LAB-214 - معمل التشريح',notes:'منخفضة بسبب اختبار مهارات عملي',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T10:30',createdBy:4},
      {id:8,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'الأجهزة التعليمية',name:'دمية محاكاة تمريض متقدمة',nameAr:'دمية محاكاة تمريض متقدمة',nameEn:'Advanced Nursing Simulator',code:'NURS-DEV-001',unit:'جهاز',qty:3,minQty:2,location:'NUR-SK-015 - معمل المهارات',notes:'استخدام مكثف في مهارات الرعاية',serialNumber:'SIM-NUR-2026-003',deviceStatus:'يعمل',createdAt:'2026-04-12T10:50',createdBy:5},
      {id:9,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',name:'كمامات طبية تدريبية',nameAr:'كمامات طبية تدريبية',nameEn:'Training Medical Masks',code:'NURS-CON-001',unit:'علبة',qty:4,minQty:15,location:'NUR-SK-015 - معمل المهارات',notes:'منخفضة وتحتاج دعم عاجل',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T11:00',createdBy:5},
      {id:10,college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',name:'رؤوس شفط تدريبية',nameAr:'رؤوس شفط تدريبية',nameEn:'Dental Suction Tips',code:'DENT-CON-001',unit:'كرتون',qty:18,minQty:12,location:'DENT-CLN-03 - عيادة تعليمية',notes:'مخزون جيد',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T11:15',createdBy:1},
      {id:11,college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'الأجهزة التعليمية',name:'وحدة كرسي أسنان تعليمي',nameAr:'وحدة كرسي أسنان تعليمي',nameEn:'Dental Training Chair Unit',code:'DENT-DEV-001',unit:'جهاز',qty:1,minQty:2,location:'DENT-CLN-03 - عيادة تعليمية',notes:'تحت الحد الأدنى',serialNumber:'DCH-TA-2026-001',deviceStatus:'يعمل',createdAt:'2026-04-12T11:30',createdBy:1},
      {id:12,college:'كلية العلوم الطبية التطبيقية',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'محلول معايرة pH 7',nameAr:'محلول معايرة pH 7',nameEn:'pH Buffer Solution 7',code:'AMS-CHM-001',unit:'لتر',qty:22,minQty:10,location:'AMS-LAB-07 - معمل التحاليل',notes:'جاهز',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T11:45',createdBy:1},
      {id:13,college:'كلية العلوم الطبية التطبيقية',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',name:'جهاز تحليل طيفي تعليمي',nameAr:'جهاز تحليل طيفي تعليمي',nameEn:'Teaching Spectrophotometer',code:'AMS-DEV-001',unit:'جهاز',qty:2,minQty:2,location:'AMS-LAB-07 - معمل التحاليل',notes:'جاهز',serialNumber:'SPC-AMS-2026-002',deviceStatus:'يعمل',createdAt:'2026-04-12T12:00',createdBy:1},
      {id:14,college:'كلية العلوم',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'هيدروكسيد الصوديوم NaOH',nameAr:'هيدروكسيد الصوديوم NaOH',nameEn:'Sodium Hydroxide',code:'SCI-CHM-001',unit:'كيلو',qty:7,minQty:15,location:'SCI-CHM-11 - مستودع الكواشف',notes:'تحت الحد ويصلح للدعم بين القطاعات',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T12:15',createdBy:1},
      {id:15,college:'كلية العلوم',mainDepartment:'الفصول الذكية',section:'الأثاث التعليمي',name:'طاولات مختبر مقاومة للمواد',nameAr:'طاولات مختبر مقاومة للمواد',nameEn:'Chemical Resistant Lab Tables',code:'SCI-FUR-001',unit:'قطعة',qty:16,minQty:8,location:'SCI-CHM-11 - مستودع الكواشف',notes:'مخزون قابل للدعم',serialNumber:'',deviceStatus:'',createdAt:'2026-04-12T12:30',createdBy:1},
      {id:16,college:'إدارة التجهيزات',mainDepartment:'المستودعات',section:'الأجهزة التعليمية',name:'حاسب محمول تعليمي',nameAr:'حاسب محمول تعليمي',nameEn:'Teaching Laptop',code:'EQPM-DEV-001',unit:'جهاز',qty:25,minQty:10,location:'EQPM-WH-01 - مستودع التجهيزات المركزي',notes:'رصيد مركزي للطلبات المعتمدة',serialNumber:'LAP-EQPM-2026-BATCH',deviceStatus:'عهدة',createdAt:'2026-04-12T12:45',createdBy:2}
    ],
    transactions:[
      {id:1,type:'receive',status:'approved',itemId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:20,unit:'لتر',transactionAt:'2026-04-13T08:30',notes:'توريد بداية الفصل',createdBy:3,approvedBy:3},
      {id:2,type:'issue',status:'pending',itemId:2,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:6,unit:'لتر',transactionAt:'2026-04-14T09:15',notes:'طلب صرف لتجربة تحضير العينات',createdBy:3},
      {id:3,type:'issue',status:'approved',itemId:7,college:'كلية الطب',mainDepartment:'المستهلكات التعليمية',section:'المستهلكات التعليمية',qty:4,unit:'علبة',transactionAt:'2026-04-14T10:00',notes:'صرف لاختبار مهارات عملي',createdBy:4,reviewedBy:4,approvedBy:4},
      {id:4,type:'receive',status:'approved',itemId:8,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'الأجهزة التعليمية',qty:1,unit:'جهاز',transactionAt:'2026-04-14T11:20',notes:'إضافة جهاز محاكاة جديد',createdBy:5,approvedBy:5},
      {id:5,type:'issue',status:'pending',itemId:9,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',qty:3,unit:'علبة',transactionAt:'2026-04-15T08:40',notes:'طلب صرف لتدريب السلامة',createdBy:5},
      {id:6,type:'receive',status:'approved',itemId:16,college:'إدارة التجهيزات',mainDepartment:'المستودعات',section:'الأجهزة التعليمية',qty:10,unit:'جهاز',transactionAt:'2026-04-15T12:10',notes:'توريد مركزي',createdBy:2,approvedBy:2},
      {id:7,type:'issue',status:'rejected',itemId:11,college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'الأجهزة التعليمية',qty:1,unit:'جهاز',transactionAt:'2026-04-16T09:05',notes:'رفض لعدم اكتمال المبررات',createdBy:1,reviewedBy:2},
      {id:8,type:'issue',status:'approved',itemId:3,college:'كلية الصيدلة',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',qty:12,unit:'صندوق',transactionAt:'2026-04-16T10:10',notes:'صرف لمعامل التدريب العملي',createdBy:3,reviewedBy:3,approvedBy:3},
      {id:9,type:'issue',status:'approved',itemId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:10,unit:'لتر',transactionAt:'2026-04-16T11:00',notes:'صرف لتجارب التحليل الكيميائي',createdBy:3,reviewedBy:3,approvedBy:3},
      {id:10,type:'issue',status:'approved',itemId:10,college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',qty:9,unit:'كرتون',transactionAt:'2026-04-17T08:35',notes:'صرف للعيادات التعليمية',createdBy:1,reviewedBy:2,approvedBy:2},
      {id:11,type:'issue',status:'approved',itemId:16,college:'إدارة التجهيزات',mainDepartment:'المستودعات',section:'الأجهزة التعليمية',qty:5,unit:'جهاز',transactionAt:'2026-04-17T13:20',notes:'دعم أجهزة للتدريب المتنقل',createdBy:2,reviewedBy:2,approvedBy:2},
      {id:12,type:'issue',status:'approved',itemId:14,college:'كلية العلوم',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:5,unit:'كيلو',transactionAt:'2026-04-18T09:25',notes:'صرف لمقرر الكيمياء العامة',createdBy:2,reviewedBy:2,approvedBy:2}
    ],
    needsRequests:[
      {id:1,requestNo:'NR-2026-0001',erpCode:'ERP-46021',college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',category:'المواد الكيميائية',itemNameAr:'إيثانول 96%',itemNameEn:'Ethanol 96%',unit:'لتر',mandatoryProduct:'نعم',constructionCode:'CHM-ETH-96',similarItem:'لا يوجد بديل مطابق',brandMention:'لا',brandReason:'',yearsCount:2,year1Qty:80,year2Qty:60,year3Qty:0,qty:140,requestOrderNo:'PO-REQ-2026-184',sendGrouping:'حسب القسم الرئيسي',description:'مذيب تعليمي عالي النقاوة لاستخدامات التحضير والتعقيم',specifications:'عبوات 4 لتر، نقاوة 96%، مطابقة لاشتراطات السلامة',justification:'انخفاض الرصيد الحالي مع زيادة الشعب العملية',notes:'طلب مرشح للاعتماد',status:'pending_equipment_review',workflowStage:'بانتظار إجراء إدارة التجهيزات',createdAt:'2026-04-16T09:30',createdBy:3,sectorApprovedAt:'2026-04-16T12:00',sectorApprovedBy:3},
      {id:2,requestNo:'NR-2026-0002',erpCode:'ERP-46044',college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',category:'الأجهزة التعليمية',itemNameAr:'جهاز طرد مركزي تعليمي',itemNameEn:'Teaching Centrifuge',unit:'جهاز',mandatoryProduct:'لا',constructionCode:'',similarItem:'جهاز الطرد المركزي الحالي محدود السعة',brandMention:'لا',brandReason:'',yearsCount:1,year1Qty:2,year2Qty:0,year3Qty:0,qty:2,requestOrderNo:'PO-REQ-2026-201',sendGrouping:'حسب القسم الفرعي',description:'أجهزة تعليمية للتدريب العملي على فصل العينات',specifications:'سعة 12 أنبوب، تحكم رقمي، غطاء أمان',justification:'تزايد عدد مجموعات التدريب وتوقف جهاز حالي للصيانة',notes:'مهم قبل اختبارات نهاية الفصل',status:'pending_sector_approval',workflowStage:'بانتظار اعتماد مسؤول القطاع',createdAt:'2026-04-16T10:20',createdBy:4},
      {id:3,requestNo:'NR-2026-0003',erpCode:'ERP-46102',college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',category:'المستهلكات التعليمية',itemNameAr:'كمامات طبية تدريبية',itemNameEn:'Training Medical Masks',unit:'علبة',mandatoryProduct:'لا',constructionCode:'',similarItem:'',brandMention:'لا',brandReason:'',yearsCount:3,year1Qty:35,year2Qty:35,year3Qty:30,qty:100,requestOrderNo:'PO-REQ-2026-209',sendGrouping:'حسب القسم الرئيسي',description:'مستهلكات تدريبية لمعامل المهارات السريرية',specifications:'علبة 50 قطعة، ثلاث طبقات',justification:'المخزون الحالي لا يغطي أسابيع التدريب العملي',notes:'يوجد شاهد احتياج',status:'approved',workflowStage:'معتمد من إدارة التجهيزات',createdAt:'2026-04-15T11:00',createdBy:5,reviewedAt:'2026-04-17T09:00',reviewedBy:2},
      {id:4,requestNo:'NR-2026-0004',erpCode:'ERP-46110',college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'الأجهزة التعليمية',category:'الأجهزة التعليمية',itemNameAr:'وحدة كرسي أسنان تعليمي',itemNameEn:'Dental Training Chair Unit',unit:'جهاز',mandatoryProduct:'لا',constructionCode:'',similarItem:'',brandMention:'نعم',brandReason:'توحيد قطع الغيار مع الوحدات الحالية',yearsCount:1,year1Qty:1,year2Qty:0,year3Qty:0,qty:1,requestOrderNo:'PO-REQ-2026-215',sendGrouping:'حسب القسم الفرعي',description:'كرسي أسنان تعليمي للعيادات التدريبية',specifications:'وحدة تدريب مع ضوء ومنافذ شفط وماء',justification:'رفع الطاقة الاستيعابية للعيادات التعليمية',notes:'معاد لاستكمال عرض السعر',status:'returned_to_sector',workflowStage:'معاد للقطاع للتعديل',returnNote:'إرفاق مبرر ذكر العلامة التجارية',createdAt:'2026-04-15T12:10',createdBy:1,reviewedAt:'2026-04-17T10:30',reviewedBy:2},
      {id:5,requestNo:'NR-2026-0005',erpCode:'ERP-46130',college:'كلية العلوم الطبية التطبيقية',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',category:'الأجهزة التعليمية',itemNameAr:'جهاز تحليل طيفي تعليمي',itemNameEn:'Teaching Spectrophotometer',unit:'جهاز',mandatoryProduct:'لا',constructionCode:'',similarItem:'',brandMention:'لا',brandReason:'',yearsCount:2,year1Qty:1,year2Qty:1,year3Qty:0,qty:2,requestOrderNo:'PO-REQ-2026-233',sendGrouping:'حسب القسم الرئيسي',description:'جهاز قياس امتصاصية العينات التعليمية',specifications:'مدى 320-1000 nm، شاشة رقمية',justification:'دعم مقررات التحاليل السريرية',notes:'قيد المراجعة',status:'pending_equipment_review',workflowStage:'بانتظار إجراء إدارة التجهيزات',createdAt:'2026-04-17T08:45',createdBy:2,sectorApprovedAt:'2026-04-17T11:00',sectorApprovedBy:2},
      {id:6,requestNo:'NR-2026-0006',erpCode:'ERP-46155',college:'كلية العلوم',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',category:'المواد الكيميائية',itemNameAr:'هيدروكسيد الصوديوم NaOH',itemNameEn:'Sodium Hydroxide',unit:'كيلو',mandatoryProduct:'نعم',constructionCode:'CHM-NAOH',similarItem:'',brandMention:'لا',brandReason:'',yearsCount:1,year1Qty:25,year2Qty:0,year3Qty:0,qty:25,requestOrderNo:'PO-REQ-2026-244',sendGrouping:'حسب القسم الفرعي',description:'كاشف أساسي لمقررات الكيمياء',specifications:'حبيبات، نقاوة مخبرية، عبوات 1 كجم',justification:'الرصيد الحالي دون الحد الأدنى',notes:'بانتظار اعتماد القطاع',status:'pending_sector_approval',workflowStage:'بانتظار اعتماد مسؤول القطاع',createdAt:'2026-04-18T09:10',createdBy:2}
    ],
    needEvidence:[
      {id:1,needId:1,requestNo:'NR-2026-0001',college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',itemNameAr:'إيثانول 96%',itemNameEn:'Ethanol 96%',unit:'لتر',courseName:'الصيدلانيات العملية',courseCode:'PHRM-342',academicYear:'1447',semester:'الأول',sectionsCount:5,studentsCount:128,usesCount:4,qtyPerStudent:0.12,stockAvailable:14,estimatedNeed:62,deficit:48,justification:'عدد الشعب العملية أعلى من الرصيد المتاح',recommendation:'اعتماد الاحتياج لسنتين',notes:'مرفق جدول الشعب',createdAt:'2026-04-16T09:50',createdBy:3},
      {id:2,needId:2,requestNo:'NR-2026-0002',college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',itemNameAr:'جهاز طرد مركزي تعليمي',itemNameEn:'Teaching Centrifuge',unit:'جهاز',courseName:'مهارات المختبرات الطبية',courseCode:'MED-221',academicYear:'1447',semester:'الثاني',sectionsCount:4,studentsCount:96,usesCount:6,qtyPerStudent:0.02,stockAvailable:2,estimatedNeed:12,deficit:10,justification:'تعطل جهاز حالي وارتفاع عدد المجموعات',recommendation:'اعتماد جهازين وتوجيه الصيانة للجهاز المتعطل',notes:'',createdAt:'2026-04-16T10:45',createdBy:4},
      {id:3,needId:3,requestNo:'NR-2026-0003',college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',itemNameAr:'كمامات طبية تدريبية',itemNameEn:'Training Medical Masks',unit:'علبة',courseName:'أساسيات التمريض السريري',courseCode:'NUR-210',academicYear:'1447',semester:'الثاني',sectionsCount:6,studentsCount:180,usesCount:5,qtyPerStudent:0.05,stockAvailable:4,estimatedNeed:45,deficit:41,justification:'التدريب السريري يتطلب استهلاكًا لكل طالب',recommendation:'اعتماد الطلب كاملًا',notes:'تم الاعتماد',createdAt:'2026-04-15T11:20',createdBy:5},
      {id:4,needId:5,requestNo:'NR-2026-0005',college:'كلية العلوم الطبية التطبيقية',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',itemNameAr:'جهاز تحليل طيفي تعليمي',itemNameEn:'Teaching Spectrophotometer',unit:'جهاز',courseName:'التحاليل السريرية',courseCode:'AMS-330',academicYear:'1447',semester:'الأول',sectionsCount:3,studentsCount:74,usesCount:8,qtyPerStudent:0.03,stockAvailable:2,estimatedNeed:18,deficit:16,justification:'الاستخدام المتزامن يسبب انتظارًا طويلًا للطلاب',recommendation:'اعتماد جهازين',notes:'',createdAt:'2026-04-17T09:15',createdBy:2}
    ],
    supportRequests:[
      {id:1,requestNo:'SR-2026-0001',itemId:3,itemName:'قفازات نيتريل M',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',fromCollege:'كلية التمريض',toCollege:'كلية الصيدلة',qty:8,unit:'صندوق',supportType:'دعم تشغيلي',notes:'تغطية تدريب السلامة حتى وصول التوريد',attachmentName:'',status:'pending_owner',workflowStage:'بانتظار موافقة الجهة المالكة',createdAt:'2026-04-18T08:20',createdBy:5,sourceLocation:'125 FW 004 - مستودع المستهلكات'},
      {id:2,requestNo:'SR-2026-0002',itemId:15,itemName:'طاولات مختبر مقاومة للمواد',mainDepartment:'الفصول الذكية',section:'الأثاث التعليمي',fromCollege:'كلية الصيدلة',toCollege:'كلية العلوم',qty:4,unit:'قطعة',supportType:'نقل عهدة',notes:'تجهيز معمل مؤقت للتدريب الصيفي',attachmentName:'',status:'owner_approved',workflowStage:'بانتظار اعتماد إدارة التجهيزات',createdAt:'2026-04-18T09:30',createdBy:3,ownerReviewedAt:'2026-04-18T12:00',ownerReviewedBy:2},
      {id:3,requestNo:'SR-2026-0003',itemId:16,itemName:'حاسب محمول تعليمي',mainDepartment:'المستودعات',section:'الأجهزة التعليمية',fromCollege:'كلية الأسنان',toCollege:'إدارة التجهيزات',qty:5,unit:'جهاز',supportType:'سلفة تشغيلية',notes:'تشغيل عيادات تدريبية متنقلة',attachmentName:'',status:'pending_equipment',workflowStage:'بانتظار اعتماد إدارة التجهيزات',createdAt:'2026-04-18T10:15',createdBy:1},
      {id:4,requestNo:'SR-2026-0004',itemId:12,itemName:'محلول معايرة pH 7',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',fromCollege:'كلية الصيدلة',toCollege:'كلية العلوم الطبية التطبيقية',qty:5,unit:'لتر',supportType:'دعم تشغيلي',notes:'استخدام مؤقت لتجارب التحليل',attachmentName:'',status:'approved',workflowStage:'معتمد نهائيًا',createdAt:'2026-04-17T13:00',createdBy:3,ownerReviewedAt:'2026-04-17T14:00',ownerReviewedBy:2,reviewedAt:'2026-04-18T08:00',reviewedBy:2},
      {id:5,requestNo:'SR-2026-0005',itemId:4,itemName:'نظارات سلامة مخبرية',mainDepartment:'السلامة والتجهيز',section:'مستلزمات السلامة',fromCollege:'كلية العلوم',toCollege:'كلية الصيدلة',qty:6,unit:'قطعة',supportType:'دعم تشغيلي',notes:'تهيئة تدريب السلامة الأسبوع القادم',attachmentName:'',status:'rejected',workflowStage:'مرفوض',createdAt:'2026-04-16T08:50',createdBy:2,reviewedAt:'2026-04-16T12:20',reviewedBy:3}
    ],
    auditLogs:[
      {id:1,action:'تهيئة نسخة العرض',targetType:'system',targetId:'DEMO',college:'جامعة طيبة',department:'الكل',details:'تم إنشاء بيانات تجريبية تنفيذية للعرض',createdAt:'2026-04-23T08:00',createdBy:1},
      {id:2,action:'رفع طلب احتياج',targetType:'need',targetId:'NR-2026-0001',college:'كلية الصيدلة',department:'المعامل والمختبرات',details:'إيثانول 96% - إجمالي 140 لتر',createdAt:'2026-04-16T09:30',createdBy:3},
      {id:3,action:'اعتماد طلب احتياج',targetType:'need',targetId:'NR-2026-0003',college:'كلية التمريض',department:'العيادات التعليمية',details:'كمامات طبية تدريبية - شواهد مكتملة',createdAt:'2026-04-17T09:00',createdBy:2},
      {id:4,action:'إعادة طلب احتياج للتعديل',targetType:'need',targetId:'NR-2026-0004',college:'كلية الأسنان',department:'العيادات التعليمية',details:'استكمال مبرر العلامة التجارية',createdAt:'2026-04-17T10:30',createdBy:2},
      {id:5,action:'طلب دعم بين القطاعات',targetType:'support',targetId:'SR-2026-0002',college:'كلية الصيدلة',department:'الفصول الذكية',details:'نقل عهدة - طاولات مختبر',createdAt:'2026-04-18T09:30',createdBy:3},
      {id:6,action:'موافقة الجهة المالكة على الدعم',targetType:'support',targetId:'SR-2026-0002',college:'كلية العلوم',department:'الفصول الذكية',details:'بانتظار اعتماد إدارة التجهيزات',createdAt:'2026-04-18T12:00',createdBy:2},
      {id:7,action:'طلب صرف',targetType:'transaction',targetId:'2',college:'كلية الصيدلة',department:'المعامل والمختبرات',details:'إيثانول 96% - كمية 6 لتر',createdAt:'2026-04-14T09:15',createdBy:3}
    ]
  };
}

function buildSimplifiedOperationalDemoData(){
  return {
    demoMeta:{version:DEMO_DATA_VERSION,label:'نسخة عرض مبسطة لحوكمة الاحتياج والمخزون',seededAt:'2026-04-24T21:45'},
    items:[
      {id:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'إيثانول 96%',nameAr:'إيثانول 96%',nameEn:'Ethanol 96%',code:'PHRM-CHM-001',unit:'لتر',qty:8,minQty:20,location:'129 SSL 009 - معمل الصيدلانيات',notes:'رصيد منخفض لا يكفي تجارب الفصلين',serialNumber:'',deviceStatus:'',createdAt:'2026-04-20T09:00',createdBy:3},
      {id:2,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',name:'حمض الهيدروكلوريك HCl',nameAr:'حمض الهيدروكلوريك HCl',nameEn:'Hydrochloric Acid 37%',code:'PHRM-CHM-002',unit:'لتر',qty:24,minQty:10,location:'129 SSL 008 - معمل الكيمياء',notes:'رصيد كاف للتدريب الحالي',serialNumber:'',deviceStatus:'',createdAt:'2026-04-20T09:10',createdBy:3},
      {id:3,college:'كلية الصيدلة',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',name:'قفازات نيتريل M',nameAr:'قفازات نيتريل M',nameEn:'Nitrile Gloves M',code:'PHRM-CON-001',unit:'صندوق',qty:12,minQty:20,location:'125 FW 004 - مستودع المستهلكات',notes:'الصندوق 100 قطعة، يستخدم في أكثر من تجربة',serialNumber:'',deviceStatus:'',createdAt:'2026-04-20T09:20',createdBy:3},
      {id:4,college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',name:'مجهر تعليمي',nameAr:'مجهر تعليمي',nameEn:'Teaching Microscope',code:'MED-DEV-001',unit:'جهاز',qty:5,minQty:8,location:'MED-LAB-214 - معمل التشريح',notes:'تحتاج زيادة مع عدد المجموعات',serialNumber:'MIC-TA-2026-BATCH',deviceStatus:'يعمل',createdAt:'2026-04-20T09:30',createdBy:4},
      {id:5,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',name:'كمامات طبية تدريبية',nameAr:'كمامات طبية تدريبية',nameEn:'Training Medical Masks',code:'NURS-CON-001',unit:'علبة',qty:6,minQty:12,location:'NUR-SK-015 - معمل المهارات',notes:'العلبة 50 قطعة، رصيد منخفض',serialNumber:'',deviceStatus:'',createdAt:'2026-04-20T09:40',createdBy:5},
      {id:6,college:'كلية الأسنان',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',name:'رؤوس شفط تدريبية',nameAr:'رؤوس شفط تدريبية',nameEn:'Dental Suction Tips',code:'DENT-CON-001',unit:'كرتون',qty:18,minQty:10,location:'DENT-CLN-03 - عيادة تعليمية',notes:'رصيد مناسب وقابل للمقارنة مع الاحتياج',serialNumber:'',deviceStatus:'',createdAt:'2026-04-20T09:50',createdBy:1}
    ],
    transactions:[
      {id:1,type:'receive',status:'approved',itemId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:12,unit:'لتر',transactionAt:'2026-04-21T08:30',notes:'توريد إيثانول بداية التجارب العملية',createdBy:3,approvedBy:3,reviewedBy:3},
      {id:2,type:'issue',status:'approved',itemId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',qty:4,unit:'لتر',transactionAt:'2026-04-21T11:15',notes:'صرف لتجربة تحضير العينات',createdBy:3,approvedBy:3,reviewedBy:3},
      {id:3,type:'issue',status:'pending',itemId:3,college:'كلية الصيدلة',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',qty:3,unit:'صندوق',transactionAt:'2026-04-22T09:20',notes:'طلب صرف لمعمل التدريب العملي',createdBy:3},
      {id:4,type:'issue',status:'pending',itemId:5,college:'كلية التمريض',mainDepartment:'العيادات التعليمية',section:'المستهلكات التعليمية',qty:2,unit:'علبة',transactionAt:'2026-04-22T10:10',notes:'تدريب مهارات السلامة السريرية',createdBy:5}
    ],
    needsRequests:[
      {id:1,requestNo:'NR-2026-0001',erpCode:'ERP-DEMO-001',college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',category:'المواد الكيميائية',itemNameAr:'إيثانول 96%',itemNameEn:'Ethanol 96%',unit:'لتر',mandatoryProduct:'نعم',constructionCode:'CHM-ETH-96',similarItem:'لا يوجد بديل مطابق للتجارب الحالية',brandMention:'لا',brandReason:'',yearsCount:2,year1Qty:23,year2Qty:23,year3Qty:0,qty:46,grossQty:54,stockAvailable:8,evidenceCount:2,requestOrderNo:'PO-DEMO-001',sendGrouping:'حسب القسم الرئيسي',targetEntity:'إدارة التجهيزات',description:'احتياج مولد من المراجع التعليمية لتجارب الصيدلانيات العملية',specifications:'عبوات 4 لتر، نقاوة 96%، مطابقة لاشتراطات السلامة',justification:'احتياج مولد من مرجعين تعليميين لنفس الصنف مع خصم الرصيد المتاح وتقريب الكمية للأعلى.',notes:'عينة مبسطة لاختبار الربط بين المرجع التعليمي والاحتياج الرسمي',status:'pending_equipment_review',workflowStage:'بانتظار إجراء إدارة التجهيزات',calculationSource:'educational_reference_v6_2',referenceBased:true,courseName:'الصيدلانيات العملية، الكيمياء الصيدلية العملية',courseCode:'PHRM-342، PHRM-251',createdAt:'2026-04-22T13:00',createdBy:3,sectorApprovedAt:'2026-04-22T14:30',sectorApprovedBy:3}
    ],
    needEvidence:[
      {id:1,referenceNo:'ER-2026-0001',requestNo:'NR-2026-0001',referenceType:'educational_reference',referenceStatus:'generated',needId:1,generatedNeedId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',referenceCategoryKey:'chemical',referenceCategory:'المواد الكيميائية',categoryLabel:'مواد كيميائية',itemNameAr:'إيثانول 96%',itemNameEn:'Ethanol 96%',unit:'لتر',usageUnit:'مليتر',calculationUsageUnit:'لتر',requestUnit:'لتر',academicYear:'1447',level:'المستوى الخامس',courseName:'الصيدلانيات العملية',courseCode:'PHRM-342',experimentName:'تحضير عينة كحولية',semester:'الأول',sectionsCount:4,studentsCount:96,maleSections:2,malePerSection:24,femaleSections:2,femalePerSection:24,groupSize:1,groupsCount:96,usesCount:3,repeats:3,consumptionBasis:'per_student',calculationMethod:'لكل طالب',qtyPerUse:0.08,displayQtyPerUse:80,packSize:0,wastePercent:10,stockAvailable:8,specA:'96%',specB:'قابل للاشتعال',specifications:'96% | قابل للاشتعال',estimatedNeed:26,grossNeed:26,grossNeedUsage:26,deficit:18,justification:'مرجع تعليمي لمقرر الصيدلانيات العملية: لكل طالب × 0.08 لتر في تجربة تحضير عينة كحولية.',recommendation:'تم توليد الاحتياج الرسمي من هذا المرجع.',notes:'',createdAt:'2026-04-22T12:00',createdBy:3,generatedAt:'2026-04-22T13:00',generatedBy:3},
      {id:2,referenceNo:'ER-2026-0002',requestNo:'NR-2026-0001',referenceType:'educational_reference',referenceStatus:'generated',needId:1,generatedNeedId:1,college:'كلية الصيدلة',mainDepartment:'المعامل والمختبرات',section:'المواد الكيميائية',referenceCategoryKey:'chemical',referenceCategory:'المواد الكيميائية',categoryLabel:'مواد كيميائية',itemNameAr:'إيثانول 96%',itemNameEn:'Ethanol 96%',unit:'لتر',usageUnit:'مليتر',calculationUsageUnit:'لتر',requestUnit:'لتر',academicYear:'1447',level:'المستوى الرابع',courseName:'الكيمياء الصيدلية العملية',courseCode:'PHRM-251',experimentName:'استخلاص مركب عضوي',semester:'الثاني',sectionsCount:4,studentsCount:92,maleSections:2,malePerSection:23,femaleSections:2,femalePerSection:23,groupSize:1,groupsCount:92,usesCount:3,repeats:3,consumptionBasis:'per_student',calculationMethod:'لكل طالب',qtyPerUse:0.075,displayQtyPerUse:75,packSize:0,wastePercent:10,stockAvailable:8,specA:'96%',specB:'قابل للاشتعال',specifications:'96% | قابل للاشتعال',estimatedNeed:23,grossNeed:23,grossNeedUsage:23,deficit:15,justification:'مرجع تعليمي لنفس الصنف من مقرر آخر، لذلك تم تجميعه تحت احتياج واحد.',recommendation:'تم توليد الاحتياج الرسمي من هذا المرجع.',notes:'',createdAt:'2026-04-22T12:10',createdBy:3,generatedAt:'2026-04-22T13:00',generatedBy:3},
      {id:3,referenceNo:'ER-2026-0003',requestNo:'ER-2026-0003',referenceType:'educational_reference',referenceStatus:'ready',needId:null,generatedNeedId:null,college:'كلية الصيدلة',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',referenceCategoryKey:'consumable',referenceCategory:'المستهلكات التعليمية',categoryLabel:'مستهلكات تعليمية',itemNameAr:'قفازات نيتريل M',itemNameEn:'Nitrile Gloves M',unit:'صندوق',usageUnit:'قطعة',calculationUsageUnit:'صندوق',requestUnit:'صندوق',academicYear:'1447',level:'المستوى الثالث',courseName:'السلامة المخبرية',courseCode:'PHRM-210',experimentName:'تدريب السلامة والتعامل مع العينات',semester:'الأول',sectionsCount:5,studentsCount:120,maleSections:2,malePerSection:24,femaleSections:3,femalePerSection:24,groupSize:1,groupsCount:120,usesCount:2,repeats:2,consumptionBasis:'per_student',calculationMethod:'لكل طالب',qtyPerUse:0.04,displayQtyPerUse:4,packSize:100,wastePercent:5,stockAvailable:12,specA:'مقاس M',specB:'100',specifications:'مقاس M | 100',estimatedNeed:6,grossNeed:6,grossNeedUsage:6,deficit:0,justification:'كل طالب يحتاج 4 قطع خلال التجربة، والصندوق يحتوي 100 قطعة، لذلك تحول الحساب إلى صندوق.',recommendation:'جاهز للمراجعة وتوليد الاحتياج عند الحاجة.',notes:'اختبار تحويل المستهلكات من قطعة إلى صندوق',createdAt:'2026-04-22T12:20',createdBy:3},
      {id:4,referenceNo:'ER-2026-0004',requestNo:'ER-2026-0004',referenceType:'educational_reference',referenceStatus:'ready',needId:null,generatedNeedId:null,college:'كلية الطب',mainDepartment:'المعامل والمختبرات',section:'الأجهزة التعليمية',referenceCategoryKey:'device',referenceCategory:'الأجهزة التعليمية',categoryLabel:'أجهزة تعليمية',itemNameAr:'مجهر تعليمي',itemNameEn:'Teaching Microscope',unit:'جهاز',usageUnit:'جهاز',calculationUsageUnit:'جهاز',requestUnit:'جهاز',academicYear:'1447',level:'المستوى الثاني',courseName:'الأحياء الدقيقة العملي',courseCode:'MED-214',experimentName:'فحص الشرائح المجهرية',semester:'الثاني',sectionsCount:4,studentsCount:80,maleSections:2,malePerSection:20,femaleSections:2,femalePerSection:20,groupSize:5,groupsCount:16,usesCount:1,repeats:1,consumptionBasis:'per_group',calculationMethod:'لكل مجموعة',qtyPerUse:1,displayQtyPerUse:1,packSize:0,wastePercent:0,stockAvailable:5,specA:'مجهر ثنائي العدسة',specB:'يعمل',specifications:'مجهر ثنائي العدسة | يعمل',estimatedNeed:16,grossNeed:16,grossNeedUsage:16,deficit:11,justification:'كل مجموعة تحتاج جهازًا أثناء تجربة فحص الشرائح.',recommendation:'جاهز للمراجعة وتوليد احتياج أجهزة.',notes:'اختبار فئة الأجهزة التعليمية بدون نسبة هدر',createdAt:'2026-04-22T12:30',createdBy:4}
    ],
    supportRequests:[
      {id:1,requestNo:'SR-2026-0001',itemId:3,itemName:'قفازات نيتريل M',mainDepartment:'المستودعات',section:'المستهلكات التعليمية',fromCollege:'كلية التمريض',toCollege:'كلية الصيدلة',qty:4,unit:'صندوق',supportType:'دعم تشغيلي',notes:'تغطية تدريب مؤقت حتى استكمال الاحتياج الرسمي',attachmentName:'',status:'pending_owner',workflowStage:'بانتظار موافقة الجهة المالكة',createdAt:'2026-04-22T11:00',createdBy:5,sourceLocation:'125 FW 004 - مستودع المستهلكات'}
    ],
    auditLogs:[
      {id:1,action:'إعادة ضبط تشغيلية مبسطة',targetType:'system',targetId:'DEMO-OPS',college:'جامعة طيبة',department:'الكل',details:'تم تقليل بيانات المخزون والحركات والاحتياج مع الحفاظ على الأقسام والمستخدمين والصلاحيات.',createdAt:'2026-04-24T21:45',createdBy:1},
      {id:2,action:'توليد طلب احتياج من المراجع التعليمية',targetType:'need',targetId:'NR-2026-0001',college:'كلية الصيدلة',department:'المعامل والمختبرات',details:'إيثانول 96% - تجميع مرجعين تعليميين تحت صنف واحد',createdAt:'2026-04-22T13:00',createdBy:3},
      {id:3,action:'طلب صرف',targetType:'transaction',targetId:'3',college:'كلية الصيدلة',department:'المستودعات',details:'قفازات نيتريل M - كمية 3 صندوق بانتظار الاعتماد',createdAt:'2026-04-22T09:20',createdBy:3}
    ]
  };
}

function buildOperationallyResetDemoDb(previousDb){
  const fresh=buildExecutiveDemoDb();
  const operations=buildSimplifiedOperationalDemoData();
  return {
    ...fresh,
    ...operations,
    settings:deepClone(previousDb?.settings||fresh.settings),
    users:deepClone(previousDb?.users||fresh.users)
  };
}

function applyDemoDataIfNeeded(force=false){
  if(!window.DEMO_MODE) return false;
  const current=db && db.demoMeta && db.demoMeta.version;
  if(force || current!==DEMO_DATA_VERSION){
    const username=state.currentUser?.username;
    db=buildOperationallyResetDemoDb(db);
    if(typeof refreshSettingCaches==='function') refreshSettingCaches();
    if(username){
      state.currentUser=(db.users||[]).find(u=>u.username===username) || null;
    }
    localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
    return true;
  }
  if(typeof refreshSettingCaches==='function') refreshSettingCaches();
  return false;
}

function resetDemoData(){
  if(!confirm('إعادة ضبط بيانات المخزون والحركات والاحتياج إلى العينة المبسطة مع الحفاظ على الأقسام والمستخدمين والصلاحيات؟')) return;
  applyDemoDataIfNeeded(true);
  state.currentPage='executive';
  state.search='';
  state.collegeFilter='all';
  state.sectionFilter='all';
  state.modal=null;
  render();
}

function demoPercent(done,total){
  return total?Math.round((done/total)*100):0;
}

function demoExecutiveStats(){
  const items=visibleItems(true);
  const needs=db.needsRequests||[];
  const support=db.supportRequests||[];
  const devices=items.filter(i=>i.section==='الأجهزة التعليمية');
  return {
    items:items.length,
    colleges:new Set(items.map(i=>i.college).filter(c=>c && c!=='إدارة التجهيزات')).size,
    low:items.filter(i=>Number(i.qty)<=Number(i.minQty)).length,
    devices:devices.length,
    readyDevices:devices.filter(i=>['يعمل','عهدة'].includes(i.deviceStatus||'يعمل')).length,
    needs:needs.length,
    approvedNeeds:needs.filter(n=>n.status==='approved').length,
    activeNeeds:needs.filter(n=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(n.status||'pending_sector_approval')).length,
    support:support.length,
    activeSupport:support.filter(s=>['pending_owner','owner_approved','pending_equipment'].includes(s.status||'pending_owner')).length
  };
}

function demoAccountCards(){
  const accounts=[
    ['مدير النظام','admin','123','يرى كامل السيناريو ولوحات الإدارة'],
    ['إدارة التجهيزات','equipment','123','يعتمد الاحتياج والدعم النهائي'],
    ['مسؤول كلية الصيدلة','pharmacy','123','ينشئ طلبات ويطلب دعمًا بين القطاعات'],
    ['مشاهد التقارير','reports','123','يعرض التقارير بدون تعديل تشغيلي']
  ];
  return `<div class="demo-login-accounts">${accounts.map(a=>`<div class="demo-account"><strong>${a[0]}</strong><span>${a[3]}</span><code>${a[1]} / ${a[2]}</code></div>`).join('')}</div>`;
}

renderLogin=function(){
  return `<div class="login-screen demo-login"><div class="login-card demo-login-card"><div class="demo-pill">نسخة عرض للمديرين</div><div class="login-title">جامعة طيبة</div><div class="login-subtitle">منصة تنفيذية لإدارة المخزون والاحتياج والدعم بين القطاعات التعليمية</div><div class="input-group"><label class="label">اسم المستخدم</label><input id="login-username" class="input" value="admin" placeholder="أدخل اسم المستخدم"></div><div class="input-group"><label class="label">كلمة المرور</label><input id="login-password" type="password" class="input" value="123" placeholder="أدخل كلمة المرور"></div><button class="btn btn-primary" style="width:100%" onclick="doLogin()">دخول نسخة العرض</button>${demoAccountCards()}</div></div>`;
}

getPageTitle=function(){
  return {executive:'اللوحة التنفيذية',dashboard:'لوحة القطاع',items:'الأصناف والمخزون',transactions:'الصرف والحركات',exchange:'طلب الدعم بين القطاعات',needs:'طلبات الاحتياج',needEvidence:'شواهد الاحتياج',equipment:'التحليل والمتابعة المركزية',reports:'التقارير',audit:'سجل التدقيق والعمليات',users:'المستخدمون والصلاحيات',org:'القطاعات والأقسام والترميز'}[state.currentPage]||'نسخة العرض';
}

renderApp=function(){
  const nav=navItems();
  if(!nav.some(n=>n.id===state.currentPage)) state.currentPage=nav[0]?.id||'executive';
  return `<div class="mobile-overlay ${state.sidebarOpen?'show':''}" onclick="closeSidebar()"></div><div class="app demo-shell"><aside class="sidebar ${state.sidebarOpen?'open':''}"><div class="brand-wrap"><div class="brand-title">جامعة طيبة</div><div class="brand-subtitle">Demo Edition - عرض تنفيذي</div></div><div class="nav">${nav.map(n=>`<div class="nav-item ${state.currentPage===n.id?'active':''}" onclick="setPage('${n.id}')"><div>${n.icon}</div><div>${n.label}</div></div>`).join('')}</div><div class="user-panel"><div class="user-card"><div class="user-name">${state.currentUser.fullName}</div><div class="user-role">${state.currentUser.role==='admin'?'مدير النظام':state.currentUser.jobTitle}</div><div class="user-meta">الجهة: ${state.currentUser.college}<br>القسم: ${state.currentUser.department}</div><button class="btn logout-btn" onclick="logout()">تسجيل الخروج</button></div></div></aside><main class="main"><div class="topbar demo-topbar"><div><div class="page-title">${getPageTitle()}</div><div class="page-subtitle">نسخة عرض مستقرة ببيانات تجريبية للشرح أمام المديرين.</div></div><div class="mobile-top-actions"><button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button></div><div class="demo-top-actions"><div class="tag demo-tag">${window.DEMO_LABEL||'نسخة عرض'}</div><div class="tag">${state.currentUser.college}</div><button class="btn btn-secondary btn-sm" onclick="resetDemoData()">إعادة ضبط العرض</button></div></div><div class="content">${renderPageContent()}<div class="footer-note">${typeof syncStatusText==='function'?syncStatusText():'نسخة عرض محلية.'}</div></div></main>${modalHtml()}</div>`;
}

function demoKpisHtml(){
  const s=demoExecutiveStats();
  return `<div class="demo-kpi-grid"><div class="demo-kpi"><span>القطاعات المشمولة</span><strong>${s.colleges}</strong><em>كليات تعليمية في سيناريو العرض</em></div><div class="demo-kpi"><span>الأصناف المسجلة</span><strong>${s.items}</strong><em>مواد وأجهزة ومستهلكات</em></div><div class="demo-kpi warn"><span>تحت الحد الأدنى</span><strong>${s.low}</strong><em>تحتاج معالجة أو احتياج</em></div><div class="demo-kpi"><span>طلبات نشطة</span><strong>${s.activeNeeds+s.activeSupport}</strong><em>احتياج ودعم قيد الاعتماد</em></div></div>`;
}

renderExecutive=function(){
  const s=demoExecutiveStats();
  const readiness=demoPercent(s.readyDevices,s.devices);
  const needApproval=demoPercent(s.approvedNeeds,s.needs);
  const lowRows=lowStock().slice(0,8).map(i=>[i.college,i.mainDepartment||'القسم العام',i.section,itemName(i),i.qty,i.minQty,itemActionButtons(i)]);
  const needRows=filteredNeeds().filter(r=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(r.status||'pending_sector_approval')).slice(0,6).map(r=>[r.requestNo,r.college,r.mainDepartment||'القسم العام',r.itemNameAr||r.itemNameEn,r.qty,statusBadge(r.status),needEvidenceBadge(r.id)]);
  const supportRows=filteredSupport().filter(r=>['pending_owner','owner_approved','pending_equipment'].includes(r.status||'pending_owner')).slice(0,6).map(r=>[r.requestNo,r.supportType||'دعم تشغيلي',r.fromCollege,r.toCollege,r.itemName,r.qty,statusBadge(r.status)]);
  return `<div class="demo-hero"><div class="demo-hero-copy"><div class="demo-pill">نسخة عرض للمديرين</div><h1>منصة موحدة لرؤية المخزون وقرارات الاحتياج</h1><p>يعرض هذا السيناريو كيف تربط إدارة التجهيزات بين مخزون الكليات، طلبات الصرف، شواهد الاحتياج، والدعم بين القطاعات في لوحة واحدة قابلة للتقرير.</p><div class="demo-hero-actions"><button class="btn btn-primary" onclick="setPage('reports')">فتح التقارير</button><button class="btn btn-secondary" onclick="setPage('needs')">متابعة الاحتياج</button><button class="btn btn-secondary" onclick="setPage('exchange')">الدعم بين القطاعات</button></div></div><div class="demo-hero-panel"><div class="demo-panel-title">قراءة تنفيذية سريعة</div><div class="demo-progress"><span>جاهزية الأجهزة التعليمية</span><strong>${readiness}%</strong><div><i style="width:${readiness}%"></i></div></div><div class="demo-progress"><span>نسبة الاحتياج المعتمد</span><strong>${needApproval}%</strong><div><i style="width:${needApproval}%"></i></div></div><div class="demo-note">الأولوية الحالية: معالجة ${s.low} أصناف تحت الحد، واستكمال ${s.activeNeeds} طلبات احتياج قيد الإجراء.</div></div></div>${demoKpisHtml()}${alertsHtml()}<div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات احتياج تحتاج قرارًا</div><div class="panel-subtitle">تظهر الحالة والشواهد المرتبطة بكل طلب.</div></div>${table(['رقم الطلب','القطاع','القسم الرئيسي','البند','الإجمالي','الحالة','الشواهد'],needRows)}</div><div class="table-panel"><div class="table-head"><div class="panel-title">طلبات دعم بين القطاعات</div><div class="panel-subtitle">طلبات تشغيلية توضح الاستفادة من المخزون المتاح.</div></div>${table(['رقم الطلب','النوع','الطالبة','المالكة','الصنف','الكمية','الحالة'],supportRows)}</div></div><div class="table-panel"><div class="table-head"><div class="panel-title">أصناف تحت الحد الأدنى</div><div class="panel-subtitle">قائمة مختصرة قابلة للتحويل إلى احتياج أو دعم.</div></div>${table(['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الحد الأدنى','إجراء'],lowRows)}</div>`;
}

renderDashboard=function(){
  const deviceRows=visibleItems(true).filter(i=>i.section==='الأجهزة التعليمية').map(i=>[i.college,i.mainDepartment||'القسم العام',itemName(i),i.serialNumber||'—',i.deviceStatus||'يعمل',i.location||'—',i.qty,itemActionButtons(i)]);
  return `<div class="hero"><div class="hero-title">لوحة متابعة ${isCentral()?'جامعة طيبة':state.currentUser.college}</div><div class="hero-text">مؤشرات تشغيلية مختصرة لاستخدامها أثناء العرض: جاهزية الأجهزة، الأصناف المنخفضة، والطلبات النشطة.</div></div>${demoKpisHtml()}${alertsHtml()}<div class="table-panel"><div class="table-head"><div class="panel-title">حالة الأجهزة التعليمية</div><div class="panel-subtitle">توضح الجاهزية والمواقع والرقم التسلسلي لكل جهاز.</div></div>${table(['القطاع','القسم الرئيسي','الجهاز','الرقم التسلسلي','الحالة','الموقع','الكمية','إجراء'],deviceRows)}</div>`;
}

const __demoOriginalReportData=reportData;
reportData=function(){
  if(state.reportTab==='senior'){
    const s=demoExecutiveStats();
    return {title:'تقرير الإدارة العليا - نسخة العرض',headers:['المؤشر','القيمة','قراءة تنفيذية'],rows:[
      ['القطاعات المشمولة',s.colleges,'نطاق العرض التجريبي للكليات التعليمية'],
      ['الأصناف المسجلة',s.items,'حجم قاعدة بيانات العرض'],
      ['الأصناف تحت الحد الأدنى',s.low,'أولوية للمعالجة أو رفع الاحتياج'],
      ['جاهزية الأجهزة التعليمية',demoPercent(s.readyDevices,s.devices)+'%','نسبة الأجهزة العاملة أو المسجلة كعهدة'],
      ['طلبات الاحتياج قيد الإجراء',s.activeNeeds,'تحتاج متابعة اعتماد أو استكمال ملاحظات'],
      ['طلبات الدعم النشطة',s.activeSupport,'توضح أثر مشاركة المخزون بين القطاعات']
    ]};
  }
  return __demoOriginalReportData();
}

applyDemoDataIfNeeded(false);
/* ===== end Executive Demo Edition ===== */

/* ===== Analysis Assistant ===== */
function ensureAnalysisState(){
  if(typeof state.analysisRange==='undefined') state.analysisRange='month';
}

function setAnalysisRange(value){
  ensureAnalysisState();
  state.analysisRange=value||'month';
  render();
}

function analysisRangeLabel(){
  ensureAnalysisState();
  return {month:'هذا الشهر',semester:'هذا الفصل',year:'هذه السنة',all:'كل البيانات'}[state.analysisRange]||'هذا الشهر';
}

function analysisDateBounds(){
  ensureAnalysisState();
  if(state.analysisRange==='all') return null;
  const now=new Date();
  let start,end;
  if(state.analysisRange==='month'){
    start=new Date(now.getFullYear(),now.getMonth(),1);
    end=new Date(now.getFullYear(),now.getMonth()+1,0);
  }else if(state.analysisRange==='semester'){
    const firstHalf=now.getMonth()<6;
    start=new Date(now.getFullYear(),firstHalf?0:6,1);
    end=new Date(now.getFullYear(),firstHalf?6:12,0);
  }else{
    start=new Date(now.getFullYear(),0,1);
    end=new Date(now.getFullYear(),11,31);
  }
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  return {start,end};
}

function analysisRecordDate(record,keys=[]){
  for(const key of keys){
    const d=parseAnyDateValue(record?.[key]);
    if(d) return d;
  }
  return parseAnyDateValue(record?.createdAt||record?.transactionAt||record?.reviewedAt||'');
}

function withinAnalysisRange(record,keys=[]){
  const bounds=analysisDateBounds();
  if(!bounds) return true;
  const d=analysisRecordDate(record,keys);
  if(!d) return false;
  return d.getTime()>=bounds.start.getTime() && d.getTime()<=bounds.end.getTime();
}

function analysisItemLabel(itemId, fallback=''){
  const item=getItemById(Number(itemId));
  return itemName(item)||fallback||'غير محدد';
}

function analysisUnit(itemId, fallback=''){
  const item=getItemById(Number(itemId));
  return item?.unit||fallback||'';
}

function addAnalysisBucket(map,key,label,unit,qty=0,source=''){
  if(!map[key]) map[key]={label,unit,qty:0,count:0,sources:{},lastSource:''};
  map[key].qty+=Number(qty)||0;
  map[key].count+=1;
  if(source) map[key].sources[source]=(map[key].sources[source]||0)+1;
  map[key].lastSource=source||map[key].lastSource;
  return map[key];
}

function topAnalysisRows(map,sorter,limit=5){
  return Object.values(map).sort(sorter).slice(0,limit);
}

function mostSpentItems(limit=5){
  ensureAnalysisState();
  const map={};
  (db.transactions||[])
    .filter(t=>t.type==='issue' && ['approved','completed'].includes(t.status||'pending'))
    .filter(t=>withinAnalysisRange(t,['transactionAt','approvedAt','createdAt']))
    .forEach(t=>{
      const label=analysisItemLabel(t.itemId,t.itemName);
      const unit=analysisUnit(t.itemId,t.unit);
      addAnalysisBucket(map,`${label}|${unit}`,label,unit,t.qty,'صرف معتمد');
    });
  (db.supportRequests||[])
    .filter(r=>r.status==='approved')
    .filter(r=>withinAnalysisRange(r,['reviewedAt','createdAt']))
    .forEach(r=>addAnalysisBucket(map,`${r.itemName}|${r.unit}`,r.itemName,r.unit,r.qty,'دعم معتمد'));
  return topAnalysisRows(map,(a,b)=>(b.qty-a.qty)||(b.count-a.count),limit);
}

function mostNeededByUsage(limit=5){
  ensureAnalysisState();
  const map={};
  (db.needEvidence||[]).filter(e=>withinAnalysisRange(e,['createdAt','updatedAt'])).forEach(e=>{
    const label=e.itemNameAr||e.itemNameEn||'غير محدد';
    const unit=e.unit||'';
    const key=`${label}|${unit}`;
    const bucket=addAnalysisBucket(map,key,label,unit,e.estimatedNeed||0,'شاهد احتياج');
    bucket.students=(bucket.students||0)+(Number(e.studentsCount)||0);
    bucket.uses=(bucket.uses||0)+(Number(e.usesCount)||0);
    bucket.deficit=(bucket.deficit||0)+(Number(e.deficit)||0);
    bucket.courses=bucket.courses||new Set();
    if(e.courseName) bucket.courses.add(e.courseName);
  });
  return topAnalysisRows(map,(a,b)=>(b.qty-a.qty)||(b.deficit-a.deficit),limit).map(r=>({...r,coursesCount:r.courses?r.courses.size:0}));
}

function mostRequestedItems(limit=5){
  ensureAnalysisState();
  const map={};
  (db.needsRequests||[]).filter(r=>withinAnalysisRange(r,['createdAt','reviewedAt','sectorApprovedAt'])).forEach(r=>{
    const label=r.itemNameAr||r.itemNameEn||'غير محدد';
    addAnalysisBucket(map,`${label}|${r.unit||''}`,label,r.unit||'',r.qty,'احتياج');
  });
  (db.supportRequests||[]).filter(r=>withinAnalysisRange(r,['createdAt','reviewedAt','ownerReviewedAt'])).forEach(r=>{
    addAnalysisBucket(map,`${r.itemName}|${r.unit||''}`,r.itemName,r.unit||'',r.qty,'دعم');
  });
  (db.transactions||[]).filter(t=>t.type==='issue').filter(t=>withinAnalysisRange(t,['transactionAt','createdAt'])).forEach(t=>{
    const label=analysisItemLabel(t.itemId,t.itemName);
    const unit=analysisUnit(t.itemId,t.unit);
    addAnalysisBucket(map,`${label}|${unit}`,label,unit,t.qty,'صرف');
  });
  return topAnalysisRows(map,(a,b)=>(b.count-a.count)||(b.qty-a.qty),limit);
}

function analysisSourcesText(row){
  return Object.entries(row.sources||{}).map(([k,v])=>`${k}: ${v}`).join(' | ')||'—';
}

function analysisMiniTable(headers,rows){
  return `<div class="analysis-mini-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">لا توجد بيانات كافية</td></tr>`}</tbody></table></div>`;
}

function analysisInsightText(kind,rows){
  if(!rows.length) return 'لا توجد بيانات كافية لإظهار قراءة موثوقة.';
  const top=rows[0];
  if(kind==='spent') return `الأعلى صرفًا هو ${top.label} بإجمالي ${top.qty} ${top.unit||''}.`;
  if(kind==='usage') return `الأعلى احتياجًا حسب الاستخدام هو ${top.label} باحتياج تقديري ${top.qty} ${top.unit||''} وعجز ${top.deficit||0}.`;
  return `الأكثر طلبًا هو ${top.label} بعدد ${top.count} طلبات/حركات.`;
}

function analysisChart(rows,valueGetter,formatter){
  const max=Math.max(...rows.map(valueGetter),0);
  if(!rows.length) return '<div class="analysis-chart-empty">لا توجد بيانات للرسم في هذا النطاق.</div>';
  return `<div class="analysis-chart">${rows.slice(0,5).map((r,idx)=>{const value=valueGetter(r); const pct=max?Math.max(6,Math.round((value/max)*100)):0; return `<div class="analysis-bar-row"><div class="analysis-bar-label"><span>${idx+1}. ${r.label}</span><strong>${formatter(r)}</strong></div><div class="analysis-bar-track"><i style="width:${pct}%"></i></div></div>`}).join('')}</div>`;
}

function matchingInventoryItem(label){
  return (db.items||[]).find(i=>itemName(i)===label || i.nameAr===label || i.nameEn===label);
}

function analysisRecommendation(kind,row){
  if(!row) return 'التوصية: لا توجد بيانات كافية، ابدأ بإدخال حركات أو شواهد احتياج إضافية.';
  const item=matchingInventoryItem(row.label);
  if(kind==='usage'){
    if(Number(row.deficit||0)>0) return `التوصية: ارفع احتياجًا لـ ${row.label} لأن العجز التقديري ${row.deficit} ${row.unit||''}.`;
    return `التوصية: راقب استخدام ${row.label} ولا ترفع احتياجًا جديدًا قبل تحديث الشواهد.`;
  }
  if(kind==='spent'){
    if(item && Number(item.qty)<=Number(item.minQty)) return `التوصية: ارفع احتياجًا أو اطلب دعمًا لـ ${row.label} لأن الصرف مرتفع والرصيد تحت الحد.`;
    return `التوصية: راقب معدل صرف ${row.label} وحدد حدًا أدنى أعلى إذا استمر الاستهلاك.`;
  }
  if(item && Number(item.qty)>Number(item.minQty)*1.5) return `التوصية: أعد توزيع مخزون ${row.label} على القطاعات الأكثر طلبًا قبل شراء كميات جديدة.`;
  return `التوصية: اطلب دعمًا أو ارفع احتياجًا لـ ${row.label} حسب توفره في القطاعات الأخرى.`;
}

function analysisRangeControls(){
  ensureAnalysisState();
  const opts=[['month','هذا الشهر'],['semester','هذا الفصل'],['year','هذه السنة'],['all','كل البيانات']];
  return `<div class="analysis-range">${opts.map(([value,label])=>`<button type="button" class="${state.analysisRange===value?'active':''}" onclick="setAnalysisRange('${value}')">${label}</button>`).join('')}</div>`;
}

function analysisAssistantHtml(){
  ensureAnalysisState();
  const spent=mostSpentItems(5);
  const usage=mostNeededByUsage(5);
  const requested=mostRequestedItems(5);
  const spentRows=spent.map((r,idx)=>[idx+1,r.label,`${r.qty} ${r.unit||''}`,analysisSourcesText(r)]);
  const usageRows=usage.map((r,idx)=>[idx+1,r.label,`${r.qty} ${r.unit||''}`,r.deficit||0,r.students||0]);
  const requestedRows=requested.map((r,idx)=>[idx+1,r.label,r.count,`${r.qty} ${r.unit||''}`,analysisSourcesText(r)]);
  return `<div class="analysis-assistant" id="analysis-assistant"><div class="analysis-head"><div><div class="demo-pill">مساعد تحليل</div><div class="analysis-title">قراءات تلقائية للقرارات التشغيلية</div><div class="analysis-subtitle">النطاق الحالي: ${analysisRangeLabel()}، والنتائج مبنية على الصرف، شواهد الاحتياج، وطلبات الدعم والاحتياج.</div></div><div class="analysis-head-actions">${analysisRangeControls()}<button class="btn btn-secondary btn-sm" onclick="setPage('reports')">فتح التقارير</button></div></div><div class="analysis-grid"><div class="analysis-card"><div class="analysis-card-title">1. الأكثر صرفًا</div><p>${analysisInsightText('spent',spent)}</p>${analysisChart(spent,r=>r.qty,r=>`${r.qty} ${r.unit||''}`)}<div class="analysis-recommendation">${analysisRecommendation('spent',spent[0])}</div>${analysisMiniTable(['#','الصنف','الإجمالي','المصدر'],spentRows)}</div><div class="analysis-card"><div class="analysis-card-title">2. الأعلى احتياجًا حسب الاستخدام</div><p>${analysisInsightText('usage',usage)}</p>${analysisChart(usage,r=>r.qty,r=>`${r.qty} ${r.unit||''}`)}<div class="analysis-recommendation">${analysisRecommendation('usage',usage[0])}</div>${analysisMiniTable(['#','الصنف','الاحتياج','العجز','الطلاب'],usageRows)}</div><div class="analysis-card"><div class="analysis-card-title">3. الأكثر طلبًا</div><p>${analysisInsightText('requested',requested)}</p>${analysisChart(requested,r=>r.count,r=>`${r.count} طلب`)}<div class="analysis-recommendation">${analysisRecommendation('requested',requested[0])}</div>${analysisMiniTable(['#','الصنف','عدد الطلبات','الإجمالي','المصادر'],requestedRows)}</div></div></div>`;
}

const __analysisRenderExecutive=renderExecutive;
renderExecutive=function(){
  const html=__analysisRenderExecutive();
  const marker='<div class="alert-grid"';
  const idx=html.indexOf(marker);
  if(idx<0) return html+analysisAssistantHtml();
  return html.slice(0,idx)+analysisAssistantHtml()+html.slice(idx);
}

const __analysisRenderEquipment=renderEquipment;
renderEquipment=function(){
  return analysisAssistantHtml()+__analysisRenderEquipment();
}

const __analysisReportData=reportData;
reportData=function(){
  if(state.reportTab==='senior'){
    const base=__analysisReportData();
    const spent=mostSpentItems(3).map(r=>[`الأكثر صرفًا: ${r.label}`,`${r.qty} ${r.unit||''}`,analysisSourcesText(r)]);
    const usage=mostNeededByUsage(3).map(r=>[`الأعلى احتياجًا حسب الاستخدام: ${r.label}`,`${r.qty} ${r.unit||''}`,`العجز: ${r.deficit||0}`]);
    const requested=mostRequestedItems(3).map(r=>[`الأكثر طلبًا: ${r.label}`,`${r.count} طلب`,analysisSourcesText(r)]);
    return {...base,rows:[...(base.rows||[]),[`مساعد التحليل - ${analysisRangeLabel()}`,'',''],...spent,...usage,...requested]};
  }
  return __analysisReportData();
}
/* ===== end Analysis Assistant ===== */

/* ===== Smart Analyst Page ===== */
const SMART_ANALYST_API_ENDPOINT=window.SMART_ANALYST_API_ENDPOINT||'';

function smartAnalystEndpoint(){
  return window.SMART_ANALYST_API_ENDPOINT||SMART_ANALYST_API_ENDPOINT||'';
}

function ensureSmartAnalystState(){
  ensureAnalysisState();
  if(typeof state.smartAnalystMode==='undefined') state.smartAnalystMode='executive';
  if(typeof state.smartAnalystQuestion==='undefined') state.smartAnalystQuestion='';
}

function smartEscape(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function smartNormalize(value){
  return String(value||'').trim().toLowerCase()
    .replace(/[إأآا]/g,'ا')
    .replace(/[ىي]/g,'ي')
    .replace(/ة/g,'ه');
}

function smartAnalystPresets(){
  return [
    {id:'executive',label:'قراءة تنفيذية',question:'ما أهم القرارات الآن؟'},
    {id:'need',label:'رفع الاحتياج',question:'ما الأصناف التي أرفع لها احتياج؟'},
    {id:'support',label:'الدعم والتوزيع',question:'أين أطلب دعمًا أو أعيد توزيع المخزون؟'},
    {id:'risk',label:'المخاطر التشغيلية',question:'ما المخاطر التي تحتاج متابعة؟'},
    {id:'report',label:'ملخص للمدير',question:'اكتب ملخصًا تنفيذيًا قصيرًا.'}
  ];
}

function detectSmartAnalystMode(question){
  const q=smartNormalize(question);
  if(!q) return state.smartAnalystMode||'executive';
  if(q.includes('احتياج')||q.includes('عجز')||q.includes('نقص')||q.includes('need')||q.includes('deficit')||q.includes('shortage')) return 'need';
  if(q.includes('دعم')||q.includes('توزيع')||q.includes('مخزون')||q.includes('support')||q.includes('redistribute')||q.includes('stock')) return 'support';
  if(q.includes('خطر')||q.includes('مخاطر')||q.includes('تعطل')||q.includes('متوقف')||q.includes('risk')||q.includes('down')||q.includes('stopped')) return 'risk';
  if(q.includes('تقرير')||q.includes('ملخص')||q.includes('مدير')||q.includes('report')||q.includes('summary')||q.includes('manager')) return 'report';
  if(q.includes('صرف')||q.includes('مصروف')||q.includes('استهلاك')||q.includes('spent')||q.includes('expense')||q.includes('consumption')) return 'spent';
  if(q.includes('طلب')||q.includes('الاكثر')||q.includes('requested')||q.includes('demand')) return 'requested';
  return 'executive';
}

function setSmartAnalystMode(mode){
  ensureSmartAnalystState();
  state.smartAnalystMode=mode||'executive';
  const preset=smartAnalystPresets().find(p=>p.id===state.smartAnalystMode);
  if(preset) state.smartAnalystQuestion=preset.question;
  render();
}

function askSmartAnalyst(){
  ensureSmartAnalystState();
  const el=document.getElementById('smart-question');
  state.smartAnalystQuestion=(el?.value||'').trim();
  state.smartAnalystMode=detectSmartAnalystMode(state.smartAnalystQuestion);
  render();
}

function smartIsActiveStatus(status){
  return !['approved','rejected','completed','closed'].includes(status||'pending');
}

function smartScopedNeeds(){
  return filteredNeeds()
    .filter(r=>smartIsActiveStatus(r.status))
    .filter(r=>withinAnalysisRange(r,['createdAt','reviewedAt','sectorApprovedAt','updatedAt']));
}

function smartScopedSupport(){
  return filteredSupport()
    .filter(r=>smartIsActiveStatus(r.status))
    .filter(r=>withinAnalysisRange(r,['createdAt','reviewedAt','ownerReviewedAt','updatedAt']));
}

function smartCurrentStats(){
  const s=typeof demoExecutiveStats==='function'?demoExecutiveStats():metrics();
  return {
    colleges:s.colleges||COLLEGE_OPTIONS.length,
    items:s.items||visibleItems(true).length,
    low:s.low||lowStock().length,
    activeNeeds:s.activeNeeds??smartScopedNeeds().length,
    activeSupport:s.activeSupport??smartScopedSupport().length,
    devices:s.devices||0,
    readyDevices:s.readyDevices||0
  };
}

function smartSurplusItemFor(label){
  const wanted=smartNormalize(label);
  return (db.items||[])
    .filter(i=>smartNormalize(itemName(i))===wanted || smartNormalize(i.nameEn)===wanted)
    .filter(i=>Number(i.qty)>Math.max(Number(i.minQty||0)*1.5,Number(i.minQty||0)+1))
    .sort((a,b)=>(Number(b.qty)-Number(b.minQty||0))-(Number(a.qty)-Number(a.minQty||0)))[0];
}

function smartCollegePressure(limit=5){
  const map={};
  const add=(college,score,label)=>{
    if(!college) return;
    if(!map[college]) map[college]={college,score:0,signals:[]};
    map[college].score+=Number(score)||0;
    if(label) map[college].signals.push(label);
  };
  lowStock().forEach(i=>add(i.college,3,`رصيد منخفض: ${itemName(i)}`));
  smartScopedNeeds().forEach(n=>add(n.college,2,`احتياج نشط: ${n.itemNameAr||n.itemNameEn}`));
  smartScopedSupport().forEach(r=>add(r.fromCollege,2,`طلب دعم: ${r.itemName}`));
  return Object.values(map).sort((a,b)=>b.score-a.score).slice(0,limit);
}

function smartDecisionRows(){
  const spent=mostSpentItems(5);
  const usage=mostNeededByUsage(5);
  const requested=mostRequestedItems(5);
  const rows=[];
  if(usage[0]){
    rows.push({
      priority:'عالية',
      subject:usage[0].label,
      reason:`عجز تقديري ${usage[0].deficit||0} ${usage[0].unit||''} واحتياج محسوب ${usage[0].qty} ${usage[0].unit||''}.`,
      action:Number(usage[0].deficit||0)>0?'ارفع احتياج':'حدّث شواهد الاستخدام قبل الشراء'
    });
  }
  if(spent[0]){
    const item=matchingInventoryItem(spent[0].label);
    rows.push({
      priority:item&&Number(item.qty)<=Number(item.minQty)?'عالية':'متوسطة',
      subject:spent[0].label,
      reason:`صرف معتمد بإجمالي ${spent[0].qty} ${spent[0].unit||''} في نطاق ${analysisRangeLabel()}.`,
      action:item&&Number(item.qty)<=Number(item.minQty)?'اطلب دعمًا أو ارفع احتياجًا':'راقب معدل الصرف'
    });
  }
  if(requested[0]){
    const surplus=smartSurplusItemFor(requested[0].label);
    rows.push({
      priority:surplus?'متوسطة':'عالية',
      subject:requested[0].label,
      reason:`تكرر في ${requested[0].count} طلبات أو حركات.`,
      action:surplus?`أعد توزيع الفائض من ${surplus.college}`:'اطلب دعمًا مركزيًا أو ارفع احتياجًا'
    });
  }
  return rows;
}

function smartMainActions(mode,spent,usage,requested,pressure){
  const actions=[];
  if(usage[0]){
    actions.push(Number(usage[0].deficit||0)>0
      ? `ارفع احتياجًا لـ ${usage[0].label} لأن العجز التقديري ${usage[0].deficit} ${usage[0].unit||''}.`
      : `راجع شواهد ${usage[0].label} قبل إنشاء احتياج جديد.`);
  }
  if(spent[0]) actions.push(analysisRecommendation('spent',spent[0]).replace(/^التوصية:\s*/,''));
  if(requested[0]) actions.push(analysisRecommendation('requested',requested[0]).replace(/^التوصية:\s*/,''));
  if(pressure[0]) actions.push(`ابدأ بالقطاع الأعلى ضغطًا: ${pressure[0].college} بسبب ${pressure[0].signals.slice(0,2).join('، ')}.`);
  if(mode==='support' && requested[0]){
    const surplus=smartSurplusItemFor(requested[0].label);
    if(surplus) actions.unshift(`أعد توزيع ${requested[0].label} من ${surplus.college} قبل فتح شراء جديد.`);
  }
  if(!actions.length) actions.push('أدخل حركات صرف أو شواهد احتياج إضافية حتى يعطي المحلل توصية أوثق.');
  return [...new Set(actions)].slice(0,5);
}

function smartAnalystAnswer(mode){
  ensureSmartAnalystState();
  const spent=mostSpentItems(5);
  const usage=mostNeededByUsage(5);
  const requested=mostRequestedItems(5);
  const pressure=smartCollegePressure(5);
  const stats=smartCurrentStats();
  const topSpent=spent[0], topUsage=usage[0], topRequested=requested[0], topPressure=pressure[0];
  const reasons=[
    topSpent?`الأكثر صرفًا: ${topSpent.label} بإجمالي ${topSpent.qty} ${topSpent.unit||''}.`:'لا توجد حركات صرف كافية في النطاق الحالي.',
    topUsage?`الأعلى احتياجًا حسب الاستخدام: ${topUsage.label} باحتياج تقديري ${topUsage.qty} ${topUsage.unit||''}.`:'لا توجد شواهد احتياج كافية في النطاق الحالي.',
    topRequested?`الأكثر طلبًا: ${topRequested.label} بعدد ${topRequested.count} طلبات/حركات.`:'لا توجد طلبات كافية في النطاق الحالي.',
    topPressure?`أعلى قطاع يحتاج متابعة: ${topPressure.college}.`:'لا توجد مؤشرات ضغط واضحة على قطاع محدد.'
  ];
  let title='قراءة تنفيذية ذكية';
  let summary=`في نطاق ${analysisRangeLabel()} تظهر ${stats.low} أصناف تحت الحد الأدنى، و${stats.activeNeeds} احتياجات نشطة، و${stats.activeSupport} طلبات دعم نشطة. القرار المقترح يبدأ بالأصناف التي تجمع بين الصرف العالي والعجز أو كثرة الطلب.`;
  if(mode==='need'){
    title='أولوية رفع الاحتياج';
    summary=topUsage
      ? `الأولوية الآن هي ${topUsage.label} لأن الاحتياج المحسوب من الشواهد ${topUsage.qty} ${topUsage.unit||''} والعجز ${topUsage.deficit||0}.`
      : 'لا يظهر احتياج موثوق في هذا النطاق، لذلك الأفضل استكمال الشواهد قبل رفع طلب جديد.';
  }else if(mode==='support'){
    title='الدعم وإعادة توزيع المخزون';
    const surplus=topRequested?smartSurplusItemFor(topRequested.label):null;
    summary=surplus
      ? `يوجد مسار إعادة توزيع محتمل لـ ${topRequested.label} من ${surplus.college} لأن لديه رصيدًا أعلى من الحد الأدنى.`
      : `لا يظهر فائض واضح للصنف الأعلى طلبًا، لذلك المسار الأقرب هو طلب دعم أو رفع احتياج بعد مراجعة الرصيد.`;
  }else if(mode==='risk'){
    title='المخاطر التشغيلية';
    summary=`أبرز المخاطر: انخفاض ${stats.low} أصناف، وتراكم ${stats.activeNeeds+stats.activeSupport} طلبات نشطة. أي صنف يجمع بين عجز استخدام وصرف مرتفع يجب التعامل معه قبل بداية فترة تشغيل جديدة.`;
  }else if(mode==='report'){
    title='ملخص تنفيذي للمدير';
    summary=`يعرض النظام قراءة موحدة لـ ${stats.colleges} قطاعات و${stats.items} أصناف. في ${analysisRangeLabel()} تظهر أولويات القرار حول ${topUsage?.label||topSpent?.label||topRequested?.label||'الأصناف النشطة'} مع توصية بمعالجة العجز أولًا ثم الاستفادة من الدعم بين القطاعات.`;
  }else if(mode==='spent'){
    title='تحليل المصروفات';
    summary=topSpent
      ? `الصنف الأعلى صرفًا هو ${topSpent.label} بإجمالي ${topSpent.qty} ${topSpent.unit||''}. اربطه مباشرة بالرصيد الحالي قبل اعتماد كميات إضافية.`
      : 'لا توجد مصروفات كافية في هذا النطاق.';
  }else if(mode==='requested'){
    title='تحليل الأكثر طلبًا';
    summary=topRequested
      ? `${topRequested.label} هو الأعلى طلبًا بعدد ${topRequested.count} طلبات/حركات، وهذا يجعله مرشحًا للمراجعة أو الدعم.`
      : 'لا توجد طلبات كافية في هذا النطاق.';
  }
  return {
    title,
    summary,
    reasons,
    actions:smartMainActions(mode,spent,usage,requested,pressure),
    decisions:smartDecisionRows(),
    confidence:(spent.length+usage.length+requested.length)>=6?'مرتفعة':'متوسطة',
    spent,usage,requested,pressure
  };
}

function smartAnalystApiPayload(){
  const answer=smartAnalystAnswer(state.smartAnalystMode||'executive');
  return {
    version:'local-rules-v1',
    range:state.analysisRange,
    rangeLabel:analysisRangeLabel(),
    question:state.smartAnalystQuestion||smartAnalystPresets().find(p=>p.id===state.smartAnalystMode)?.question||'',
    metrics:smartCurrentStats(),
    signals:{
      mostSpent:answer.spent.slice(0,5).map(r=>({item:r.label,qty:r.qty,unit:r.unit,sources:r.sources})),
      mostNeededByUsage:answer.usage.slice(0,5).map(r=>({item:r.label,estimatedNeed:r.qty,deficit:r.deficit,unit:r.unit,students:r.students||0})),
      mostRequested:answer.requested.slice(0,5).map(r=>({item:r.label,count:r.count,qty:r.qty,unit:r.unit,sources:r.sources})),
      pressure:answer.pressure.slice(0,5).map(r=>({college:r.college,score:r.score,signals:r.signals.slice(0,3)}))
    },
    requestedOutput:'executive_recommendation'
  };
}

async function requestSmartAnalystApi(payload){
  const endpoint=smartAnalystEndpoint();
  if(!endpoint) throw new Error('لم يتم ضبط SMART_ANALYST_API_ENDPOINT بعد.');
  const res=await fetch(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('فشل طلب المحلل الذكي من الخادم.');
  return res.json();
}

function smartBullets(items,emptyText){
  if(!items.length) return `<div class="smart-empty">${emptyText}</div>`;
  return `<ul class="smart-list">${items.map(x=>`<li>${smartEscape(x)}</li>`).join('')}</ul>`;
}

function smartDecisionTable(rows){
  return analysisMiniTable(['الأولوية','الموضوع','سبب القراءة','الإجراء المقترح'],rows.map(r=>[r.priority,r.subject,r.reason,r.action]));
}

function renderSmartAnalyst(){
  ensureSmartAnalystState();
  const presets=smartAnalystPresets();
  const answer=smartAnalystAnswer(state.smartAnalystMode||'executive');
  const payload=smartAnalystApiPayload();
  const payloadPreview=JSON.stringify({
    range:payload.rangeLabel,
    question:payload.question,
    metrics:payload.metrics,
    topSignals:{
      mostNeeded:payload.signals.mostNeededByUsage[0]||null,
      mostSpent:payload.signals.mostSpent[0]||null,
      mostRequested:payload.signals.mostRequested[0]||null
    }
  },null,2);
  return `<div class="smart-analyst-page">
    <div class="smart-hero">
      <div>
        <div class="demo-pill">المحلل الذكي</div>
        <h1>محلل قرارات يعمل الآن بقواعد محلية</h1>
        <p>يقرأ الصرف، شواهد الاحتياج، الطلبات، والمخزون المنخفض ليعطي توصية تنفيذية. تم تجهيزه لاحقًا للربط مع API ذكاء اصطناعي عبر خادم آمن دون وضع مفاتيح داخل المتصفح.</p>
      </div>
      <div class="smart-status">
        <span>وضع التشغيل الحالي</span>
        <strong>قواعد ذكية محلية</strong>
        <em>جاهز للربط لاحقًا عبر backend</em>
      </div>
    </div>
    <div class="smart-controls">
      <div>
        <div class="smart-section-title">اسأل المحلل</div>
        <div class="smart-preset-grid">${presets.map(p=>`<button type="button" class="smart-preset ${state.smartAnalystMode===p.id?'active':''}" onclick="setSmartAnalystMode('${p.id}')"><strong>${p.label}</strong><span>${p.question}</span></button>`).join('')}</div>
      </div>
      <div class="smart-question-panel">
        <label class="label" for="smart-question">سؤال حر</label>
        <textarea id="smart-question" class="textarea smart-question" placeholder="مثال: ما الأصناف التي تحتاج رفع احتياج هذا الشهر؟">${smartEscape(state.smartAnalystQuestion)}</textarea>
        <div class="smart-question-actions">
          ${analysisRangeControls()}
          <button class="btn btn-primary" onclick="askSmartAnalyst()">تحليل السؤال</button>
        </div>
      </div>
    </div>
    <div class="smart-answer-grid">
      <div class="smart-answer-main">
        <div class="smart-answer-head">
          <div>
            <div class="smart-section-title">${smartEscape(answer.title)}</div>
            <div class="smart-confidence">الثقة: ${answer.confidence} | النطاق: ${analysisRangeLabel()}</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="setPage('executive')">العودة للوحة التنفيذية</button>
        </div>
        <p class="smart-summary">${smartEscape(answer.summary)}</p>
        <div class="smart-columns">
          <div class="smart-card">
            <div class="smart-card-title">أسباب القراءة</div>
            ${smartBullets(answer.reasons,'لا توجد مؤشرات كافية.')}
          </div>
          <div class="smart-card">
            <div class="smart-card-title">توصيات تلقائية</div>
            ${smartBullets(answer.actions,'لا توجد توصيات حاليًا.')}
          </div>
        </div>
        <div class="smart-card smart-decision-card">
          <div class="smart-card-title">قائمة قرار سريعة</div>
          ${smartDecisionTable(answer.decisions)}
        </div>
      </div>
      <div class="smart-api-card">
        <div class="smart-section-title">تجهيز API الذكاء الاصطناعي</div>
        <div class="smart-api-steps">
          <div><strong>1</strong><span>الواجهة ترسل ملخص مؤشرات فقط، وليس قاعدة البيانات كاملة.</span></div>
          <div><strong>2</strong><span>المفتاح السري يبقى في backend مثل Supabase Edge Function أو Serverless Function.</span></div>
          <div><strong>3</strong><span>عند ضبط SMART_ANALYST_API_ENDPOINT يمكن استبدال الرد المحلي برد AI حقيقي.</span></div>
        </div>
        <div class="smart-payload-title">نموذج الحمولة الجاهزة</div>
        <pre class="smart-payload">${smartEscape(payloadPreview)}</pre>
      </div>
    </div>
  </div>`;
}

const __smartAnalystNavItems=navItems;
navItems=function(){
  const items=__smartAnalystNavItems();
  const canSeeSmart=state.currentUser && (hasPermission('view_executive')||hasPermission('view_equipment')||hasPermission('report_senior'));
  if(canSeeSmart && !items.some(i=>i.id==='analyst')){
    const item={id:'analyst',label:'المحلل الذكي',icon:'AI',permission:'view_executive'};
    const executiveIdx=items.findIndex(i=>i.id==='executive');
    if(executiveIdx>=0) items.splice(executiveIdx+1,0,item);
    else items.unshift(item);
  }
  return items;
}

const __smartAnalystGetPageTitle=getPageTitle;
getPageTitle=function(){
  if(state.currentPage==='analyst') return 'المحلل الذكي';
  return __smartAnalystGetPageTitle();
}

const __smartAnalystRenderPageContent=renderPageContent;
renderPageContent=function(){
  if(state.currentPage==='analyst') return renderSmartAnalyst();
  return __smartAnalystRenderPageContent();
}
/* ===== end Smart Analyst Page ===== */

/* ===== Educational Need Evidence Builder v5.9 ===== */
const EDU_NEED_BASIS_OPTIONS=[
  {id:'per_student',label:'لكل طالب'},
  {id:'per_group',label:'لكل مجموعة'},
  {id:'per_section',label:'لكل شعبة'},
  {id:'per_experiment',label:'للتجربة كاملة'},
  {id:'reusable',label:'أداة قابلة لإعادة الاستخدام'}
];

function eduNeedEscape(value){
  if(typeof smartEscape==='function') return smartEscape(value);
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function eduNeedUnits(){
  return (typeof UNIT_OPTIONS!=='undefined' && Array.isArray(UNIT_OPTIONS) && UNIT_OPTIONS.length)
    ? UNIT_OPTIONS
    : ['وحدة','علبة','عبوة','لتر','ملليلتر','كيلو','جرام','متر','قطعة'];
}

function eduNeedUnitOptions(selected='وحدة'){
  return eduNeedUnits().map(u=>`<option value="${eduNeedEscape(u)}" ${selected===u?'selected':''}>${eduNeedEscape(u)}</option>`).join('');
}

function eduNeedBasisOptions(selected='per_student'){
  return EDU_NEED_BASIS_OPTIONS.map(o=>`<option value="${o.id}" ${selected===o.id?'selected':''}>${o.label}</option>`).join('');
}

function eduNeedSemesterOptions(selected='الأول'){
  return ['الأول','الثاني','كلاهما'].map(s=>`<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('');
}

function eduNeedCurrentCollege(){
  if(!isCentral()) return state.currentUser.college;
  if(state.collegeFilter && state.collegeFilter!=='all') return state.collegeFilter;
  const colleges=(db.settings?.colleges||[]).map(c=>c.name).filter(n=>n && n!=='إدارة التجهيزات');
  return colleges[0]||state.currentUser?.college||'كلية غير محددة';
}

function eduNeedCollegeControl(currentCollege){
  if(!isCentral()) return `<input id="need-college" class="input" value="${eduNeedEscape(state.currentUser.college)}" readonly>`;
  const colleges=(db.settings?.colleges||[]).map(c=>c.name).filter(n=>n && n!=='إدارة التجهيزات');
  if(!colleges.length) return `<input id="need-college" class="input" value="${eduNeedEscape(currentCollege)}" readonly>`;
  return `<select id="need-college" class="select">${colleges.map(c=>`<option value="${eduNeedEscape(c)}" ${c===currentCollege?'selected':''}>${eduNeedEscape(c)}</option>`).join('')}</select>`;
}

function eduNeedRowHtml(idx,row={}){
  const semester=row.semester||'الأول';
  const basis=row.basis||'per_student';
  return `<div class="edu-need-row" data-edu-need-row="${idx}">
    <div class="edu-need-row-head">
      <div>
        <div class="edu-need-row-title">شاهد تجربة / مادة</div>
        <div class="small">أدخل تجربة واحدة وصنفًا واحدًا في كل سطر. يمكن تكرار التجربة لأكثر من مادة أو أداة.</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="removeEduNeedRow('${idx}')">حذف</button>
    </div>
    <div class="edu-need-grid">
      <div><label class="label">اسم التجربة</label><input class="input edu-experiment" value="${eduNeedEscape(row.experimentName||'')}" placeholder="مثال: معايرة حمض وقاعدة"></div>
      <div><label class="label">الفصل</label><select class="select edu-semester">${eduNeedSemesterOptions(semester)}</select></div>
      <div><label class="label">تكرار التجربة</label><input class="input edu-repeats" type="number" min="1" step="1" value="${Number(row.repeats||1)}"></div>
      <div><label class="label">شعب الطلاب</label><input class="input edu-male-sections" type="number" min="0" step="1" value="${Number(row.maleSections||0)}"></div>
      <div><label class="label">طلاب/شعبة</label><input class="input edu-male-per-section" type="number" min="0" step="1" value="${Number(row.malePerSection||0)}"></div>
      <div><label class="label">شعب الطالبات</label><input class="input edu-female-sections" type="number" min="0" step="1" value="${Number(row.femaleSections||0)}"></div>
      <div><label class="label">طالبات/شعبة</label><input class="input edu-female-per-section" type="number" min="0" step="1" value="${Number(row.femalePerSection||0)}"></div>
      <div><label class="label">حجم المجموعة</label><input class="input edu-group-size" type="number" min="0" step="1" value="${Number(row.groupSize||1)}"></div>
      <div><label class="label">البند بالعربي</label><input class="input edu-item-ar" value="${eduNeedEscape(row.itemNameAr||'')}" placeholder="إيثانول"></div>
      <div><label class="label">English</label><input class="input edu-item-en" value="${eduNeedEscape(row.itemNameEn||'')}" placeholder="Ethanol"></div>
      <div><label class="label">الوحدة</label><select class="select edu-unit">${eduNeedUnitOptions(row.unit||'وحدة')}</select></div>
      <div><label class="label">أساس الصرف</label><select class="select edu-basis">${eduNeedBasisOptions(basis)}</select></div>
      <div><label class="label">كمية الاستخدام</label><input class="input edu-qty-per-use" type="number" min="0" step="0.01" value="${Number(row.qtyPerUse||0)}"></div>
      <div><label class="label">هدر/احتياط %</label><input class="input edu-waste" type="number" min="0" step="1" value="${Number(row.wastePercent||0)}"></div>
      <div><label class="label">الرصيد المتاح</label><input class="input edu-stock" type="number" min="0" step="0.01" value="${Number(row.stockAvailable||0)}"></div>
    </div>
  </div>`;
}

function addEduNeedRow(prefill={}){
  const wrap=document.getElementById('edu-need-rows');
  if(!wrap) return;
  const idx=`r${Date.now().toString(36)}${wrap.children.length}`;
  wrap.insertAdjacentHTML('beforeend',eduNeedRowHtml(idx,prefill));
}

function removeEduNeedRow(idx){
  const row=document.querySelector(`[data-edu-need-row="${idx}"]`);
  if(row) row.remove();
  renderEduNeedPreview();
}

function eduNeedReadNumber(row,selector){
  const value=Number(row.querySelector(selector)?.value||0);
  return Number.isFinite(value) ? Math.max(value,0) : 0;
}

function eduNeedReadRows(){
  return [...document.querySelectorAll('[data-edu-need-row]')].map(row=>({
    experimentName:(row.querySelector('.edu-experiment')?.value||'').trim()||'تجربة غير مسماة',
    semester:row.querySelector('.edu-semester')?.value||'الأول',
    repeats:Math.max(1,eduNeedReadNumber(row,'.edu-repeats')),
    maleSections:eduNeedReadNumber(row,'.edu-male-sections'),
    malePerSection:eduNeedReadNumber(row,'.edu-male-per-section'),
    femaleSections:eduNeedReadNumber(row,'.edu-female-sections'),
    femalePerSection:eduNeedReadNumber(row,'.edu-female-per-section'),
    groupSize:Math.max(1,eduNeedReadNumber(row,'.edu-group-size')||1),
    itemNameAr:(row.querySelector('.edu-item-ar')?.value||'').trim(),
    itemNameEn:(row.querySelector('.edu-item-en')?.value||'').trim(),
    unit:row.querySelector('.edu-unit')?.value||'وحدة',
    basis:row.querySelector('.edu-basis')?.value||'per_student',
    qtyPerUse:eduNeedReadNumber(row,'.edu-qty-per-use'),
    wastePercent:eduNeedReadNumber(row,'.edu-waste'),
    stockAvailable:eduNeedReadNumber(row,'.edu-stock')
  }));
}

function eduNeedBasisLabel(basis){
  return EDU_NEED_BASIS_OPTIONS.find(o=>o.id===basis)?.label||basis;
}

function eduNeedNormalizeKey(value){
  return String(value||'').trim().toLowerCase()
    .replace(/[إأآا]/g,'ا')
    .replace(/[ىي]/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/\s+/g,' ');
}

function eduNeedRoundQty(value,unit){
  const decimalUnits=['لتر','ملليلتر','مل','كيلو','جرام','متر','متر مربع','متر مكعب'];
  if(decimalUnits.includes(unit)) return Math.ceil((Number(value)||0)*100)/100;
  return Math.ceil(Number(value)||0);
}

function eduNeedCalcRow(row){
  const maleStudents=row.maleSections*row.malePerSection;
  const femaleStudents=row.femaleSections*row.femalePerSection;
  const students=maleStudents+femaleStudents;
  const sections=row.maleSections+row.femaleSections;
  const maleGroups=row.maleSections ? row.maleSections*Math.ceil(row.malePerSection/row.groupSize) : 0;
  const femaleGroups=row.femaleSections ? row.femaleSections*Math.ceil(row.femalePerSection/row.groupSize) : 0;
  const groups=maleGroups+femaleGroups;
  let baseQty=0;
  let effectiveRepeats=row.repeats;
  if(row.basis==='per_student') baseQty=students*row.qtyPerUse;
  else if(row.basis==='per_group') baseQty=groups*row.qtyPerUse;
  else if(row.basis==='per_section') baseQty=sections*row.qtyPerUse;
  else if(row.basis==='per_experiment') baseQty=row.qtyPerUse;
  else {
    baseQty=Math.max(groups,sections,1)*row.qtyPerUse;
    effectiveRepeats=1;
  }
  const gross=(baseQty*effectiveRepeats)*(1+(row.wastePercent/100));
  return {...row,maleStudents,femaleStudents,students,sections,groups,baseQty,effectiveRepeats,grossNeed:gross};
}

function eduNeedAggregateRows(rows){
  const department=document.getElementById('need-mainDepartment')?.value||currentDepartmentName();
  const section=document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام');
  const map=new Map();
  rows.map(eduNeedCalcRow).filter(r=>(r.itemNameAr||r.itemNameEn) && r.qtyPerUse>0 && (r.students>0 || r.sections>0 || r.basis==='per_experiment')).forEach(r=>{
    const key=[eduNeedNormalizeKey(r.itemNameAr||r.itemNameEn),eduNeedNormalizeKey(r.unit),eduNeedNormalizeKey(department),eduNeedNormalizeKey(section)].join('|');
    if(!map.has(key)){
      map.set(key,{
        key,
        erpCode:'',
        mainDepartment:department,
        section,
        category:section,
        itemNameAr:r.itemNameAr,
        itemNameEn:r.itemNameEn,
        unit:r.unit,
        term1Gross:0,
        term2Gross:0,
        stockAvailable:0,
        evidenceRows:[],
        experiments:new Set(),
        courses:new Set()
      });
    }
    const agg=map.get(key);
    if(r.itemNameAr && !agg.itemNameAr) agg.itemNameAr=r.itemNameAr;
    if(r.itemNameEn && !agg.itemNameEn) agg.itemNameEn=r.itemNameEn;
    if(r.semester==='الأول' || r.semester==='كلاهما') agg.term1Gross+=r.grossNeed;
    if(r.semester==='الثاني' || r.semester==='كلاهما') agg.term2Gross+=r.grossNeed;
    agg.stockAvailable=Math.max(agg.stockAvailable,r.stockAvailable||0);
    agg.evidenceRows.push(r);
    agg.experiments.add(r.experimentName);
  });
  return [...map.values()].map(agg=>{
    let remainingStock=agg.stockAvailable;
    const term1NetRaw=Math.max(agg.term1Gross-remainingStock,0);
    remainingStock=Math.max(remainingStock-agg.term1Gross,0);
    const term2NetRaw=Math.max(agg.term2Gross-remainingStock,0);
    agg.term1Net=eduNeedRoundQty(term1NetRaw,agg.unit);
    agg.term2Net=eduNeedRoundQty(term2NetRaw,agg.unit);
    agg.grossTotal=eduNeedRoundQty(agg.term1Gross+agg.term2Gross,agg.unit);
    agg.netTotal=eduNeedRoundQty(agg.term1Net+agg.term2Net,agg.unit);
    return agg;
  });
}

function renderEduNeedPreview(){
  const target=document.getElementById('edu-need-preview');
  if(!target) return;
  const aggregates=eduNeedAggregateRows(eduNeedReadRows());
  const rows=aggregates.map(a=>[
    eduNeedEscape(a.itemNameAr||a.itemNameEn||'—'),
    eduNeedEscape(a.unit),
    eduNeedEscape([...a.experiments].slice(0,3).join('، ')||'—'),
    eduNeedRoundQty(a.term1Gross,a.unit),
    eduNeedRoundQty(a.term2Gross,a.unit),
    eduNeedRoundQty(a.stockAvailable,a.unit),
    a.netTotal>0?`<span class="badge badge-ok">${a.netTotal}</span>`:`<span class="badge badge-info">مغطى بالمخزون</span>`
  ]);
  target.innerHTML=`<div class="table-panel edu-preview-panel"><div class="table-head"><div class="panel-title">المخرجات المحسوبة</div><div class="panel-subtitle">تجميع تلقائي للصنف نفسه عبر التجارب والفصول، مع خصم الرصيد المتاح.</div></div>${table(['البند','الوحدة','التجارب','احتياج الفصل الأول','احتياج الفصل الثاني','الرصيد','الصافي المطلوب'],rows)}</div>`;
}

function eduNeedEvidenceSummary(agg){
  const experiments=[...agg.experiments].filter(Boolean).join('، ')||'تجارب غير مسماة';
  const totalStudents=agg.evidenceRows.reduce((sum,r)=>sum+r.students,0);
  const totalSections=agg.evidenceRows.reduce((sum,r)=>sum+r.sections,0);
  return `احتياج محسوب من الشواهد التعليمية: ${experiments}. إجمالي الطلاب المحتسبين عبر الشواهد ${totalStudents}، وعدد الشعب ${totalSections}. تم احتساب الاحتياج الإجمالي ${agg.grossTotal} ${agg.unit} وخصم الرصيد المتاح ${eduNeedRoundQty(agg.stockAvailable,agg.unit)} ${agg.unit}.`;
}

function needModalHtml(){
  const currentCollege=eduNeedCurrentCollege();
  const currentDepartment=(!isCentral()&&hasDepartmentScope()) ? state.currentUser.department : currentDepartmentName();
  const year=new Date().getFullYear();
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)">
    <div class="modal modal-xl edu-need-modal">
      <div class="modal-header">
        <div>
          <div class="panel-title">رفع احتياج من الشواهد التعليمية</div>
          <div class="panel-subtitle">يبنى الطلب من المقرر، الشعب، التجارب، المواد المستخدمة، التكرار، والرصيد المتاح.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button>
      </div>
      <div class="modal-body">
        <div class="edu-need-intro">
          <div>
            <div class="hero-title">محرك الاحتياج الفعلي</div>
            <div class="small">أدخل الشواهد كما تأتي من القسم، وسيقوم النظام بتجميع البنود المتكررة مثل الإيثانول عبر أكثر من تجربة وإخراج صافي الاحتياج السنوي بفصليه.</div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        </div>
        <div class="form-grid edu-need-master">
          <div><label class="label">العام الدراسي</label><input id="need-academicYear" class="input" value="${year}-${year+1}"></div>
          <div><label class="label">القطاع</label>${eduNeedCollegeControl(currentCollege)}</div>
          <div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="need-mainDepartment" class="input" value="${eduNeedEscape(state.currentUser.department)}" readonly>`:`<select id="need-mainDepartment" class="select">${departmentOptions(currentDepartment,false)}</select>`}</div>
          <div><label class="label">القسم الفرعي / الفئة</label><select id="need-section" class="select">${sectionOptions((typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام'),false)}</select></div>
          <div><label class="label">المستوى</label><input id="need-level" class="input" placeholder="مثال: المستوى الثالث"></div>
          <div><label class="label">اسم المقرر</label><input id="need-courseName" class="input" placeholder="مثال: كيمياء عضوية عملي"></div>
          <div><label class="label">رمز المقرر</label><input id="need-courseCode" class="input" placeholder="CHEM 214"></div>
          <div><label class="label">رقم أمر الاحتياج</label><input id="need-requestOrderNo" class="input" placeholder="اختياري"></div>
          <div class="full"><label class="label">ملاحظات عامة</label><textarea id="need-notes" class="textarea" placeholder="أي افتراضات أو ملاحظات من القسم"></textarea></div>
        </div>
        <div class="edu-need-section-head">
          <div>
            <div class="panel-title">الشواهد والحساب</div>
            <div class="panel-subtitle">كل سطر يمثل استخدام مادة أو أداة داخل تجربة. أضف أكثر من سطر للتجربة الواحدة عند وجود أكثر من مادة.</div>
          </div>
          <button type="button" class="btn btn-primary" onclick="addEduNeedRow()">+ إضافة شاهد</button>
        </div>
        <div id="edu-need-rows" class="edu-need-rows">${eduNeedRowHtml(0)}</div>
        <div id="edu-need-preview" class="edu-need-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        <button class="btn btn-primary" onclick="saveNeed()">توليد طلب الاحتياج</button>
      </div>
    </div>
  </div>`;
}

function saveNeed(){
  if(!hasPermission('create_need')) return alert('لا تملك صلاحية رفع الاحتياج');
  db.needsRequests=db.needsRequests||[];
  db.needEvidence=db.needEvidence||[];
  const rows=eduNeedReadRows();
  if(!rows.length) return alert('أضف شاهد احتياج واحدًا على الأقل');
  const aggregates=eduNeedAggregateRows(rows).filter(a=>a.netTotal>0);
  if(!aggregates.length) return alert('لا يوجد صافي احتياج بعد احتساب الرصيد المتاح أو أن بيانات الشواهد غير مكتملة');

  const planId=`EDU-${Date.now()}`;
  const academicYear=(document.getElementById('need-academicYear')?.value||'').trim();
  const college=document.getElementById('need-college')?.value||eduNeedCurrentCollege();
  const mainDepartment=document.getElementById('need-mainDepartment')?.value||currentDepartmentName();
  const section=document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام');
  const level=(document.getElementById('need-level')?.value||'').trim();
  const courseName=(document.getElementById('need-courseName')?.value||'').trim()||'مقرر غير محدد';
  const courseCode=(document.getElementById('need-courseCode')?.value||'').trim()||'غير محدد';
  const requestOrderNo=(document.getElementById('need-requestOrderNo')?.value||'').trim();
  const notes=(document.getElementById('need-notes')?.value||'').trim();
  const createdAt=nowLocalString();
  const createdBy=state.currentUser.id;
  const needByKey=new Map();

  aggregates.forEach(agg=>{
    const req={
      id:nextId(db.needsRequests),
      requestNo:nextNo('NR',db.needsRequests),
      erpCode:'',
      college,
      mainDepartment,
      section,
      category:section,
      itemNameAr:agg.itemNameAr,
      itemNameEn:agg.itemNameEn,
      unit:agg.unit,
      mandatoryProduct:'لا',
      constructionCode:'',
      similarItem:'',
      brandMention:'لا',
      yearsCount:2,
      year1Qty:agg.term1Net,
      year2Qty:agg.term2Net,
      year3Qty:0,
      qty:agg.netTotal,
      requestOrderNo,
      sendGrouping:'subsection',
      targetEntity:'إدارة التجهيزات',
      description:`${agg.itemNameAr||agg.itemNameEn} مستخدم في ${courseName} (${courseCode})`,
      specifications:`احتياج تعليمي محسوب من ${agg.evidenceRows.length} شاهد/شواهد، أساسه الشعب والطلاب والتجارب والتكرار ونسبة الهدر.`,
      justification:eduNeedEvidenceSummary(agg),
      brandReason:'',
      notes,
      status:'pending_sector_approval',
      workflowStage:'بانتظار اعتماد مسؤول القطاع',
      calculationSource:'educational_evidence_v5_9',
      planId,
      academicYear,
      level,
      courseName,
      courseCode,
      grossQty:agg.grossTotal,
      stockAvailable:eduNeedRoundQty(agg.stockAvailable,agg.unit),
      evidenceCount:agg.evidenceRows.length,
      createdAt,
      createdBy
    };
    db.needsRequests.unshift(req);
    needByKey.set(agg.key,req);
    auditLog('توليد طلب احتياج من الشواهد','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - صافي ${req.qty} ${req.unit}`,req.college,req.mainDepartment);
  });

  aggregates.forEach(agg=>{
    const need=needByKey.get(agg.key);
    if(!need) return;
    agg.evidenceRows.forEach(row=>{
      const deficit=eduNeedRoundQty(Math.max(row.grossNeed-row.stockAvailable,0),row.unit);
      const ev={
        id:nextId(db.needEvidence),
        needId:need.id,
        requestNo:need.requestNo,
        college,
        mainDepartment,
        section,
        itemNameAr:need.itemNameAr,
        itemNameEn:need.itemNameEn,
        unit:need.unit,
        academicYear,
        level,
        courseName,
        courseCode,
        experimentName:row.experimentName,
        semester:row.semester,
        sectionsCount:row.sections,
        studentsCount:row.students,
        maleSections:row.maleSections,
        femaleSections:row.femaleSections,
        maleStudents:row.maleStudents,
        femaleStudents:row.femaleStudents,
        groupsCount:row.groups,
        usesCount:row.effectiveRepeats,
        repeats:row.repeats,
        consumptionBasis:row.basis,
        calculationMethod:eduNeedBasisLabel(row.basis),
        qtyPerStudent:row.basis==='per_student'?row.qtyPerUse:0,
        qtyPerUse:row.qtyPerUse,
        wastePercent:row.wastePercent,
        stockAvailable:row.stockAvailable,
        estimatedNeed:eduNeedRoundQty(row.grossNeed,row.unit),
        grossNeed:eduNeedRoundQty(row.grossNeed,row.unit),
        deficit,
        planId,
        justification:`شاهد ${row.experimentName} للمقرر ${courseName}: ${eduNeedBasisLabel(row.basis)} × ${row.qtyPerUse} ${row.unit}، تكرار ${row.effectiveRepeats}، هدر ${row.wastePercent}%.`,
        recommendation:'اعتماد الصافي المولد آليًا بعد مراجعة القسم والمسؤول المعتمد.',
        notes,
        createdAt,
        createdBy
      };
      db.needEvidence.unshift(ev);
      auditLog('إضافة شاهد احتياج محسوب','evidence',ev.requestNo,`${ev.experimentName} - ${ev.grossNeed} ${ev.unit}`,ev.college,ev.mainDepartment);
    });
  });

  saveDb();
  state.currentPage='needs';
  closeModal();
  alert(`تم توليد ${aggregates.length} طلب احتياج من ${rows.length} شاهد تعليمي`);
}

function renderNeeds(){
  const rows=filteredNeeds().map(r=>{
    const source=r.calculationSource==='educational_evidence_v5_9'
      ? `<span class="badge badge-ok">محسوب من الشواهد</span>`
      : `<span class="badge badge-info">يدوي</span>`;
    const stock=typeof r.stockAvailable!=='undefined' ? r.stockAvailable : '—';
    return [r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',source,`${r.year1Qty||0} / ${r.year2Qty||0}`,r.grossQty||'—',stock,r.qty,r.unit,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)];
  });
  return `<div class="hero edu-need-page-hero">
    <div>
      <div class="hero-title">طلبات الاحتياج</div>
      <div class="hero-text">يمكن رفع الاحتياج الآن من الشواهد التعليمية: مقرر، شعب، تجربة، مواد مستخدمة، تكرار، ورصيد متاح. النظام يجمع الصنف المتكرر ويخرج صافي الكميات للفصلين.</div>
    </div>
    ${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج محسوب</button>`:''}
  </div>
  <div class="toolbar">
    <div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div>
    <div class="toolbar-left"><button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div>
  </div>
  <div class="table-panel">
    <div class="table-head"><div class="panel-title">سجل الاحتياج</div><div class="panel-subtitle">تظهر الطلبات المحسوبة مع مصدرها ورصيدها، وتبقى الطلبات اليدوية القديمة كما هي.</div></div>
    ${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','مصدر الحساب','الفصل 1 / الفصل 2','الإجمالي قبل الرصيد','الرصيد','الصافي','الوحدة','الحالة','الشواهد','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}
  </div>`;
}

function renderNeedEvidence(){
  const rows=visibleNeedEvidence().map(r=>[
    r.requestNo,
    r.college,
    r.mainDepartment||'القسم العام',
    r.section,
    r.itemNameAr||'—',
    r.courseName||'—',
    r.courseCode||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.groupsCount||'—',
    r.calculationMethod||eduNeedBasisLabel(r.consumptionBasis)||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    actorName(r.createdBy),
    `<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('evidenceEdit',${r.id})">تعديل</button></div>`
  ]);
  return `<div class="hero"><div class="hero-title">شواهد الاحتياج</div><div class="hero-text">كل شاهد يربط الاحتياج بمقرر وتجربة وأساس صرف واضح، مع الاحتفاظ بسجل الحساب الذي ولّد طلب الاحتياج.</div></div>
  <div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة شاهد يدوي</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل شواهد الاحتياج</div><div class="panel-subtitle">الشواهد المولدة من محرك الاحتياج تظهر هنا بجانب الشواهد اليدوية.</div></div>${table(['رقم الطلب','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقرر','رمز المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','المجموعات','طريقة الحساب','الاحتياج النظري','المتاح','العجز','صاحب الإجراء','إجراء'],rows)}</div>`;
}
/* ===== end Educational Need Evidence Builder v5.9 ===== */

/* ===== Educational Need Evidence Builder v5.9.1: experiment cards + final unit rounding ===== */
function eduNeedDefaultRequestUnit(unit){
  const u=eduNeedCanonicalUnit(unit);
  if(u==='مليتر') return 'لتر';
  if(u==='جرام') return 'كيلو';
  return unit||'عدد';
}

function eduNeedCanonicalUnit(unit){
  const u=String(unit||'').trim();
  const aliases={
    'مل':'مليتر','مللي':'مليتر','ملليلتر':'مليتر','مليلتر':'مليتر','ملي لتر':'مليتر',
    'ل':'لتر',
    'جم':'جرام','غرام':'جرام','غ':'جرام',
    'كجم':'كيلو','كغ':'كيلو','كيلوغرام':'كيلو',
    'حبه':'حبة','قطعه':'قطعة'
  };
  return aliases[u]||u;
}

function eduNeedUnitFamily(unit){
  const u=eduNeedCanonicalUnit(unit);
  if(['مليتر','لتر'].includes(u)) return 'volume';
  if(['جرام','كيلو'].includes(u)) return 'weight';
  if(['حبة','عدد','قطعة','علبة','صندوق','كرتون','جهاز'].includes(u)) return 'count';
  return u;
}

function eduNeedUnitFactor(unit){
  const u=eduNeedCanonicalUnit(unit);
  if(u==='مليتر') return 1;
  if(u==='لتر') return 1000;
  if(u==='جرام') return 1;
  if(u==='كيلو') return 1000;
  return 1;
}

function eduNeedConvertQty(qty,fromUnit,toUnit){
  const from=eduNeedCanonicalUnit(fromUnit), to=eduNeedCanonicalUnit(toUnit);
  if(from===to) return Number(qty)||0;
  if(eduNeedUnitFamily(from)!==eduNeedUnitFamily(to)) return Number(qty)||0;
  if(eduNeedUnitFamily(from)==='count') return Number(qty)||0;
  return (Number(qty)||0)*eduNeedUnitFactor(from)/eduNeedUnitFactor(to);
}

function eduNeedRoundQty(value){
  return Math.ceil(Number(value)||0);
}

function eduNeedRoundPreview(value){
  return Math.ceil((Number(value)||0)*100)/100;
}

function syncEduNeedRequestUnit(select){
  const row=select.closest('[data-edu-material-row]');
  const request=row?.querySelector('.edu-request-unit');
  if(request) request.value=eduNeedDefaultRequestUnit(select.value);
}

function eduNeedMaterialRowHtml(groupIdx,materialIdx,material={}){
  const usageUnit=material.usageUnit||material.unit||'مليتر';
  const requestUnit=material.requestUnit||eduNeedDefaultRequestUnit(usageUnit);
  const basis=material.basis||'per_student';
  return `<div class="edu-material-row" data-edu-material-row="${materialIdx}">
    <div class="edu-material-grid">
      <div><label class="label">البند بالعربي</label><input class="input edu-item-ar" value="${eduNeedEscape(material.itemNameAr||'')}" placeholder="إيثانول"></div>
      <div><label class="label">English</label><input class="input edu-item-en" value="${eduNeedEscape(material.itemNameEn||'')}" placeholder="Ethanol"></div>
      <div><label class="label">وحدة الاستخدام في التجربة</label><select class="select edu-usage-unit" onchange="syncEduNeedRequestUnit(this)">${eduNeedUnitOptions(usageUnit)}</select></div>
      <div><label class="label">وحدة الطلب النهائية</label><select class="select edu-request-unit">${eduNeedUnitOptions(requestUnit)}</select></div>
      <div><label class="label">أساس الصرف</label><select class="select edu-basis">${eduNeedBasisOptions(basis)}</select></div>
      <div><label class="label">كمية الاستخدام</label><input class="input edu-qty-per-use" type="number" min="0" step="0.01" value="${Number(material.qtyPerUse||0)}"></div>
      <div><label class="label">هدر/احتياط %</label><input class="input edu-waste" type="number" min="0" step="1" value="${Number(material.wastePercent||0)}"></div>
      <div><label class="label">الرصيد بوحدة الطلب</label><input class="input edu-stock" type="number" min="0" step="0.01" value="${Number(material.stockAvailable||0)}"></div>
      <div class="edu-material-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="removeEduNeedMaterial('${groupIdx}','${materialIdx}')">حذف المادة</button></div>
    </div>
  </div>`;
}

function eduNeedRowHtml(idx,row={}){
  const semester=row.semester||'الأول';
  return `<div class="edu-need-row edu-experiment-card" data-edu-need-row="${idx}">
    <div class="edu-need-row-head">
      <div>
        <div class="edu-need-row-title">تجربة تعليمية</div>
        <div class="small">هذه التجربة تمثل نشاطًا عمليًا واحدًا. أضف داخلها جميع المواد والأدوات المستخدمة في التجربة نفسها.</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="removeEduNeedRow('${idx}')">حذف التجربة</button>
    </div>
    <div class="edu-need-grid edu-experiment-grid">
      <div><label class="label">اسم التجربة</label><input class="input edu-experiment" value="${eduNeedEscape(row.experimentName||'')}" placeholder="مثال: معايرة حمض وقاعدة"></div>
      <div><label class="label">الفصل</label><select class="select edu-semester">${eduNeedSemesterOptions(semester)}</select></div>
      <div><label class="label">تكرار التجربة</label><input class="input edu-repeats" type="number" min="1" step="1" value="${Number(row.repeats||1)}"></div>
      <div><label class="label">شعب الطلاب</label><input class="input edu-male-sections" type="number" min="0" step="1" value="${Number(row.maleSections||0)}"></div>
      <div><label class="label">طلاب/شعبة</label><input class="input edu-male-per-section" type="number" min="0" step="1" value="${Number(row.malePerSection||0)}"></div>
      <div><label class="label">شعب الطالبات</label><input class="input edu-female-sections" type="number" min="0" step="1" value="${Number(row.femaleSections||0)}"></div>
      <div><label class="label">طالبات/شعبة</label><input class="input edu-female-per-section" type="number" min="0" step="1" value="${Number(row.femalePerSection||0)}"></div>
      <div><label class="label">حجم المجموعة</label><input class="input edu-group-size" type="number" min="1" step="1" value="${Number(row.groupSize||1)}"></div>
    </div>
    <div class="edu-material-head">
      <div>
        <div class="edu-material-title">مواد وأدوات التجربة</div>
        <div class="small">وحدة الاستخدام تحفظ دقة المرجع التعليمي، ووحدة الطلب النهائية تستخدم للمنافسة وتُقرب للأعلى كعدد صحيح.</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="addEduNeedMaterial('${idx}')">+ إضافة مادة/أداة</button>
    </div>
    <div class="edu-material-rows" data-edu-materials="${idx}">${eduNeedMaterialRowHtml(idx,0)}</div>
  </div>`;
}

function addEduNeedRow(prefill={}){
  const wrap=document.getElementById('edu-need-rows');
  if(!wrap) return;
  const idx=`e${Date.now().toString(36)}${wrap.children.length}`;
  wrap.insertAdjacentHTML('beforeend',eduNeedRowHtml(idx,prefill));
}

function addEduNeedMaterial(groupIdx,prefill={}){
  const wrap=document.querySelector(`[data-edu-materials="${groupIdx}"]`);
  if(!wrap) return;
  const idx=`m${Date.now().toString(36)}${wrap.children.length}`;
  wrap.insertAdjacentHTML('beforeend',eduNeedMaterialRowHtml(groupIdx,idx,prefill));
}

function removeEduNeedMaterial(groupIdx,materialIdx){
  const row=document.querySelector(`[data-edu-materials="${groupIdx}"] [data-edu-material-row="${materialIdx}"]`);
  if(row) row.remove();
  renderEduNeedPreview();
}

function eduNeedReadRows(){
  const rows=[];
  [...document.querySelectorAll('[data-edu-need-row]')].forEach(group=>{
    const common={
      experimentName:(group.querySelector('.edu-experiment')?.value||'').trim()||'تجربة غير مسماة',
      semester:group.querySelector('.edu-semester')?.value||'الأول',
      repeats:Math.max(1,eduNeedReadNumber(group,'.edu-repeats')),
      maleSections:eduNeedReadNumber(group,'.edu-male-sections'),
      malePerSection:eduNeedReadNumber(group,'.edu-male-per-section'),
      femaleSections:eduNeedReadNumber(group,'.edu-female-sections'),
      femalePerSection:eduNeedReadNumber(group,'.edu-female-per-section'),
      groupSize:Math.max(1,eduNeedReadNumber(group,'.edu-group-size')||1)
    };
    [...group.querySelectorAll('[data-edu-material-row]')].forEach(material=>{
      const usageUnit=material.querySelector('.edu-usage-unit')?.value||'عدد';
      const requestUnit=material.querySelector('.edu-request-unit')?.value||eduNeedDefaultRequestUnit(usageUnit);
      rows.push({
        ...common,
        itemNameAr:(material.querySelector('.edu-item-ar')?.value||'').trim(),
        itemNameEn:(material.querySelector('.edu-item-en')?.value||'').trim(),
        usageUnit,
        requestUnit,
        unit:requestUnit,
        basis:material.querySelector('.edu-basis')?.value||'per_student',
        qtyPerUse:eduNeedReadNumber(material,'.edu-qty-per-use'),
        wastePercent:eduNeedReadNumber(material,'.edu-waste'),
        stockAvailable:eduNeedReadNumber(material,'.edu-stock')
      });
    });
  });
  return rows;
}

function eduNeedCalcRow(row){
  const maleStudents=row.maleSections*row.malePerSection;
  const femaleStudents=row.femaleSections*row.femalePerSection;
  const students=maleStudents+femaleStudents;
  const sections=row.maleSections+row.femaleSections;
  const maleGroups=row.maleSections ? row.maleSections*Math.ceil(row.malePerSection/row.groupSize) : 0;
  const femaleGroups=row.femaleSections ? row.femaleSections*Math.ceil(row.femalePerSection/row.groupSize) : 0;
  const groups=maleGroups+femaleGroups;
  let baseUsage=0;
  let effectiveRepeats=row.repeats;
  if(row.basis==='per_student') baseUsage=students*row.qtyPerUse;
  else if(row.basis==='per_group') baseUsage=groups*row.qtyPerUse;
  else if(row.basis==='per_section') baseUsage=sections*row.qtyPerUse;
  else if(row.basis==='per_experiment') baseUsage=row.qtyPerUse;
  else {
    baseUsage=Math.max(groups,sections,1)*row.qtyPerUse;
    effectiveRepeats=1;
  }
  const grossUsage=(baseUsage*effectiveRepeats)*(1+(row.wastePercent/100));
  const grossRequest=eduNeedConvertQty(grossUsage,row.usageUnit,row.requestUnit);
  return {...row,maleStudents,femaleStudents,students,sections,groups,baseQty:baseUsage,effectiveRepeats,grossNeedUsage:grossUsage,grossNeed:grossRequest,unit:row.requestUnit};
}

function eduNeedAggregateRows(rows){
  const department=document.getElementById('need-mainDepartment')?.value||currentDepartmentName();
  const section=document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام');
  const map=new Map();
  rows.map(eduNeedCalcRow).filter(r=>(r.itemNameAr||r.itemNameEn) && r.qtyPerUse>0 && (r.students>0 || r.sections>0 || r.basis==='per_experiment')).forEach(r=>{
    const key=[eduNeedNormalizeKey(r.itemNameAr||r.itemNameEn),eduNeedNormalizeKey(r.requestUnit),eduNeedNormalizeKey(department),eduNeedNormalizeKey(section)].join('|');
    if(!map.has(key)){
      map.set(key,{
        key,
        erpCode:'',
        mainDepartment:department,
        section,
        category:section,
        itemNameAr:r.itemNameAr,
        itemNameEn:r.itemNameEn,
        unit:r.requestUnit,
        requestUnit:r.requestUnit,
        usageUnits:new Set(),
        term1Gross:0,
        term2Gross:0,
        stockAvailable:0,
        evidenceRows:[],
        experiments:new Set()
      });
    }
    const agg=map.get(key);
    if(r.itemNameAr && !agg.itemNameAr) agg.itemNameAr=r.itemNameAr;
    if(r.itemNameEn && !agg.itemNameEn) agg.itemNameEn=r.itemNameEn;
    if(r.semester==='الأول' || r.semester==='كلاهما') agg.term1Gross+=r.grossNeed;
    if(r.semester==='الثاني' || r.semester==='كلاهما') agg.term2Gross+=r.grossNeed;
    agg.stockAvailable=Math.max(agg.stockAvailable,r.stockAvailable||0);
    agg.evidenceRows.push(r);
    agg.experiments.add(r.experimentName);
    agg.usageUnits.add(r.usageUnit);
  });
  return [...map.values()].map(agg=>{
    let remainingStock=agg.stockAvailable;
    const term1NetRaw=Math.max(agg.term1Gross-remainingStock,0);
    remainingStock=Math.max(remainingStock-agg.term1Gross,0);
    const term2NetRaw=Math.max(agg.term2Gross-remainingStock,0);
    agg.term1Net=eduNeedRoundQty(term1NetRaw);
    agg.term2Net=eduNeedRoundQty(term2NetRaw);
    agg.grossTotal=eduNeedRoundPreview(agg.term1Gross+agg.term2Gross);
    agg.netTotal=eduNeedRoundQty(agg.term1Net+agg.term2Net);
    return agg;
  });
}

function eduNeedFindMergeTarget(agg,ctx){
  return (db.needsRequests||[]).find(r=>{
    if(['approved','rejected'].includes(r.status)) return false;
    if(!['educational_evidence_v5_9','educational_evidence_v5_9_1'].includes(r.calculationSource)) return false;
    const sameScope=r.college===ctx.college && (r.mainDepartment||'القسم العام')===ctx.mainDepartment && r.section===ctx.section;
    const sameUnit=eduNeedCanonicalUnit(r.unit)===eduNeedCanonicalUnit(agg.unit);
    const sameItem=eduNeedNormalizeKey(r.itemNameAr||r.itemNameEn)===eduNeedNormalizeKey(agg.itemNameAr||agg.itemNameEn);
    return sameScope && sameUnit && sameItem;
  });
}

function renderEduNeedPreview(){
  const target=document.getElementById('edu-need-preview');
  if(!target) return;
  const aggregates=eduNeedAggregateRows(eduNeedReadRows());
  const rows=aggregates.map(a=>[
    eduNeedEscape(a.itemNameAr||a.itemNameEn||'—'),
    eduNeedEscape([...a.usageUnits].join('، ')||a.unit),
    eduNeedEscape(a.unit),
    eduNeedEscape([...a.experiments].slice(0,4).join('، ')||'—'),
    eduNeedRoundPreview(a.term1Gross),
    eduNeedRoundPreview(a.term2Gross),
    eduNeedRoundPreview(a.stockAvailable),
    a.netTotal>0?`<span class="badge badge-ok">${a.netTotal}</span>`:`<span class="badge badge-info">مغطى بالمخزون</span>`
  ]);
  target.innerHTML=`<div class="table-panel edu-preview-panel"><div class="table-head"><div class="panel-title">المخرجات المحسوبة قبل الرفع</div><div class="panel-subtitle">يجمع النظام نفس الصنف داخل كل التجارب، يحول إلى وحدة الطلب النهائية، ثم يقرب الصافي للأعلى كعدد صحيح.</div></div>${table(['البند','وحدة الاستخدام','وحدة الطلب','التجارب','الفصل الأول','الفصل الثاني','الرصيد','الصافي المرفوع'],rows)}</div>`;
}

function eduNeedEvidenceSummary(agg){
  const experiments=[...agg.experiments].filter(Boolean).join('، ')||'تجارب غير مسماة';
  const usageUnits=[...agg.usageUnits].filter(Boolean).join('، ')||agg.unit;
  const totalStudents=agg.evidenceRows.reduce((sum,r)=>sum+r.students,0);
  const totalSections=agg.evidenceRows.reduce((sum,r)=>sum+r.sections,0);
  return `احتياج محسوب من المراجع التعليمية: ${experiments}. إجمالي الطلاب المحتسبين عبر المراجع ${totalStudents}، وعدد الشعب ${totalSections}. تم تحويل وحدات الاستخدام (${usageUnits}) إلى وحدة الطلب النهائية (${agg.unit})، ثم خصم الرصيد ${eduNeedRoundPreview(agg.stockAvailable)} ${agg.unit} وتقريب الصافي للأعلى إلى ${agg.netTotal} ${agg.unit}.`;
}

function needModalHtml(){
  const currentCollege=eduNeedCurrentCollege();
  const currentDepartment=(!isCentral()&&hasDepartmentScope()) ? state.currentUser.department : currentDepartmentName();
  const year=new Date().getFullYear();
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)">
    <div class="modal modal-xl edu-need-modal">
      <div class="modal-header">
        <div>
          <div class="panel-title">احتياج مباشر من بيانات تعليمية</div>
          <div class="panel-subtitle">المرجع يتكون من تجربة واحدة، وداخلها يمكن إضافة جميع المواد والأدوات ثم تحويلها لوحدة طلب نهائية.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button>
      </div>
      <div class="modal-body">
        <div class="edu-need-intro">
          <div>
            <div class="hero-title">محرك الاحتياج الفعلي</div>
            <div class="small">أضف تجربة جديدة عند تغير التجربة فقط. أما مواد وأدوات التجربة نفسها فتضاف داخل المرجع نفسه، وتجمع النتيجة تحت نفس الصنف حتى لو تكرر في مقرر آخر لاحقًا.</div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        </div>
        <div class="form-grid edu-need-master">
          <div><label class="label">العام الدراسي</label><input id="need-academicYear" class="input" value="${year}-${year+1}"></div>
          <div><label class="label">القطاع</label>${eduNeedCollegeControl(currentCollege)}</div>
          <div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="need-mainDepartment" class="input" value="${eduNeedEscape(state.currentUser.department)}" readonly>`:`<select id="need-mainDepartment" class="select">${departmentOptions(currentDepartment,false)}</select>`}</div>
          <div><label class="label">القسم الفرعي / الفئة</label><select id="need-section" class="select">${sectionOptions((typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام'),false)}</select></div>
          <div><label class="label">المستوى</label><input id="need-level" class="input" placeholder="مثال: المستوى الثالث"></div>
          <div><label class="label">اسم المقرر</label><input id="need-courseName" class="input" placeholder="مثال: كيمياء عضوية عملي"></div>
          <div><label class="label">رمز المقرر</label><input id="need-courseCode" class="input" placeholder="CHEM 214"></div>
          <div><label class="label">رقم أمر الاحتياج</label><input id="need-requestOrderNo" class="input" placeholder="اختياري"></div>
          <div class="full"><label class="label">ملاحظات عامة</label><textarea id="need-notes" class="textarea" placeholder="أي افتراضات أو ملاحظات من القسم"></textarea></div>
        </div>
        <div class="edu-need-section-head">
          <div>
            <div class="panel-title">المراجع والحساب</div>
            <div class="panel-subtitle">أضف تجربة جديدة فقط عند اختلاف التجربة. داخل كل تجربة يمكن إضافة أكثر من مادة أو أداة.</div>
          </div>
          <button type="button" class="btn btn-primary" onclick="addEduNeedRow()">+ إضافة تجربة</button>
        </div>
        <div id="edu-need-rows" class="edu-need-rows">${eduNeedRowHtml(0)}</div>
        <div id="edu-need-preview" class="edu-need-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        <button class="btn btn-primary" onclick="saveNeed()">توليد/دمج طلب الاحتياج</button>
      </div>
    </div>
  </div>`;
}

function saveNeed(){
  if(!hasPermission('create_need')) return alert('لا تملك صلاحية رفع الاحتياج');
  db.needsRequests=db.needsRequests||[];
  db.needEvidence=db.needEvidence||[];
  const rows=eduNeedReadRows();
  if(!rows.length) return alert('أضف تجربة ومادة واحدة على الأقل');
  const aggregates=eduNeedAggregateRows(rows).filter(a=>a.netTotal>0);
  if(!aggregates.length) return alert('لا يوجد صافي احتياج بعد احتساب الرصيد المتاح أو أن بيانات المراجع غير مكتملة');

  const planId=`EDU-${Date.now()}`;
  const ctx={
    academicYear:(document.getElementById('need-academicYear')?.value||'').trim(),
    college:document.getElementById('need-college')?.value||eduNeedCurrentCollege(),
    mainDepartment:document.getElementById('need-mainDepartment')?.value||currentDepartmentName(),
    section:document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام'),
    level:(document.getElementById('need-level')?.value||'').trim(),
    courseName:(document.getElementById('need-courseName')?.value||'').trim()||'مقرر غير محدد',
    courseCode:(document.getElementById('need-courseCode')?.value||'').trim()||'غير محدد',
    requestOrderNo:(document.getElementById('need-requestOrderNo')?.value||'').trim(),
    notes:(document.getElementById('need-notes')?.value||'').trim(),
    createdAt:nowLocalString(),
    createdBy:state.currentUser.id
  };
  const needByKey=new Map();
  let createdCount=0, mergedCount=0;

  aggregates.forEach(agg=>{
    let req=eduNeedFindMergeTarget(agg,ctx);
    if(req){
      req.year1Qty=eduNeedRoundQty(Number(req.year1Qty||0)+agg.term1Net);
      req.year2Qty=eduNeedRoundQty(Number(req.year2Qty||0)+agg.term2Net);
      req.year3Qty=0;
      req.qty=eduNeedRoundQty(Number(req.year1Qty||0)+Number(req.year2Qty||0));
      req.grossQty=eduNeedRoundPreview(Number(req.grossQty||0)+agg.grossTotal);
      req.stockAvailable=Math.max(Number(req.stockAvailable||0),Number(agg.stockAvailable||0));
      req.evidenceCount=Number(req.evidenceCount||0)+agg.evidenceRows.length;
      req.calculationSource='educational_evidence_v5_9_1';
      req.workflowStage='تم دمج مراجع تعليمية جديدة وينتظر اعتماد مسؤول القطاع';
      req.status='pending_sector_approval';
      req.lastMergedAt=ctx.createdAt;
      req.lastMergedBy=ctx.createdBy;
      req.courseName=[req.courseName,ctx.courseName].filter(Boolean).join('، ');
      req.courseCode=[req.courseCode,ctx.courseCode].filter(Boolean).join('، ');
      req.justification=`${req.justification||''}\n\nدمج جديد: ${eduNeedEvidenceSummary(agg)}`.trim();
      req.notes=[req.notes,ctx.notes].filter(Boolean).join('\n');
      mergedCount++;
      auditLog('دمج مراجع تعليمية في طلب قائم','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - الصافي بعد الدمج ${req.qty} ${req.unit}`,req.college,req.mainDepartment);
    } else {
      req={
        id:nextId(db.needsRequests),
        requestNo:nextNo('NR',db.needsRequests),
        erpCode:'',
        college:ctx.college,
        mainDepartment:ctx.mainDepartment,
        section:ctx.section,
        category:ctx.section,
        itemNameAr:agg.itemNameAr,
        itemNameEn:agg.itemNameEn,
        unit:agg.unit,
        mandatoryProduct:'لا',
        constructionCode:'',
        similarItem:'',
        brandMention:'لا',
        yearsCount:2,
        year1Qty:agg.term1Net,
        year2Qty:agg.term2Net,
        year3Qty:0,
        qty:agg.netTotal,
        requestOrderNo:ctx.requestOrderNo,
        sendGrouping:'subsection',
        targetEntity:'إدارة التجهيزات',
        description:`${agg.itemNameAr||agg.itemNameEn} مستخدم في ${ctx.courseName} (${ctx.courseCode})`,
        specifications:`احتياج تعليمي محسوب من ${agg.evidenceRows.length} مرجع/مادة، مع تحويل وحدة الاستخدام إلى وحدة طلب نهائية وتقريب الصافي للأعلى.`,
        justification:eduNeedEvidenceSummary(agg),
        brandReason:'',
        notes:ctx.notes,
        status:'pending_sector_approval',
        workflowStage:'بانتظار اعتماد مسؤول القطاع',
        calculationSource:'educational_evidence_v5_9_1',
        planId,
        academicYear:ctx.academicYear,
        level:ctx.level,
        courseName:ctx.courseName,
        courseCode:ctx.courseCode,
        grossQty:agg.grossTotal,
        stockAvailable:eduNeedRoundPreview(agg.stockAvailable),
        evidenceCount:agg.evidenceRows.length,
        createdAt:ctx.createdAt,
        createdBy:ctx.createdBy
      };
      db.needsRequests.unshift(req);
      createdCount++;
      auditLog('توليد طلب احتياج من المراجع التعليمية','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - صافي ${req.qty} ${req.unit}`,req.college,req.mainDepartment);
    }
    needByKey.set(agg.key,req);
  });

  aggregates.forEach(agg=>{
    const need=needByKey.get(agg.key);
    if(!need) return;
    agg.evidenceRows.forEach(row=>{
      const deficit=eduNeedRoundQty(Math.max(row.grossNeed-row.stockAvailable,0));
      const ev={
        id:nextId(db.needEvidence),
        needId:need.id,
        requestNo:need.requestNo,
        college:ctx.college,
        mainDepartment:ctx.mainDepartment,
        section:ctx.section,
        itemNameAr:need.itemNameAr,
        itemNameEn:need.itemNameEn,
        unit:need.unit,
        usageUnit:row.usageUnit,
        requestUnit:row.requestUnit,
        academicYear:ctx.academicYear,
        level:ctx.level,
        courseName:ctx.courseName,
        courseCode:ctx.courseCode,
        experimentName:row.experimentName,
        semester:row.semester,
        sectionsCount:row.sections,
        studentsCount:row.students,
        maleSections:row.maleSections,
        femaleSections:row.femaleSections,
        maleStudents:row.maleStudents,
        femaleStudents:row.femaleStudents,
        groupsCount:row.groups,
        usesCount:row.effectiveRepeats,
        repeats:row.repeats,
        consumptionBasis:row.basis,
        calculationMethod:eduNeedBasisLabel(row.basis),
        qtyPerUse:row.qtyPerUse,
        wastePercent:row.wastePercent,
        stockAvailable:row.stockAvailable,
        estimatedNeed:eduNeedRoundPreview(row.grossNeed),
        grossNeed:eduNeedRoundPreview(row.grossNeed),
        grossNeedUsage:eduNeedRoundPreview(row.grossNeedUsage),
        deficit,
        planId,
        justification:`مرجع ${row.experimentName} للمقرر ${ctx.courseName}: ${eduNeedBasisLabel(row.basis)} × ${row.qtyPerUse} ${row.usageUnit}، تم تحويله إلى ${row.requestUnit} للطلب النهائي وتقريبه للأعلى.`,
        recommendation:'اعتماد الصافي المجمع بعد مراجعة القسم والمسؤول المعتمد.',
        notes:ctx.notes,
        createdAt:ctx.createdAt,
        createdBy:ctx.createdBy
      };
      db.needEvidence.unshift(ev);
      auditLog('إضافة مرجع تعليمي محسوب','evidence',ev.requestNo,`${ev.experimentName} - ${ev.grossNeed} ${ev.unit}`,ev.college,ev.mainDepartment);
    });
  });

  saveDb();
  state.currentPage='needs';
  closeModal();
  alert(`تم إنشاء ${createdCount} طلب ودمج ${mergedCount} بند قائم من ${rows.length} مادة/أداة داخل الشواهد`);
}

function renderNeeds(){
  const rows=filteredNeeds().map(r=>{
    const source=['educational_evidence_v5_9','educational_evidence_v5_9_1'].includes(r.calculationSource)
      ? `<span class="badge badge-ok">مجمّع من الشواهد</span>`
      : `<span class="badge badge-info">يدوي</span>`;
    const stock=typeof r.stockAvailable!=='undefined' ? r.stockAvailable : '—';
    return [r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',source,`${r.year1Qty||0} / ${r.year2Qty||0}`,r.grossQty||'—',stock,r.qty,r.unit,r.evidenceCount||evidenceCountForNeed(r.id)||0,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)];
  });
  return `<div class="hero edu-need-page-hero">
    <div>
      <div class="hero-title">طلبات الاحتياج</div>
      <div class="hero-text">تجمع الصفحة الآن نفس الصنف من أكثر من شاهد أو مقرر تحت طلب واحد مفتوح، مع إظهار الرصيد والصافي النهائي بوحدة الطلب بعد التقريب للأعلى.</div>
    </div>
    ${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج محسوب</button>`:''}
  </div>
  <div class="toolbar">
    <div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div>
    <div class="toolbar-left"><button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div>
  </div>
  <div class="table-panel">
    <div class="table-head"><div class="panel-title">سجل الاحتياج المجمع</div><div class="panel-subtitle">البنود المحسوبة تجمع الكميات من الشواهد والمقررات المفتوحة في نفس الصنف، مع منع النزول عن الاحتياج الفعلي عبر التقريب للأعلى.</div></div>
    ${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','مصدر الحساب','الفصل 1 / الفصل 2','الإجمالي قبل الرصيد','الرصيد','الصافي المرفوع','الوحدة','عدد الشواهد','الحالة','الشواهد','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}
  </div>`;
}

function renderNeedEvidence(){
  const rows=visibleNeedEvidence().map(r=>[
    r.requestNo,
    r.college,
    r.mainDepartment||'القسم العام',
    r.section,
    r.itemNameAr||'—',
    r.courseName||'—',
    r.courseCode||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.groupsCount||'—',
    r.calculationMethod||eduNeedBasisLabel(r.consumptionBasis)||'—',
    r.usageUnit||r.unit||'—',
    r.requestUnit||r.unit||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    actorName(r.createdBy),
    `<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('evidenceEdit',${r.id})">تعديل</button></div>`
  ]);
  return `<div class="hero"><div class="hero-title">شواهد الاحتياج</div><div class="hero-text">كل شاهد يمثل تجربة، وداخله تسجل مواد وأدوات متعددة مع وحدة الشاهد ووحدة الطلب النهائية.</div></div>
  <div class="toolbar"><div class="toolbar-right"><input class="input search-input" placeholder="بحث..." value="${state.search}" oninput="setSearch(this.value,this)">${collegeFilterControl(false)}<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة شاهد يدوي</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل شواهد الاحتياج</div><div class="panel-subtitle">يعرض السجل أساس الحساب والتحويل بين وحدة الاستخدام ووحدة الطلب النهائي.</div></div>${table(['رقم الطلب','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقرر','رمز المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','المجموعات','طريقة الحساب','وحدة الشاهد','وحدة الطلب','الاحتياج المحول','المتاح','العجز','صاحب الإجراء','إجراء'],rows)}</div>`;
}
/* ===== end Educational Need Evidence Builder v5.9.1 ===== */

/* ===== Educational Need Engine bridge v5.9.2 ===== */
function eduNeedEngine(){
  if(typeof window!=='undefined' && window.NeedEngine) return window.NeedEngine;
  if(typeof NeedEngine!=='undefined') return NeedEngine;
  throw new Error('NeedEngine is not loaded. تأكد من تحميل need-engine.js قبل app.js');
}

function eduNeedDefaultRequestUnit(unit){
  return eduNeedEngine().defaultRequestUnit(unit);
}

function eduNeedCanonicalUnit(unit){
  return eduNeedEngine().canonicalUnit(unit);
}

function eduNeedUnitFamily(unit){
  return eduNeedEngine().unitFamily(unit);
}

function eduNeedUnitFactor(unit){
  return eduNeedEngine().unitFactor(unit);
}

function eduNeedConvertQty(qty,fromUnit,toUnit){
  return eduNeedEngine().convertQty(qty,fromUnit,toUnit);
}

function eduNeedRoundQty(value){
  return eduNeedEngine().roundQty(value);
}

function eduNeedRoundPreview(value){
  return eduNeedEngine().roundPreview(value);
}

function eduNeedNormalizeKey(value){
  return eduNeedEngine().normalizeKey(value);
}

function eduNeedBasisLabel(basis){
  return eduNeedEngine().basisLabel(basis);
}

function eduNeedCalcRow(row){
  return eduNeedEngine().calcMaterial(row);
}

function eduNeedAggregateRows(rows){
  const department=document.getElementById('need-mainDepartment')?.value||currentDepartmentName();
  const section=document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام');
  return eduNeedEngine().aggregateRows(rows,{mainDepartment:department,section});
}

function eduNeedFindMergeTarget(agg,ctx){
  return eduNeedEngine().findMergeTarget(agg,ctx,db.needsRequests||[]);
}
/* ===== end Educational Need Engine bridge v5.9.2 ===== */

/* ===== Official reports and visual report shell v6.0 ===== */
function officialReportText(value){
  return String(value??'—').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()||'—';
}

function officialReportScope(){
  if(isCentral()) return state.collegeFilter && state.collegeFilter!=='all' ? state.collegeFilter : 'جامعة طيبة';
  return state.currentUser?.college||'—';
}

function officialReportFilters(){
  const filters=[];
  if(state.search) filters.push(`البحث: ${state.search}`);
  if(state.collegeFilter && state.collegeFilter!=='all') filters.push(`القطاع: ${state.collegeFilter}`);
  if(state.sectionFilter && state.sectionFilter!=='all') filters.push(`القسم: ${state.sectionFilter}`);
  if(state.needStatusFilter && state.needStatusFilter!=='all') filters.push(`الحالة: ${statusText(state.needStatusFilter)}`);
  if(state.dateFrom) filters.push(`من: ${state.dateFrom}`);
  if(state.dateTo) filters.push(`إلى: ${state.dateTo}`);
  return filters.length?filters.join(' | '):'لا توجد فلاتر مخصصة';
}

function officialReportMeta(data){
  return [
    ['تاريخ الإنشاء',formatDateTime(nowLocalString())],
    ['مستخرج التقرير',state.currentUser?.fullName||'—'],
    ['النطاق',officialReportScope()],
    ['عدد السجلات',(data.rows||[]).length],
    ['الفلاتر',officialReportFilters()],
    ['مصدر البيانات','نظام إدارة التجهيزات والمخزون']
  ];
}

function officialReportHtml(data){
  const rows=data.rows||[];
  const meta=officialReportMeta(data);
  const summary=data.summary||[];
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${officialReportText(data.title)}</title><style>
    @page{size:A4 landscape;margin:11mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#182235;background:#fff;direction:rtl}
    .report{min-height:100vh}
    .head{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;border-bottom:4px solid #006b54;padding:0 0 14px;margin-bottom:14px}
    .kicker{font-size:12px;color:#667085;font-weight:800}
    h1{margin:4px 0 6px;color:#10233f;font-size:24px;line-height:1.5}
    .sub{color:#667085;font-size:13px;line-height:1.8}
    .mark{width:68px;height:68px;border-radius:16px;display:grid;place-items:center;background:#10233f;color:#fff;font-size:30px;font-weight:900;position:relative}
    .mark:after{content:"";position:absolute;bottom:9px;width:34px;height:4px;border-radius:999px;background:#0a8e6e}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}
    .meta div,.summary div{border:1px solid #dbe4ee;border-radius:10px;padding:8px 10px;background:#fbfdff;font-size:12px;line-height:1.7}
    .meta strong,.summary strong{display:block;color:#10233f;font-size:12px}
    .summary{display:grid;grid-template-columns:repeat(${Math.max(Math.min(summary.length,4),1)},1fr);gap:8px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;font-size:10.5px;page-break-inside:auto}
    tr{page-break-inside:avoid;page-break-after:auto}
    th,td{border:1px solid #cfd9e5;padding:6px 7px;text-align:right;vertical-align:top}
    th{background:#eef3f7;color:#10233f;font-weight:900}
    tbody tr:nth-child(even) td{background:#fbfdff}
    .foot{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:end}
    .sign{height:58px;border:1px solid #dbe4ee;border-radius:10px;padding:8px;color:#667085;font-size:11px}
    .note{font-size:10px;color:#667085;line-height:1.8;margin-top:8px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="report">
    <header class="head"><div><div class="kicker">جامعة طيبة | نظام إدارة التجهيزات والمخزون</div><h1>${officialReportText(data.title)}</h1><div class="sub">${officialReportText(data.subtitle||'تقرير رسمي مستخرج من بيانات النظام حسب الصلاحيات والفلاتر الحالية.')}</div></div><div class="mark">T</div></header>
    <section class="meta">${meta.map(([k,v])=>`<div><strong>${officialReportText(k)}</strong>${officialReportText(v)}</div>`).join('')}</section>
    ${summary.length?`<section class="summary">${summary.map(([k,v])=>`<div><strong>${officialReportText(k)}</strong>${officialReportText(v)}</div>`).join('')}</section>`:''}
    <table><thead><tr>${(data.headers||[]).map(h=>`<th>${officialReportText(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${officialReportText(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${(data.headers||[]).length||1}">لا توجد بيانات</td></tr>`}</tbody></table>
    <section class="foot"><div class="sign">إعداد</div><div class="sign">مراجعة</div><div class="sign">اعتماد</div></section>
    <div class="note">ملاحظة: يعتمد التقرير على البيانات المسجلة في النظام وقت الاستخراج. يرجى مراجعة الشواهد قبل الرفع للمنافسة أو الاعتماد النهائي.</div>
  </main></body></html>`;
}

function officialNeedsRows(){
  return filteredNeeds().map(r=>{
    const source=['educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2'].includes(r.calculationSource)?'محسوب من الشواهد':'يدوي';
    return [
      r.requestNo,
      r.erpCode||'—',
      r.college,
      r.mainDepartment||'القسم العام',
      r.section,
      r.itemNameAr||'—',
      r.itemNameEn||'—',
      source,
      Number(r.year1Qty||0),
      Number(r.year2Qty||0),
      Number(r.grossQty||r.qty||0),
      typeof r.stockAvailable!=='undefined'?r.stockAvailable:'—',
      Number(r.qty||0),
      r.unit||'—',
      r.evidenceCount||evidenceCountForNeed(r.id)||0,
      statusText(r.status),
      r.workflowStage||statusText(r.status),
      actorName(r.createdBy),
      actorName(r.reviewedBy)
    ];
  });
}

function officialNeedsSummary(){
  const rows=filteredNeeds();
  const calculated=rows.filter(r=>['educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2'].includes(r.calculationSource));
  const pending=rows.filter(r=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(r.status||'pending_sector_approval'));
  const approved=rows.filter(r=>r.status==='approved');
  const evidence=(db.needEvidence||[]).filter(e=>rows.some(r=>Number(r.id)===Number(e.needId)));
  return [
    ['إجمالي الطلبات',rows.length],
    ['طلبات محسوبة من الشواهد',calculated.length],
    ['طلبات قيد الإجراء',pending.length],
    ['طلبات معتمدة',approved.length],
    ['عدد الشواهد المرتبطة',evidence.length]
  ];
}

function officialNeedsReportData(){
  return {
    template:'official-needs',
    title:'تقرير طلبات الاحتياج المبنية على الشواهد',
    subtitle:'يعرض التقرير البنود المجمعة، مصدر الحساب، الرصيد، الصافي المرفوع، وحالة الاعتماد الحالية.',
    headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','مصدر الحساب','الفصل الأول','الفصل الثاني','الإجمالي قبل الرصيد','الرصيد','الصافي المرفوع','الوحدة','عدد الشواهد','الحالة','مسار الاعتماد','صاحب الإجراء','راجعه'],
    rows:officialNeedsRows(),
    summary:officialNeedsSummary()
  };
}

const __officialReportHtml=reportHtml;
reportHtml=function(data){
  if(data && data.template==='official-needs') return officialReportHtml(data);
  return officialReportHtml(data||{title:'تقرير',headers:[],rows:[]});
}

const __officialReportData=reportData;
reportData=function(){
  if(state.reportTab==='needs') return officialNeedsReportData();
  return __officialReportData();
}

printNeeds=function(){
  openPrint(officialNeedsReportData());
}

exportNeeds=function(){
  exportExcel(officialNeedsReportData(),'needs-official-report.xlsx');
}
/* ===== end Official reports and visual report shell v6.0 ===== */

/* ===== Deep UI and Excel polish v6.1 ===== */
function uiIcon(name){
  const icons={
    executive:'M4 19V5m0 14h16M8 17V9m4 8V7m4 10v-5',
    dashboard:'M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z',
    items:'M4 7l8-4 8 4-8 4-8-4Zm0 5l8 4 8-4M4 17l8 4 8-4',
    transactions:'M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3',
    exchange:'M8 7h10m0 0-3-3m3 3-3 3M16 17H6m0 0 3 3m-3-3 3-3',
    needs:'M6 4h9l3 3v13H6V4Zm9 0v4h4M9 13h6M9 17h4',
    needEvidence:'M5 5h7a4 4 0 0 1 4 4v10H8a3 3 0 0 1-3-3V5Zm4 5h5M9 14h4',
    equipment:'M5 6h14v10H5V6Zm4 14h6M12 16v4',
    reports:'M5 19V5h14v14H5Zm4-4h6M9 11h6M9 7h3',
    audit:'M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4Zm-3 9 2 2 4-5',
    users:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 9a6 6 0 0 0-12 0M17 11a3 3 0 1 0 0-6M20 20a5 5 0 0 0-4-4.8',
    org:'M4 19h16M6 19V9l6-4 6 4v10M9 19v-6h6v6',
    analyst:'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z'
  };
  const d=icons[name]||icons.dashboard;
  return `<span class="nav-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`;
}

const __polishedNavItems=navItems;
navItems=function(){
  return __polishedNavItems().map(item=>({...item,icon:uiIcon(item.id)}));
}

function filterControl(label,html,kind=''){
  return `<label class="filter-control ${kind}"><span>${label}</span>${html}</label>`;
}

filtersHtml=function(opts={}){
  if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
  const cfg={college:true,section:true,search:true,searchPlaceholder:'اسم، رقم، حالة...',forceCollege:false,txType:false,txStatus:false,needStatus:false,date:false,...opts};
  const controls=[];
  if(cfg.search) controls.push(filterControl('بحث',`<input class="input search-input" placeholder="${cfg.searchPlaceholder}" value="${state.search}" oninput="setSearch(this.value,this)">`,'filter-search'));
  if(cfg.college) controls.push(filterControl('القطاع',collegeFilterControl(!!cfg.forceCollege),'filter-college'));
  if(cfg.section) controls.push(filterControl('القسم',`<select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select>`,'filter-section'));
  if(cfg.txType && typeof txTypeFilterOptions==='function') controls.push(filterControl('نوع الحركة',`<select class="select" onchange="setTransactionTypeFilter(this.value)">${txTypeFilterOptions(state.transactionTypeFilter)}</select>`,'filter-status'));
  if(cfg.txStatus && typeof txStatusFilterOptions==='function') controls.push(filterControl('حالة الحركة',`<select class="select" onchange="setTransactionStatusFilter(this.value)">${txStatusFilterOptions(state.transactionStatusFilter)}</select>`,'filter-status'));
  if(cfg.needStatus && typeof needStatusFilterOptions==='function') controls.push(filterControl('حالة الاحتياج',`<select class="select" onchange="setNeedStatusFilter(this.value)">${needStatusFilterOptions(state.needStatusFilter)}</select>`,'filter-status'));
  if(cfg.date){
    controls.push(filterControl('من تاريخ',`<input class="input" type="date" value="${state.dateFrom||''}" onchange="setDateFrom(this.value)">`,'filter-date'));
    controls.push(filterControl('إلى تاريخ',`<input class="input" type="date" value="${state.dateTo||''}" onchange="setDateTo(this.value)">`,'filter-date'));
  }
  return `<div class="toolbar filter-toolbar"><div class="toolbar-right">${controls.join('')}</div><div class="toolbar-left"></div></div>`;
}

function excelCell(value){
  return cleanExcelCell ? (cleanExcelCell(value)||'—') : String(value??'—').replace(/<[^>]*>/g,'').trim();
}

function excelSetCellStyle(ws,addr,style){
  if(!ws[addr]) return;
  ws[addr].s={...(ws[addr].s||{}),...style};
}

function excelStyleSheet(ws,headerRowIndex,totalCols,totalRows){
  const titleStyle={font:{bold:true,sz:18,color:{rgb:'10233F'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2}};
  const subtitleStyle={font:{bold:true,sz:12,color:{rgb:'006B54'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2}};
  const metaStyle={font:{bold:true,color:{rgb:'344054'}},fill:{fgColor:{rgb:'F3F6F9'}},alignment:{horizontal:'right',vertical:'center',readingOrder:2,wrapText:true}};
  const headerStyle={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'10233F'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2,wrapText:true},border:{top:{style:'thin',color:{rgb:'D0D5DD'}},bottom:{style:'thin',color:{rgb:'D0D5DD'}},left:{style:'thin',color:{rgb:'D0D5DD'}},right:{style:'thin',color:{rgb:'D0D5DD'}}}};
  const bodyStyle={alignment:{horizontal:'right',vertical:'top',readingOrder:2,wrapText:true},border:{bottom:{style:'thin',color:{rgb:'EAECF0'}}}};
  ['A1','A2','A3'].forEach((a,idx)=>excelSetCellStyle(ws,a,idx===0?titleStyle:subtitleStyle));
  for(let r=4;r<headerRowIndex;r++){
    for(let c=0;c<Math.min(totalCols,6);c++){
      const addr=XLSX.utils.encode_cell({r:r-1,c});
      if(ws[addr]) excelSetCellStyle(ws,addr,metaStyle);
    }
  }
  for(let c=0;c<totalCols;c++){
    const addr=XLSX.utils.encode_cell({r:headerRowIndex-1,c});
    excelSetCellStyle(ws,addr,headerStyle);
  }
  for(let r=headerRowIndex;r<totalRows;r++){
    for(let c=0;c<totalCols;c++){
      const addr=XLSX.utils.encode_cell({r,c});
      excelSetCellStyle(ws,addr,bodyStyle);
    }
  }
  ws['!rows']=(ws['!rows']||[]);
  ws['!rows'][0]={hpt:26};
  ws['!rows'][1]={hpt:22};
  ws['!rows'][headerRowIndex-1]={hpt:26};
}

function makeExcelData(data){
  const headers=(data.headers||[]).map(excelCell);
  const rows=(data.rows||[]).map(r=>r.map(excelCell));
  const summary=data.summary||[];
  const meta=[
    ['جامعة طيبة'],
    ['نظام إدارة التجهيزات والمخزون'],
    [data.title||'تقرير'],
    [],
    ['تاريخ الإنشاء',formatDateTime(nowLocalString()),'مستخرج التقرير',state.currentUser?.fullName||'—'],
    ['النطاق',officialReportScope?officialReportScope():(isCentral()?'جامعة طيبة':state.currentUser.college),'عدد السجلات',rows.length],
    ['الفلاتر',officialReportFilters?officialReportFilters():'لا توجد فلاتر مخصصة']
  ];
  const summaryRows=summary.length?[[],['ملخص التقرير'],...summary.map(([k,v])=>[k,v])]:[];
  const aoa=[...meta,...summaryRows,[],headers,...rows];
  const headerRow=meta.length+summaryRows.length+2;
  return {aoa,headers,rows,headerRow};
}

exportExcel=function(data,filename){
  if(typeof XLSX==='undefined') return alert('مكتبة Excel غير محملة. تأكد من الاتصال بالإنترنت.');
  const prepared=makeExcelData(data||{title:'تقرير',headers:[],rows:[]});
  const ws=XLSX.utils.aoa_to_sheet(prepared.aoa);
  const totalCols=Math.max(prepared.headers.length,4);
  const totalRows=prepared.aoa.length;
  const lastCol=Math.max(totalCols-1,1);
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:lastCol}},
    {s:{r:1,c:0},e:{r:1,c:lastCol}},
    {s:{r:2,c:0},e:{r:2,c:lastCol}},
    {s:{r:6,c:1},e:{r:6,c:lastCol}}
  ];
  if((data.summary||[]).length){
    const summaryTitleRow=8;
    ws['!merges'].push({s:{r:summaryTitleRow,c:0},e:{r:summaryTitleRow,c:lastCol}});
  }
  const widths=prepared.headers.map((h,idx)=>({
    wch:Math.min(Math.max(String(h).length+5,...prepared.rows.map(r=>String(r[idx]||'').length+3),14),42)
  }));
  ws['!cols']=widths.length?widths:[{wch:24},{wch:24},{wch:24},{wch:24}];
  ws['!sheetViews']=[{rightToLeft:true,showGridLines:false}];
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:prepared.headerRow-1,c:0},e:{r:Math.max(totalRows-1,prepared.headerRow-1),c:lastCol}})};
  ws['!freeze']={xSplit:0,ySplit:prepared.headerRow,topLeftCell:`A${prepared.headerRow+1}`,activePane:'bottomRight',state:'frozen'};
  ws['!margins']={left:.25,right:.25,top:.55,bottom:.55,header:.2,footer:.2};
  ws['!pageSetup']={orientation:'landscape',fitToWidth:1,fitToHeight:0};
  excelStyleSheet(ws,prepared.headerRow,totalCols,totalRows);
  const wb=XLSX.utils.book_new();
  wb.Workbook={Views:[{RTL:true}],WBProps:{date1904:false}};
  wb.Props={Title:excelCell(data.title||'تقرير'),Subject:'تقرير من نظام إدارة التجهيزات والمخزون',Author:state.currentUser?.fullName||'جامعة طيبة',Company:'جامعة طيبة'};
  XLSX.utils.book_append_sheet(wb,ws,excelSheetName(data.title||'تقرير'));
  XLSX.writeFile(wb,filename||'taibah-report.xlsx',{compression:true,cellStyles:true});
}

exportNeedsDetailedExact=function(){
  if(typeof XLSX==='undefined') return alert('مكتبة Excel غير محملة. تأكد من الاتصال بالإنترنت.');
  const data=detailedNeedsTemplateData();
  const aoa=[
    ['جامعة طيبة'],
    ['نظام إدارة التجهيزات والمخزون'],
    ['جدول الكميات المعتمد للاحتياج'],
    [],
    ['القطاع',officialReportScope?officialReportScope():(isCentral()?'جامعة طيبة':state.currentUser.college),'تاريخ الإنشاء',formatDateTime(nowLocalString())],
    ['عدد البنود',data.rows.length,'الفلاتر',officialReportFilters?officialReportFilters():'لا توجد فلاتر مخصصة'],
    [],
    data.headers,
    data.subHeaders,
    ...data.rows
  ];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  const lastCol=data.headers.length-1;
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:lastCol}},
    {s:{r:1,c:0},e:{r:1,c:lastCol}},
    {s:{r:2,c:0},e:{r:2,c:lastCol}},
    ...data.headers.map((h,idx)=>idx<11?{s:{r:7,c:idx},e:{r:8,c:idx}}:null).filter(Boolean)
  ];
  ws['!cols']=[20,28,16,34,36,22,18,20,34,22,34,14,14,14].map(wch=>({wch}));
  ws['!sheetViews']=[{rightToLeft:true,showGridLines:false}];
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:7,c:0},e:{r:Math.max(9+data.rows.length,9),c:lastCol}})};
  ws['!freeze']={xSplit:0,ySplit:9,topLeftCell:'A10',activePane:'bottomRight',state:'frozen'};
  excelStyleSheet(ws,8,data.headers.length,aoa.length);
  const wb=XLSX.utils.book_new();
  wb.Workbook={Views:[{RTL:true}],WBProps:{date1904:false}};
  wb.Props={Title:'جدول الكميات المعتمد للاحتياج',Author:state.currentUser?.fullName||'جامعة طيبة',Company:'جامعة طيبة'};
  XLSX.utils.book_append_sheet(wb,ws,'جدول الكميات');
  XLSX.writeFile(wb,'needs-detailed-template.xlsx',{compression:true,cellStyles:true});
}

const __polishedRenderReports=renderReports;
renderReports=function(){
  ensureExtendedReportState && ensureExtendedReportState();
  const tabs=availableReportTabs();
  if(!tabs.length) return `<div class="panel"><div class="panel-title">التقارير</div><div class="panel-subtitle">لم يتم منح هذا الحساب أي نوع من أنواع التقارير.</div></div>`;
  if(!tabs.some(t=>t[0]===state.reportTab)) state.reportTab=tabs[0][0];
  const txFilters=state.reportTab==='transactions';
  const needFilters=state.reportTab==='needs';
  return `<div class="panel report-landing"><div class="panel-title">مركز التقارير</div><div class="panel-subtitle">تقارير رسمية باتجاه يمين إلى يسار، مع فلاتر واضحة وتصدير Excel محسّن وجاهز للمراجعة.</div></div>
  <div class="report-tabs">${tabs.map(([id,l])=>`<button class="report-tab ${state.reportTab===id?'active':''}" onclick="state.reportTab='${id}';render()">${l}</button>`).join('')}</div>
  ${filtersHtml({txType:txFilters,txStatus:txFilters,needStatus:needFilters,date:true})}
  <div class="report-actions"><button class="btn btn-primary" onclick="printCurrentReport()">استخراج PDF</button><button class="btn btn-secondary" onclick="exportCurrentExcel()">استخراج Excel</button></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">معاينة التقرير</div><div class="panel-subtitle">المعاينة تعكس الفلاتر الحالية قبل التصدير.</div></div>${reportPreviewTable()}</div>`;
}

const __polishedRenderNeeds=renderNeeds;
renderNeeds=function(){
  const rows=filteredNeeds().map(r=>{
    const source=['educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2'].includes(r.calculationSource)
      ? `<span class="badge badge-ok">مجمّع من الشواهد</span>`
      : `<span class="badge badge-info">يدوي</span>`;
    const stock=typeof r.stockAvailable!=='undefined' ? r.stockAvailable : '—';
    return [r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',source,`${r.year1Qty||0} / ${r.year2Qty||0}`,r.grossQty||'—',stock,r.qty,r.unit,r.evidenceCount||evidenceCountForNeed(r.id)||0,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)];
  });
  return `<div class="hero edu-need-page-hero">
    <div><div class="hero-title">طلبات الاحتياج</div><div class="hero-text">تجميع البنود من الشواهد والمقررات المفتوحة، مع إظهار الرصيد والصافي النهائي بوحدة الطلب بعد التقريب للأعلى.</div></div>
    ${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج محسوب</button>`:''}
  </div>
  ${filtersHtml({needStatus:true,date:true})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left"><button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل الاحتياج المجمع</div><div class="panel-subtitle">البنود المحسوبة تجمع الكميات من الشواهد والمقررات المفتوحة في نفس الصنف.</div></div>
  ${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','مصدر الحساب','الفصل 1 / الفصل 2','الإجمالي قبل الرصيد','الرصيد','الصافي المرفوع','الوحدة','عدد الشواهد','الحالة','الشواهد','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}</div>`;
}

renderTransactions=function(){
  ensureExtendedReportState && ensureExtendedReportState();
  const rows=visibleTransactions().map(t=>{
    const i=getItemById(t.itemId);
    return [t.type==='receive'?'<span class="badge badge-ok">إدخال</span>':'<span class="badge badge-low">طلب صرف</span>',t.college,t.mainDepartment||'القسم العام',t.section,itemName(i),t.qty,t.unit,t.type==='issue'?statusBadge(t.status):'<span class="badge badge-ok">مكتمل</span>',formatDateTime(t.transactionAt),actorName(t.createdBy),transactionActions(t)];
  });
  return `${filtersHtml({txType:true,txStatus:true,date:true})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('add_issue')?`<button class="btn btn-warning" onclick="openModal('transaction',null,'issue')">+ طلب صرف</button>`:''}</div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجلات الصرف والحركات</div><div class="panel-subtitle">فلاتر مضغوطة للبحث، القطاع، القسم، النوع، الحالة، والفترة الزمنية.</div></div>${table(['النوع','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','الكمية','الوحدة','الحالة','التاريخ','صاحب الإجراء','إجراء'],rows)}</div>`;
}

renderItems=function(){
  const rows=visibleItems().map(i=>[
    i.college,
    i.mainDepartment||'القسم العام',
    i.code,
    itemName(i),
    i.nameEn||'—',
    i.section,
    i.unit,
    i.qty,
    i.minQty,
    i.location||'—',
    i.serialNumber||'—',
    i.section==='الأجهزة التعليمية'?(i.deviceStatus||'يعمل'):(i.qty<=i.minQty?'<span class="badge badge-low">منخفض</span>':'<span class="badge badge-ok">متوفر</span>'),
    itemActionButtons(i)
  ]);
  return `${filtersHtml({searchPlaceholder:'بحث باسم الصنف، الرمز، الموقع...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('add_item')?`<button class="btn btn-primary" onclick="openModal('item')">+ إضافة صنف</button>`:''}${hasPermission('add_item')?`<button class="btn btn-secondary" onclick="openModal('importItems')">استيراد Excel</button>`:''}</div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">الأصناف والمخزون</div><div class="panel-subtitle">فلاتر موحدة للقطاع والقسم والبحث، مع بقاء إجراءات الإضافة والاستيراد في شريط مستقل.</div></div>${table(['القطاع','القسم الرئيسي','الرمز','العربي','English','القسم الفرعي','الوحدة','الكمية','الحد الأدنى','الموقع','التسلسلي','الحالة','إجراءات'],rows)}</div>`;
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
  return `<div class="hero"><div class="hero-title">طلب الدعم بين القطاعات</div><div class="hero-text">ابحث عن الصنف ثم أنشئ طلب الدعم من الجهة المالكة مع معرفة الكمية والموقع.</div></div>
  ${filtersHtml({forceCollege:true,searchPlaceholder:'ابحث باسم الصنف أو الرمز...'})}
  <div class="table-panel"><div class="table-head"><div class="panel-title">نتائج البحث عن الصنف</div><div class="panel-subtitle">${String(state.search||'').trim()?`عدد النتائج: ${results.length}`:'ابدأ بكتابة اسم الصنف أو الرمز ليتم عرض الجهات المالكة والكمية المتاحة.'}</div></div>${table(['الصنف','English','القطاع المالك','القسم الرئيسي','القسم الفرعي','المتاح','الوحدة','الموقع','إجراء'],resultRows)}</div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">طلبات الدعم بين القطاعات</div></div>${table(['رقم الطلب','نوع الطلب','الصنف','الجهة الطالبة','الجهة المالكة','الكمية','الوحدة','الحالة','مسار الاعتماد','تاريخ الطلب','إجراء'],reqRows)}</div>`;
}

visibleNeedEvidence=function(){
  if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
  let rows=db.needEvidence||[];
  if(!isCentral()) rows=rows.filter(r=>r.college===state.currentUser.college);
  if(hasDepartmentScope()) rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department);
  if(state.collegeFilter!=='all') rows=rows.filter(r=>r.college===state.collegeFilter);
  if(state.sectionFilter!=='all') rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter);
  if(typeof rowObjectWithinDateRange==='function') rows=rows.filter(r=>rowObjectWithinDateRange(r,['createdAt','updatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[r.requestNo,r.college,r.mainDepartment,r.section,r.itemNameAr,r.itemNameEn,r.courseName,r.courseCode,r.experimentName,r.academicYear,r.semester,r.justification,r.recommendation,r.notes].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}

renderNeedEvidence=function(){
  const rows=visibleNeedEvidence().map(r=>[
    r.requestNo,
    r.college,
    r.mainDepartment||'القسم العام',
    r.section,
    r.itemNameAr||'—',
    r.courseName||'—',
    r.courseCode||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.groupsCount||'—',
    r.calculationMethod||eduNeedBasisLabel(r.consumptionBasis)||'—',
    r.usageUnit||r.unit||'—',
    r.requestUnit||r.unit||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    actorName(r.createdBy),
    `<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('evidenceEdit',${r.id})">تعديل</button></div>`
  ]);
  return `<div class="hero"><div class="hero-title">شواهد الاحتياج</div><div class="hero-text">كل شاهد يمثل تجربة، وداخله تسجل مواد وأدوات متعددة مع وحدة الشاهد ووحدة الطلب النهائية.</div></div>
  ${filtersHtml({date:true,searchPlaceholder:'بحث بالمقرر، التجربة، الصنف...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة شاهد يدوي</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل شواهد الاحتياج</div><div class="panel-subtitle">فلاتر موحدة مع دعم الفترة الزمنية حسب تاريخ إنشاء الشاهد.</div></div>${table(['رقم الطلب','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقرر','رمز المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','المجموعات','طريقة الحساب','وحدة الشاهد','وحدة الطلب','الاحتياج المحول','المتاح','العجز','صاحب الإجراء','إجراء'],rows)}</div>`;
}

renderAudit=function(){
  if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
  const rows=visibleAuditLogs().map(r=>[formatDateTime(r.createdAt),actorName(r.createdBy),r.action,r.targetType,r.targetId,r.college,r.department,r.details]);
  return `<div class="hero"><div class="hero-title">سجل التدقيق والعمليات</div><div class="hero-text">سجل الحوكمة يعرض صاحب الإجراء ونوعه وتوقيته والجهة المرتبطة به.</div></div>
  ${filtersHtml({forceCollege:true,date:true,searchPlaceholder:'بحث بالإجراء، المرجع، الجهة...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left"><button class="btn btn-primary" onclick="printAuditReport()">تقرير PDF</button><button class="btn btn-secondary" onclick="exportAuditExcel()">تقرير Excel</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">آخر العمليات</div></div>${table(['التاريخ','صاحب الإجراء','الإجراء','النوع','المرجع','القطاع','القسم','التفاصيل'],rows)}</div>`;
}
/* ===== end Deep UI and Excel polish v6.1 ===== */

/* ===== Educational References workflow v6.2 ===== */
function learningCalculatedSources(){
  return ['educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2','educational_reference_v6_2'];
}

function isLearningReference(row){
  return row && row.referenceType==='educational_reference';
}

function isLearningReferenceReady(row){
  return isLearningReference(row) && !['generated','covered_by_stock','archived'].includes(row.referenceStatus||'ready');
}

function isCalculatedNeedSource(source){
  return learningCalculatedSources().includes(source);
}

function learningReferenceStatusBadge(row){
  const status=row.referenceStatus||'ready';
  if(status==='generated') return '<span class="badge badge-ok">تم توليد احتياج</span>';
  if(status==='covered_by_stock') return '<span class="badge badge-info">مغطى بالمخزون</span>';
  if(isLearningReference(row)) return '<span class="badge badge-warning">جاهز للمراجعة</span>';
  return '<span class="badge badge-info">مرتبط بطلب قديم</span>';
}

function learningTextList(values){
  return [...new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean))].join('، ');
}

function learningAppendText(oldValue,newValue){
  return learningTextList([...(String(oldValue||'').split('، ')),newValue]);
}

function learningReferenceNumber(row){
  return row.referenceNo||row.requestNo||'—';
}

if(typeof PERMISSIONS!=='undefined'){
  const viewRef=PERMISSIONS.find(p=>p.key==='view_need_evidence');
  const createRef=PERMISSIONS.find(p=>p.key==='create_need_evidence');
  if(viewRef) viewRef.label='عرض المراجع التعليمية';
  if(createRef) createRef.label='إضافة وتعديل المراجع التعليمية';
}

const __learningNavItems=navItems;
navItems=function(){
  return __learningNavItems().map(item=>item.id==='needEvidence'?{...item,label:'المراجع التعليمية'}:item);
}

const __learningGetPageTitle=getPageTitle;
getPageTitle=function(){
  if(state.currentPage==='needEvidence') return 'المراجع التعليمية';
  return __learningGetPageTitle();
}

function learningReferenceRowsBase(){
  if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
  let rows=db.needEvidence||[];
  if(!isCentral()) rows=rows.filter(r=>r.college===state.currentUser.college);
  if(hasDepartmentScope()) rows=rows.filter(r=>(r.mainDepartment||'القسم العام')===state.currentUser.department);
  if(state.collegeFilter!=='all') rows=rows.filter(r=>r.college===state.collegeFilter);
  if(state.sectionFilter!=='all') rows=rows.filter(r=>r.section===state.sectionFilter || (r.mainDepartment||'')===state.sectionFilter);
  if(typeof rowObjectWithinDateRange==='function') rows=rows.filter(r=>rowObjectWithinDateRange(r,['createdAt','updatedAt','generatedAt']));
  if(state.search){
    const q=state.search.trim();
    rows=rows.filter(r=>[learningReferenceNumber(r),r.requestNo,r.college,r.mainDepartment,r.section,r.itemNameAr,r.itemNameEn,r.courseName,r.courseCode,r.experimentName,r.academicYear,r.semester,r.justification,r.recommendation,r.notes].join(' ').includes(q));
  }
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}

visibleNeedEvidence=function(){
  return learningReferenceRowsBase();
}

function learningReferencesForGeneration(){
  return learningReferenceRowsBase().filter(isLearningReferenceReady);
}

function learningReferenceToEngineRow(ref){
  const students=Number(ref.studentsCount||0);
  const sections=Number(ref.sectionsCount||0);
  const maleSections=Number(ref.maleSections||sections||0);
  const malePerSection=Number(ref.malePerSection||ref.maleStudents||(sections?Math.ceil(students/Math.max(sections,1)):students)||0);
  return {
    _refId:ref.id,
    referenceNo:learningReferenceNumber(ref),
    courseName:ref.courseName||'',
    courseCode:ref.courseCode||'',
    academicYear:ref.academicYear||'',
    experimentName:ref.experimentName||'تجربة غير مسماة',
    semester:ref.semester||'الأول',
    repeats:Number(ref.repeats||ref.usesCount||1),
    maleSections,
    malePerSection,
    femaleSections:Number(ref.femaleSections||0),
    femalePerSection:Number(ref.femalePerSection||0),
    groupSize:Number(ref.groupSize||1),
    itemNameAr:ref.itemNameAr||'',
    itemNameEn:ref.itemNameEn||'',
    usageUnit:ref.calculationUsageUnit||ref.usageUnit||ref.unit||'عدد',
    requestUnit:ref.requestUnit||ref.unit||'عدد',
    unit:ref.requestUnit||ref.unit||'عدد',
    basis:ref.consumptionBasis||ref.basis||'per_student',
    qtyPerUse:Number(ref.qtyPerUse||ref.qtyPerStudent||0),
    wastePercent:Number(ref.wastePercent||0),
    stockAvailable:Number(ref.stockAvailable||0)
  };
}

function learningAppliesFirst(semester){
  return ['الأول','كلاهما','both','first'].includes(semester);
}

function learningAppliesSecond(semester){
  return ['الثاني','كلاهما','both','second'].includes(semester);
}

function learningValidCalc(row){
  return Boolean(row.itemNameAr||row.itemNameEn) &&
    Number(row.qtyPerUse||0)>0 &&
    (Number(row.students||0)>0 || Number(row.sections||0)>0 || row.basis==='per_experiment' || row.basis==='reusable');
}

function learningAggregateRows(refs,scope){
  const engine=eduNeedEngine();
  const map=new Map();
  (refs||[]).map(ref=>{
    const source=learningReferenceToEngineRow(ref);
    return {...engine.calcMaterial(source),_refId:source._refId,referenceNo:source.referenceNo,courseName:source.courseName,courseCode:source.courseCode,academicYear:source.academicYear};
  }).filter(learningValidCalc).forEach(row=>{
    const key=[
      engine.normalizeKey(row.itemNameAr||row.itemNameEn),
      engine.normalizeKey(row.requestUnit),
      engine.normalizeKey(scope.mainDepartment||'القسم العام'),
      engine.normalizeKey(scope.section||'القسم العام')
    ].join('|');
    if(!map.has(key)){
      map.set(key,{
        key,
        ctx:scope,
        mainDepartment:scope.mainDepartment,
        section:scope.section,
        itemNameAr:row.itemNameAr,
        itemNameEn:row.itemNameEn,
        unit:row.requestUnit,
        requestUnit:row.requestUnit,
        usageUnits:new Set(),
        term1Gross:0,
        term2Gross:0,
        stockAvailable:0,
        evidenceRows:[],
        experiments:new Set(),
        sourceRefIds:new Set(),
        courses:new Set(),
        courseCodes:new Set(),
        academicYears:new Set()
      });
    }
    const agg=map.get(key);
    if(row.itemNameAr && !agg.itemNameAr) agg.itemNameAr=row.itemNameAr;
    if(row.itemNameEn && !agg.itemNameEn) agg.itemNameEn=row.itemNameEn;
    if(learningAppliesFirst(row.semester)) agg.term1Gross+=row.grossNeed;
    if(learningAppliesSecond(row.semester)) agg.term2Gross+=row.grossNeed;
    agg.stockAvailable=Math.max(agg.stockAvailable,row.stockAvailable||0);
    agg.evidenceRows.push(row);
    agg.experiments.add(row.experimentName);
    agg.usageUnits.add(row.usageUnit);
    agg.sourceRefIds.add(row._refId);
    if(row.courseName) agg.courses.add(row.courseName);
    if(row.courseCode) agg.courseCodes.add(row.courseCode);
    if(row.academicYear) agg.academicYears.add(row.academicYear);
  });
  return [...map.values()].map(agg=>{
    let remainingStock=agg.stockAvailable;
    const term1NetRaw=Math.max(agg.term1Gross-remainingStock,0);
    remainingStock=Math.max(remainingStock-agg.term1Gross,0);
    const term2NetRaw=Math.max(agg.term2Gross-remainingStock,0);
    agg.term1Net=engine.roundQty(term1NetRaw);
    agg.term2Net=engine.roundQty(term2NetRaw);
    agg.grossTotal=engine.roundPreview(agg.term1Gross+agg.term2Gross);
    agg.netTotal=engine.roundQty(agg.term1Net+agg.term2Net);
    return agg;
  });
}

function learningReferenceGroups(refs){
  const groups=new Map();
  (refs||[]).forEach(ref=>{
    const key=[ref.college,ref.mainDepartment||'القسم العام',ref.section||'القسم العام'].join('|');
    if(!groups.has(key)){
      groups.set(key,{college:ref.college,mainDepartment:ref.mainDepartment||'القسم العام',section:ref.section||'القسم العام',refs:[]});
    }
    groups.get(key).refs.push(ref);
  });
  return [...groups.values()];
}

function learningReferenceAggregates(refs){
  return learningReferenceGroups(refs).flatMap(group=>learningAggregateRows(group.refs,group));
}

function findLearningMergeTarget(agg,ctx){
  const engine=eduNeedEngine();
  return (db.needsRequests||[]).find(req=>{
    if(['approved','rejected'].includes(req.status)) return false;
    if(!isCalculatedNeedSource(req.calculationSource)) return false;
    const sameScope=req.college===ctx.college &&
      (req.mainDepartment||'القسم العام')===(ctx.mainDepartment||'القسم العام') &&
      req.section===ctx.section;
    const sameUnit=engine.canonicalUnit(req.unit)===engine.canonicalUnit(agg.unit);
    const sameItem=engine.normalizeKey(req.itemNameAr||req.itemNameEn)===engine.normalizeKey(agg.itemNameAr||agg.itemNameEn);
    return sameScope && sameUnit && sameItem;
  });
}

function learningReferenceSummary(agg){
  const experiments=[...agg.experiments].filter(Boolean).join('، ')||'تجارب غير مسماة';
  const usageUnits=[...agg.usageUnits].filter(Boolean).join('، ')||agg.unit;
  const totalStudents=agg.evidenceRows.reduce((sum,row)=>sum+Number(row.students||0),0);
  const totalSections=agg.evidenceRows.reduce((sum,row)=>sum+Number(row.sections||0),0);
  return `احتياج مولد من المراجع التعليمية: ${experiments}. إجمالي الطلاب ${totalStudents}، وعدد الشعب ${totalSections}. تم تحويل وحدات الاستخدام (${usageUnits}) إلى وحدة الطلب النهائية (${agg.unit})، وخصم الرصيد ${eduNeedRoundPreview(agg.stockAvailable)} ${agg.unit} ثم تقريب الصافي للأعلى إلى ${agg.netTotal} ${agg.unit}.`;
}

function learningReferencesPreviewHtml(refs){
  const aggregates=learningReferenceAggregates(refs);
  const rows=aggregates.map(agg=>[
    agg.ctx.college,
    agg.ctx.mainDepartment,
    agg.ctx.section,
    agg.itemNameAr||agg.itemNameEn||'—',
    learningTextList([...agg.courses])||'—',
    eduNeedRoundPreview(agg.term1Gross),
    eduNeedRoundPreview(agg.term2Gross),
    eduNeedRoundPreview(agg.stockAvailable),
    agg.netTotal>0?`<span class="badge badge-ok">${agg.netTotal} ${agg.unit}</span>`:'<span class="badge badge-info">مغطى بالمخزون</span>',
    agg.sourceRefIds.size
  ]);
  return `<div class="table-panel"><div class="table-head"><div class="panel-title">معاينة الاحتياج المتوقع</div><div class="panel-subtitle">المعاينة تجمع المراجع التعليمية الجاهزة حسب القطاع والقسم والصنف ووحدة الطلب.</div></div>${table(['القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقررات','الفصل الأول','الفصل الثاني','الرصيد','الصافي','عدد المراجع'],rows)}</div>`;
}

function educationalReferenceModalHtml(){
  const currentCollege=eduNeedCurrentCollege();
  const currentDepartment=(!isCentral()&&hasDepartmentScope()) ? state.currentUser.department : currentDepartmentName();
  const year=new Date().getFullYear();
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)">
    <div class="modal modal-xl edu-need-modal">
      <div class="modal-header">
        <div><div class="panel-title">إدخال مرجع تعليمي</div><div class="panel-subtitle">هذه البيانات لا ترفع احتياجًا رسميًا. هي مرجع تعليمي يراجعه مسؤول القطاع لاحقًا لتوليد الاحتياج.</div></div>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button>
      </div>
      <div class="modal-body">
        <div class="edu-need-intro">
          <div><div class="hero-title">بيانات المقرر والتجارب</div><div class="small">مسؤول المقرر يسجل المقرر، الشعب، التجارب، والمواد المستخدمة. مسؤول القطاع سيولد الاحتياج الرسمي من هذه المراجع عند اكتمالها.</div></div>
          <button type="button" class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        </div>
        <div class="form-grid edu-need-master">
          <div><label class="label">العام الدراسي</label><input id="need-academicYear" class="input" value="${year}-${year+1}"></div>
          <div><label class="label">القطاع</label>${eduNeedCollegeControl(currentCollege)}</div>
          <div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="need-mainDepartment" class="input" value="${eduNeedEscape(state.currentUser.department)}" readonly>`:`<select id="need-mainDepartment" class="select">${departmentOptions(currentDepartment,false)}</select>`}</div>
          <div><label class="label">القسم الفرعي / الفئة</label><select id="need-section" class="select">${sectionOptions((typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام'),false)}</select></div>
          <div><label class="label">المستوى</label><input id="need-level" class="input" placeholder="مثال: المستوى الثالث"></div>
          <div><label class="label">اسم المقرر</label><input id="need-courseName" class="input" placeholder="مثال: الكيمياء التحليلية"></div>
          <div><label class="label">رمز المقرر</label><input id="need-courseCode" class="input" placeholder="CHEM 201"></div>
          <div class="full"><label class="label">ملاحظات المرجع</label><textarea id="need-notes" class="textarea" placeholder="أي ملاحظات تعليمية أو تشغيلية"></textarea></div>
        </div>
        <div class="edu-need-section-head">
          <div><div class="panel-title">التجارب والمواد</div><div class="panel-subtitle">أضف تجربة جديدة عند اختلاف التجربة، وداخلها أضف كل المواد والأدوات المستخدمة.</div></div>
          <button type="button" class="btn btn-primary" onclick="addEduNeedRow()">+ إضافة تجربة</button>
        </div>
        <div id="edu-need-rows" class="edu-need-rows">${eduNeedRowHtml(0)}</div>
        <div id="edu-need-preview" class="edu-need-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-secondary" onclick="renderEduNeedPreview()">حساب مبدئي</button>
        <button class="btn btn-primary" onclick="saveLearningReferences()">حفظ المرجع التعليمي</button>
      </div>
    </div>
  </div>`;
}

needEvidenceModalHtml=function(){
  return educationalReferenceModalHtml();
}

function saveLearningReferences(){
  if(!hasPermission('create_need_evidence')) return alert('لا تملك صلاحية إضافة المراجع التعليمية');
  db.needEvidence=db.needEvidence||[];
  const rawRows=eduNeedReadRows();
  const ctx={
    academicYear:(document.getElementById('need-academicYear')?.value||'').trim(),
    college:document.getElementById('need-college')?.value||eduNeedCurrentCollege(),
    mainDepartment:document.getElementById('need-mainDepartment')?.value||currentDepartmentName(),
    section:document.getElementById('need-section')?.value||(typeof SECTION_OPTIONS!=='undefined'?SECTION_OPTIONS[0]:'القسم العام'),
    level:(document.getElementById('need-level')?.value||'').trim(),
    courseName:(document.getElementById('need-courseName')?.value||'').trim()||'مقرر غير محدد',
    courseCode:(document.getElementById('need-courseCode')?.value||'').trim()||'غير محدد',
    notes:(document.getElementById('need-notes')?.value||'').trim(),
    createdAt:nowLocalString(),
    createdBy:state.currentUser.id,
    batchId:`REFB-${Date.now()}`
  };
  const rows=rawRows.map(row=>({raw:row,calc:eduNeedEngine().calcMaterial(row)})).filter(x=>learningValidCalc(x.calc));
  if(!rows.length) return alert('أدخل تجربة ومادة واحدة على الأقل مع بيانات الطلاب أو الشعب والكمية المستخدمة');
  rows.forEach(({raw,calc})=>{
    const referenceNo=nextNo('ER',db.needEvidence);
    const ev={
      id:nextId(db.needEvidence),
      referenceNo,
      requestNo:referenceNo,
      referenceType:'educational_reference',
      referenceStatus:'ready',
      needId:null,
      generatedNeedId:null,
      college:ctx.college,
      mainDepartment:ctx.mainDepartment,
      section:ctx.section,
      itemNameAr:calc.itemNameAr,
      itemNameEn:calc.itemNameEn,
      unit:calc.requestUnit,
      usageUnit:raw.displayUsageUnit||calc.usageUnit,
      calculationUsageUnit:raw.calculationUsageUnit||calc.usageUnit,
      requestUnit:calc.requestUnit,
      academicYear:ctx.academicYear,
      level:ctx.level,
      courseName:ctx.courseName,
      courseCode:ctx.courseCode,
      experimentName:calc.experimentName,
      semester:calc.semester,
      sectionsCount:calc.sections,
      studentsCount:calc.students,
      maleSections:calc.maleSections,
      malePerSection:calc.malePerSection,
      femaleSections:calc.femaleSections,
      femalePerSection:calc.femalePerSection,
      groupSize:calc.groupSize,
      groupsCount:calc.groups,
      usesCount:calc.effectiveRepeats,
      repeats:calc.repeats,
      consumptionBasis:calc.basis,
      calculationMethod:eduNeedBasisLabel(calc.basis),
      qtyPerUse:calc.qtyPerUse,
      displayQtyPerUse:raw.displayQtyPerUse||calc.qtyPerUse,
      packSize:raw.packSize||0,
      wastePercent:calc.wastePercent,
      stockAvailable:calc.stockAvailable,
      estimatedNeed:eduNeedRoundPreview(calc.grossNeed),
      grossNeed:eduNeedRoundPreview(calc.grossNeed),
      grossNeedUsage:eduNeedRoundPreview(calc.grossNeedUsage),
      deficit:eduNeedRoundQty(Math.max(calc.grossNeed-calc.stockAvailable,0)),
      batchId:ctx.batchId,
      justification:`مرجع تعليمي للمقرر ${ctx.courseName}: ${eduNeedBasisLabel(calc.basis)} × ${calc.qtyPerUse} ${calc.usageUnit} في تجربة ${calc.experimentName}.`,
      recommendation:'جاهز لمراجعة مسؤول القطاع وتوليد الاحتياج عند الحاجة.',
      notes:ctx.notes,
      createdAt:ctx.createdAt,
      createdBy:ctx.createdBy
    };
    db.needEvidence.unshift(ev);
    auditLog('إضافة مرجع تعليمي','educationReference',referenceNo,`${ctx.courseName} - ${calc.experimentName} - ${calc.itemNameAr||calc.itemNameEn}`,ctx.college,ctx.mainDepartment);
  });
  saveDb();
  state.currentPage='needEvidence';
  closeModal();
  alert(`تم حفظ ${rows.length} مرجع تعليمي. يمكن لمسؤول القطاع توليد الاحتياج منها لاحقًا.`);
}

saveNeedEvidence=function(){
  return saveLearningReferences();
}

function needFromReferencesModalHtml(){
  const refs=learningReferencesForGeneration();
  const preview=refs.length?learningReferencesPreviewHtml(refs):'<div class="panel"><div class="panel-title">لا توجد مراجع جاهزة</div><div class="panel-subtitle">أدخل المراجع التعليمية أولًا أو عدّل الفلاتر الحالية.</div></div>';
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)">
    <div class="modal modal-xl">
      <div class="modal-header">
        <div><div class="panel-title">توليد احتياج من المراجع التعليمية</div><div class="panel-subtitle">راجع التجميع قبل إنشاء طلبات الاحتياج الرسمية. سيتم تجاهل المراجع المغطاة بالكامل بالمخزون.</div></div>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button>
      </div>
      <div class="modal-body">${preview}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="generateNeedsFromLearningReferences()" ${refs.length?'':'disabled'}>توليد طلبات الاحتياج</button>
      </div>
    </div>
  </div>`;
}

function markLearningReferences(ids,status,need,ctx){
  (db.needEvidence||[]).forEach(ref=>{
    if(!ids.has(ref.id)) return;
    ref.referenceStatus=status;
    ref.generatedAt=ctx.createdAt;
    ref.generatedBy=ctx.createdBy;
    if(need){
      ref.generatedNeedId=need.id;
      ref.needId=need.id;
      ref.requestNo=need.requestNo;
    }
  });
}

function generateNeedsFromLearningReferences(){
  if(!hasPermission('create_need')) return alert('لا تملك صلاحية توليد الاحتياج');
  db.needsRequests=db.needsRequests||[];
  db.needEvidence=db.needEvidence||[];
  const refs=learningReferencesForGeneration();
  if(!refs.length) return alert('لا توجد مراجع تعليمية جاهزة للتوليد');
  const aggregates=learningReferenceAggregates(refs);
  const ctxBase={createdAt:nowLocalString(),createdBy:state.currentUser.id};
  let createdCount=0, mergedCount=0, coveredCount=0;
  aggregates.forEach(agg=>{
    const ctx={
      ...agg.ctx,
      academicYear:learningTextList([...agg.academicYears]),
      courseName:learningTextList([...agg.courses])||'مراجع تعليمية متعددة',
      courseCode:learningTextList([...agg.courseCodes])||'متعدد',
      createdAt:ctxBase.createdAt,
      createdBy:ctxBase.createdBy
    };
    const refIds=new Set([...agg.sourceRefIds]);
    if(agg.netTotal<=0){
      markLearningReferences(refIds,'covered_by_stock',null,ctx);
      coveredCount+=refIds.size;
      return;
    }
    let req=findLearningMergeTarget(agg,ctx);
    if(req){
      req.year1Qty=eduNeedRoundQty(Number(req.year1Qty||0)+agg.term1Net);
      req.year2Qty=eduNeedRoundQty(Number(req.year2Qty||0)+agg.term2Net);
      req.year3Qty=0;
      req.qty=eduNeedRoundQty(Number(req.year1Qty||0)+Number(req.year2Qty||0));
      req.grossQty=eduNeedRoundPreview(Number(req.grossQty||0)+agg.grossTotal);
      req.stockAvailable=Math.max(Number(req.stockAvailable||0),Number(agg.stockAvailable||0));
      req.evidenceCount=Number(req.evidenceCount||0)+refIds.size;
      req.calculationSource='educational_reference_v6_2';
      req.referenceBased=true;
      req.workflowStage='تم دمج مراجع تعليمية جديدة وينتظر اعتماد مسؤول القطاع';
      req.status='pending_sector_approval';
      req.lastMergedAt=ctx.createdAt;
      req.lastMergedBy=ctx.createdBy;
      req.courseName=learningAppendText(req.courseName,ctx.courseName);
      req.courseCode=learningAppendText(req.courseCode,ctx.courseCode);
      req.justification=`${req.justification||''}\n\nدمج جديد: ${learningReferenceSummary(agg)}`.trim();
      mergedCount++;
      auditLog('دمج مراجع تعليمية في طلب احتياج','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - الصافي بعد الدمج ${req.qty} ${req.unit}`,req.college,req.mainDepartment);
    }else{
      req={
        id:nextId(db.needsRequests),
        requestNo:nextNo('NR',db.needsRequests),
        erpCode:'',
        college:ctx.college,
        mainDepartment:ctx.mainDepartment,
        section:ctx.section,
        category:ctx.section,
        itemNameAr:agg.itemNameAr,
        itemNameEn:agg.itemNameEn,
        unit:agg.unit,
        mandatoryProduct:'لا',
        constructionCode:'',
        similarItem:'',
        brandMention:'لا',
        yearsCount:2,
        year1Qty:agg.term1Net,
        year2Qty:agg.term2Net,
        year3Qty:0,
        qty:agg.netTotal,
        requestOrderNo:'',
        sendGrouping:'subsection',
        targetEntity:'إدارة التجهيزات',
        description:`${agg.itemNameAr||agg.itemNameEn} مبني على ${ctx.courseName}`,
        specifications:`احتياج مولد من ${refIds.size} مرجع تعليمي، مع تحويل وحدة الاستخدام إلى وحدة طلب نهائية وتقريب الصافي للأعلى.`,
        justification:learningReferenceSummary(agg),
        brandReason:'',
        notes:'',
        status:'pending_sector_approval',
        workflowStage:'بانتظار اعتماد مسؤول القطاع',
        calculationSource:'educational_reference_v6_2',
        referenceBased:true,
        academicYear:ctx.academicYear,
        courseName:ctx.courseName,
        courseCode:ctx.courseCode,
        grossQty:agg.grossTotal,
        stockAvailable:eduNeedRoundPreview(agg.stockAvailable),
        evidenceCount:refIds.size,
        createdAt:ctx.createdAt,
        createdBy:ctx.createdBy
      };
      db.needsRequests.unshift(req);
      createdCount++;
      auditLog('توليد طلب احتياج من المراجع التعليمية','need',req.requestNo,`${req.itemNameAr||req.itemNameEn} - صافي ${req.qty} ${req.unit}`,req.college,req.mainDepartment);
    }
    markLearningReferences(refIds,'generated',req,ctx);
  });
  saveDb();
  state.currentPage='needs';
  closeModal();
  alert(`تم إنشاء ${createdCount} طلب ودمج ${mergedCount} بند. المراجع المغطاة بالمخزون: ${coveredCount}`);
}

const __learningModalHtml=modalHtml;
modalHtml=function(){
  if(!state.modal) return '';
  if(state.modal==='needFromReferences') return needFromReferencesModalHtml();
  return __learningModalHtml();
}

const __learningOpenModal=openModal;
openModal=function(type,id=null,txType='receive'){
  __learningOpenModal(type,id,txType);
  if(type==='evidence') setTimeout(()=>renderEduNeedPreview(),0);
}

needEvidenceBadge=function(needId){
  const c=(db.needEvidence||[]).filter(x=>Number(x.needId)===Number(needId)).length;
  return c>0?`<span class="badge badge-success">مراجع (${c})</span>`:`<span class="badge badge-warning">لا توجد مراجع</span>`;
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
  if((sameCollege||isCentral())&&hasPermission('create_need')) buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('needEdit',${r.id})">تعديل</button>`);
  if(typeof canDeleteNeed==='function' && canDeleteNeed(r)) buttons.push(`<button class="btn btn-danger btn-sm" onclick="removeNeed(${r.id})">حذف</button>`);
  return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—';
}

renderNeedEvidence=function(){
  const rows=visibleNeedEvidence().map(r=>[
    learningReferenceNumber(r),
    r.needId?`<span class="badge badge-ok">${r.requestNo||'مرتبط'}</span>`:'—',
    r.college,
    r.mainDepartment||'القسم العام',
    r.section,
    r.itemNameAr||'—',
    r.courseName||'—',
    r.courseCode||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.usageUnit||r.unit||'—',
    r.requestUnit||r.unit||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    learningReferenceStatusBadge(r),
    actorName(r.createdBy)
  ]);
  return `<div class="hero"><div class="hero-title">المراجع التعليمية</div><div class="hero-text">يدخل مسؤول المقرر بيانات المقرر والتجارب والمواد هنا كمرجع تعليمي. مسؤول القطاع يراجعها لاحقًا ويولد منها طلب الاحتياج الرسمي.</div></div>
  ${filtersHtml({date:true,searchPlaceholder:'بحث بالمقرر، التجربة، الصنف...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة مرجع تعليمي</button>`:''}${hasPermission('create_need')?`<button class="btn btn-success" onclick="openModal('needFromReferences')">توليد احتياج من المراجع</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل المراجع التعليمية</div><div class="panel-subtitle">المراجع الجاهزة لا تصبح طلب احتياج إلا بعد توليدها من مسؤول القطاع.</div></div>${table(['رقم المرجع','طلب الاحتياج','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقرر','رمز المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','وحدة الاستخدام','وحدة الطلب','الاحتياج المحول','الرصيد','العجز','الحالة','صاحب الإجراء'],rows)}</div>`;
}

renderNeeds=function(){
  const rows=filteredNeeds().map(r=>{
    const source=r.referenceBased || r.calculationSource==='educational_reference_v6_2'
      ? '<span class="badge badge-ok">من المراجع التعليمية</span>'
      : isCalculatedNeedSource(r.calculationSource)
        ? '<span class="badge badge-info">محسوب سابقًا</span>'
        : '<span class="badge badge-info">يدوي</span>';
    const stock=typeof r.stockAvailable!=='undefined' ? r.stockAvailable : '—';
    return [r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',source,`${r.year1Qty||0} / ${r.year2Qty||0}`,r.grossQty||'—',stock,r.qty,r.unit,r.evidenceCount||evidenceCountForNeed(r.id)||0,statusBadge(r.status),needEvidenceBadge(r.id),approvalPath('need',r.status),r.requestOrderNo||'—',formatDateTime(r.createdAt),actorName(r.createdBy),needActions(r)];
  });
  return `<div class="hero edu-need-page-hero">
    <div><div class="hero-title">طلبات الاحتياج</div><div class="hero-text">مسؤول القطاع يولد الاحتياج الرسمي من المراجع التعليمية بعد مراجعتها، مع إمكانية رفع احتياج مباشر للحالات الاستثنائية.</div></div>
    <div class="flex-actions">${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('needFromReferences')">توليد احتياج من المراجع</button><button class="btn btn-secondary" onclick="openModal('need')">احتياج مباشر</button>`:''}</div>
  </div>
  ${filtersHtml({needStatus:true,date:true})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left"><button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل الاحتياج المجمع</div><div class="panel-subtitle">كل صنف يتجمع من أكثر من مرجع ومقرر تحت نفس البند قبل الرفع لإدارة التجهيزات.</div></div>
  ${table(['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','القسم الفرعي','البند بالعربي','English','مصدر الحساب','الفصل 1 / الفصل 2','الإجمالي قبل الرصيد','الرصيد','الصافي المرفوع','الوحدة','عدد المراجع','الحالة','المراجع','المسار','رقم أمر الاحتياج','تاريخ الرفع','صاحب الإجراء','إجراء'],rows)}</div>`;
}

needEvidenceExecutiveData=function(){
  const rows=visibleNeedEvidence();
  const ready=rows.filter(isLearningReferenceReady).length;
  const generated=rows.filter(r=>(r.referenceStatus||'')==='generated').length;
  const covered=rows.filter(r=>(r.referenceStatus||'')==='covered_by_stock').length;
  return {
    title:'التقرير التنفيذي للمراجع التعليمية',
    subtitle:'ملخص المراجع التعليمية المدخلة كأساس لحوكمة رفع الاحتياج.',
    summary:[
      ['إجمالي المراجع',rows.length],
      ['جاهزة للمراجعة',ready],
      ['تم توليد احتياج',generated],
      ['مغطاة بالمخزون',covered]
    ],
    headers:['رقم المرجع','طلب الاحتياج','القطاع','القسم الرئيسي','القسم الفرعي','الصنف','المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','وحدة الطلب','الاحتياج','الرصيد','العجز','الحالة','صاحب الإجراء'],
    rows:rows.map(r=>[learningReferenceNumber(r),r.needId?r.requestNo:'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||r.itemNameEn||'—',r.courseName||'—',r.experimentName||'—',r.academicYear||'—',r.semester||'—',r.studentsCount||0,r.sectionsCount||0,r.requestUnit||r.unit||'—',r.grossNeed||r.estimatedNeed||0,r.stockAvailable||0,r.deficit||0,(r.referenceStatus||'ready'),actorName(r.createdBy)])
  };
}

officialNeedsRows=function(){
  return filteredNeeds().map(r=>{
    const source=r.referenceBased || r.calculationSource==='educational_reference_v6_2' ? 'من المراجع التعليمية' : isCalculatedNeedSource(r.calculationSource) ? 'محسوب سابقًا' : 'يدوي';
    return [r.requestNo,r.erpCode||'—',r.college,r.mainDepartment||'القسم العام',r.section,r.itemNameAr||'—',r.itemNameEn||'—',source,Number(r.year1Qty||0),Number(r.year2Qty||0),Number(r.grossQty||r.qty||0),typeof r.stockAvailable!=='undefined'?r.stockAvailable:'—',Number(r.qty||0),r.unit||'—',r.evidenceCount||evidenceCountForNeed(r.id)||0,statusText(r.status),r.workflowStage||statusText(r.status),actorName(r.createdBy),actorName(r.reviewedBy)];
  });
}

alertsHtml=function(){
  const lows=lowStock().length;
  const pendingIssue=visibleTransactions().filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length;
  const pendingNeeds=filteredNeeds().filter(n=>['pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(n.status||'pending_sector_approval')).length;
  const noRefs=filteredNeeds().filter(n=>evidenceCountForNeed(n.id)===0).length;
  const readyRefs=(db.needEvidence||[]).filter(isLearningReferenceReady).length;
  const pendingSupport=filteredSupport().filter(s=>['pending_owner','owner_approved','pending_equipment'].includes(s.status||'pending_owner')).length;
  const cards=[
    ['مواد تحت الحد الأدنى',lows,'تحتاج معالجة أو رفع احتياج'],
    ['طلبات صرف معلقة',pendingIssue,'بانتظار قرار المسؤول'],
    ['طلبات احتياج قيد الإجراء',pendingNeeds,'بين القطاع وإدارة التجهيزات'],
    ['طلبات احتياج بلا مراجع',noRefs,'يفضل ربطها بمرجع تعليمي عند الإمكان'],
    ['مراجع جاهزة للتوليد',readyRefs,'يمكن لمسؤول القطاع توليد احتياج منها'],
    ['طلبات دعم بين القطاعات',pendingSupport,'بانتظار الموافقات']
  ];
  return `<div class="alert-grid">${cards.map(c=>`<div class="alert-card"><strong>${c[0]}</strong><b>${c[1]}</b><span>${c[2]}</span></div>`).join('')}</div>`;
}

approveNeed=function(id){
  if(!hasPermission('approve_need')) return alert('لا تملك صلاحية اعتماد طلبات الاحتياج');
  const r=db.needsRequests.find(x=>x.id===id);
  if(!r) return;
  const referenceCount=evidenceCountForNeed(r.id);
  if((r.status||'pending_sector_approval')==='pending_sector_approval' && !isCentral()){
    r.status='pending_equipment_review';
    r.workflowStage='أحيل إلى إدارة التجهيزات بعد اعتماد مسؤول القطاع';
    r.sectorApprovedAt=nowLocalString();
    r.sectorApprovedBy=state.currentUser.id;
    auditLog('اعتماد طلب احتياج من مسؤول القطاع','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} | مراجع: ${referenceCount}`,r.college,r.mainDepartment||r.section);
    saveDb();
    render();
    return;
  }
  if(referenceCount===0){
    const proceed=confirm('هذا الطلب لا يحتوي على مرجع تعليمي. هل ترغب في اعتماده رغم ذلك؟');
    if(!proceed) return;
  }
  r.status='approved';
  r.workflowStage='معتمد من إدارة التجهيزات';
  r.reviewedAt=nowLocalString();
  r.reviewedBy=state.currentUser.id;
  auditLog('اعتماد طلب احتياج','need',r.requestNo,`${r.itemNameAr||r.itemNameEn} | مراجع: ${referenceCount}`,r.college,r.mainDepartment||r.section);
  saveDb();
  render();
}
/* ===== end Educational References workflow v6.2 ===== */

/* ===== Educational Reference Categories v6.3 ===== */
const EDU_REFERENCE_CATEGORIES={
  chemical:{
    key:'chemical',
    label:'مواد كيميائية',
    section:'المواد الكيميائية',
    title:'المواد الكيميائية',
    description:'مواد تقاس غالبًا بالحجم أو الوزن، مثل المحاليل والكواشف.',
    itemLabel:'اسم المادة',
    itemPlaceholder:'إيثانول 96%',
    englishPlaceholder:'Ethanol 96%',
    usageUnit:'مليتر',
    requestUnit:'لتر',
    basis:'per_student',
    qtyLabel:'كمية الاستخدام',
    stockLabel:'الرصيد بوحدة الطلب',
    specALabel:'التركيز / النقاوة',
    specBLabel:'ملاحظة السلامة أو التخزين',
    specAPlaceholder:'96% أو 0.1M',
    specBPlaceholder:'قابل للاشتعال / يحتاج تهوية'
  },
  consumable:{
    key:'consumable',
    label:'مستهلكات تعليمية',
    section:'المستهلكات التعليمية',
    title:'الأدوات المعملية والمستهلكات',
    description:'أدوات تستهلك في التجربة أو تحتاج تعويضًا دوريًا مثل القفازات والأنابيب.',
    itemLabel:'اسم المستهلك / الأداة',
    itemPlaceholder:'أنابيب اختبار',
    englishPlaceholder:'Test tubes',
    usageUnit:'حبة',
    requestUnit:'علبة',
    basis:'per_group',
    qtyLabel:'الكمية المستخدمة',
    stockLabel:'الرصيد بوحدة الطلب',
    specALabel:'المقاس / السعة',
    specBLabel:'عدد القطع في العبوة',
    specAPlaceholder:'10ml أو Small',
    specBPlaceholder:'مثال: 100'
  },
  device:{
    key:'device',
    label:'أجهزة تعليمية',
    section:'الأجهزة التعليمية',
    title:'الأجهزة التعليمية',
    description:'أجهزة أو معدات مطلوبة لتنفيذ التجربة، وتُحسب غالبًا لكل مجموعة أو شعبة.',
    itemLabel:'اسم الجهاز',
    itemPlaceholder:'ميزان حساس',
    englishPlaceholder:'Analytical balance',
    usageUnit:'جهاز',
    requestUnit:'جهاز',
    basis:'per_group',
    qtyLabel:'عدد الأجهزة المطلوبة',
    stockLabel:'الأجهزة المتاحة',
    specALabel:'المواصفة / الموديل',
    specBLabel:'حالة التشغيل المطلوبة',
    specAPlaceholder:'0.001g أو موديل مكافئ',
    specBPlaceholder:'جهاز صالح للتدريب العملي'
  }
};

function eduReferenceCategory(category){
  return EDU_REFERENCE_CATEGORIES[category]||EDU_REFERENCE_CATEGORIES.chemical;
}

function eduReferenceCategoryOptions(selected){
  return Object.values(EDU_REFERENCE_CATEGORIES).map(c=>`<option value="${c.key}" ${selected===c.key?'selected':''}>${c.label}</option>`).join('');
}

function eduReferenceCategoryBlockHtml(groupIdx,category,rows){
  const meta=eduReferenceCategory(category);
  const materialRows=(rows&&rows.length?rows:[{}]).map((row,idx)=>eduNeedMaterialRowHtml(groupIdx,`${category}-${idx}`,{...row,referenceCategoryKey:category},category)).join('');
  return `<div class="edu-category-block edu-category-${meta.key}">
    <div class="edu-category-head">
      <div>
        <div class="edu-category-title">${meta.title}</div>
        <div class="small">${meta.description}</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="addEduNeedMaterial('${groupIdx}','${meta.key}')">+ إضافة ${meta.label}</button>
    </div>
    <div class="edu-material-rows" data-edu-materials="${groupIdx}-${meta.key}" data-edu-category="${meta.key}">${materialRows}</div>
  </div>`;
}

eduNeedMaterialRowHtml=function(groupIdx,materialIdx,material={},category=null){
  const meta=eduReferenceCategory(category||material.referenceCategoryKey||material.category||'chemical');
  const usageUnit=material.usageUnit||material.unit||meta.usageUnit;
  const requestUnit=material.requestUnit||meta.requestUnit||eduNeedDefaultRequestUnit(usageUnit);
  const basis=material.basis||material.consumptionBasis||meta.basis;
  const wasteValue=meta.key==='device'?0:Number(material.wastePercent||0);
  return `<div class="edu-material-row edu-material-${meta.key}" data-edu-material-row="${materialIdx}" data-edu-category="${meta.key}">
    <div class="edu-material-grid">
      <div><label class="label">${meta.itemLabel} بالعربي</label><input class="input edu-item-ar" value="${eduNeedEscape(material.itemNameAr||'')}" placeholder="${meta.itemPlaceholder}"></div>
      <div><label class="label">English</label><input class="input edu-item-en" value="${eduNeedEscape(material.itemNameEn||'')}" placeholder="${meta.englishPlaceholder}"></div>
      <div><label class="label">التصنيف</label><select class="select edu-category-select" onchange="changeEduNeedMaterialCategory(this,'${groupIdx}','${materialIdx}')">${eduReferenceCategoryOptions(meta.key)}</select></div>
      <div><label class="label">وحدة الاستخدام</label><select class="select edu-usage-unit" onchange="syncEduNeedRequestUnit(this)">${eduNeedUnitOptions(usageUnit)}</select></div>
      <div><label class="label">وحدة الطلب النهائية</label><select class="select edu-request-unit">${eduNeedUnitOptions(requestUnit)}</select></div>
      <div><label class="label">أساس الحساب</label><select class="select edu-basis">${eduNeedBasisOptions(basis)}</select></div>
      <div><label class="label">${meta.qtyLabel}</label><input class="input edu-qty-per-use" type="number" min="0" step="0.01" value="${Number(material.qtyPerUse||0)}"></div>
      <div><label class="label">هدر/احتياط %</label><input class="input edu-waste" type="number" min="0" step="1" value="${wasteValue}" ${meta.key==='device'?'readonly':''}></div>
      <div><label class="label">${meta.stockLabel}</label><input class="input edu-stock" type="number" min="0" step="0.01" value="${Number(material.stockAvailable||0)}"></div>
      <div><label class="label">${meta.specALabel}</label><input class="input edu-spec-a" value="${eduNeedEscape(material.specA||material.concentration||material.size||material.model||'')}" placeholder="${meta.specAPlaceholder}"></div>
      <div><label class="label">${meta.specBLabel}</label><input class="input edu-spec-b" value="${eduNeedEscape(material.specB||material.storage||material.packageType||material.deviceCondition||'')}" placeholder="${meta.specBPlaceholder}"></div>
      <div class="edu-material-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="removeEduNeedMaterial('${groupIdx}','${meta.key}','${materialIdx}')">حذف</button></div>
    </div>
  </div>`;
}

function changeEduNeedMaterialCategory(select,groupIdx,materialIdx){
  const row=select.closest('[data-edu-material-row]');
  if(!row) return;
  const prefill={
    itemNameAr:(row.querySelector('.edu-item-ar')?.value||'').trim(),
    itemNameEn:(row.querySelector('.edu-item-en')?.value||'').trim(),
    qtyPerUse:eduNeedReadNumber(row,'.edu-qty-per-use'),
    stockAvailable:eduNeedReadNumber(row,'.edu-stock'),
    specA:(row.querySelector('.edu-spec-a')?.value||'').trim(),
    specB:(row.querySelector('.edu-spec-b')?.value||'').trim()
  };
  row.outerHTML=eduNeedMaterialRowHtml(groupIdx,materialIdx,prefill,select.value);
  renderEduNeedPreview();
}

eduNeedRowHtml=function(idx,row={}){
  const semester=row.semester||'الأول';
  return `<div class="edu-need-row edu-experiment-card" data-edu-need-row="${idx}">
    <div class="edu-need-row-head">
      <div>
        <div class="edu-need-row-title">تجربة تعليمية</div>
        <div class="small">كل تجربة تحتوي على ثلاث احتياجات مستقلة: مواد كيميائية، مستهلكات تعليمية، وأجهزة تعليمية.</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="removeEduNeedRow('${idx}')">حذف التجربة</button>
    </div>
    <div class="edu-need-grid edu-experiment-grid">
      <div><label class="label">اسم التجربة</label><input class="input edu-experiment" value="${eduNeedEscape(row.experimentName||'')}" placeholder="مثال: معايرة حمض وقاعدة"></div>
      <div><label class="label">الفصل</label><select class="select edu-semester">${eduNeedSemesterOptions(semester)}</select></div>
      <div><label class="label">تكرار التجربة</label><input class="input edu-repeats" type="number" min="1" step="1" value="${Number(row.repeats||1)}"></div>
      <div><label class="label">شعب الطلاب</label><input class="input edu-male-sections" type="number" min="0" step="1" value="${Number(row.maleSections||0)}"></div>
      <div><label class="label">طلاب/شعبة</label><input class="input edu-male-per-section" type="number" min="0" step="1" value="${Number(row.malePerSection||0)}"></div>
      <div><label class="label">شعب الطالبات</label><input class="input edu-female-sections" type="number" min="0" step="1" value="${Number(row.femaleSections||0)}"></div>
      <div><label class="label">طالبات/شعبة</label><input class="input edu-female-per-section" type="number" min="0" step="1" value="${Number(row.femalePerSection||0)}"></div>
      <div><label class="label">حجم المجموعة</label><input class="input edu-group-size" type="number" min="1" step="1" value="${Number(row.groupSize||1)}"></div>
    </div>
    <div class="edu-category-grid">
      ${eduReferenceCategoryBlockHtml(idx,'chemical',row.chemicals)}
      ${eduReferenceCategoryBlockHtml(idx,'consumable',row.consumables)}
      ${eduReferenceCategoryBlockHtml(idx,'device',row.devices)}
    </div>
  </div>`;
}

addEduNeedMaterial=function(groupIdx,category='chemical',prefill={}){
  const meta=eduReferenceCategory(category);
  let wrap=document.querySelector(`[data-edu-materials="${groupIdx}-${meta.key}"]`);
  if(!wrap) wrap=document.querySelector(`[data-edu-materials="${groupIdx}"]`);
  if(!wrap) return;
  const idx=`${meta.key}-${Date.now().toString(36)}${wrap.children.length}`;
  wrap.insertAdjacentHTML('beforeend',eduNeedMaterialRowHtml(groupIdx,idx,prefill,meta.key));
}

removeEduNeedMaterial=function(groupIdx,category,materialIdx){
  let row=null;
  if(typeof materialIdx==='undefined'){
    materialIdx=category;
    row=document.querySelector(`[data-edu-materials="${groupIdx}"] [data-edu-material-row="${materialIdx}"]`);
  }else{
    row=document.querySelector(`[data-edu-materials="${groupIdx}-${category}"] [data-edu-material-row="${materialIdx}"]`);
  }
  if(row) row.remove();
  renderEduNeedPreview();
}

eduNeedReadRows=function(){
  const rows=[];
  [...document.querySelectorAll('[data-edu-need-row]')].forEach(group=>{
    const common={
      experimentName:(group.querySelector('.edu-experiment')?.value||'').trim()||'تجربة غير مسماة',
      semester:group.querySelector('.edu-semester')?.value||'الأول',
      repeats:Math.max(1,eduNeedReadNumber(group,'.edu-repeats')),
      maleSections:eduNeedReadNumber(group,'.edu-male-sections'),
      malePerSection:eduNeedReadNumber(group,'.edu-male-per-section'),
      femaleSections:eduNeedReadNumber(group,'.edu-female-sections'),
      femalePerSection:eduNeedReadNumber(group,'.edu-female-per-section'),
      groupSize:Math.max(1,eduNeedReadNumber(group,'.edu-group-size')||1)
    };
    [...group.querySelectorAll('[data-edu-material-row]')].forEach(material=>{
      const categoryKey=material.dataset.eduCategory || material.querySelector('.edu-category-select')?.value || 'chemical';
      const meta=eduReferenceCategory(categoryKey);
      const originalUsageUnit=material.querySelector('.edu-usage-unit')?.value||meta.usageUnit;
      const requestUnit=material.querySelector('.edu-request-unit')?.value||meta.requestUnit||eduNeedDefaultRequestUnit(originalUsageUnit);
      const specA=(material.querySelector('.edu-spec-a')?.value||'').trim();
      const specB=(material.querySelector('.edu-spec-b')?.value||'').trim();
      const packSize=meta.key==='consumable'?Number(specB||0):0;
      const rawQtyPerUse=eduNeedReadNumber(material,'.edu-qty-per-use');
      const shouldConvertPack=meta.key==='consumable' && packSize>0 && eduNeedCanonicalUnit(originalUsageUnit)!==eduNeedCanonicalUnit(requestUnit);
      const usageUnit=shouldConvertPack?requestUnit:originalUsageUnit;
      const qtyPerUse=shouldConvertPack?rawQtyPerUse/packSize:rawQtyPerUse;
      rows.push({
        ...common,
        referenceCategoryKey:meta.key,
        referenceCategory:meta.section,
        categoryLabel:meta.label,
        itemNameAr:(material.querySelector('.edu-item-ar')?.value||'').trim(),
        itemNameEn:(material.querySelector('.edu-item-en')?.value||'').trim(),
        displayUsageUnit:originalUsageUnit,
        calculationUsageUnit:usageUnit,
        usageUnit,
        requestUnit,
        unit:requestUnit,
        basis:material.querySelector('.edu-basis')?.value||meta.basis,
        qtyPerUse,
        displayQtyPerUse:rawQtyPerUse,
        packSize,
        wastePercent:meta.key==='device'?0:eduNeedReadNumber(material,'.edu-waste'),
        stockAvailable:eduNeedReadNumber(material,'.edu-stock'),
        specA,
        specB
      });
    });
  });
  return rows;
}

function eduNeedAggregatesByCategory(rows,ctx={}){
  const engine=eduNeedEngine();
  const department=ctx.mainDepartment || document.getElementById('need-mainDepartment')?.value || currentDepartmentName();
  const groups=new Map();
  (rows||[]).forEach(row=>{
    const meta=eduReferenceCategory(row.referenceCategoryKey||'chemical');
    const section=row.referenceCategory||meta.section;
    if(!groups.has(section)) groups.set(section,[]);
    groups.get(section).push(row);
  });
  return [...groups.entries()].flatMap(([section,groupRows])=>engine.aggregateRows(groupRows,{mainDepartment:department,section}).map(agg=>({...agg,section,categoryLabel:eduReferenceCategory(groupRows[0]?.referenceCategoryKey).label})));
}

eduNeedAggregateRows=function(rows){
  return eduNeedAggregatesByCategory(rows);
}

renderEduNeedPreview=function(){
  const target=document.getElementById('edu-need-preview');
  if(!target) return;
  const aggregates=eduNeedAggregatesByCategory(eduNeedReadRows());
  const rows=aggregates.map(a=>[
    eduNeedEscape(a.section||'—'),
    eduNeedEscape(a.itemNameAr||a.itemNameEn||'—'),
    eduNeedEscape([...a.usageUnits].join('، ')||a.unit),
    eduNeedEscape(a.unit),
    eduNeedEscape([...a.experiments].slice(0,4).join('، ')||'—'),
    eduNeedRoundPreview(a.term1Gross),
    eduNeedRoundPreview(a.term2Gross),
    eduNeedRoundPreview(a.stockAvailable),
    a.netTotal>0?`<span class="badge badge-ok">${a.netTotal}</span>`:`<span class="badge badge-info">مغطى بالمخزون</span>`
  ]);
  target.innerHTML=`<div class="table-panel edu-preview-panel"><div class="table-head"><div class="panel-title">المخرجات المحسوبة قبل التوليد</div><div class="panel-subtitle">يتم تجميع الأصناف حسب نوعها: مواد كيميائية، مستهلكات تعليمية، وأجهزة تعليمية.</div></div>${table(['التصنيف','البند','وحدة الاستخدام','وحدة الطلب','التجارب','الفصل الأول','الفصل الثاني','الرصيد','الصافي'],rows)}</div>`;
}

const __categorySaveLearningReferences=saveLearningReferences;
saveLearningReferences=function(){
  if(!hasPermission('create_need_evidence')) return alert('لا تملك صلاحية إضافة المراجع التعليمية');
  db.needEvidence=db.needEvidence||[];
  const rawRows=eduNeedReadRows();
  const ctx={
    academicYear:(document.getElementById('need-academicYear')?.value||'').trim(),
    college:document.getElementById('need-college')?.value||eduNeedCurrentCollege(),
    mainDepartment:document.getElementById('need-mainDepartment')?.value||currentDepartmentName(),
    level:(document.getElementById('need-level')?.value||'').trim(),
    courseName:(document.getElementById('need-courseName')?.value||'').trim()||'مقرر غير محدد',
    courseCode:(document.getElementById('need-courseCode')?.value||'').trim()||'غير محدد',
    notes:(document.getElementById('need-notes')?.value||'').trim(),
    createdAt:nowLocalString(),
    createdBy:state.currentUser.id,
    batchId:`REFB-${Date.now()}`
  };
  const rows=rawRows.map(row=>({raw:row,calc:eduNeedEngine().calcMaterial(row)})).filter(x=>learningValidCalc(x.calc));
  if(!rows.length) return alert('أدخل تجربة وبندًا واحدًا على الأقل ضمن المواد الكيميائية أو المستهلكات أو الأجهزة');
  rows.forEach(({raw,calc})=>{
    const meta=eduReferenceCategory(raw.referenceCategoryKey);
    const referenceNo=nextNo('ER',db.needEvidence);
    const ev={
      id:nextId(db.needEvidence),
      referenceNo,
      requestNo:referenceNo,
      referenceType:'educational_reference',
      referenceStatus:'ready',
      needId:null,
      generatedNeedId:null,
      college:ctx.college,
      mainDepartment:ctx.mainDepartment,
      section:raw.referenceCategory||meta.section,
      referenceCategoryKey:meta.key,
      referenceCategory:meta.section,
      categoryLabel:meta.label,
      itemNameAr:calc.itemNameAr,
      itemNameEn:calc.itemNameEn,
      unit:calc.requestUnit,
      usageUnit:raw.displayUsageUnit||calc.usageUnit,
      calculationUsageUnit:raw.calculationUsageUnit||calc.usageUnit,
      requestUnit:calc.requestUnit,
      academicYear:ctx.academicYear,
      level:ctx.level,
      courseName:ctx.courseName,
      courseCode:ctx.courseCode,
      experimentName:calc.experimentName,
      semester:calc.semester,
      sectionsCount:calc.sections,
      studentsCount:calc.students,
      maleSections:calc.maleSections,
      malePerSection:calc.malePerSection,
      femaleSections:calc.femaleSections,
      femalePerSection:calc.femalePerSection,
      groupSize:calc.groupSize,
      groupsCount:calc.groups,
      usesCount:calc.effectiveRepeats,
      repeats:calc.repeats,
      consumptionBasis:calc.basis,
      calculationMethod:eduNeedBasisLabel(calc.basis),
      qtyPerUse:calc.qtyPerUse,
      displayQtyPerUse:raw.displayQtyPerUse||calc.qtyPerUse,
      packSize:raw.packSize||0,
      wastePercent:calc.wastePercent,
      stockAvailable:calc.stockAvailable,
      specA:raw.specA,
      specB:raw.specB,
      specifications:[raw.specA,raw.specB].filter(Boolean).join(' | '),
      estimatedNeed:eduNeedRoundPreview(calc.grossNeed),
      grossNeed:eduNeedRoundPreview(calc.grossNeed),
      grossNeedUsage:eduNeedRoundPreview(calc.grossNeedUsage),
      deficit:eduNeedRoundQty(Math.max(calc.grossNeed-calc.stockAvailable,0)),
      batchId:ctx.batchId,
      justification:`مرجع تعليمي (${meta.label}) للمقرر ${ctx.courseName}: ${eduNeedBasisLabel(calc.basis)} × ${calc.qtyPerUse} ${calc.usageUnit} في تجربة ${calc.experimentName}.`,
      recommendation:'جاهز لمراجعة مسؤول القطاع وتوليد الاحتياج عند الحاجة.',
      notes:ctx.notes,
      createdAt:ctx.createdAt,
      createdBy:ctx.createdBy
    };
    db.needEvidence.unshift(ev);
    auditLog('إضافة مرجع تعليمي','educationReference',referenceNo,`${meta.label} - ${ctx.courseName} - ${calc.experimentName} - ${calc.itemNameAr||calc.itemNameEn}`,ctx.college,ctx.mainDepartment);
  });
  saveDb();
  state.currentPage='needEvidence';
  closeModal();
  alert(`تم حفظ ${rows.length} مرجع تعليمي موزعة على المواد الكيميائية والمستهلكات والأجهزة.`);
}

learningReferenceToEngineRow=function(ref){
  const students=Number(ref.studentsCount||0);
  const sections=Number(ref.sectionsCount||0);
  const maleSections=Number(ref.maleSections||sections||0);
  const malePerSection=Number(ref.malePerSection||ref.maleStudents||(sections?Math.ceil(students/Math.max(sections,1)):students)||0);
  return {
    _refId:ref.id,
    referenceNo:learningReferenceNumber(ref),
    referenceCategoryKey:ref.referenceCategoryKey||'chemical',
    categoryLabel:ref.categoryLabel||eduReferenceCategory(ref.referenceCategoryKey).label,
    courseName:ref.courseName||'',
    courseCode:ref.courseCode||'',
    academicYear:ref.academicYear||'',
    experimentName:ref.experimentName||'تجربة غير مسماة',
    semester:ref.semester||'الأول',
    repeats:Number(ref.repeats||ref.usesCount||1),
    maleSections,
    malePerSection,
    femaleSections:Number(ref.femaleSections||0),
    femalePerSection:Number(ref.femalePerSection||0),
    groupSize:Number(ref.groupSize||1),
    itemNameAr:ref.itemNameAr||'',
    itemNameEn:ref.itemNameEn||'',
    usageUnit:ref.calculationUsageUnit||ref.usageUnit||ref.unit||'عدد',
    requestUnit:ref.requestUnit||ref.unit||'عدد',
    unit:ref.requestUnit||ref.unit||'عدد',
    basis:ref.consumptionBasis||ref.basis||'per_student',
    qtyPerUse:Number(ref.qtyPerUse||ref.qtyPerStudent||0),
    wastePercent:Number(ref.wastePercent||0),
    stockAvailable:Number(ref.stockAvailable||0)
  };
}

const __categoryRenderNeedEvidence=renderNeedEvidence;
renderNeedEvidence=function(){
  const rows=visibleNeedEvidence().map(r=>[
    learningReferenceNumber(r),
    r.needId?`<span class="badge badge-ok">${r.requestNo||'مرتبط'}</span>`:'—',
    r.categoryLabel||eduReferenceCategory(r.referenceCategoryKey).label,
    r.college,
    r.mainDepartment||'القسم العام',
    r.itemNameAr||'—',
    r.specifications||'—',
    r.courseName||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.usageUnit||r.unit||'—',
    r.requestUnit||r.unit||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    learningReferenceStatusBadge(r),
    actorName(r.createdBy)
  ]);
  return `<div class="hero"><div class="hero-title">المراجع التعليمية</div><div class="hero-text">كل تجربة تفصل احتياجاتها إلى مواد كيميائية، مستهلكات تعليمية، وأجهزة تعليمية، حتى يراجعها مسؤول القطاع ويولد الاحتياج الرسمي بوضوح.</div></div>
  ${filtersHtml({date:true,searchPlaceholder:'بحث بالمقرر، التجربة، الصنف...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة مرجع تعليمي</button>`:''}${hasPermission('create_need')?`<button class="btn btn-success" onclick="openModal('needFromReferences')">توليد احتياج من المراجع</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل المراجع التعليمية</div><div class="panel-subtitle">التصنيف يحدد خصائص الإدخال وطريقة التجميع في طلب الاحتياج.</div></div>${table(['رقم المرجع','طلب الاحتياج','التصنيف','القطاع','القسم الرئيسي','الصنف','الخصائص','المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','وحدة الاستخدام','وحدة الطلب','الاحتياج المحول','الرصيد','العجز','الحالة','صاحب الإجراء'],rows)}</div>`;
}

needEvidenceExecutiveData=function(){
  const rows=visibleNeedEvidence();
  const ready=rows.filter(isLearningReferenceReady).length;
  const generated=rows.filter(r=>(r.referenceStatus||'')==='generated').length;
  const byCategory=Object.values(EDU_REFERENCE_CATEGORIES).map(meta=>[meta.label,rows.filter(r=>(r.referenceCategoryKey||'chemical')===meta.key || r.section===meta.section).length]);
  return {
    title:'التقرير التنفيذي للمراجع التعليمية',
    subtitle:'ملخص المراجع التعليمية حسب المواد الكيميائية والمستهلكات والأجهزة.',
    summary:[['إجمالي المراجع',rows.length],['جاهزة للمراجعة',ready],['تم توليد احتياج',generated],...byCategory],
    headers:['رقم المرجع','طلب الاحتياج','التصنيف','القطاع','القسم الرئيسي','الصنف','الخصائص','المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','وحدة الطلب','الاحتياج','الرصيد','العجز','الحالة','صاحب الإجراء'],
    rows:rows.map(r=>[learningReferenceNumber(r),r.needId?r.requestNo:'—',r.categoryLabel||eduReferenceCategory(r.referenceCategoryKey).label,r.college,r.mainDepartment||'القسم العام',r.itemNameAr||r.itemNameEn||'—',r.specifications||'—',r.courseName||'—',r.experimentName||'—',r.academicYear||'—',r.semester||'—',r.studentsCount||0,r.sectionsCount||0,r.requestUnit||r.unit||'—',r.grossNeed||r.estimatedNeed||0,r.stockAvailable||0,r.deficit||0,(r.referenceStatus||'ready'),actorName(r.createdBy)])
  };
}
/* ===== end Educational Reference Categories v6.3 ===== */

/* ===== Educational Reference PDF Reports v6.4 ===== */
function learningReferenceReportStatus(row){
  const status=row?.referenceStatus||'ready';
  if(status==='generated') return 'تم توليد احتياج';
  if(status==='covered_by_stock') return 'مغطى بالمخزون';
  if(status==='archived') return 'مؤرشف';
  return 'جاهز للمراجعة';
}

function learningReferenceReportQty(value,unit){
  const n=Number(value||0);
  const v=Number.isFinite(n)?eduNeedRoundPreview(n):value;
  return `${v} ${unit||''}`.trim();
}

function learningReferenceReportBasis(row){
  return row?.calculationMethod||eduNeedBasisLabel(row?.consumptionBasis||row?.basis)||'غير محدد';
}

function learningReferenceDetailReportData(id){
  const ref=(db.needEvidence||[]).find(r=>Number(r.id)===Number(id));
  if(!ref) return null;
  const refNo=learningReferenceNumber(ref);
  const category=ref.categoryLabel||eduReferenceCategory(ref.referenceCategoryKey).label;
  const requestNo=ref.needId?(ref.requestNo||'مرتبط'):'لم يولد طلب بعد';
  const usageQty=ref.displayQtyPerUse
    ? `${ref.displayQtyPerUse} ${ref.usageUnit||ref.unit||''}`
    : learningReferenceReportQty(ref.qtyPerUse||ref.qtyPerStudent,ref.usageUnit||ref.unit);
  const calcQty=ref.calculationUsageUnit && ref.calculationUsageUnit!==ref.usageUnit
    ? learningReferenceReportQty(ref.qtyPerUse,ref.calculationUsageUnit)
    : usageQty;
  const rows=[
    ['رقم المرجع',refNo],
    ['حالة المرجع',learningReferenceReportStatus(ref)],
    ['طلب الاحتياج المرتبط',requestNo],
    ['التصنيف',category],
    ['القطاع',ref.college||'—'],
    ['القسم الرئيسي',ref.mainDepartment||'القسم العام'],
    ['القسم الفرعي',ref.section||ref.referenceCategory||'—'],
    ['الصنف',ref.itemNameAr||ref.itemNameEn||'—'],
    ['English',ref.itemNameEn||'—'],
    ['خصائص الصنف',ref.specifications||[ref.specA,ref.specB].filter(Boolean).join(' | ')||'—'],
    ['المقرر',ref.courseName||'—'],
    ['رمز المقرر',ref.courseCode||'—'],
    ['المستوى',ref.level||'—'],
    ['السنة الأكاديمية',ref.academicYear||'—'],
    ['الفصل',ref.semester||'—'],
    ['التجربة',ref.experimentName||'—'],
    ['عدد الشعب',ref.sectionsCount||0],
    ['عدد الطلاب',ref.studentsCount||0],
    ['شعب الطلاب',`${ref.maleSections||0} شعبة × ${ref.malePerSection||0}`],
    ['شعب الطالبات',`${ref.femaleSections||0} شعبة × ${ref.femalePerSection||0}`],
    ['حجم المجموعة',ref.groupSize||1],
    ['عدد المجموعات',ref.groupsCount||0],
    ['عدد مرات الاستخدام',ref.usesCount||ref.repeats||1],
    ['أساس الحساب',learningReferenceReportBasis(ref)],
    ['كمية الاستخدام المسجلة',usageQty],
    ['كمية الحساب بعد التحويل',calcQty],
    ['وحدة الطلب النهائية',ref.requestUnit||ref.unit||'—'],
    ['نسبة الهدر',`${Number(ref.wastePercent||0)}%`],
    ['الرصيد المتاح',learningReferenceReportQty(ref.stockAvailable,ref.requestUnit||ref.unit)],
    ['الاحتياج قبل خصم الرصيد',learningReferenceReportQty(ref.grossNeed||ref.estimatedNeed,ref.requestUnit||ref.unit)],
    ['العجز / الصافي المتوقع',learningReferenceReportQty(ref.deficit,ref.requestUnit||ref.unit)],
    ['التوصية',ref.recommendation||'—'],
    ['المبرر',ref.justification||'—'],
    ['ملاحظات',ref.notes||'—'],
    ['تاريخ الإنشاء',formatDateTime(ref.createdAt)],
    ['صاحب الإجراء',actorName(ref.createdBy)]
  ];
  return {
    title:`تقرير مرجع تعليمي - ${refNo}`,
    subtitle:'تقرير تفصيلي لمرجع تعليمي واحد يوضح بيانات المقرر والتجربة والصنف ومنطق الحساب قبل توليد الاحتياج الرسمي.',
    summary:[
      ['التصنيف',category],
      ['الصنف',ref.itemNameAr||ref.itemNameEn||'—'],
      ['الحالة',learningReferenceReportStatus(ref)],
      ['الصافي المتوقع',learningReferenceReportQty(ref.deficit,ref.requestUnit||ref.unit)]
    ],
    headers:['الحقل','البيان'],
    rows
  };
}

function printLearningReferenceDetail(id){
  const data=learningReferenceDetailReportData(id);
  if(!data) return alert('المرجع التعليمي غير موجود');
  openPrint(data);
}

function learningReferencesDetailedReportData(){
  const rows=visibleNeedEvidence();
  const ready=rows.filter(isLearningReferenceReady).length;
  const generated=rows.filter(r=>(r.referenceStatus||'')==='generated').length;
  const totalDeficit=rows.reduce((sum,r)=>sum+Number(r.deficit||0),0);
  return {
    title:'تقرير تفصيلي عام للمراجع التعليمية',
    subtitle:'يعرض كل مرجع تعليمي مع بيانات المقرر والتجربة والتصنيف ووحدات الاستخدام والطلب والاحتياج المحسوب والرصيد والعجز.',
    summary:[
      ['إجمالي المراجع',rows.length],
      ['جاهزة للمراجعة',ready],
      ['تم توليد احتياج',generated],
      ['إجمالي العجز العددي',eduNeedRoundPreview(totalDeficit)]
    ],
    headers:[
      'رقم المرجع','طلب الاحتياج','الحالة','التصنيف','القطاع','القسم الرئيسي','القسم الفرعي',
      'الصنف','English','الخصائص','المقرر','رمز المقرر','المستوى','السنة','الفصل','التجربة',
      'الطلاب','الشعب','المجموعات','أساس الحساب','كمية الاستخدام','وحدة الاستخدام','وحدة الطلب',
      'الهدر','الاحتياج قبل الرصيد','الرصيد','العجز','المبرر','التوصية','صاحب الإجراء'
    ],
    rows:rows.map(r=>[
      learningReferenceNumber(r),
      r.needId?(r.requestNo||'مرتبط'):'—',
      learningReferenceReportStatus(r),
      r.categoryLabel||eduReferenceCategory(r.referenceCategoryKey).label,
      r.college||'—',
      r.mainDepartment||'القسم العام',
      r.section||r.referenceCategory||'—',
      r.itemNameAr||'—',
      r.itemNameEn||'—',
      r.specifications||[r.specA,r.specB].filter(Boolean).join(' | ')||'—',
      r.courseName||'—',
      r.courseCode||'—',
      r.level||'—',
      r.academicYear||'—',
      r.semester||'—',
      r.experimentName||'—',
      r.studentsCount||0,
      r.sectionsCount||0,
      r.groupsCount||0,
      learningReferenceReportBasis(r),
      r.displayQtyPerUse||r.qtyPerUse||r.qtyPerStudent||0,
      r.usageUnit||r.unit||'—',
      r.requestUnit||r.unit||'—',
      `${Number(r.wastePercent||0)}%`,
      r.grossNeed||r.estimatedNeed||0,
      r.stockAvailable||0,
      r.deficit||0,
      r.justification||'—',
      r.recommendation||'—',
      actorName(r.createdBy)
    ])
  };
}

function printLearningReferencesDetailed(){
  openPrint(learningReferencesDetailedReportData());
}

function learningReferenceRowActions(row){
  return `<div class="flex-actions"><button class="btn btn-warning btn-sm" onclick="printLearningReferenceDetail(${row.id})">PDF المرجع</button></div>`;
}

renderNeedEvidence=function(){
  const rows=visibleNeedEvidence().map(r=>[
    learningReferenceNumber(r),
    r.needId?`<span class="badge badge-ok">${r.requestNo||'مرتبط'}</span>`:'—',
    r.categoryLabel||eduReferenceCategory(r.referenceCategoryKey).label,
    r.college,
    r.mainDepartment||'القسم العام',
    r.itemNameAr||'—',
    r.specifications||'—',
    r.courseName||'—',
    r.experimentName||'—',
    r.academicYear||'—',
    r.semester||'—',
    r.studentsCount||0,
    r.sectionsCount||0,
    r.usageUnit||r.unit||'—',
    r.requestUnit||r.unit||'—',
    r.grossNeed||r.estimatedNeed||0,
    r.stockAvailable||0,
    r.deficit||0,
    learningReferenceStatusBadge(r),
    actorName(r.createdBy),
    learningReferenceRowActions(r)
  ]);
  return `<div class="hero"><div class="hero-title">المراجع التعليمية</div><div class="hero-text">كل تجربة تفصل احتياجاتها إلى مواد كيميائية، مستهلكات تعليمية، وأجهزة تعليمية، حتى يراجعها مسؤول القطاع ويولد الاحتياج الرسمي بوضوح.</div></div>
  ${filtersHtml({date:true,searchPlaceholder:'بحث بالمقرر، التجربة، الصنف...'})}
  <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة مرجع تعليمي</button>`:''}${hasPermission('create_need')?`<button class="btn btn-success" onclick="openModal('needFromReferences')">توليد احتياج من المراجع</button>`:''}<button class="btn btn-secondary" onclick="exportNeedEvidenceExecutive()">Excel تنفيذي</button><button class="btn btn-secondary" onclick="printNeedEvidenceExecutive()">PDF تنفيذي</button><button class="btn btn-primary" onclick="printLearningReferencesDetailed()">PDF عام مفصل</button></div></div>
  <div class="table-panel"><div class="table-head"><div class="panel-title">سجل المراجع التعليمية</div><div class="panel-subtitle">يمكن استخراج تقرير تفصيلي لكل مرجع من الصف نفسه، أو تقرير عام مفصل لكل المراجع الظاهرة حسب الفلاتر الحالية.</div></div>${table(['رقم المرجع','طلب الاحتياج','التصنيف','القطاع','القسم الرئيسي','الصنف','الخصائص','المقرر','التجربة','السنة','الفصل','الطلاب','الشعب','وحدة الاستخدام','وحدة الطلب','الاحتياج المحول','الرصيد','العجز','الحالة','صاحب الإجراء','تقرير'],rows)}</div>`;
}
/* ===== end Educational Reference PDF Reports v6.4 ===== */

/* ===== Smart Item Add / Duplicate Guard v6.5 ===== */
function itemFormCanChooseMainDepartment(){
  return isCentral() || !hasDepartmentScope();
}

function itemFormCollegeValue(){
  return isCentral()?document.getElementById('item-college')?.value:state.currentUser?.college;
}

function itemFormDepartmentValue(){
  return document.getElementById('item-mainDepartment')?.value || currentDepartmentName();
}

function itemSmartScopeItems(scopeCollege=null,scopeDepartment=null){
  const college=scopeCollege||itemFormCollegeValue();
  const department=scopeDepartment||itemFormDepartmentValue();
  return (db.items||[]).filter(item=>{
    if(Number(item.id)===Number(state.editId||0)) return false;
    if(item.college!==college) return false;
    if(!itemFormCanChooseMainDepartment() && (item.mainDepartment||'القسم العام')!==department) return false;
    return true;
  });
}

function itemSmartTextMatch(value,item){
  const q=normalizeText(value);
  if(!q) return false;
  return [itemName(item),item.nameAr,item.name,item.nameEn,item.code].some(v=>normalizeText(v)===q);
}

function itemSmartFindMatch(value){
  const q=String(value||'').trim();
  if(!q) return null;
  const department=itemFormDepartmentValue();
  const rows=itemSmartScopeItems();
  return rows.find(item=>itemSmartTextMatch(q,item) && (item.mainDepartment||'القسم العام')===department)
    || rows.find(item=>itemSmartTextMatch(q,item))
    || null;
}

function itemSmartSuggestions(item){
  const info=[item.code,item.mainDepartment||'القسم العام',item.section,`${item.qty||0} ${item.unit||''}`].filter(Boolean).join(' | ');
  return `${itemName(item)} - ${info}`;
}

function itemSmartDatalistOptions(scopeCollege=null,scopeDepartment=null){
  const seen=new Set();
  return itemSmartScopeItems(scopeCollege,scopeDepartment).flatMap(item=>{
    const values=[itemName(item),item.nameEn].map(v=>String(v||'').trim()).filter(Boolean);
    return values.map(value=>({value,item})).filter(({value})=>{
      const key=normalizeText(value);
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }).map(({value,item})=>`<option value="${value}" label="${itemSmartSuggestions(item)}">`).join('');
}

function itemSmartSetSelect(id,value){
  const el=document.getElementById(id);
  if(el && value) el.value=value;
}

function itemSmartFillFromMatch(item,source='name'){
  if(!item || state.editId) return;
  const hidden=document.getElementById('item-existing-id');
  if(hidden) hidden.value=item.id;
  if(itemFormCanChooseMainDepartment()) itemSmartSetSelect('item-mainDepartment',item.mainDepartment||'القسم العام');
  itemSmartSetSelect('item-section',item.section);
  itemSmartSetSelect('item-unit',item.unit);
  itemSmartSetSelect('item-deviceStatus',item.deviceStatus||'يعمل');
  const name=document.getElementById('item-name');
  const nameEn=document.getElementById('item-name-en');
  const qty=document.getElementById('item-qty');
  const minQty=document.getElementById('item-minQty');
  const location=document.getElementById('item-location');
  const serial=document.getElementById('item-serialNumber');
  const notes=document.getElementById('item-notes');
  if(name && source!=='english') name.value=item.nameAr||itemName(item)||'';
  if(nameEn) nameEn.value=item.nameEn||'';
  if(qty) qty.value='0';
  if(minQty) minQty.value=Number(item.minQty||0);
  if(location) location.value=item.location||'';
  if(serial) serial.value=item.serialNumber||'';
  if(notes && !notes.value) notes.value=item.notes||'';
  const hint=document.getElementById('item-smart-hint');
  if(hint){
    hint.innerHTML=`تم العثور على صنف موجود: <strong>${itemName(item)}</strong>، الرصيد الحالي <strong>${item.qty||0} ${item.unit||''}</strong>. أدخل في خانة الكمية مقدار الإضافة فقط، وسيتم جمعها على الرصيد الحالي بدل إنشاء صنف مكرر.`;
    hint.style.display='block';
  }
}

function itemSmartClearMatch(){
  const hidden=document.getElementById('item-existing-id');
  if(hidden) hidden.value='';
  const hint=document.getElementById('item-smart-hint');
  if(hint){
    hint.innerHTML='اكتب اسم الصنف أو اختره من الاقتراحات. إذا كان موجودًا سيتم تعبئة بياناته تلقائيًا وتتحول العملية إلى إضافة كمية على الرصيد.';
    hint.style.display=state.editId?'none':'block';
  }
}

function itemSmartLookup(source='name'){
  if(state.editId) return;
  const value=source==='english'?document.getElementById('item-name-en')?.value:document.getElementById('item-name')?.value;
  const match=itemSmartFindMatch(value);
  if(match) itemSmartFillFromMatch(match,source);
  else itemSmartClearMatch();
}

function itemSmartRefreshAfterScopeChange(){
  const list=document.getElementById('item-name-suggestions');
  if(list) list.innerHTML=itemSmartDatalistOptions(itemFormCollegeValue(),itemFormDepartmentValue());
  itemSmartClearMatch();
  itemSmartLookup('name');
}

itemModalHtml=function(){
  const item=state.editId?getItemById(state.editId):{college:isCentral()?COLLEGE_OPTIONS[0]:state.currentUser.college,mainDepartment:currentDepartmentName(),section:SECTION_OPTIONS[0],unit:UNIT_OPTIONS[0],qty:0,minQty:0,location:'',serialNumber:'',deviceStatus:'يعمل',nameAr:'',nameEn:'',notes:''};
  const college=item.college||(!isCentral()?state.currentUser.college:COLLEGE_OPTIONS[0]);
  const locs=locationOptionsForCollege(college);
  const suggestions=!state.editId?itemSmartDatalistOptions(college,item.mainDepartment||currentDepartmentName()):'';
  return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">${state.editId?'تعديل صنف':'إضافة صنف'}</div><div class="panel-subtitle">${state.editId?'تعديل بيانات الصنف الحالي.':'ابدأ باسم الصنف، وإذا كان موجودًا سيتم التعرف عليه وتعبئة بياناته لإضافة الكمية على الرصيد الحالي.'}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div><div class="modal-body"><input id="item-existing-id" type="hidden" value=""><div id="item-smart-hint" class="alert" style="${state.editId?'display:none':'display:block'}">اكتب اسم الصنف أو اختره من الاقتراحات. إذا كان موجودًا سيتم تعبئة بياناته تلقائيًا وتتحول العملية إلى إضافة كمية على الرصيد.</div><div class="form-grid"><div><label class="label">القطاع</label>${isCentral()?`<select id="item-college" class="select" onchange="itemSmartRefreshAfterScopeChange()">${collegeOptions(college,false)}</select>`:`<input id="item-college" class="input" value="${state.currentUser.college}" readonly>`}</div><div><label class="label">القسم الرئيسي</label>${!isCentral()&&hasDepartmentScope()?`<input id="item-mainDepartment" class="input" value="${state.currentUser.department}" readonly>`:`<select id="item-mainDepartment" class="select" onchange="itemSmartRefreshAfterScopeChange()">${departmentOptions(item.mainDepartment||currentDepartmentName(),false)}</select>`}</div><div><label class="label">القسم الفرعي</label><select id="item-section" class="select">${sectionOptions(item.section,false)}</select></div><div><label class="label">اسم الصنف بالعربية</label><input id="item-name" class="input" list="item-name-suggestions" value="${item.nameAr||''}" oninput="itemSmartLookup('name')" onblur="itemSmartLookup('name')"><datalist id="item-name-suggestions">${suggestions}</datalist></div><div><label class="label">اسم الصنف بالإنجليزية</label><input id="item-name-en" class="input" list="item-name-suggestions" value="${item.nameEn||''}" oninput="itemSmartLookup('english')" onblur="itemSmartLookup('english')"></div><div><label class="label">${state.editId?'الكمية':'الكمية / الكمية المضافة'}</label><input id="item-qty" class="input" type="number" min="0" value="${item.qty||0}"></div><div><label class="label">الوحدة</label><select id="item-unit" class="select">${UNIT_OPTIONS.map(u=>`<option ${item.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="label">الحد الأدنى</label><input id="item-minQty" class="input" type="number" min="0" value="${item.minQty||0}"></div><div><label class="label">الموقع</label><input id="item-location" class="input" list="item-location-list" value="${item.location||''}"><datalist id="item-location-list">${locs.map(x=>`<option value="${x}">`).join('')}</datalist></div><div><label class="label">الرقم التسلسلي</label><input id="item-serialNumber" class="input" value="${item.serialNumber||''}"></div><div><label class="label">حالة الجهاز</label><select id="item-deviceStatus" class="select">${deviceStatuses().map(s=>`<option ${item.deviceStatus===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="full"><label class="label">ملاحظات</label><textarea id="item-notes" class="textarea">${item.notes||''}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveItem()">${state.editId?'حفظ':'حفظ / إضافة للرصيد'}</button></div></div></div>`;
}

function readItemFormValues(){
  return {
    college:isCentral()?document.getElementById('item-college').value:state.currentUser.college,
    mainDepartment:document.getElementById('item-mainDepartment')?.value || currentDepartmentName(),
    section:document.getElementById('item-section').value,
    nameAr:document.getElementById('item-name').value.trim(),
    nameEn:document.getElementById('item-name-en').value.trim(),
    unit:document.getElementById('item-unit').value,
    qty:Number(document.getElementById('item-qty').value||0),
    minQty:Number(document.getElementById('item-minQty').value||0),
    location:document.getElementById('item-location').value.trim(),
    serialNumber:document.getElementById('item-serialNumber').value.trim(),
    deviceStatus:document.getElementById('item-deviceStatus').value,
    notes:document.getElementById('item-notes').value.trim()
  };
}

function itemDuplicateForValues(values,currentId=null){
  const keyAr=normalizeText(values.nameAr);
  const keyEn=normalizeText(values.nameEn);
  return (db.items||[]).find(item=>{
    if(Number(item.id)===Number(currentId||0)) return false;
    if(item.college!==values.college) return false;
    if((item.mainDepartment||'القسم العام')!==values.mainDepartment) return false;
    return normalizeText(itemName(item))===keyAr || (keyEn && normalizeText(item.nameEn)===keyEn);
  })||null;
}

function updateExistingItemFromForm(item,values){
  const addedQty=Number(values.qty||0);
  if(addedQty<0) return alert('الكمية يجب ألا تكون أقل من صفر');
  const oldQty=Number(item.qty||0);
  item.nameAr=item.nameAr||values.nameAr;
  item.name=item.nameAr;
  item.nameEn=item.nameEn||values.nameEn;
  item.section=values.section||item.section;
  item.unit=values.unit||item.unit;
  item.minQty=Number(values.minQty||item.minQty||0);
  item.location=values.location||item.location||'';
  item.serialNumber=values.serialNumber||item.serialNumber||'';
  item.deviceStatus=values.deviceStatus||item.deviceStatus||'';
  item.notes=values.notes||item.notes||'';
  item.lastEditedAt=nowLocalString();
  item.lastEditedBy=state.currentUser.id;
  item.qty=oldQty+addedQty;
  if(addedQty>0){
    db.transactions=db.transactions||[];
    db.transactions.unshift({
      id:nextId(db.transactions),
      type:'receive',
      status:'approved',
      itemId:item.id,
      college:item.college,
      mainDepartment:item.mainDepartment||'القسم العام',
      section:item.section,
      qty:addedQty,
      unit:item.unit,
      transactionAt:nowLocalString(),
      notes:`إضافة كمية من شاشة الأصناف بعد التعرف على الصنف الموجود. الرصيد السابق ${oldQty}، الرصيد الجديد ${item.qty}.`,
      createdBy:state.currentUser.id,
      approvedBy:state.currentUser.id,
      reviewedBy:state.currentUser.id
    });
  }
  auditLog('تحديث رصيد صنف موجود','item',item.id,`تمت إضافة ${addedQty} ${item.unit} إلى ${itemName(item)}. الرصيد: ${oldQty} → ${item.qty}`,item.college,item.mainDepartment);
  saveDb();
  closeModal();
  alert(addedQty>0?'تمت إضافة الكمية إلى الصنف الموجود بدون إنشاء تكرار.':'تم تحديث بيانات الصنف الموجود بدون إنشاء تكرار.');
}

saveItem=function(){
  const id=state.editId;
  const values=readItemFormValues();
  if(!values.nameAr) return alert('أدخل اسم الصنف');
  if(values.qty<0) return alert('الكمية يجب ألا تكون أقل من صفر');
  if(id){
    const duplicate=itemDuplicateForValues(values,id);
    if(duplicate) return alert(`يوجد صنف بنفس الاسم في نفس القطاع والقسم الرئيسي: ${itemName(duplicate)}. لا يمكن حفظ تكرار.`);
    const item=getItemById(id);
    if(!item) return alert('الصنف غير موجود');
    Object.assign(item,{
      college:values.college,
      mainDepartment:values.mainDepartment,
      nameAr:values.nameAr,
      name:values.nameAr,
      nameEn:values.nameEn,
      section:values.section,
      code:generateItemCode(values.college,values.section,id),
      unit:values.unit,
      qty:values.qty,
      minQty:values.minQty,
      location:values.location,
      serialNumber:values.serialNumber,
      deviceStatus:values.deviceStatus,
      notes:values.notes,
      lastEditedAt:nowLocalString(),
      lastEditedBy:state.currentUser.id
    });
    auditLog('تعديل صنف','item',item.id,`تم تعديل ${item.nameAr}`,item.college,item.mainDepartment);
    saveDb();
    closeModal();
    return;
  }
  const hiddenId=Number(document.getElementById('item-existing-id')?.value||0);
  const hiddenMatch=hiddenId?getItemById(hiddenId):null;
  const duplicate=hiddenMatch||itemDuplicateForValues(values,null);
  if(duplicate) return updateExistingItemFromForm(duplicate,values);
  const item={id:nextId(db.items),createdAt:nowLocalString(),createdBy:state.currentUser.id};
  Object.assign(item,{
    college:values.college,
    mainDepartment:values.mainDepartment,
    nameAr:values.nameAr,
    name:values.nameAr,
    nameEn:values.nameEn,
    section:values.section,
    code:generateItemCode(values.college,values.section,null),
    unit:values.unit,
    qty:values.qty,
    minQty:values.minQty,
    location:values.location,
    serialNumber:values.serialNumber,
    deviceStatus:values.deviceStatus,
    notes:values.notes
  });
  db.items.push(item);
  auditLog('إضافة صنف','item',item.id,`تمت إضافة ${item.nameAr}`,item.college,item.mainDepartment);
  saveDb();
  closeModal();
}
/* ===== end Smart Item Add / Duplicate Guard v6.5 ===== */

/* ===== Taibah University Official Identity v6.6 ===== */
const TAIBAH_LOGO_SRC='taibah-logo.png';

function taibahLogoUrl(){
  try{return new URL(TAIBAH_LOGO_SRC,window.location.href).href}catch(e){return TAIBAH_LOGO_SRC}
}

function taibahBrandLockup(subtitle='نظام إدارة التجهيزات والمخزون'){
  return `<div class="brand-lockup"><div class="brand-logo-panel"><img class="brand-logo" src="${TAIBAH_LOGO_SRC}" alt="شعار جامعة طيبة"></div><div class="brand-copy"><div class="brand-title">جامعة طيبة</div><div class="brand-subtitle">${subtitle}</div></div></div>`;
}

renderLogin=function(){
  return `<div class="login-screen demo-login"><div class="login-card demo-login-card">${taibahBrandLockup('منصة تنفيذية لإدارة المخزون والاحتياج والدعم بين القطاعات التعليمية')}<div class="demo-pill">نسخة عرض للمديرين</div><div class="input-group"><label class="label">اسم المستخدم</label><input id="login-username" class="input" value="admin" placeholder="أدخل اسم المستخدم"></div><div class="input-group"><label class="label">كلمة المرور</label><input id="login-password" type="password" class="input" value="123" placeholder="أدخل كلمة المرور"></div><button class="btn btn-primary" style="width:100%" onclick="doLogin()">دخول نسخة العرض</button>${typeof demoAccountCards==='function'?demoAccountCards():''}</div></div>`;
}

renderApp=function(){
  const nav=navItems();
  if(!nav.some(n=>n.id===state.currentPage)) state.currentPage=nav[0]?.id||'executive';
  return `<div class="mobile-overlay ${state.sidebarOpen?'show':''}" onclick="closeSidebar()"></div><div class="app demo-shell"><aside class="sidebar ${state.sidebarOpen?'open':''}"><div class="brand-wrap">${taibahBrandLockup('إدارة التجهيزات والمخزون')}</div><div class="nav">${nav.map(n=>`<div class="nav-item ${state.currentPage===n.id?'active':''}" onclick="setPage('${n.id}')"><div>${n.icon}</div><div>${n.label}</div></div>`).join('')}</div><div class="user-panel"><div class="user-card"><div class="user-name">${state.currentUser.fullName}</div><div class="user-role">${state.currentUser.role==='admin'?'مدير النظام':state.currentUser.jobTitle}</div><div class="user-meta">الجهة: ${state.currentUser.college}<br>القسم: ${state.currentUser.department}</div><button class="btn logout-btn" onclick="logout()">تسجيل الخروج</button></div></div></aside><main class="main"><div class="topbar demo-topbar"><div class="topbar-title-group"><img class="topbar-logo" src="${TAIBAH_LOGO_SRC}" alt="جامعة طيبة"><div><div class="page-title">${getPageTitle()}</div><div class="page-subtitle">منظومة موحدة لحوكمة المخزون والاحتياج وفق هوية جامعة طيبة.</div></div></div><div class="mobile-top-actions"><button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button></div><div class="demo-top-actions"><div class="tag demo-tag">${window.DEMO_LABEL||'نسخة عرض'}</div><div class="tag">${state.currentUser.college}</div><button class="btn btn-secondary btn-sm" onclick="resetDemoData()">إعادة ضبط العرض</button></div></div><div class="content">${renderPageContent()}<div class="footer-note">${typeof syncStatusText==='function'?syncStatusText():'نسخة عرض محلية.'}</div></div></main>${modalHtml()}</div>`;
}

officialReportHtml=function(data){
  const rows=data.rows||[];
  const meta=officialReportMeta(data);
  const summary=data.summary||[];
  const logo=taibahLogoUrl();
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${officialReportText(data.title)}</title><style>
    @page{size:A4 landscape;margin:11mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#111144;background:#fff;direction:rtl}
    .report{min-height:100vh}
    .head{display:grid;grid-template-columns:1fr 172px;gap:18px;align-items:center;border-bottom:5px solid #0a8e6e;padding:0 0 14px;margin-bottom:14px}
    .kicker{font-size:12px;color:#4056e3;font-weight:900}
    h1{margin:4px 0 6px;color:#111144;font-size:24px;line-height:1.5}
    .sub{color:#5f6377;font-size:13px;line-height:1.8}
    .report-logo{width:160px;max-height:100px;object-fit:contain;justify-self:end}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}
    .meta div,.summary div{border:1px solid #dfe3ef;border-radius:8px;padding:8px 10px;background:#f8fbfd;font-size:12px;line-height:1.7}
    .meta strong,.summary strong{display:block;color:#111144;font-size:12px}
    .summary{display:grid;grid-template-columns:repeat(${Math.max(Math.min(summary.length,4),1)},1fr);gap:8px;margin:0 0 12px}
    .summary div{border-top:3px solid #00aeda}
    table{width:100%;border-collapse:collapse;font-size:10.5px;page-break-inside:auto}
    tr{page-break-inside:avoid;page-break-after:auto}
    th,td{border:1px solid #d8deeb;padding:6px 7px;text-align:right;vertical-align:top}
    th{background:#f2f2f2;color:#111144;font-weight:900}
    tbody tr:nth-child(even) td{background:#fbfdff}
    .foot{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:end}
    .sign{height:58px;border:1px solid #dfe3ef;border-radius:8px;padding:8px;color:#5f6377;font-size:11px}
    .note{font-size:10px;color:#5f6377;line-height:1.8;margin-top:8px;border-right:4px solid #e5c603;padding-right:8px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="report">
    <header class="head"><div><div class="kicker">جامعة طيبة | نظام إدارة التجهيزات والمخزون</div><h1>${officialReportText(data.title)}</h1><div class="sub">${officialReportText(data.subtitle||'تقرير رسمي مستخرج من بيانات النظام حسب الصلاحيات والفلاتر الحالية.')}</div></div><img class="report-logo" src="${logo}" alt="شعار جامعة طيبة"></header>
    <section class="meta">${meta.map(([k,v])=>`<div><strong>${officialReportText(k)}</strong>${officialReportText(v)}</div>`).join('')}</section>
    ${summary.length?`<section class="summary">${summary.map(([k,v])=>`<div><strong>${officialReportText(k)}</strong>${officialReportText(v)}</div>`).join('')}</section>`:''}
    <table><thead><tr>${(data.headers||[]).map(h=>`<th>${officialReportText(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${officialReportText(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${(data.headers||[]).length||1}">لا توجد بيانات</td></tr>`}</tbody></table>
    <section class="foot"><div class="sign">إعداد</div><div class="sign">مراجعة</div><div class="sign">اعتماد</div></section>
    <div class="note">ملاحظة: يعتمد التقرير على البيانات المسجلة في النظام وقت الاستخراج. يرجى مراجعة الشواهد قبل الرفع للمنافسة أو الاعتماد النهائي.</div>
  </main></body></html>`;
}
/* ===== end Taibah University Official Identity v6.6 ===== */

/* ===== Sector Dashboard Scope Guard v6.7 ===== */
function scopeText(value){
  return String(value||'').trim();
}

function isSectorWideDepartment(department){
  return [
    '',
    'all',
    'الكل',
    'ط§ظ„ظƒظ„',
    'القسم العام',
    'ط§ظ„ظ‚ط³ظ… ط§ظ„ط¹ط§ظ…',
    '—',
    'â€”'
  ].includes(scopeText(department));
}

function hasSectorDepartmentScope(){
  return !isCentral() && !isSectorWideDepartment(state.currentUser?.department);
}

function rowMatchesCurrentDepartment(row){
  if(!hasSectorDepartmentScope()) return true;
  const department=scopeText(state.currentUser?.department);
  return [
    row?.mainDepartment,
    row?.department,
    row?.section
  ].some(value=>scopeText(value)===department);
}

function currentSectorItems(){
  let rows=db.items||[];
  if(!isCentral()){
    rows=rows.filter(item=>item.college===state.currentUser?.college);
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

function currentSectorNeeds(){
  let rows=db.needsRequests||[];
  if(!isCentral()){
    rows=rows.filter(need=>need.college===state.currentUser?.college);
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

function currentSectorSupport(){
  let rows=db.supportRequests||[];
  if(!isCentral()){
    rows=rows.filter(req=>req.fromCollege===state.currentUser?.college||req.toCollege===state.currentUser?.college);
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

function currentSectorLearningReferences(){
  let rows=db.needEvidence||[];
  if(!isCentral()){
    const college=state.currentUser?.college;
    const visibleNeedIds=new Set(currentSectorNeeds().map(need=>Number(need.id)));
    rows=rows.filter(ref=>ref.college===college||visibleNeedIds.has(Number(ref.needId)));
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

function isTeachingDeviceItem(item){
  return ['الأجهزة التعليمية','ط§ظ„ط£ط¬ظ‡ط²ط© ط§ظ„طھط¹ظ„ظٹظ…ظٹط©'].includes(scopeText(item?.section));
}

function isReadyTeachingDevice(item){
  return ['يعمل','عهدة','ظٹط¹ظ…ظ„','ط¹ظ‡ط¯ط©'].includes(scopeText(item?.deviceStatus||'يعمل'));
}

demoExecutiveStats=function(){
  const items=isCentral()?visibleItems(true):currentSectorItems();
  const needs=isCentral()?(db.needsRequests||[]):currentSectorNeeds();
  const support=isCentral()?(db.supportRequests||[]):currentSectorSupport();
  const devices=items.filter(isTeachingDeviceItem);
  return {
    items:items.length,
    colleges:new Set(items.map(item=>item.college).filter(college=>college&&college!=='إدارة التجهيزات'&&college!=='ط¥ط¯ط§ط±ط© ط§ظ„طھط¬ظ‡ظٹط²ط§طھ')).size,
    low:items.filter(item=>Number(item.qty)<=Number(item.minQty)).length,
    devices:devices.length,
    readyDevices:devices.filter(isReadyTeachingDevice).length,
    needs:needs.length,
    approvedNeeds:needs.filter(need=>need.status==='approved').length,
    activeNeeds:needs.filter(need=>['pending','pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(need.status||'pending_sector_approval')).length,
    support:support.length,
    activeSupport:support.filter(req=>['pending','pending_owner','owner_approved','pending_equipment'].includes(req.status||'pending_owner')).length
  };
}

alertsHtml=function(){
  const items=isCentral()?visibleItems(true):currentSectorItems();
  const transactions=isCentral()?visibleTransactions():(db.transactions||[]).filter(tx=>tx.college===state.currentUser?.college).filter(rowMatchesCurrentDepartment);
  const needs=isCentral()?filteredNeeds():currentSectorNeeds();
  const support=isCentral()?filteredSupport():currentSectorSupport();
  const references=isCentral()?(db.needEvidence||[]):currentSectorLearningReferences();
  const lows=items.filter(item=>Number(item.qty)<=Number(item.minQty)).length;
  const pendingIssue=transactions.filter(tx=>tx.type==='issue'&&(tx.status||'pending')==='pending').length;
  const pendingNeeds=needs.filter(need=>['pending','pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(need.status||'pending_sector_approval')).length;
  const noRefs=needs.filter(need=>evidenceCountForNeed(need.id)===0).length;
  const readyRefs=references.filter(ref=>typeof isLearningReferenceReady==='function'?isLearningReferenceReady(ref):true).length;
  const pendingSupport=support.filter(req=>['pending','pending_owner','owner_approved','pending_equipment'].includes(req.status||'pending_owner')).length;
  const cards=[
    ['مواد تحت الحد الأدنى',lows,'تحتاج معالجة أو رفع احتياج'],
    ['طلبات صرف معلقة',pendingIssue,'بانتظار قرار المسؤول'],
    ['طلبات احتياج قيد الإجراء',pendingNeeds,'ضمن نطاق القطاع الحالي'],
    ['طلبات احتياج بلا مراجع',noRefs,'يفضل ربطها بمرجع تعليمي عند الإمكان'],
    ['مراجع جاهزة للتوليد',readyRefs,'يمكن توليد احتياج منها'],
    ['طلبات دعم بين القطاعات',pendingSupport,'طلبات تخص هذا القطاع فقط']
  ];
  return `<div class="alert-grid">${cards.map(card=>`<div class="alert-card"><strong>${card[0]}</strong><b>${card[1]}</b><span>${card[2]}</span></div>`).join('')}</div>`;
}

renderDashboard=function(){
  const items=isCentral()?visibleItems(true):currentSectorItems();
  const deviceRows=items.filter(isTeachingDeviceItem).map(item=>[
    item.college,
    item.mainDepartment||'القسم العام',
    itemName(item),
    item.serialNumber||'—',
    item.deviceStatus||'يعمل',
    item.location||'—',
    item.qty,
    itemActionButtons(item)
  ]);
  return `<div class="hero"><div class="hero-title">لوحة متابعة ${isCentral()?'جامعة طيبة':state.currentUser.college}</div><div class="hero-text">مؤشرات تشغيلية مختصرة ضمن نطاق صلاحية المستخدم الحالي: جاهزية الأجهزة، الأصناف المنخفضة، والطلبات النشطة.</div></div>${demoKpisHtml()}${alertsHtml()}<div class="table-panel"><div class="table-head"><div class="panel-title">حالة الأجهزة التعليمية</div><div class="panel-subtitle">${isCentral()?'عرض مركزي لجميع القطاعات.':'يعرض أجهزة القطاع الحالي فقط ولا يسحب بيانات القطاعات الأخرى.'}</div></div>${table(['القطاع','القسم الرئيسي','الجهاز','الرقم التسلسلي','الحالة','الموقع','الكمية','إجراء'],deviceRows)}</div>`;
}
/* ===== end Sector Dashboard Scope Guard v6.7 ===== */

/* ===== Sector Data Isolation Guard v6.8 ===== */
const __scopeOriginalAvailableReportTabs = availableReportTabs;
const __scopeOriginalReportData = reportData;
const __scopeOriginalSaveTransaction = typeof saveTransaction === 'function' ? saveTransaction : null;
const __scopeOriginalSaveNeed = typeof saveNeed === 'function' ? saveNeed : null;
const __scopeOriginalApproveIssue = typeof approveIssue === 'function' ? approveIssue : null;
const __scopeOriginalRejectIssue = typeof rejectIssue === 'function' ? rejectIssue : null;
const __scopeOriginalApproveNeed = typeof approveNeed === 'function' ? approveNeed : null;
const __scopeOriginalRejectNeed = typeof rejectNeed === 'function' ? rejectNeed : null;
const __scopeOriginalReturnNeed = typeof returnNeed === 'function' ? returnNeed : null;
const __scopeOriginalOwnerApproveSupport = typeof ownerApproveSupport === 'function' ? ownerApproveSupport : null;
const __scopeOriginalApproveSupport = typeof approveSupport === 'function' ? approveSupport : null;
const __scopeOriginalRejectSupport = typeof rejectSupport === 'function' ? rejectSupport : null;
const __scopeOriginalSaveSupport = typeof saveSupport === 'function' ? saveSupport : null;

function scopeClean(value){
  return String(value||'').trim();
}

function scopeIsCentralCollege(college){
  const text=scopeClean(college);
  return ['إدارة التجهيزات','إدارة التجهيزات والمخزون'].includes(text);
}

isCentral=function(){
  return state.currentUser?.role==='admin' || scopeIsCentralCollege(state.currentUser?.college);
}

canAccessCollege=function(college){
  return isCentral() || scopeClean(state.currentUser?.college)===scopeClean(college);
}

isSectorWideDepartment=function(department){
  return ['', 'all', 'الكل', 'القسم العام', '—', '-'].includes(scopeClean(department));
}

hasDepartmentScope=function(){
  return !isCentral() && !isSectorWideDepartment(state.currentUser?.department);
}

rowMatchesCurrentDepartment=function(row){
  if(!hasDepartmentScope()) return true;
  const department=scopeClean(state.currentUser?.department);
  return [
    row?.mainDepartment,
    row?.department,
    row?.section
  ].some(value=>scopeClean(value)===department);
}

function scopeMatchesUiSection(row){
  if(state.sectionFilter==='all') return true;
  const selected=scopeClean(state.sectionFilter);
  return [
    row?.mainDepartment,
    row?.department,
    row?.section
  ].some(value=>scopeClean(value)===selected);
}

function scopeSearchMatch(row, fields){
  const query=scopeClean(state.search).toLowerCase();
  if(!query) return true;
  return fields.map(field=>typeof field==='function'?field(row):row?.[field])
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function scopeApplyCollegeFilter(rows, getter){
  if(state.collegeFilter==='all') return rows;
  const selected=scopeClean(state.collegeFilter);
  return rows.filter(row=>getter(row).some(value=>scopeClean(value)===selected));
}

currentSectorItems=function(){
  let rows=db.items||[];
  if(!isCentral()){
    rows=rows.filter(item=>canAccessCollege(item.college)).filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

currentSectorNeeds=function(){
  let rows=db.needsRequests||[];
  if(!isCentral()){
    rows=rows.filter(need=>canAccessCollege(need.college)).filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

currentSectorSupport=function(){
  let rows=db.supportRequests||[];
  if(!isCentral()){
    const college=scopeClean(state.currentUser?.college);
    rows=rows.filter(req=>scopeClean(req.fromCollege)===college || scopeClean(req.toCollege)===college);
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

currentSectorLearningReferences=function(){
  let rows=db.needEvidence||[];
  if(!isCentral()){
    const college=scopeClean(state.currentUser?.college);
    const visibleNeedIds=new Set(currentSectorNeeds().map(need=>Number(need.id)));
    rows=rows.filter(ref=>scopeClean(ref.college)===college || visibleNeedIds.has(Number(ref.needId)));
    rows=rows.filter(rowMatchesCurrentDepartment);
  }
  return rows;
}

visibleItems=function(all=false){
  let rows=db.items||[];
  if(!isCentral()) rows=currentSectorItems();
  if(isCentral() && !all && state.collegeFilter!=='all') rows=rows.filter(item=>scopeClean(item.college)===scopeClean(state.collegeFilter));
  if(isCentral() && all && state.collegeFilter!=='all') rows=rows.filter(item=>scopeClean(item.college)===scopeClean(state.collegeFilter));
  if(!isCentral() && state.collegeFilter!=='all' && scopeClean(state.collegeFilter)!==scopeClean(state.currentUser?.college)) rows=[];
  rows=rows.filter(scopeMatchesUiSection);
  rows=rows.filter(item=>scopeSearchMatch(item,[itemName,'nameEn','code','college','mainDepartment','section','location','serialNumber']));
  return rows;
}

visibleTransactions=function(){
  let rows=db.transactions||[];
  if(!isCentral()) rows=rows.filter(tx=>canAccessCollege(tx.college)).filter(rowMatchesCurrentDepartment);
  rows=scopeApplyCollegeFilter(rows,row=>[row.college]);
  rows=rows.filter(scopeMatchesUiSection);
  rows=rows.filter(tx=>scopeSearchMatch(tx,[row=>itemName(getItemById(row.itemId)),'college','mainDepartment','section','type','notes','status',row=>actorName(row.createdBy),row=>actorName(row.reviewedBy)]));
  if(typeof rowWithinDateRange==='function') rows=rows.filter(tx=>rowObjectWithinDateRange(tx,['transactionAt','createdAt','approvedAt','reviewedAt']));
  return rows.sort((a,b)=>(b.transactionAt||b.createdAt||'').localeCompare(a.transactionAt||a.createdAt||''));
}

filteredNeeds=function(){
  let rows=db.needsRequests||[];
  if(!isCentral()) rows=currentSectorNeeds();
  rows=scopeApplyCollegeFilter(rows,row=>[row.college]);
  rows=rows.filter(scopeMatchesUiSection);
  rows=rows.filter(need=>scopeSearchMatch(need,['requestNo','erpCode','college','mainDepartment','section','itemNameAr','itemNameEn','notes','workflowStage',row=>statusText(row.status),row=>actorName(row.createdBy),row=>actorName(row.reviewedBy)]));
  if(typeof rowObjectWithinDateRange==='function') rows=rows.filter(need=>rowObjectWithinDateRange(need,['createdAt','reviewedAt','sectorApprovedAt','updatedAt']));
  if(state.needStatusFilter && state.needStatusFilter!=='all') rows=rows.filter(need=>String(need.status||'pending_sector_approval')===state.needStatusFilter);
  return rows;
}

filteredSupport=function(){
  let rows=db.supportRequests||[];
  if(!isCentral()) rows=currentSectorSupport();
  rows=scopeApplyCollegeFilter(rows,row=>[row.fromCollege,row.toCollege]);
  rows=rows.filter(scopeMatchesUiSection);
  rows=rows.filter(req=>scopeSearchMatch(req,['requestNo','supportType','fromCollege','toCollege','mainDepartment','section','itemName','notes','workflowStage',row=>statusText(row.status),row=>actorName(row.createdBy),row=>actorName(row.ownerReviewedBy),row=>actorName(row.reviewedBy)]));
  if(typeof rowObjectWithinDateRange==='function') rows=rows.filter(req=>rowObjectWithinDateRange(req,['createdAt','reviewedAt','ownerReviewedAt','updatedAt']));
  return rows;
}

visibleNeedEvidence=function(){
  if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
  let rows=isCentral()?(db.needEvidence||[]):currentSectorLearningReferences();
  rows=scopeApplyCollegeFilter(rows,row=>[row.college]);
  rows=rows.filter(scopeMatchesUiSection);
  rows=rows.filter(ref=>scopeSearchMatch(ref,[learningReferenceNumber,'requestNo','college','mainDepartment','section','itemNameAr','itemNameEn','courseName','courseCode','experimentName','academicYear','semester','justification','recommendation','notes']));
  if(typeof rowObjectWithinDateRange==='function') rows=rows.filter(ref=>rowObjectWithinDateRange(ref,['createdAt','updatedAt','generatedAt']));
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}

lowStock=function(){
  return (isCentral()?visibleItems(true):visibleItems()).filter(item=>Number(item.qty)<=Number(item.minQty));
}

metrics=function(){
  const items=isCentral()?visibleItems(true):visibleItems();
  const tx=visibleTransactions();
  const needs=filteredNeeds();
  const support=filteredSupport();
  return {
    items:items.length,
    colleges:isCentral()?new Set(items.map(item=>item.college).filter(Boolean)).size:1,
    low:items.filter(item=>Number(item.qty)<=Number(item.minQty)).length,
    devices:items.filter(isTeachingDeviceItem).length,
    pendingIssue:tx.filter(t=>t.type==='issue'&&(t.status||'pending')==='pending').length,
    pendingNeeds:needs.filter(n=>['pending','pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(n.status||'pending_sector_approval')).length,
    pendingSupport:support.filter(s=>['pending','pending_owner','owner_approved','pending_equipment'].includes(s.status||'pending_owner')).length,
    approvedSupport:support.filter(s=>s.status==='approved').length
  };
}

demoExecutiveStats=function(){
  const items=isCentral()?visibleItems(true):visibleItems();
  const needs=filteredNeeds();
  const support=filteredSupport();
  const devices=items.filter(isTeachingDeviceItem);
  return {
    items:items.length,
    colleges:isCentral()?new Set(items.map(item=>item.college).filter(college=>college&&!scopeIsCentralCollege(college))).size:1,
    low:items.filter(item=>Number(item.qty)<=Number(item.minQty)).length,
    devices:devices.length,
    readyDevices:devices.filter(isReadyTeachingDevice).length,
    needs:needs.length,
    approvedNeeds:needs.filter(need=>need.status==='approved').length,
    activeNeeds:needs.filter(need=>['pending','pending_sector_approval','pending_equipment_review','returned_to_sector'].includes(need.status||'pending_sector_approval')).length,
    support:support.length,
    activeSupport:support.filter(req=>['pending','pending_owner','owner_approved','pending_equipment'].includes(req.status||'pending_owner')).length
  };
}

availableReportTabs=function(){
  const tabs=__scopeOriginalAvailableReportTabs();
  return isCentral()?tabs:tabs.filter(tab=>tab[0]!=='senior');
}

reportData=function(){
  if(state.reportTab==='senior' && !isCentral()){
    const s=demoExecutiveStats();
    return {
      title:'تقرير تنفيذي للقطاع',
      headers:['المؤشر','القيمة','قراءة تشغيلية'],
      rows:[
        ['القطاع',state.currentUser?.college||'—','نطاق بيانات الحساب الحالي'],
        ['الأصناف المسجلة',s.items,'أصناف ظاهرة ضمن صلاحية القطاع'],
        ['الأصناف تحت الحد الأدنى',s.low,'تحتاج معالجة أو رفع احتياج'],
        ['جاهزية الأجهزة التعليمية',demoPercent(s.readyDevices,s.devices)+'%','ضمن أجهزة القطاع الحالية'],
        ['طلبات الاحتياج قيد الإجراء',s.activeNeeds,'طلبات تخص القطاع الحالي'],
        ['طلبات الدعم النشطة',s.activeSupport,'طلبات يكون القطاع طرفاً فيها']
      ]
    };
  }
  return __scopeOriginalReportData();
}

supportSearchResults=function(){
  const query=scopeClean(state.search).toLowerCase();
  let rows=(db.items||[]).filter(item=>Number(item.qty||0)>0);
  if(!isCentral()) rows=rows.filter(item=>!canAccessCollege(item.college));
  rows=scopeApplyCollegeFilter(rows,row=>[row.college]);
  rows=rows.filter(scopeMatchesUiSection);
  if(query){
    rows=rows.filter(item=>[itemName(item),item.nameEn,item.code,item.college,item.mainDepartment,item.section,item.location].join(' ').toLowerCase().includes(query));
  }else{
    rows=[];
  }
  return rows.sort((a,b)=>scopeClean(a.college).localeCompare(scopeClean(b.college)) || scopeClean(a.section).localeCompare(scopeClean(b.section)) || scopeClean(itemName(a)).localeCompare(scopeClean(itemName(b))));
}

renderDashboard=function(){
  const items=isCentral()?visibleItems(true):visibleItems();
  const deviceRows=items.filter(isTeachingDeviceItem).map(item=>[
    item.college,
    item.mainDepartment||'القسم العام',
    itemName(item),
    item.serialNumber||'—',
    item.deviceStatus||'يعمل',
    item.location||'—',
    item.qty,
    itemActionButtons(item)
  ]);
  return `<div class="hero"><div class="hero-title">لوحة متابعة ${isCentral()?'جامعة طيبة':state.currentUser.college}</div><div class="hero-text">مؤشرات تشغيلية مختصرة ضمن نطاق صلاحية المستخدم الحالي: جاهزية الأجهزة، الأصناف المنخفضة، والطلبات النشطة.</div></div>${demoKpisHtml()}${alertsHtml()}<div class="table-panel"><div class="table-head"><div class="panel-title">حالة الأجهزة التعليمية</div><div class="panel-subtitle">${isCentral()?'عرض مركزي لجميع القطاعات.':'يعرض أجهزة القطاع الحالي فقط ولا يسحب بيانات القطاعات الأخرى.'}</div></div>${table(['القطاع','القسم الرئيسي','الجهاز','الرقم التسلسلي','الحالة','الموقع','الكمية','إجراء'],deviceRows)}</div>`;
}

function scopeDeny(){
  alert('لا تملك صلاحية تنفيذ هذا الإجراء خارج نطاق قطاعك.');
}

saveTransaction=function(){
  if(__scopeOriginalSaveTransaction){
    const item=getItemById(Number(document.getElementById('tx-item')?.value));
    if(item && !canAccessCollege(item.college)) return scopeDeny();
    return __scopeOriginalSaveTransaction();
  }
}

saveNeed=function(){
  if(!isCentral()){
    const collegeEl=document.getElementById('need-college');
    if(collegeEl) collegeEl.value=state.currentUser.college;
    const editCollegeEl=document.getElementById('edit-need-college');
    if(editCollegeEl) editCollegeEl.value=state.currentUser.college;
  }
  return __scopeOriginalSaveNeed?__scopeOriginalSaveNeed():undefined;
}

approveIssue=function(id){
  const tx=(db.transactions||[]).find(row=>Number(row.id)===Number(id));
  if(tx && (!canAccessCollege(tx.college)||!rowMatchesCurrentDepartment(tx))) return scopeDeny();
  return __scopeOriginalApproveIssue?__scopeOriginalApproveIssue(id):undefined;
}

rejectIssue=function(id){
  const tx=(db.transactions||[]).find(row=>Number(row.id)===Number(id));
  if(tx && (!canAccessCollege(tx.college)||!rowMatchesCurrentDepartment(tx))) return scopeDeny();
  return __scopeOriginalRejectIssue?__scopeOriginalRejectIssue(id):undefined;
}

approveNeed=function(id){
  const need=(db.needsRequests||[]).find(row=>Number(row.id)===Number(id));
  if(need && !isCentral() && (!canAccessCollege(need.college)||!rowMatchesCurrentDepartment(need))) return scopeDeny();
  return __scopeOriginalApproveNeed?__scopeOriginalApproveNeed(id):undefined;
}

rejectNeed=function(id){
  const need=(db.needsRequests||[]).find(row=>Number(row.id)===Number(id));
  if(need && !isCentral() && (!canAccessCollege(need.college)||!rowMatchesCurrentDepartment(need))) return scopeDeny();
  return __scopeOriginalRejectNeed?__scopeOriginalRejectNeed(id):undefined;
}

returnNeed=function(id){
  const need=(db.needsRequests||[]).find(row=>Number(row.id)===Number(id));
  if(need && !isCentral() && (!canAccessCollege(need.college)||!rowMatchesCurrentDepartment(need))) return scopeDeny();
  return __scopeOriginalReturnNeed?__scopeOriginalReturnNeed(id):undefined;
}

ownerApproveSupport=function(id){
  const req=(db.supportRequests||[]).find(row=>Number(row.id)===Number(id));
  if(req && !isCentral() && scopeClean(req.toCollege)!==scopeClean(state.currentUser?.college)) return scopeDeny();
  return __scopeOriginalOwnerApproveSupport?__scopeOriginalOwnerApproveSupport(id):undefined;
}

approveSupport=function(id){
  const req=(db.supportRequests||[]).find(row=>Number(row.id)===Number(id));
  if(req && !isCentral()) return scopeDeny();
  return __scopeOriginalApproveSupport?__scopeOriginalApproveSupport(id):undefined;
}

rejectSupport=function(id){
  const req=(db.supportRequests||[]).find(row=>Number(row.id)===Number(id));
  const college=scopeClean(state.currentUser?.college);
  if(req && !isCentral() && ![req.fromCollege,req.toCollege].map(scopeClean).includes(college)) return scopeDeny();
  return __scopeOriginalRejectSupport?__scopeOriginalRejectSupport(id):undefined;
}

saveSupport=function(){
  const item=getItemById(state.editId);
  if(item && !isCentral() && canAccessCollege(item.college)) return alert('لا يمكن طلب دعم من مخزون قطاعك؛ استخدم طلب صرف داخلي.');
  return __scopeOriginalSaveSupport?__scopeOriginalSaveSupport():undefined;
}
/* ===== end Sector Data Isolation Guard v6.8 ===== */

/* ===== Need Approval Workflow v6.9 ===== */
;(function(){
  const WORKFLOW_STATES={
    draft:{
      label:'مسودة',
      stage:'مسودة داخل القطاع',
      badge:'badge-info',
      summary:'لم ترسل للاعتماد'
    },
    pending_sector_approval:{
      label:'بانتظار اعتماد مسؤول القطاع',
      stage:'بانتظار اعتماد مسؤول القطاع',
      badge:'badge-warning',
      summary:'لدى مسؤول القطاع'
    },
    pending_equipment_review:{
      label:'بانتظار مراجعة إدارة التجهيزات',
      stage:'اعتمدها القطاع وأحيلت لإدارة التجهيزات',
      badge:'badge-warning',
      summary:'لدى إدارة التجهيزات'
    },
    returned_to_sector:{
      label:'معاد للقطاع للتعديل',
      stage:'معاد للقطاع للتعديل',
      badge:'badge-warning',
      summary:'يتطلب استكمال'
    },
    approved:{
      label:'معتمد',
      stage:'معتمد من إدارة التجهيزات',
      badge:'badge-ok',
      summary:'مغلق بالاعتماد'
    },
    rejected:{
      label:'مرفوض',
      stage:'مرفوض',
      badge:'badge-danger',
      summary:'مغلق بالرفض'
    }
  };

  const SUPPORT_STATUS_TEXT={
    pending_owner:'بانتظار موافقة الجهة المالكة',
    owner_approved:'موافقة الجهة المالكة',
    pending_equipment:'بانتظار اعتماد إدارة التجهيزات',
    completed:'مكتمل',
    pending:'تحت الإجراء'
  };

  const previousStatusText=typeof statusText==='function'?statusText:null;
  const previousStatusBadge=typeof statusBadge==='function'?statusBadge:null;
  const previousApprovalPath=typeof approvalPath==='function'?approvalPath:null;
  const previousNeedStatusFilterOptions=typeof needStatusFilterOptions==='function'?needStatusFilterOptions:null;
  const previousNeedModalHtml=typeof needModalHtml==='function'?needModalHtml:null;
  const previousSaveNeed=typeof saveNeed==='function'?saveNeed:null;
  const previousSaveNeedEdit=typeof saveNeedEdit==='function'?saveNeedEdit:null;
  const previousReportData=typeof reportData==='function'?reportData:null;

  function workflowClean(value){
    return String(value??'').trim();
  }

  function workflowEscape(value){
    return workflowClean(value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function workflowStatus(status){
    const normalized=workflowClean(status||'pending_sector_approval');
    if(normalized==='pending') return 'pending_sector_approval';
    return WORKFLOW_STATES[normalized]?normalized:normalized;
  }

  function workflowMeta(status){
    return WORKFLOW_STATES[workflowStatus(status)]||{
      label:previousStatusText?previousStatusText(status):(status||'تحت الإجراء'),
      stage:previousStatusText?previousStatusText(status):(status||'تحت الإجراء'),
      badge:'badge-info',
      summary:'تحت الإجراء'
    };
  }

  function workflowCanReachNeed(need){
    return !need || isCentral() || (canAccessCollege(need.college) && rowMatchesCurrentDepartment(need));
  }

  function workflowNeedById(id){
    return (db.needsRequests||[]).find(row=>Number(row.id)===Number(id));
  }

  function workflowLastDate(need){
    return need.reviewedAt||need.sectorApprovedAt||need.lastEditedAt||need.updatedAt||need.submittedAt||need.createdAt||'';
  }

  function workflowSourceBadge(need){
    const calculatedSources=['educational_reference_v6_2','educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2'];
    if(need.referenceBased || calculatedSources.includes(need.calculationSource)){
      return '<span class="badge badge-ok">من المرجع التعليمي</span>';
    }
    if(typeof isCalculatedNeedSource==='function' && isCalculatedNeedSource(need.calculationSource)){
      return '<span class="badge badge-info">محسوب</span>';
    }
    return '<span class="badge badge-info">يدوي</span>';
  }

  function workflowStockText(need){
    return typeof need.stockAvailable!=='undefined' ? need.stockAvailable : '—';
  }

  function workflowQtyText(need){
    return `${Number(need.qty||0)} ${workflowEscape(need.unit||'')}`.trim();
  }

  function workflowSetState(need,status,stage){
    const key=workflowStatus(status);
    need.status=key;
    need.workflowStage=stage||workflowMeta(key).stage;
  }

  function workflowHistory(need,action,details){
    need.workflowHistory=Array.isArray(need.workflowHistory)?need.workflowHistory:[];
    need.workflowHistory.push({
      at:nowLocalString(),
      by:state.currentUser?.id||null,
      actor:state.currentUser?.fullName||'—',
      action,
      status:need.status,
      stage:need.workflowStage,
      details:details||''
    });
  }

  function normalizeNeedWorkflowRecord(need){
    let changed=false;
    const before=need.status;
    const next=workflowStatus(need.status);
    if(before!==next){
      need.status=next;
      changed=true;
    }
    const meta=workflowMeta(need.status);
    if(!need.workflowStage || workflowClean(need.workflowStage)==='مراجعة إدارة التجهيزات'){
      need.workflowStage=meta.stage;
      changed=true;
    }
    if(!Array.isArray(need.workflowHistory)){
      need.workflowHistory=[];
      changed=true;
    }
    if(need.status==='pending_equipment_review' && !need.sectorApprovedAt && need.reviewedAt){
      need.sectorApprovedAt=need.reviewedAt;
      changed=true;
    }
    return changed;
  }

  function normalizeAllNeedWorkflow(){
    let changed=false;
    (db.needsRequests||[]).forEach(need=>{
      changed=normalizeNeedWorkflowRecord(need)||changed;
    });
    if(changed && typeof saveDb==='function') saveDb();
  }
  window.normalizeAllNeedWorkflow=normalizeAllNeedWorkflow;

  statusText=function(status){
    const key=workflowStatus(status);
    if(WORKFLOW_STATES[key]) return WORKFLOW_STATES[key].label;
    if(SUPPORT_STATUS_TEXT[key]) return SUPPORT_STATUS_TEXT[key];
    return previousStatusText?previousStatusText(status):(status||'تحت الإجراء');
  };

  statusBadge=function(status){
    const key=workflowStatus(status);
    if(WORKFLOW_STATES[key]){
      const meta=workflowMeta(key);
      return `<span class="badge ${meta.badge}">${meta.label}</span>`;
    }
    return previousStatusBadge?previousStatusBadge(status):`<span class="badge badge-info">${statusText(status)}</span>`;
  };

  approvalPath=function(type,status){
    if(type==='support'){
      return previousApprovalPath?previousApprovalPath(type,status):statusBadge(status);
    }
    const key=workflowStatus(status);
    const labels=['مسودة','اعتماد القطاع','إدارة التجهيزات','اعتماد نهائي'];
    const activeIndex={
      draft:0,
      pending_sector_approval:1,
      returned_to_sector:1,
      pending_equipment_review:2,
      approved:3,
      rejected:3
    }[key]??1;
    return `<div class="workflow workflow-approval">${labels.map((label,index)=>{
      let cls='';
      if(key==='rejected' && index===activeIndex) cls='blocked';
      else if(key==='approved' && index<=activeIndex) cls='done';
      else if(index<activeIndex) cls='done';
      else if(index===activeIndex) cls='active';
      return `<span class="${cls}">${label}</span>`;
    }).join('')}</div>`;
  };

  needStatusFilterOptions=function(selected='all'){
    const options=[
      ['all','كل الحالات'],
      ['draft','مسودة'],
      ['pending_sector_approval','بانتظار اعتماد القطاع'],
      ['pending_equipment_review','بانتظار إدارة التجهيزات'],
      ['returned_to_sector','معاد للقطاع'],
      ['approved','معتمد'],
      ['rejected','مرفوض']
    ];
    const current=selected||'all';
    return options.map(([value,label])=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`).join('');
  };

  function workflowNeedFiltersHtml(){
    if(typeof ensureAdvancedFilterState==='function') ensureAdvancedFilterState();
    const search=workflowEscape(state.search||'');
    return `<div class="toolbar filter-toolbar"><div class="toolbar-right">
      <label class="filter-control filter-search"><span>بحث</span><input class="input search-input" placeholder="رقم الطلب، الصنف، القطاع، الحالة..." value="${search}" oninput="setSearch(this.value,this)"></label>
      <label class="filter-control filter-college"><span>القطاع</span>${collegeFilterControl(false)}</label>
      <label class="filter-control filter-section"><span>القسم</span><select class="select" onchange="setSectionFilter(this.value)">${sectionOptions(state.sectionFilter,true)}</select></label>
      <label class="filter-control filter-status"><span>حالة الاحتياج</span><select class="select" onchange="setNeedStatusFilter(this.value)">${needStatusFilterOptions(state.needStatusFilter)}</select></label>
      <label class="filter-control filter-date"><span>من تاريخ</span><input class="input" type="date" value="${state.dateFrom||''}" onchange="setDateFrom(this.value)"></label>
      <label class="filter-control filter-date"><span>إلى تاريخ</span><input class="input" type="date" value="${state.dateTo||''}" onchange="setDateTo(this.value)"></label>
    </div><div class="toolbar-left"></div></div>`;
  }

  function workflowSummaryHtml(rows){
    const counts={
      draft:rows.filter(row=>workflowStatus(row.status)==='draft').length,
      sector:rows.filter(row=>workflowStatus(row.status)==='pending_sector_approval').length,
      equipment:rows.filter(row=>workflowStatus(row.status)==='pending_equipment_review').length,
      returned:rows.filter(row=>workflowStatus(row.status)==='returned_to_sector').length,
      approved:rows.filter(row=>workflowStatus(row.status)==='approved').length
    };
    const cards=[
      ['مسودات',counts.draft,'قبل الإرسال'],
      ['اعتماد القطاع',counts.sector,'بانتظار مسؤول القطاع'],
      ['إدارة التجهيزات',counts.equipment,'بانتظار المراجعة النهائية'],
      ['معادة للتعديل',counts.returned,'تتطلب استكمال'],
      ['معتمدة',counts.approved,'جاهزة للإجراء التالي']
    ];
    return `<div class="need-workflow-summary">${cards.map(([title,value,note])=>`<div class="workflow-card"><strong>${title}</strong><b>${value}</b><span>${note}</span></div>`).join('')}</div>`;
  }

  function canEditNeedWorkflow(need){
    const status=workflowStatus(need.status);
    const sameCollege=need.college===state.currentUser?.college;
    if(!hasPermission('create_need')) return false;
    if(isCentral()) return ['pending_equipment_review','draft','returned_to_sector'].includes(status);
    return sameCollege && ['draft','returned_to_sector','pending_sector_approval'].includes(status);
  }

  function canAttachNeedEvidenceWorkflow(need){
    const status=workflowStatus(need.status);
    const sameCollege=need.college===state.currentUser?.college;
    if(!hasPermission('create_need_evidence')) return false;
    if(isCentral()) return ['pending_equipment_review','returned_to_sector'].includes(status);
    return sameCollege && ['draft','returned_to_sector','pending_sector_approval'].includes(status);
  }

  needActions=function(need){
    const buttons=[];
    const status=workflowStatus(need.status);
    const sameCollege=need.college===state.currentUser?.college;
    const sectorApprover=sameCollege && !isCentral() && hasPermission('approve_need');
    const equipmentApprover=isCentral() && hasPermission('approve_need');

    if((status==='draft'||status==='returned_to_sector') && (sameCollege||isCentral()) && hasPermission('create_need')){
      buttons.push(`<button class="btn btn-primary btn-sm" onclick="submitNeed(${need.id})">إرسال للاعتماد</button>`);
    }
    if(status==='pending_sector_approval' && sectorApprover){
      buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${need.id})">اعتماد القطاع</button>`);
      buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${need.id})">إعادة للتعديل</button>`);
      buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${need.id})">رفض</button>`);
    }
    if(status==='pending_equipment_review' && equipmentApprover){
      buttons.push(`<button class="btn btn-success btn-sm" onclick="approveNeed(${need.id})">اعتماد نهائي</button>`);
      buttons.push(`<button class="btn btn-warning btn-sm" onclick="returnNeed(${need.id})">إعادة للقطاع</button>`);
      buttons.push(`<button class="btn btn-danger btn-sm" onclick="rejectNeed(${need.id})">رفض</button>`);
    }
    if(canEditNeedWorkflow(need)){
      buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('needEdit',${need.id})">تعديل</button>`);
    }
    if(canAttachNeedEvidenceWorkflow(need)){
      buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openModal('evidence',${need.id})">مرجع</button>`);
    }
    if(typeof canDeleteNeed==='function' && canDeleteNeed(need)){
      buttons.push(`<button class="btn btn-danger btn-sm" onclick="removeNeed(${need.id})">حذف</button>`);
    }
    return buttons.length?`<div class="flex-actions">${buttons.join('')}</div>`:'—';
  };

  submitNeed=function(id){
    const need=workflowNeedById(id);
    if(!need) return alert('طلب الاحتياج غير موجود');
    if(!workflowCanReachNeed(need)) return scopeDeny();
    if(!hasPermission('create_need')) return alert('لا تملك صلاحية إرسال طلبات الاحتياج');
    const status=workflowStatus(need.status);
    if(!['draft','returned_to_sector'].includes(status)) return alert('يمكن إرسال الطلب فقط من حالة مسودة أو معاد للتعديل');
    workflowSetState(need,'pending_sector_approval');
    need.submittedAt=nowLocalString();
    need.submittedBy=state.currentUser?.id||null;
    need.reviewedAt=null;
    need.reviewedBy=null;
    need.returnNote='';
    workflowHistory(need,'إرسال للاعتماد','تم إرسال الطلب إلى مسؤول القطاع');
    auditLog('إرسال طلب احتياج لاعتماد القطاع','need',need.requestNo,need.itemNameAr||need.itemNameEn||'',need.college,need.mainDepartment||need.section);
    saveDb();
    render();
  };

  approveNeed=function(id){
    const need=workflowNeedById(id);
    if(!need) return alert('طلب الاحتياج غير موجود');
    if(!workflowCanReachNeed(need)) return scopeDeny();
    if(!hasPermission('approve_need')) return alert('لا تملك صلاحية اعتماد طلبات الاحتياج');
    const status=workflowStatus(need.status);

    if(status==='pending_sector_approval'){
      if(isCentral()) return alert('لا يمكن اعتماد الطلب نهائياً قبل اعتماد مسؤول القطاع');
      workflowSetState(need,'pending_equipment_review');
      need.sectorApprovedAt=nowLocalString();
      need.sectorApprovedBy=state.currentUser?.id||null;
      need.returnNote='';
      workflowHistory(need,'اعتماد القطاع','تم اعتماد الطلب من مسؤول القطاع وإحالته إلى إدارة التجهيزات');
      auditLog('اعتماد طلب احتياج من مسؤول القطاع','need',need.requestNo,need.itemNameAr||need.itemNameEn||'',need.college,need.mainDepartment||need.section);
      saveDb();
      render();
      return;
    }

    if(status==='pending_equipment_review'){
      if(!isCentral()) return alert('الاعتماد النهائي خاص بإدارة التجهيزات');
      const references=typeof evidenceCountForNeed==='function'?evidenceCountForNeed(need.id):0;
      if(references===0){
        const proceed=confirm('هذا الطلب لا يحتوي على مرجع تعليمي مرتبط. هل ترغب في اعتماده رغم ذلك؟');
        if(!proceed) return;
      }
      workflowSetState(need,'approved');
      need.reviewedAt=nowLocalString();
      need.reviewedBy=state.currentUser?.id||null;
      need.returnNote='';
      workflowHistory(need,'اعتماد نهائي','تم اعتماد الطلب من إدارة التجهيزات');
      auditLog('اعتماد نهائي لطلب احتياج','need',need.requestNo,`${need.itemNameAr||need.itemNameEn||''} | مراجع: ${references}`,need.college,need.mainDepartment||need.section);
      saveDb();
      render();
      return;
    }

    return alert(`لا يمكن الاعتماد من الحالة الحالية: ${statusText(status)}`);
  };

  rejectNeed=function(id){
    const need=workflowNeedById(id);
    if(!need) return alert('طلب الاحتياج غير موجود');
    if(!workflowCanReachNeed(need)) return scopeDeny();
    if(!hasPermission('approve_need')) return alert('لا تملك صلاحية رفض طلبات الاحتياج');
    const status=workflowStatus(need.status);
    if(status==='pending_sector_approval' && isCentral()) return alert('لا يمكن رفض الطلب من إدارة التجهيزات قبل اعتماد القطاع');
    if(status==='pending_equipment_review' && !isCentral()) return alert('الرفض في هذه المرحلة خاص بإدارة التجهيزات');
    if(!['pending_sector_approval','pending_equipment_review'].includes(status)) return alert(`لا يمكن رفض الطلب من الحالة الحالية: ${statusText(status)}`);
    const note=prompt('أدخل سبب الرفض','');
    if(note===null) return;
    workflowSetState(need,'rejected');
    need.reviewedAt=nowLocalString();
    need.reviewedBy=state.currentUser?.id||null;
    need.returnNote=note;
    workflowHistory(need,'رفض',note);
    auditLog('رفض طلب احتياج','need',need.requestNo,note||need.itemNameAr||need.itemNameEn||'',need.college,need.mainDepartment||need.section);
    saveDb();
    render();
  };

  returnNeed=function(id){
    const need=workflowNeedById(id);
    if(!need) return alert('طلب الاحتياج غير موجود');
    if(!workflowCanReachNeed(need)) return scopeDeny();
    if(!hasPermission('approve_need')) return alert('لا تملك صلاحية إعادة الطلب');
    const status=workflowStatus(need.status);
    if(status==='pending_sector_approval' && isCentral()) return alert('لا يمكن إرجاع الطلب من إدارة التجهيزات قبل اعتماد القطاع');
    if(status==='pending_equipment_review' && !isCentral()) return alert('إعادة الطلب في هذه المرحلة خاص بإدارة التجهيزات');
    if(!['pending_sector_approval','pending_equipment_review'].includes(status)) return alert(`لا يمكن إعادة الطلب من الحالة الحالية: ${statusText(status)}`);
    const note=prompt('أدخل ملاحظة الإعادة للتعديل','');
    if(note===null) return;
    workflowSetState(need,'returned_to_sector');
    need.reviewedAt=nowLocalString();
    need.reviewedBy=state.currentUser?.id||null;
    need.returnNote=note;
    workflowHistory(need,'إعادة للتعديل',note);
    auditLog('إعادة طلب احتياج للتعديل','need',need.requestNo,note||'بدون ملاحظة',need.college,need.mainDepartment||need.section);
    saveDb();
    render();
  };

  saveNeed=function(mode='submit'){
    const beforeIds=new Set((db.needsRequests||[]).map(need=>Number(need.id)));
    const result=previousSaveNeed?previousSaveNeed():undefined;
    const created=(db.needsRequests||[]).filter(need=>!beforeIds.has(Number(need.id)));
    if(created.length){
      created.forEach(need=>{
        normalizeNeedWorkflowRecord(need);
        if(mode==='draft'){
          workflowSetState(need,'draft');
          need.submittedAt=null;
          need.submittedBy=null;
          workflowHistory(need,'حفظ كمسودة','تم حفظ الطلب دون إرساله للاعتماد');
        }else{
          workflowSetState(need,'pending_sector_approval');
          need.submittedAt=need.submittedAt||need.createdAt||nowLocalString();
          need.submittedBy=need.submittedBy||state.currentUser?.id||null;
          workflowHistory(need,'إرسال لاعتماد القطاع','تم إنشاء الطلب وإرساله لمسؤول القطاع');
        }
      });
      saveDb();
    }
    return result;
  };

  if(previousSaveNeedEdit){
    saveNeedEdit=function(){
      const editId=state.editId;
      const need=workflowNeedById(editId);
      if(need && !workflowCanReachNeed(need)) return scopeDeny();
      if(need && !canEditNeedWorkflow(need)) return alert('لا يمكن تعديل الطلب في هذه المرحلة');
      const previousStatus=need?workflowStatus(need.status):null;
      const result=previousSaveNeedEdit();
      const updated=workflowNeedById(editId);
      if(updated){
        normalizeNeedWorkflowRecord(updated);
        if(previousStatus==='draft'){
          workflowSetState(updated,'draft');
        }else if(previousStatus==='returned_to_sector'){
          workflowSetState(updated,'returned_to_sector');
        }else if(previousStatus==='pending_sector_approval'){
          workflowSetState(updated,'pending_sector_approval');
        }else if(previousStatus==='pending_equipment_review'){
          workflowSetState(updated,'pending_equipment_review');
        }
        workflowHistory(updated,'تعديل الطلب','تم تعديل بيانات الطلب');
        saveDb();
        render();
      }
      return result;
    };
  }

  if(previousNeedModalHtml){
    needModalHtml=function(){
      const html=previousNeedModalHtml();
      return html.replace(/<button class="btn btn-primary" onclick="saveNeed\(\)">[\s\S]*?<\/button>/,
        `<button class="btn btn-secondary" onclick="saveNeed('draft')">حفظ كمسودة</button><button class="btn btn-primary" onclick="saveNeed('submit')">إرسال لاعتماد القطاع</button>`);
    };
  }

  renderNeeds=function(){
    normalizeAllNeedWorkflow();
    const rows=filteredNeeds().map(need=>{
      normalizeNeedWorkflowRecord(need);
      const note=need.returnNote?`<span class="workflow-note">${workflowEscape(need.returnNote)}</span>`:'—';
      return [
        workflowEscape(need.requestNo||'—'),
        workflowEscape(need.college||'—'),
        workflowEscape(need.mainDepartment||'القسم العام'),
        workflowEscape(need.section||'—'),
        workflowEscape(need.itemNameAr||need.itemNameEn||'—'),
        workflowSourceBadge(need),
        workflowQtyText(need),
        workflowStockText(need),
        statusBadge(need.status),
        approvalPath('need',need.status),
        note,
        formatDateTime(workflowLastDate(need)),
        actorName(need.createdBy),
        needActions(need)
      ];
    });
    const visible=filteredNeeds();
    return `<div class="hero edu-need-page-hero">
      <div><div class="hero-title">طلبات الاحتياج</div><div class="hero-text">مسار الاعتماد مثبت بحالات تشغيلية واضحة: مسودة، اعتماد القطاع، مراجعة إدارة التجهيزات، ثم الاعتماد النهائي.</div></div>
      <div class="flex-actions">${hasPermission('create_need')?`<button class="btn btn-primary" onclick="openModal('need')">+ رفع احتياج</button>`:''}${hasPermission('create_need')?`<button class="btn btn-secondary" onclick="openModal('needFromReferences')">توليد من المراجع</button>`:''}</div>
    </div>
    ${workflowSummaryHtml(visible)}
    ${workflowNeedFiltersHtml()}
    <div class="toolbar action-toolbar"><div class="toolbar-right"></div><div class="toolbar-left"><button class="btn btn-secondary" onclick="exportNeeds()">تقرير Excel</button><button class="btn btn-secondary" onclick="exportNeedsDetailedExact()">تقرير Excel مفصل</button><button class="btn btn-secondary" onclick="printNeeds()">تقرير PDF</button></div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">سجل طلبات الاحتياج</div><div class="panel-subtitle">لا يصل الطلب إلى إدارة التجهيزات إلا بعد اعتماد مسؤول القطاع، والإرجاع يعيده للقطاع للتعديل قبل إرساله مرة أخرى.</div></div>
    ${table(['رقم الطلب','القطاع','القسم الرئيسي','الفئة','الصنف','المصدر','الكمية النهائية','الرصيد','الحالة','مسار الاعتماد','ملاحظة','آخر إجراء','صاحب الإجراء','إجراء'],rows)}</div>`;
  };

  officialNeedsRows=function(){
    return filteredNeeds().map(need=>[
      need.requestNo,
      need.erpCode||'—',
      need.college,
      need.mainDepartment||'القسم العام',
      need.section,
      need.itemNameAr||'—',
      need.itemNameEn||'—',
      (need.referenceBased || need.calculationSource==='educational_reference_v6_2')?'من المرجع التعليمي':'يدوي',
      Number(need.year1Qty||0),
      Number(need.year2Qty||0),
      Number(need.grossQty||need.qty||0),
      workflowStockText(need),
      Number(need.qty||0),
      need.unit||'—',
      need.evidenceCount||evidenceCountForNeed(need.id)||0,
      statusText(need.status),
      need.workflowStage||statusText(need.status),
      need.returnNote||'—',
      actorName(need.createdBy),
      actorName(need.sectorApprovedBy),
      actorName(need.reviewedBy)
    ]);
  };

  officialNeedsSummary=function(){
    const rows=filteredNeeds();
    return [
      ['إجمالي الطلبات',rows.length],
      ['مسودات',rows.filter(row=>workflowStatus(row.status)==='draft').length],
      ['بانتظار اعتماد القطاع',rows.filter(row=>workflowStatus(row.status)==='pending_sector_approval').length],
      ['بانتظار إدارة التجهيزات',rows.filter(row=>workflowStatus(row.status)==='pending_equipment_review').length],
      ['معتمدة',rows.filter(row=>workflowStatus(row.status)==='approved').length]
    ];
  };

  officialNeedsReportData=function(){
    return {
      template:'official-needs',
      title:'تقرير مسار اعتماد طلبات الاحتياج',
      subtitle:'يعرض التقرير الطلبات حسب مسار الاعتماد الرسمي من المسودة إلى اعتماد القطاع ثم إدارة التجهيزات.',
      headers:['رقم الطلب','رمز ERP','القطاع','القسم الرئيسي','الفئة','البند بالعربي','English','المصدر','الفصل الأول','الفصل الثاني','الإجمالي قبل الرصيد','الرصيد','الصافي المرفوع','الوحدة','عدد المراجع','الحالة','مرحلة الاعتماد','ملاحظة الإرجاع/الرفض','صاحب الإجراء','اعتماد القطاع','اعتماد التجهيزات'],
      rows:officialNeedsRows(),
      summary:officialNeedsSummary()
    };
  };

  reportData=function(){
    if(state.reportTab==='needs') return officialNeedsReportData();
    return previousReportData?previousReportData():{title:'تقرير',headers:[],rows:[]};
  };

  normalizeAllNeedWorkflow();
})();
/* ===== end Need Approval Workflow v6.9 ===== */

/* ===== Educational Need Urgency and Actor Repair v7.0 ===== */
;(function(){
  const previousNeedRiskNavItems=typeof navItems==='function'?navItems:null;
  const previousNeedRiskGetPageTitle=typeof getPageTitle==='function'?getPageTitle:null;
  const previousNeedRiskRenderPageContent=typeof renderPageContent==='function'?renderPageContent:null;
  const previousNeedRiskEduNeedRowHtml=typeof eduNeedRowHtml==='function'?eduNeedRowHtml:null;
  const previousNeedRiskEduNeedReadRows=typeof eduNeedReadRows==='function'?eduNeedReadRows:null;
  const previousNeedRiskSaveLearningReferences=typeof saveLearningReferences==='function'?saveLearningReferences:null;
  const previousNeedRiskEvidenceRowHtml=typeof evidenceRowHtml==='function'?evidenceRowHtml:null;
  const previousNeedRiskSaveNeedEvidence=typeof saveNeedEvidence==='function'?saveNeedEvidence:null;

  function needRiskText(value){
    return String(value??'').trim();
  }

  function needRiskEscape(value){
    return needRiskText(value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function needRiskDateOnly(value){
    const raw=needRiskText(value);
    if(!raw) return '';
    const match=raw.match(/\d{4}-\d{2}-\d{2}/);
    return match?match[0]:raw.slice(0,10);
  }

  function needRiskParseDate(value){
    const date=needRiskDateOnly(value);
    if(!date) return null;
    const parsed=new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime())?null:parsed;
  }

  function needRiskFormatDate(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function needRiskAddDays(date,days){
    const next=new Date(date.getTime());
    next.setDate(next.getDate()+days);
    return next;
  }

  function needRiskDaysBetween(a,b){
    const ms=24*60*60*1000;
    return Math.ceil((b.getTime()-a.getTime())/ms);
  }

  function needRiskSemesterStart(startDate,semester){
    const sem=needRiskText(semester);
    if(['الثاني','second','2'].includes(sem)) return needRiskAddDays(startDate,15*7);
    return startDate;
  }

  function needRiskExperimentDate(ref,startDate){
    const week=Math.max(1,Math.min(15,Number(ref.academicWeek||ref.weekNo||ref.experimentWeek||1)||1));
    return needRiskAddDays(needRiskSemesterStart(startDate,ref.semester), (week-1)*7);
  }

  function needRiskLevel(ref,startDate,asOfDate){
    const scheduled=needRiskExperimentDate(ref,startDate);
    const days=needRiskDaysBetween(asOfDate,scheduled);
    const deficit=Number(ref.deficit||0);
    const stock=Number(ref.stockAvailable||0);
    if(days<0) return {key:'low',label:'منخفضة',badge:'badge-info',days,scheduled};
    if(deficit>0 && stock<=0 && days<=21) return {key:'critical',label:'حرجة',badge:'badge-danger',days,scheduled};
    if(deficit>0 && days<=7) return {key:'critical',label:'حرجة',badge:'badge-danger',days,scheduled};
    if(days<=21) return {key:'high',label:'عالية',badge:'badge-danger',days,scheduled};
    if(days<=45) return {key:'medium',label:'متوسطة',badge:'badge-warning',days,scheduled};
    return {key:'low',label:'منخفضة',badge:'badge-info',days,scheduled};
  }

  function needRiskVisibleReferences(){
    let rows=typeof visibleNeedEvidence==='function'?visibleNeedEvidence():(db.needEvidence||[]);
    if(state.needRiskAcademicYear){
      rows=rows.filter(ref=>needRiskText(ref.academicYear)===needRiskText(state.needRiskAcademicYear));
    }
    return rows;
  }

  function ensureNeedRiskState(){
    if(typeof state.needRiskAcademicYear==='undefined') state.needRiskAcademicYear='';
    if(typeof state.needRiskStartDate==='undefined') state.needRiskStartDate=needRiskDateOnly(nowLocalString());
    if(typeof state.needRiskAsOfDate==='undefined') state.needRiskAsOfDate=needRiskDateOnly(nowLocalString());
  }

  function setNeedRiskAcademicYear(value){ ensureNeedRiskState(); state.needRiskAcademicYear=value||''; render(); }
  function setNeedRiskStartDate(value){ ensureNeedRiskState(); state.needRiskStartDate=value||''; render(); }
  function setNeedRiskAsOfDate(value){ ensureNeedRiskState(); state.needRiskAsOfDate=value||''; render(); }

  window.setNeedRiskAcademicYear=setNeedRiskAcademicYear;
  window.setNeedRiskStartDate=setNeedRiskStartDate;
  window.setNeedRiskAsOfDate=setNeedRiskAsOfDate;

  function needRiskAcademicYearOptions(selected=''){
    const years=[...new Set((db.needEvidence||[]).map(ref=>ref.academicYear).filter(Boolean))].sort();
    return `<option value="" ${!selected?'selected':''}>كل الأعوام</option>${years.map(year=>`<option value="${needRiskEscape(year)}" ${selected===year?'selected':''}>${needRiskEscape(year)}</option>`).join('')}`;
  }

  function renderNeedRisk(){
    ensureNeedRiskState();
    const start=needRiskParseDate(state.needRiskStartDate)||needRiskParseDate(nowLocalString());
    const asOf=needRiskParseDate(state.needRiskAsOfDate)||needRiskParseDate(nowLocalString());
    const rows=needRiskVisibleReferences();
    const enriched=rows.map(ref=>({ref,risk:needRiskLevel(ref,start,asOf)}));
    const counts={
      critical:enriched.filter(row=>row.risk.key==='critical').length,
      high:enriched.filter(row=>row.risk.key==='high').length,
      medium:enriched.filter(row=>row.risk.key==='medium').length,
      low:enriched.filter(row=>row.risk.key==='low').length
    };
    const tableRows=enriched
      .sort((a,b)=>a.risk.days-b.risk.days)
      .map(({ref,risk})=>[
        learningReferenceNumber(ref),
        ref.college||'—',
        ref.mainDepartment||'القسم العام',
        ref.courseName||'—',
        ref.experimentName||'—',
        ref.academicYear||'—',
        ref.semester||'—',
        ref.academicWeek||ref.weekNo||ref.experimentWeek||1,
        needRiskFormatDate(risk.scheduled),
        risk.days<0?'مضى موعدها':`${risk.days} يوم`,
        ref.itemNameAr||ref.itemNameEn||'—',
        ref.stockAvailable||0,
        ref.deficit||0,
        `<span class="badge ${risk.badge}">${risk.label}</span>`
      ]);
    return `<div class="hero edu-need-page-hero">
      <div><div class="hero-title">مقياس حالات الاحتياج</div><div class="hero-text">يقيس أولوية المرجع التعليمي بناءً على بداية الدراسة، الفصل، أسبوع التجربة، الرصيد، والعجز الفعلي.</div></div>
      <div class="flex-actions">${hasPermission('create_need_evidence')?`<button class="btn btn-primary" onclick="openModal('evidence')">+ إضافة مرجع</button>`:''}${hasPermission('create_need')?`<button class="btn btn-secondary" onclick="openModal('needFromReferences')">توليد احتياج</button>`:''}</div>
    </div>
    <div class="need-workflow-summary">
      <div class="workflow-card"><strong>حرجة</strong><b>${counts.critical}</b><span>لا يوجد رصيد كاف أو الموعد قريب جدًا</span></div>
      <div class="workflow-card"><strong>عالية</strong><b>${counts.high}</b><span>تجارب قريبة تحتاج متابعة</span></div>
      <div class="workflow-card"><strong>متوسطة</strong><b>${counts.medium}</b><span>تجارب خلال الأسابيع القادمة</span></div>
      <div class="workflow-card"><strong>منخفضة</strong><b>${counts.low}</b><span>بعيدة أو مضى موعدها</span></div>
      <div class="workflow-card"><strong>المراجع</strong><b>${rows.length}</b><span>ضمن نطاق الصلاحية والفلتر</span></div>
    </div>
    <div class="toolbar filter-toolbar"><div class="toolbar-right">
      <label class="filter-control"><span>العام الدراسي</span><select class="select" onchange="setNeedRiskAcademicYear(this.value)">${needRiskAcademicYearOptions(state.needRiskAcademicYear)}</select></label>
      <label class="filter-control"><span>تاريخ بداية الدراسة</span><input class="input" type="date" value="${state.needRiskStartDate||''}" onchange="setNeedRiskStartDate(this.value)"></label>
      <label class="filter-control"><span>تاريخ رفع/طرح الاحتياج</span><input class="input" type="date" value="${state.needRiskAsOfDate||''}" onchange="setNeedRiskAsOfDate(this.value)"></label>
    </div><div class="toolbar-left"></div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">قراءة أولوية المراجع التعليمية</div><div class="panel-subtitle">الفصل الأول يبدأ من تاريخ بداية الدراسة، والفصل الثاني يحسب بعد 15 أسبوعًا. التجارب السابقة تظهر منخفضة، والقريبة أو بلا رصيد كاف تظهر أعلى أولوية.</div></div>
    ${table(['رقم المرجع','القطاع','القسم','المقرر','التجربة','العام','الفصل','الأسبوع','تاريخ التجربة','المدة','الصنف','الرصيد','العجز','المقياس'],tableRows)}</div>`;
  }

  function sectorOwnerForCollege(college){
    return (db.users||[]).find(user=>user.college===college && user.isActive && user.role!=='admin')||
      (db.users||[]).find(user=>user.college===college && user.isActive)||
      null;
  }

  function repairActorMismatchForRows(rows,collegeGetter,departmentGetter){
    let changed=false;
    (rows||[]).forEach(row=>{
      if(!row || !row.createdBy) return;
      const actor=getUserById(row.createdBy);
      const college=collegeGetter(row);
      if(!actor || !college || scopeIsCentralCollege(college)) return;
      if(actor.role==='admin' || scopeIsCentralCollege(actor.college)) return;
      if(actor.college===college) return;
      const owner=sectorOwnerForCollege(college);
      if(!owner) return;
      row.originalCreatedBy=row.originalCreatedBy||row.createdBy;
      row.createdBy=owner.id;
      if(departmentGetter && !row.mainDepartment) row.mainDepartment=departmentGetter(row)||owner.department||'القسم العام';
      changed=true;
    });
    return changed;
  }

  function repairNeedActorMismatches(){
    let changed=false;
    changed=repairActorMismatchForRows(db.needsRequests,row=>row.college,row=>row.mainDepartment||row.section)||changed;
    changed=repairActorMismatchForRows(db.needEvidence,row=>row.college,row=>row.mainDepartment||row.section)||changed;
    changed=repairActorMismatchForRows(db.items,row=>row.college,row=>row.mainDepartment||row.section)||changed;
    if(changed && typeof saveDb==='function') saveDb();
  }
  window.repairNeedActorMismatches=repairNeedActorMismatches;

  if(previousNeedRiskEduNeedRowHtml){
    eduNeedRowHtml=function(idx,row={}){
      const html=previousNeedRiskEduNeedRowHtml(idx,row);
      const weekValue=Number(row.academicWeek||row.weekNo||row.experimentWeek||1)||1;
      return html.replace(
        /(<div><label class="label">[^<]*?<\/label><select class="select edu-semester">[\s\S]*?<\/select><\/div>)/,
        `$1<div><label class="label">أسبوع التجربة</label><input class="input edu-week" type="number" min="1" max="15" step="1" value="${weekValue}"></div>`
      );
    };
  }

  if(previousNeedRiskEduNeedReadRows){
    eduNeedReadRows=function(){
      const groups=[...document.querySelectorAll('[data-edu-need-row]')];
      const rows=previousNeedRiskEduNeedReadRows();
      rows.forEach(row=>{
        const match=groups.find(group=>(group.querySelector('.edu-experiment')?.value||'').trim()===row.experimentName);
        const week=Number(match?.querySelector('.edu-week')?.value||1)||1;
        row.academicWeek=Math.max(1,Math.min(15,week));
      });
      return rows;
    };
  }

  if(previousNeedRiskSaveLearningReferences){
    saveLearningReferences=function(){
      const beforeIds=new Set((db.needEvidence||[]).map(ref=>Number(ref.id)));
      const rawRows=typeof eduNeedReadRows==='function'?eduNeedReadRows():[];
      const result=previousNeedRiskSaveLearningReferences();
      const created=(db.needEvidence||[]).filter(ref=>!beforeIds.has(Number(ref.id))).slice().reverse();
      if(created.length){
        created.forEach((ref,index)=>{
          ref.academicWeek=Math.max(1,Math.min(15,Number(rawRows[index]?.academicWeek||1)||1));
        });
        saveDb();
      }
      return result;
    };
  }

  if(previousNeedRiskEvidenceRowHtml){
    evidenceRowHtml=function(idx,ev={}){
      const html=previousNeedRiskEvidenceRowHtml(idx,ev);
      const weekValue=Number(ev.academicWeek||ev.weekNo||1)||1;
      return html.replace(
        /(<div><label class="label">[^<]*?<\/label><select class="select ev-semester">[\s\S]*?<\/select><\/div>)/,
        `$1<div><label class="label">أسبوع التجربة</label><input class="input ev-week" type="number" min="1" max="15" step="1" value="${weekValue}"></div>`
      );
    };
  }

  if(previousNeedRiskSaveNeedEvidence){
    saveNeedEvidence=function(){
      const beforeIds=new Set((db.needEvidence||[]).map(ref=>Number(ref.id)));
      const weekValues=[...document.querySelectorAll('[data-ev-row]')].map(row=>Math.max(1,Math.min(15,Number(row.querySelector('.ev-week')?.value||1)||1)));
      const result=previousNeedRiskSaveNeedEvidence();
      const created=(db.needEvidence||[]).filter(ref=>!beforeIds.has(Number(ref.id))).slice().reverse();
      if(created.length){
        created.forEach((ref,index)=>{ ref.academicWeek=weekValues[index]||1; });
        saveDb();
      }
      return result;
    };
  }

  navItems=function(){
    const items=previousNeedRiskNavItems?previousNeedRiskNavItems():[];
    if(!hasPermission('view_need_evidence') && !hasPermission('view_needs')) return items;
    if(items.some(item=>item.id==='needRisk')) return items;
    const entry={id:'needRisk',label:'مقياس الاحتياج',icon:typeof uiIcon==='function'?uiIcon('analyst'):'📈',permission:'view_need_evidence'};
    const idx=items.findIndex(item=>item.id==='needEvidence');
    if(idx>=0) items.splice(idx+1,0,entry);
    else items.push(entry);
    return items;
  };

  getPageTitle=function(){
    if(state.currentPage==='needRisk') return 'مقياس حالات الاحتياج';
    return previousNeedRiskGetPageTitle?previousNeedRiskGetPageTitle():'';
  };

  renderPageContent=function(){
    if(state.currentPage==='needRisk') return renderNeedRisk();
    return previousNeedRiskRenderPageContent?previousNeedRiskRenderPageContent():'';
  };

  repairNeedActorMismatches();
})();
/* ===== end Educational Need Urgency and Actor Repair v7.0 ===== */

/* ===== Maintenance and Operations Module v7.1 ===== */
;(function(){
  const previousMaintenanceNavItems=typeof navItems==='function'?navItems:null;
  const previousMaintenanceGetPageTitle=typeof getPageTitle==='function'?getPageTitle:null;
  const previousMaintenanceRenderPageContent=typeof renderPageContent==='function'?renderPageContent:null;
  const previousMaintenanceModalHtml=typeof modalHtml==='function'?modalHtml:null;
  const previousMaintenanceOpenModal=typeof openModal==='function'?openModal:null;
  const previousMaintenanceItemActionButtons=typeof itemActionButtons==='function'?itemActionButtons:null;
  const previousMaintenanceRenderDashboard=typeof renderDashboard==='function'?renderDashboard:null;
  const previousMaintenanceDoLogin=typeof doLogin==='function'?doLogin:null;
  const previousMaintenanceSaveItem=typeof saveItem==='function'?saveItem:null;

  const MAINTENANCE_TABS=[
    ['dashboard','لوحة الصيانة'],
    ['assets','الأجهزة والأصول'],
    ['preventive','الصيانة الوقائية'],
    ['tickets','بلاغات الأعطال'],
    ['visits','الزيارات الميدانية'],
    ['spares','قطع الغيار'],
    ['reports','التقارير'],
    ['kpis','مؤشرات الأداء']
  ];

  const ASSET_TYPES=['جهاز تحليلي','جهاز طبي','جهاز هندسي','جهاز تعليمي','جهاز سلامة مختبرية','أخرى'];
  const RISK_LEVELS=['عالية','متوسطة','منخفضة'];
  const ASSET_STATUSES=['يعمل','يحتاج متابعة','متوقف','خارج الخدمة'];
  const PM_FREQUENCIES=['أسبوعية','شهرية','ربع سنوية','نصف سنوية','سنوية'];
  const PM_STATUSES=['مجدولة','مستحقة','متأخرة','مكتملة','تحتاج متابعة'];
  const TICKET_STATUSES=['جديد','تحت الفرز','بانتظار الزيارة','تحت المعالجة','بانتظار قطع غيار','محال لمورد خارجي','مكتمل بانتظار اعتماد الجهة','مغلق','مرفوض'];
  const TICKET_PRIORITIES=['حرج يمس السلامة العامة','عالٍ يؤثر على استمرارية التشغيل','متوسط / عطل جزئي','منخفض / ملاحظة تشغيلية'];
  const VISIT_RECOMMENDATIONS=['إصلاح داخلي','طلب قطع غيار','إحالة لمورد','استبدال','تكهين','متابعة لاحقة'];
  const SPARE_STATUSES=['جديد','قيد المراجعة','معتمد','مرفوض','تم التوريد','تم التركيب'];

  function maintenanceText(value){ return String(value??'').trim(); }
  function maintenanceEscape(value){
    return maintenanceText(value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function maintenanceDateOnly(value){
    const raw=maintenanceText(value);
    if(!raw) return '';
    const match=raw.match(/\d{4}-\d{2}-\d{2}/);
    return match?match[0]:raw.slice(0,10);
  }
  function maintenanceParseDate(value){
    const date=maintenanceDateOnly(value);
    if(!date) return null;
    const parsed=new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime())?null:parsed;
  }
  function maintenanceFormatDate(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function maintenanceAddDays(date,days){
    const d=new Date(date.getTime());
    d.setDate(d.getDate()+days);
    return d;
  }
  function maintenanceMinutesBetween(a,b){
    const from=new Date(a||'');
    const to=new Date(b||'');
    if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())) return 0;
    return Math.max(0,Math.round((to.getTime()-from.getTime())/60000));
  }
  function maintenanceWithinDate(row,fields){
    const from=maintenanceDateOnly(state.maintenanceDateFrom||'');
    const to=maintenanceDateOnly(state.maintenanceDateTo||'');
    if(!from && !to) return true;
    const dates=fields.map(field=>maintenanceDateOnly(row[field])).filter(Boolean);
    if(!dates.length) return false;
    return dates.some(date=>(!from || date>=from) && (!to || date<=to));
  }
  function maintenanceIncludes(row,fields){
    const query=maintenanceText(state.maintenanceSearch).toLowerCase();
    if(!query) return true;
    return fields.map(field=>typeof field==='function'?field(row):row[field]).join(' ').toLowerCase().includes(query);
  }
  function maintenanceIsDeviceItem(item){
    const section=maintenanceText(item?.section);
    return section.includes('الأجهزة') || section.includes('ط§ظ„ط£ط¬ظ‡ط²ط©') || Boolean(item?.serialNumber) || Boolean(item?.deviceStatus) || /device|microscope|centrifuge|analy/i.test(item?.nameEn||'');
  }
  function maintenanceScopeRows(rows,collegeGetter=row=>row.college,departmentGetter=row=>row.mainDepartment||row.section){
    let scoped=rows||[];
    if(!isCentral()){
      scoped=scoped.filter(row=>canAccessCollege(collegeGetter(row))).filter(row=>{
        if(!hasDepartmentScope()) return true;
        return maintenanceText(departmentGetter(row))===maintenanceText(state.currentUser?.department);
      });
    }
    if(state.maintenanceCollege && state.maintenanceCollege!=='all'){
      scoped=scoped.filter(row=>maintenanceText(collegeGetter(row))===maintenanceText(state.maintenanceCollege));
    }
    return scoped;
  }

  function maintenancePushPermission(key,label){
    if(typeof PERMISSIONS==='undefined') return;
    if(!PERMISSIONS.some(permission=>permission.key===key)) PERMISSIONS.push({key,label});
  }

  function ensureMaintenancePermissions(){
    maintenancePushPermission('view_maintenance','عرض الصيانة والتشغيل');
    maintenancePushPermission('manage_maintenance_assets','إدارة أصول الصيانة');
    maintenancePushPermission('create_maintenance_ticket','إنشاء بلاغات الأعطال');
    maintenancePushPermission('approve_maintenance','اعتماد وإغلاق أعمال الصيانة');
    maintenancePushPermission('view_maintenance_reports','تقارير الصيانة');
    (db.users||[]).forEach(user=>{
      if(user.role==='admin' || (user.permissions||[]).includes('all')) return;
      const perms=new Set(user.permissions||[]);
      if(perms.has('view_items') || perms.has('view_dashboard')) perms.add('view_maintenance');
      if(perms.has('add_item') || perms.has('edit_item')) perms.add('manage_maintenance_assets');
      if(perms.has('add_issue') || perms.has('create_need')) perms.add('create_maintenance_ticket');
      if(perms.has('approve_issue') || perms.has('approve_need') || scopeIsCentralCollege(user.college)){
        perms.add('approve_maintenance');
      }
      if(perms.has('view_reports')) perms.add('view_maintenance_reports');
      user.permissions=[...perms];
    });
  }

  function maintenanceCreateAssetFromItem(item,{allowAutoSerial=false}={}){
    if(!item || !maintenanceIsDeviceItem(item)) return null;
    db.maintenanceAssets=db.maintenanceAssets||[];
    if(db.maintenanceAssets.some(asset=>Number(asset.itemId)===Number(item.id))) return null;
    const serial=maintenanceText(item.serialNumber)||(allowAutoSerial?`AUTO-${item.code||item.id}`:'');
    if(!serial) return null;
    if(db.maintenanceAssets.some(asset=>maintenanceText(asset.serialNumber)===serial)) return null;
    const asset={
      id:nextId(db.maintenanceAssets),
      itemId:item.id,
      assetNameAr:item.nameAr||item.name||'جهاز غير مسمى',
      assetNameEn:item.nameEn||'',
      serialNumber:serial,
      assetNumber:item.code||`AST-${item.id}`,
      college:item.college,
      mainDepartment:item.mainDepartment||'القسم العام',
      section:item.section,
      building:'',
      floor:'',
      labRoom:item.location||'',
      assetType:'جهاز تعليمي',
      riskLevel:'متوسطة',
      status:item.deviceStatus||'يعمل',
      manufacturer:'',
      supplier:'',
      purchaseDate:'',
      operationStartDate:'',
      warrantyEndDate:'',
      maintenanceContract:'',
      qrCodeUrl:`maintenance-asset-${item.id}`,
      lastMaintenanceDate:'',
      nextMaintenanceDate:'',
      createdBy:item.createdBy||state.currentUser?.id||1,
      createdAt:item.createdAt||nowLocalString(),
      updatedAt:''
    };
    db.maintenanceAssets.push(asset);
    return asset;
  }

  function ensureMaintenanceData(){
    db.maintenanceAssets=db.maintenanceAssets||[];
    db.preventiveMaintenancePlans=db.preventiveMaintenancePlans||[];
    db.preventiveMaintenanceRecords=db.preventiveMaintenanceRecords||[];
    db.maintenanceTickets=db.maintenanceTickets||[];
    db.fieldVisits=db.fieldVisits||[];
    db.sparePartRequests=db.sparePartRequests||[];
    ensureMaintenancePermissions();
    const assetsByItem=new Set(db.maintenanceAssets.map(asset=>Number(asset.itemId)).filter(Boolean));
    (db.items||[]).filter(maintenanceIsDeviceItem).forEach(item=>{
      if(assetsByItem.has(Number(item.id))) return;
      const serial=maintenanceText(item.serialNumber)||`AUTO-${item.code||item.id}`;
      if(db.maintenanceAssets.some(asset=>maintenanceText(asset.serialNumber)===serial)) return;
      const asset={
        id:nextId(db.maintenanceAssets),
        itemId:item.id,
        assetNameAr:item.nameAr||item.name||'جهاز غير مسمى',
        assetNameEn:item.nameEn||'',
        serialNumber:serial,
        assetNumber:item.code||`AST-${item.id}`,
        college:item.college,
        mainDepartment:item.mainDepartment||'القسم العام',
        section:item.section,
        building:'',
        floor:'',
        labRoom:item.location||'',
        assetType:'جهاز تعليمي',
        riskLevel:'متوسطة',
        status:item.deviceStatus||'يعمل',
        manufacturer:'',
        supplier:'',
        purchaseDate:'',
        operationStartDate:'',
        warrantyEndDate:'',
        maintenanceContract:'',
        qrCodeUrl:`maintenance-asset-${item.id}`,
        lastMaintenanceDate:'',
        nextMaintenanceDate:'',
        createdBy:item.createdBy||state.currentUser?.id||1,
        createdAt:item.createdAt||nowLocalString(),
        updatedAt:''
      };
      db.maintenanceAssets.push(asset);
    });
    saveDb();
  }
  window.ensureMaintenanceData=ensureMaintenanceData;

  function maintenanceAudit(action,type,id,details,college,department){
    auditLog(action,type,id,details,college,department);
  }

  function ensureMaintenanceState(){
    ensureMaintenanceData();
    if(typeof state.maintenanceTab==='undefined') state.maintenanceTab='dashboard';
    if(typeof state.maintenanceSearch==='undefined') state.maintenanceSearch='';
    if(typeof state.maintenanceCollege==='undefined') state.maintenanceCollege='all';
    if(typeof state.maintenanceStatus==='undefined') state.maintenanceStatus='all';
    if(typeof state.maintenanceRisk==='undefined') state.maintenanceRisk='all';
    if(typeof state.maintenanceDateFrom==='undefined') state.maintenanceDateFrom='';
    if(typeof state.maintenanceDateTo==='undefined') state.maintenanceDateTo='';
    if(typeof state.maintenanceReportType==='undefined') state.maintenanceReportType='tickets';
  }

  function setMaintenanceTab(tab){ ensureMaintenanceState(); state.maintenanceTab=tab; render(); }
  function setMaintenanceSearch(value){
    ensureMaintenanceState();
    state.maintenanceSearch=value;
    clearTimeout(state.maintenanceSearchTimer);
    state.maintenanceSearchTimer=setTimeout(()=>render(),260);
  }
  function setMaintenanceCollege(value){ ensureMaintenanceState(); state.maintenanceCollege=value||'all'; render(); }
  function setMaintenanceStatus(value){ ensureMaintenanceState(); state.maintenanceStatus=value||'all'; render(); }
  function setMaintenanceRisk(value){ ensureMaintenanceState(); state.maintenanceRisk=value||'all'; render(); }
  function setMaintenanceDateFrom(value){ ensureMaintenanceState(); state.maintenanceDateFrom=value||''; render(); }
  function setMaintenanceDateTo(value){ ensureMaintenanceState(); state.maintenanceDateTo=value||''; render(); }
  function setMaintenanceReportType(value){ ensureMaintenanceState(); state.maintenanceReportType=value||'tickets'; render(); }
  Object.assign(window,{setMaintenanceTab,setMaintenanceSearch,setMaintenanceCollege,setMaintenanceStatus,setMaintenanceRisk,setMaintenanceDateFrom,setMaintenanceDateTo,setMaintenanceReportType});

  function maintenanceStatusBadge(status){
    const text=maintenanceText(status)||'—';
    if(['يعمل','مكتملة','مغلق','مطابق','تم التركيب','تم التوريد'].includes(text)) return `<span class="badge badge-ok">${text}</span>`;
    if(['متوقف','خارج الخدمة','حرجة','حرج يمس السلامة العامة','متأخرة','غير مطابق','مرفوض'].includes(text)) return `<span class="badge badge-danger">${text}</span>`;
    if(['يحتاج متابعة','مستحقة','بانتظار قطع غيار','محال لمورد خارجي','عالٍ يؤثر على استمرارية التشغيل'].includes(text)) return `<span class="badge badge-warning">${text}</span>`;
    return `<span class="badge badge-info">${text}</span>`;
  }

  function maintenanceFrequencyDays(frequency){
    return {'أسبوعية':7,'شهرية':30,'ربع سنوية':90,'نصف سنوية':180,'سنوية':365}[frequency]||90;
  }

  function maintenanceSuggestedFrequency(risk){
    if(risk==='عالية') return 'شهرية';
    if(risk==='متوسطة') return 'ربع سنوية';
    return 'نصف سنوية';
  }

  function maintenanceNextDate(lastDate,frequency){
    const base=maintenanceParseDate(lastDate)||maintenanceParseDate(nowLocalString())||new Date();
    return maintenanceFormatDate(maintenanceAddDays(base,maintenanceFrequencyDays(frequency)));
  }

  function maintenancePlanStatus(plan){
    if(plan.status==='مكتملة' || plan.status==='تحتاج متابعة') return plan.status;
    const due=maintenanceParseDate(plan.nextDueDate);
    if(!due) return plan.status||'مجدولة';
    const today=maintenanceParseDate(nowLocalString());
    const days=maintenanceMinutesBetween(today,due)/(60*24);
    if(days<0) return 'متأخرة';
    if(days<=7) return 'مستحقة';
    return plan.status||'مجدولة';
  }

  function maintenanceAssets(){
    ensureMaintenanceState();
    let rows=maintenanceScopeRows(db.maintenanceAssets,row=>row.college,row=>row.mainDepartment||row.section);
    rows=rows.filter(row=>maintenanceIncludes(row,['assetNameAr','assetNameEn','serialNumber','assetNumber','college','mainDepartment','section','labRoom','status','riskLevel']));
    if(state.maintenanceStatus!=='all') rows=rows.filter(row=>row.status===state.maintenanceStatus);
    if(state.maintenanceRisk!=='all') rows=rows.filter(row=>row.riskLevel===state.maintenanceRisk);
    return rows;
  }

  function maintenancePlans(){
    ensureMaintenanceState();
    let rows=maintenanceScopeRows(db.preventiveMaintenancePlans,row=>row.college,row=>row.mainDepartment||row.section);
    rows=rows.map(plan=>({...plan,effectiveStatus:maintenancePlanStatus(plan)}));
    rows=rows.filter(row=>maintenanceIncludes(row,['planNo','assetNameAr','serialNumber','college','location','frequency','riskLevel','effectiveStatus','assignedToName']));
    if(state.maintenanceStatus!=='all') rows=rows.filter(row=>row.effectiveStatus===state.maintenanceStatus);
    if(state.maintenanceRisk!=='all') rows=rows.filter(row=>row.riskLevel===state.maintenanceRisk);
    rows=rows.filter(row=>maintenanceWithinDate(row,['lastMaintenanceDate','nextDueDate','createdAt','updatedAt']));
    return rows;
  }

  function maintenanceTickets(){
    ensureMaintenanceState();
    let rows=maintenanceScopeRows(db.maintenanceTickets,row=>row.college,row=>row.mainDepartment||row.section);
    rows=rows.filter(row=>maintenanceIncludes(row,['ticketNumber','assetNameAr','serialNumber','college','location','faultDescription','priority','status','requesterName','assignedToName']));
    if(state.maintenanceStatus!=='all') rows=rows.filter(row=>row.status===state.maintenanceStatus);
    rows=rows.filter(row=>maintenanceWithinDate(row,['reportedAt','failureDate','closedAt','createdAt','updatedAt']));
    return rows.sort((a,b)=>{
      const pri={'حرج يمس السلامة العامة':0,'عالٍ يؤثر على استمرارية التشغيل':1,'متوسط / عطل جزئي':2,'منخفض / ملاحظة تشغيلية':3};
      return (pri[a.priority]??9)-(pri[b.priority]??9) || maintenanceText(b.reportedAt).localeCompare(maintenanceText(a.reportedAt));
    });
  }

  function maintenanceVisits(){
    ensureMaintenanceState();
    let rows=maintenanceScopeRows(db.fieldVisits,row=>row.college,row=>row.mainDepartment||row.section);
    rows=rows.filter(row=>maintenanceIncludes(row,['visitNo','ticketNumber','assetNameAr','technicianName','initialDiagnosis','recommendation','actionTaken']));
    rows=rows.filter(row=>maintenanceWithinDate(row,['visitDateTime','createdAt','approvedAt']));
    return rows;
  }

  function maintenanceSpares(){
    ensureMaintenanceState();
    let rows=maintenanceScopeRows(db.sparePartRequests,row=>row.college,row=>row.mainDepartment||row.section);
    rows=rows.filter(row=>maintenanceIncludes(row,['requestNo','ticketNumber','assetNameAr','partName','suggestedSupplier','status','requestReason']));
    if(state.maintenanceStatus!=='all') rows=rows.filter(row=>row.status===state.maintenanceStatus);
    rows=rows.filter(row=>maintenanceWithinDate(row,['requestedAt','suppliedAt','installedAt','createdAt','updatedAt']));
    return rows;
  }

  function maintenanceAssetById(id){ return (db.maintenanceAssets||[]).find(asset=>Number(asset.id)===Number(id)); }
  function maintenancePlanById(id){ return (db.preventiveMaintenancePlans||[]).find(plan=>Number(plan.id)===Number(id)); }
  function maintenanceTicketById(id){ return (db.maintenanceTickets||[]).find(ticket=>Number(ticket.id)===Number(id)); }
  function maintenanceVisitById(id){ return (db.fieldVisits||[]).find(visit=>Number(visit.id)===Number(id)); }

  function maintenanceAssetOptions(selected){
    return maintenanceAssets().map(asset=>`<option value="${asset.id}" ${Number(selected)===Number(asset.id)?'selected':''}>${maintenanceEscape(asset.assetNameAr)} - ${maintenanceEscape(asset.serialNumber)}</option>`).join('');
  }

  function maintenanceUserOptions(selected){
    return (db.users||[]).filter(user=>user.isActive).map(user=>`<option value="${user.id}" ${Number(selected)===Number(user.id)?'selected':''}>${maintenanceEscape(user.fullName)}</option>`).join('');
  }

  function maintenanceCollegeOptions(selected){
    const current=selected||'all';
    return `<option value="all" ${current==='all'?'selected':''}>كل القطاعات</option>${COLLEGE_OPTIONS.map(college=>`<option value="${maintenanceEscape(college)}" ${current===college?'selected':''}>${maintenanceEscape(college)}</option>`).join('')}`;
  }

  function maintenanceGenericOptions(options,selected,allLabel='الكل'){
    return `<option value="all" ${selected==='all'?'selected':''}>${allLabel}</option>${options.map(option=>`<option value="${maintenanceEscape(option)}" ${selected===option?'selected':''}>${maintenanceEscape(option)}</option>`).join('')}`;
  }

  function maintenanceFiltersHtml({statusOptions=[],risk=true,date=true}={}){
    return `<div class="toolbar filter-toolbar"><div class="toolbar-right">
      <label class="filter-control filter-search"><span>بحث</span><input class="input search-input" placeholder="بحث باسم الجهاز، الرقم، البلاغ، الفني..." value="${maintenanceEscape(state.maintenanceSearch||'')}" oninput="setMaintenanceSearch(this.value)"></label>
      <label class="filter-control"><span>القطاع</span><select class="select" onchange="setMaintenanceCollege(this.value)">${maintenanceCollegeOptions(state.maintenanceCollege)}</select></label>
      ${statusOptions.length?`<label class="filter-control"><span>الحالة</span><select class="select" onchange="setMaintenanceStatus(this.value)">${maintenanceGenericOptions(statusOptions,state.maintenanceStatus,'كل الحالات')}</select></label>`:''}
      ${risk?`<label class="filter-control"><span>الخطورة</span><select class="select" onchange="setMaintenanceRisk(this.value)">${maintenanceGenericOptions(RISK_LEVELS,state.maintenanceRisk,'كل درجات الخطورة')}</select></label>`:''}
      ${date?`<label class="filter-control"><span>من تاريخ</span><input class="input" type="date" value="${state.maintenanceDateFrom||''}" onchange="setMaintenanceDateFrom(this.value)"></label>
      <label class="filter-control"><span>إلى تاريخ</span><input class="input" type="date" value="${state.maintenanceDateTo||''}" onchange="setMaintenanceDateTo(this.value)"></label>`:''}
    </div><div class="toolbar-left"></div></div>`;
  }

  function maintenanceDashboardStats(){
    const assets=maintenanceAssets();
    const plans=maintenancePlans();
    const tickets=maintenanceTickets();
    const closed=tickets.filter(ticket=>ticket.status==='مغلق');
    const responseValues=tickets.map(ticket=>Number(ticket.responseTimeMinutes||0)).filter(Boolean);
    const closeValues=closed.map(ticket=>Number(ticket.closeTimeMinutes||ticket.downtimeMinutes||0)).filter(Boolean);
    const byAsset=new Map();
    tickets.forEach(ticket=>byAsset.set(ticket.assetNameAr,(byAsset.get(ticket.assetNameAr)||0)+1));
    const byCollege=new Map();
    tickets.forEach(ticket=>byCollege.set(ticket.college,(byCollege.get(ticket.college)||0)+1));
    const avg=list=>list.length?Math.round(list.reduce((sum,value)=>sum+value,0)/list.length):0;
    return {
      totalAssets:assets.length,
      working:assets.filter(asset=>asset.status==='يعمل').length,
      stopped:assets.filter(asset=>['متوقف','خارج الخدمة'].includes(asset.status)).length,
      follow:assets.filter(asset=>asset.status==='يحتاج متابعة').length,
      dueThisWeek:plans.filter(plan=>plan.effectiveStatus==='مستحقة').length,
      overdue:plans.filter(plan=>plan.effectiveStatus==='متأخرة').length,
      openTickets:tickets.filter(ticket=>!['مغلق','مرفوض'].includes(ticket.status)).length,
      criticalTickets:tickets.filter(ticket=>ticket.priority==='حرج يمس السلامة العامة' && !['مغلق','مرفوض'].includes(ticket.status)).length,
      avgResponse:avg(responseValues),
      avgClose:avg(closeValues),
      topAsset:[...byAsset.entries()].sort((a,b)=>b[1]-a[1])[0]||['—',0],
      topCollege:[...byCollege.entries()].sort((a,b)=>b[1]-a[1])[0]||['—',0]
    };
  }

  function renderMaintenanceDashboard(){
    const stats=maintenanceDashboardStats();
    const cards=[
      ['إجمالي الأجهزة',stats.totalAssets,'ملفات أصول صيانة'],
      ['الأجهزة العاملة',stats.working,'جاهزة للتشغيل'],
      ['الأجهزة المتوقفة',stats.stopped,'تحتاج إجراء'],
      ['تحتاج متابعة',stats.follow,'حالة تشغيلية غير مكتملة'],
      ['وقائية مستحقة',stats.dueThisWeek,'خلال 7 أيام'],
      ['وقائية متأخرة',stats.overdue,'تجاوزت موعدها'],
      ['بلاغات مفتوحة',stats.openTickets,'قيد المعالجة'],
      ['بلاغات حرجة',stats.criticalTickets,'تمس السلامة أو التشغيل']
    ];
    return `<div class="hero edu-need-page-hero"><div><div class="hero-title">الصيانة والتشغيل</div><div class="hero-text">متابعة جاهزية الأجهزة، الصيانة الوقائية، بلاغات الأعطال، الزيارات الميدانية وقطع الغيار ضمن نطاق الصلاحية.</div></div><button class="btn btn-primary" onclick="openModal('maintenanceTicket')">+ إنشاء بلاغ</button></div>
    <div class="maintenance-kpi-grid">${cards.map(([title,value,note])=>`<div class="maintenance-kpi"><strong>${title}</strong><b>${value}</b><span>${note}</span></div>`).join('')}</div>
    <div class="section-split">
      <div class="table-panel"><div class="table-head"><div class="panel-title">مؤشرات زمنية</div></div>${table(['المؤشر','القيمة'],[
        ['متوسط زمن الاستجابة',`${stats.avgResponse} دقيقة`],
        ['متوسط زمن إغلاق البلاغ',`${stats.avgClose} دقيقة`],
        ['أكثر الأجهزة تعطلًا',`${stats.topAsset[0]} (${stats.topAsset[1]})`],
        ['أكثر القطاعات بلاغًا',`${stats.topCollege[0]} (${stats.topCollege[1]})`]
      ])}</div>
      <div class="table-panel"><div class="table-head"><div class="panel-title">تنبيهات الصيانة</div></div>${table(['التنبيه','العدد','الإجراء'],[
        ['صيانة وقائية مستحقة خلال 7 أيام',stats.dueThisWeek,'جدولة/تنفيذ'],
        ['صيانة وقائية متأخرة',stats.overdue,'متابعة عاجلة'],
        ['بلاغات حرجة مفتوحة',stats.criticalTickets,'فرز فوري'],
        ['أجهزة متوقفة أو خارج الخدمة',stats.stopped,'تقييم فني']
      ])}</div>
    </div>`;
  }

  function renderMaintenanceAssets(){
    const rows=maintenanceAssets().map(asset=>[
      asset.assetNumber||'—',
      asset.assetNameAr||'—',
      asset.assetNameEn||'—',
      asset.serialNumber||'—',
      asset.college||'—',
      asset.mainDepartment||'—',
      asset.labRoom||asset.location||'—',
      asset.assetType||'—',
      maintenanceStatusBadge(asset.riskLevel),
      maintenanceStatusBadge(asset.status),
      asset.lastMaintenanceDate||'—',
      asset.nextMaintenanceDate||'—',
      `<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('maintenanceAssetProfile',${asset.id})">ملف الجهاز</button>${hasPermission('manage_maintenance_assets')?`<button class="btn btn-secondary btn-sm" onclick="openModal('maintenanceAsset',${asset.id})">تعديل</button><button class="btn btn-primary btn-sm" onclick="openModal('maintenancePlan',${asset.id})">خطة وقائية</button>`:''}${hasPermission('create_maintenance_ticket')?`<button class="btn btn-warning btn-sm" onclick="openModal('maintenanceTicket',${asset.id})">بلاغ</button>`:''}</div>`
    ]);
    return `${maintenanceFiltersHtml({statusOptions:ASSET_STATUSES,risk:true,date:false})}
    <div class="toolbar action-toolbar"><div></div><div class="toolbar-left">${hasPermission('manage_maintenance_assets')?`<button class="btn btn-primary" onclick="openModal('maintenanceAsset')">+ إنشاء أصل صيانة</button>`:''}</div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">الأجهزة والأصول</div><div class="panel-subtitle">يتم ربط الأجهزة المسجلة في المخزون بملف أصل صيانة بدل إنشاء تكرار.</div></div>${table(['رقم الأصل','الجهاز','English','الرقم التسلسلي','القطاع','القسم','الموقع','النوع','الخطورة','الحالة','آخر صيانة','القادمة','إجراء'],rows)}</div>`;
  }

  function renderMaintenancePreventive(){
    const rows=maintenancePlans().map(plan=>[
      plan.planNo||'—',
      plan.assetNameAr||'—',
      plan.serialNumber||'—',
      plan.college||'—',
      plan.location||'—',
      maintenanceStatusBadge(plan.riskLevel),
      plan.frequency||'—',
      plan.lastMaintenanceDate||'—',
      plan.nextDueDate||'—',
      maintenanceStatusBadge(plan.effectiveStatus),
      plan.assignedToName||'—',
      `<div class="flex-actions">${hasPermission('manage_maintenance_assets')?`<button class="btn btn-success btn-sm" onclick="openModal('maintenanceRecord',${plan.id})">تنفيذ</button><button class="btn btn-secondary btn-sm" onclick="openModal('maintenancePlanEdit',${plan.id})">تعديل</button>`:''}</div>`
    ]);
    return `${maintenanceFiltersHtml({statusOptions:PM_STATUSES,risk:true,date:true})}
    <div class="toolbar action-toolbar"><div></div><div class="toolbar-left">${hasPermission('manage_maintenance_assets')?`<button class="btn btn-primary" onclick="openModal('maintenancePlan')">+ إضافة خطة</button>`:''}</div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">الصيانة الوقائية</div><div class="panel-subtitle">الحالة تحتسب من تاريخ الصيانة القادمة مع فلترة تاريخية تعتمد على التاريخ فقط.</div></div>${table(['رقم الخطة','الجهاز','التسلسلي','القطاع','الموقع','الخطورة','الدورية','آخر صيانة','الصيانة القادمة','الحالة','الفني','إجراء'],rows)}</div>`;
  }

  function renderMaintenanceTickets(){
    const rows=maintenanceTickets().map(ticket=>[
      ticket.ticketNumber,
      ticket.assetNameAr||'—',
      ticket.serialNumber||'—',
      ticket.college||'—',
      ticket.location||'—',
      maintenanceStatusBadge(ticket.priority),
      maintenanceStatusBadge(ticket.status),
      formatDateTime(ticket.reportedAt),
      ticket.assignedToName||'—',
      `<div class="flex-actions"><button class="btn btn-secondary btn-sm" onclick="openModal('maintenanceTicketProfile',${ticket.id})">عرض</button>${hasPermission('approve_maintenance')&&!['مغلق','مرفوض'].includes(ticket.status)?`<button class="btn btn-primary btn-sm" onclick="openModal('fieldVisit',${ticket.id})">زيارة</button><button class="btn btn-warning btn-sm" onclick="openModal('spareRequest',${ticket.id})">قطعة غيار</button><button class="btn btn-success btn-sm" onclick="closeMaintenanceTicket(${ticket.id})">إغلاق</button>`:''}</div>`
    ]);
    return `${maintenanceFiltersHtml({statusOptions:TICKET_STATUSES,risk:false,date:true})}
    <div class="toolbar action-toolbar"><div></div><div class="toolbar-left">${hasPermission('create_maintenance_ticket')?`<button class="btn btn-primary" onclick="openModal('maintenanceTicket')">+ إنشاء بلاغ</button>`:''}</div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">بلاغات الأعطال</div><div class="panel-subtitle">البلاغات الحرجة تظهر أعلى القائمة، ولا يغلق البلاغ دون تقرير فني وزيارة مسجلة.</div></div>${table(['رقم البلاغ','الجهاز','التسلسلي','القطاع','الموقع','الأولوية','الحالة','تاريخ البلاغ','الفني','إجراء'],rows)}</div>`;
  }

  function renderMaintenanceVisits(){
    const rows=maintenanceVisits().map(visit=>[
      visit.visitNo,
      visit.ticketNumber||'—',
      visit.assetNameAr||'—',
      visit.technicianName||'—',
      formatDateTime(visit.visitDateTime),
      visit.initialDiagnosis||'—',
      visit.recommendation||'—',
      visit.needsSpareParts?'نعم':'لا',
      visit.needsExternalVendor?'نعم':'لا',
      visit.technicianReport||'—'
    ]);
    return `${maintenanceFiltersHtml({statusOptions:[],risk:false,date:true})}
    <div class="table-panel"><div class="table-head"><div class="panel-title">الزيارات الميدانية</div></div>${table(['رقم الزيارة','رقم البلاغ','الجهاز','الفني','تاريخ الزيارة','التشخيص','التوصية','قطع غيار','مورد خارجي','تقرير الفني'],rows)}</div>`;
  }

  function renderMaintenanceSpares(){
    const rows=maintenanceSpares().map(req=>[
      req.requestNo,
      req.ticketNumber||'—',
      req.assetNameAr||'—',
      req.partName||'—',
      req.quantity||0,
      req.suggestedSupplier||'—',
      req.estimatedCost||0,
      maintenanceStatusBadge(req.status),
      maintenanceDateOnly(req.requestedAt)||'—',
      `<div class="flex-actions">${hasPermission('approve_maintenance')?`<button class="btn btn-success btn-sm" onclick="advanceSpareRequest(${req.id})">تحديث الحالة</button>`:''}</div>`
    ]);
    return `${maintenanceFiltersHtml({statusOptions:SPARE_STATUSES,risk:false,date:true})}
    <div class="table-panel"><div class="table-head"><div class="panel-title">قطع الغيار</div></div>${table(['رقم الطلب','البلاغ','الجهاز','القطعة','الكمية','المورد','التكلفة','الحالة','تاريخ الطلب','إجراء'],rows)}</div>`;
  }

  function maintenanceReportData(){
    const type=state.maintenanceReportType||'tickets';
    if(type==='assets') return {title:'تقرير الأجهزة والأصول',headers:['الجهاز','الرقم التسلسلي','القطاع','القسم','الموقع','النوع','الخطورة','الحالة','آخر صيانة','الصيانة القادمة'],rows:maintenanceAssets().map(a=>[a.assetNameAr,a.serialNumber,a.college,a.mainDepartment,a.labRoom||a.location,a.assetType,a.riskLevel,a.status,a.lastMaintenanceDate,a.nextMaintenanceDate])};
    if(type==='preventive') return {title:'تقرير الصيانة الوقائية',headers:['رقم الخطة','الجهاز','القطاع','الدورية','آخر صيانة','الصيانة القادمة','الحالة','الفني'],rows:maintenancePlans().map(p=>[p.planNo,p.assetNameAr,p.college,p.frequency,p.lastMaintenanceDate,p.nextDueDate,p.effectiveStatus,p.assignedToName])};
    if(type==='spares') return {title:'تقرير قطع الغيار',headers:['رقم الطلب','البلاغ','الجهاز','القطعة','الكمية','المورد','التكلفة','الحالة'],rows:maintenanceSpares().map(r=>[r.requestNo,r.ticketNumber,r.assetNameAr,r.partName,r.quantity,r.suggestedSupplier,r.estimatedCost,r.status])};
    if(type==='kpi') return maintenanceKpiReportData();
    return {title:'تقرير بلاغات الأعطال',headers:['رقم البلاغ','الجهاز','القطاع','الأولوية','الحالة','تاريخ البلاغ','تاريخ الإغلاق','زمن الاستجابة','زمن التوقف'],rows:maintenanceTickets().map(t=>[t.ticketNumber,t.assetNameAr,t.college,t.priority,t.status,formatDateTime(t.reportedAt),formatDateTime(t.closedAt),`${t.responseTimeMinutes||0} دقيقة`,`${t.downtimeMinutes||0} دقيقة`])};
  }

  function renderMaintenanceReports(){
    const options=[['tickets','بلاغات الأعطال'],['assets','الأجهزة والأصول'],['preventive','الصيانة الوقائية'],['spares','قطع الغيار'],['kpi','مؤشرات الأداء']];
    const data=maintenanceReportData();
    return `<div class="toolbar filter-toolbar"><div class="toolbar-right">
      <label class="filter-control"><span>نوع التقرير</span><select class="select" onchange="setMaintenanceReportType(this.value)">${options.map(([value,label])=>`<option value="${value}" ${state.maintenanceReportType===value?'selected':''}>${label}</option>`).join('')}</select></label>
    </div><div class="toolbar-left"><button class="btn btn-primary" onclick="printMaintenanceReport()">PDF</button><button class="btn btn-secondary" onclick="exportMaintenanceReport()">Excel</button></div></div>
    ${maintenanceFiltersHtml({statusOptions:[],risk:false,date:true})}
    <div class="table-panel"><div class="table-head"><div class="panel-title">${data.title}</div></div>${table(data.headers,data.rows)}</div>`;
  }

  function maintenanceKpiReportData(){
    const stats=maintenanceDashboardStats();
    const assets=maintenanceAssets();
    const plans=maintenancePlans();
    const tickets=maintenanceTickets();
    const total=assets.length||1;
    const completedPlans=plans.filter(plan=>plan.effectiveStatus==='مكتملة').length;
    const repeated=tickets.filter(ticket=>ticket.isRecurring).length;
    return {
      title:'تقرير مؤشرات أداء الصيانة',
      headers:['المؤشر','القيمة'],
      rows:[
        ['نسبة الالتزام بخطة الصيانة الوقائية',plans.length?Math.round(completedPlans/plans.length*100)+'%':'0%'],
        ['عدد الأعطال الطارئة',tickets.length],
        ['عدد الأعطال المتكررة',repeated],
        ['متوسط زمن الاستجابة',`${stats.avgResponse} دقيقة`],
        ['متوسط زمن الإغلاق',`${stats.avgClose} دقيقة`],
        ['إجمالي زمن توقف الأجهزة',`${tickets.reduce((sum,t)=>sum+Number(t.downtimeMinutes||0),0)} دقيقة`],
        ['نسبة الأجهزة الجاهزة',Math.round(stats.working/total*100)+'%'],
        ['نسبة الأجهزة المتوقفة',Math.round(stats.stopped/total*100)+'%'],
        ['عدد البلاغات الحرجة',stats.criticalTickets],
        ['عدد البلاغات المغلقة',tickets.filter(t=>t.status==='مغلق').length],
        ['عدد البلاغات المتأخرة',tickets.filter(t=>!['مغلق','مرفوض'].includes(t.status) && maintenanceMinutesBetween(t.reportedAt,nowLocalString())>48*60).length],
        ['الصيانات الوقائية المتأخرة',stats.overdue]
      ]
    };
  }

  function renderMaintenanceKpis(){
    const data=maintenanceKpiReportData();
    return `<div class="table-panel"><div class="table-head"><div class="panel-title">مؤشرات الأداء KPIs</div></div>${table(data.headers,data.rows)}</div>`;
  }

  function renderMaintenance(){
    ensureMaintenanceState();
    const tabs=MAINTENANCE_TABS.map(([id,label])=>`<button class="report-tab ${state.maintenanceTab===id?'active':''}" onclick="setMaintenanceTab('${id}')">${label}</button>`).join('');
    const content={
      dashboard:renderMaintenanceDashboard,
      assets:renderMaintenanceAssets,
      preventive:renderMaintenancePreventive,
      tickets:renderMaintenanceTickets,
      visits:renderMaintenanceVisits,
      spares:renderMaintenanceSpares,
      reports:renderMaintenanceReports,
      kpis:renderMaintenanceKpis
    }[state.maintenanceTab]?.()||'';
    return `<div class="report-tabs maintenance-tabs">${tabs}</div>${content}`;
  }

  function maintenanceAssetModalHtml(){
    const itemId=state.editId && !maintenanceAssetById(state.editId)?state.editId:null;
    const existing=maintenanceAssetById(state.editId);
    const item=itemId?getItemById(itemId):(existing?.itemId?getItemById(existing.itemId):null);
    const asset=existing||{
      itemId:item?.id||'',
      assetNameAr:item?.nameAr||item?.name||'',
      assetNameEn:item?.nameEn||'',
      serialNumber:item?.serialNumber||'',
      assetNumber:item?.code||'',
      college:item?.college||(!isCentral()?state.currentUser.college:COLLEGE_OPTIONS[0]),
      mainDepartment:item?.mainDepartment||currentDepartmentName(),
      section:item?.section||SECTION_OPTIONS[0],
      labRoom:item?.location||'',
      assetType:'جهاز تعليمي',
      riskLevel:'متوسطة',
      status:item?.deviceStatus||'يعمل'
    };
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-xl"><div class="modal-header"><div><div class="panel-title">${existing?'تعديل أصل صيانة':'إنشاء أصل صيانة'}</div><div class="panel-subtitle">يرتبط الأصل بالجهاز المسجل في المخزون إن وجد، مع منع تكرار الرقم التسلسلي.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <input id="maint-asset-id" type="hidden" value="${existing?.id||''}">
      <input id="maint-item-id" type="hidden" value="${asset.itemId||''}">
      <div><label class="label">اسم الجهاز بالعربي</label><input id="maint-asset-ar" class="input" value="${maintenanceEscape(asset.assetNameAr)}"></div>
      <div><label class="label">اسم الجهاز بالإنجليزي</label><input id="maint-asset-en" class="input" value="${maintenanceEscape(asset.assetNameEn)}"></div>
      <div><label class="label">الرقم التسلسلي</label><input id="maint-serial" class="input" value="${maintenanceEscape(asset.serialNumber)}"></div>
      <div><label class="label">رقم الأصل</label><input id="maint-asset-number" class="input" value="${maintenanceEscape(asset.assetNumber)}"></div>
      <div><label class="label">القطاع</label>${isCentral()?`<select id="maint-college" class="select">${COLLEGE_OPTIONS.map(c=>`<option value="${maintenanceEscape(c)}" ${asset.college===c?'selected':''}>${maintenanceEscape(c)}</option>`).join('')}</select>`:`<input id="maint-college" class="input" value="${maintenanceEscape(state.currentUser.college)}" readonly>`}</div>
      <div><label class="label">القسم الرئيسي</label><input id="maint-main-dept" class="input" value="${maintenanceEscape(asset.mainDepartment||'القسم العام')}"></div>
      <div><label class="label">القسم الفرعي</label><input id="maint-section" class="input" value="${maintenanceEscape(asset.section||'')}"></div>
      <div><label class="label">الموقع / المعمل</label><input id="maint-lab" class="input" value="${maintenanceEscape(asset.labRoom||asset.location||'')}"></div>
      <div><label class="label">المبنى</label><input id="maint-building" class="input" value="${maintenanceEscape(asset.building||'')}"></div>
      <div><label class="label">الدور</label><input id="maint-floor" class="input" value="${maintenanceEscape(asset.floor||'')}"></div>
      <div><label class="label">نوع الجهاز</label><select id="maint-asset-type" class="select">${ASSET_TYPES.map(type=>`<option ${asset.assetType===type?'selected':''}>${type}</option>`).join('')}</select></div>
      <div><label class="label">درجة الخطورة</label><select id="maint-risk" class="select">${RISK_LEVELS.map(r=>`<option ${asset.riskLevel===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div><label class="label">حالة الجهاز</label><select id="maint-status" class="select">${ASSET_STATUSES.map(s=>`<option ${asset.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div><label class="label">الشركة المصنعة</label><input id="maint-manufacturer" class="input" value="${maintenanceEscape(asset.manufacturer||'')}"></div>
      <div><label class="label">المورد</label><input id="maint-supplier" class="input" value="${maintenanceEscape(asset.supplier||'')}"></div>
      <div><label class="label">تاريخ الشراء</label><input id="maint-purchase" type="date" class="input" value="${maintenanceDateOnly(asset.purchaseDate)}"></div>
      <div><label class="label">بداية التشغيل</label><input id="maint-operation" type="date" class="input" value="${maintenanceDateOnly(asset.operationStartDate)}"></div>
      <div><label class="label">نهاية الضمان</label><input id="maint-warranty" type="date" class="input" value="${maintenanceDateOnly(asset.warrantyEndDate)}"></div>
      <div><label class="label">عقد الصيانة</label><input id="maint-contract" class="input" value="${maintenanceEscape(asset.maintenanceContract||'')}"></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveMaintenanceAsset()">حفظ الأصل</button></div></div></div>`;
  }

  function saveMaintenanceAsset(){
    if(!hasPermission('manage_maintenance_assets')) return alert('لا تملك صلاحية إدارة أصول الصيانة');
    const id=Number(document.getElementById('maint-asset-id')?.value||0);
    const serial=maintenanceText(document.getElementById('maint-serial')?.value);
    if(!serial) return alert('الرقم التسلسلي إلزامي');
    const duplicate=(db.maintenanceAssets||[]).find(asset=>Number(asset.id)!==id && maintenanceText(asset.serialNumber)===serial);
    if(duplicate) return alert('الرقم التسلسلي موجود مسبقًا ولا يمكن تكراره');
    const asset=id?maintenanceAssetById(id):{id:nextId(db.maintenanceAssets),createdAt:nowLocalString(),createdBy:state.currentUser.id};
    if(!asset) return alert('الأصل غير موجود');
    Object.assign(asset,{
      itemId:Number(document.getElementById('maint-item-id')?.value||0)||null,
      assetNameAr:maintenanceText(document.getElementById('maint-asset-ar')?.value),
      assetNameEn:maintenanceText(document.getElementById('maint-asset-en')?.value),
      serialNumber:serial,
      assetNumber:maintenanceText(document.getElementById('maint-asset-number')?.value)||`AST-${serial}`,
      college:isCentral()?document.getElementById('maint-college').value:state.currentUser.college,
      mainDepartment:maintenanceText(document.getElementById('maint-main-dept')?.value)||'القسم العام',
      section:maintenanceText(document.getElementById('maint-section')?.value),
      labRoom:maintenanceText(document.getElementById('maint-lab')?.value),
      building:maintenanceText(document.getElementById('maint-building')?.value),
      floor:maintenanceText(document.getElementById('maint-floor')?.value),
      assetType:document.getElementById('maint-asset-type')?.value,
      riskLevel:document.getElementById('maint-risk')?.value,
      status:document.getElementById('maint-status')?.value,
      manufacturer:maintenanceText(document.getElementById('maint-manufacturer')?.value),
      supplier:maintenanceText(document.getElementById('maint-supplier')?.value),
      purchaseDate:maintenanceDateOnly(document.getElementById('maint-purchase')?.value),
      operationStartDate:maintenanceDateOnly(document.getElementById('maint-operation')?.value),
      warrantyEndDate:maintenanceDateOnly(document.getElementById('maint-warranty')?.value),
      maintenanceContract:maintenanceText(document.getElementById('maint-contract')?.value),
      qrCodeUrl:`maintenance-asset-${serial}`,
      updatedAt:nowLocalString(),
      updatedBy:state.currentUser.id
    });
    if(!id) db.maintenanceAssets.push(asset);
    const item=asset.itemId?getItemById(asset.itemId):null;
    if(item){
      item.serialNumber=asset.serialNumber;
      item.deviceStatus=asset.status;
      item.location=asset.labRoom||item.location;
    }
    maintenanceAudit(id?'تعديل أصل صيانة':'إنشاء أصل صيانة','maintenanceAsset',asset.id,asset.assetNameAr,asset.college,asset.mainDepartment);
    saveDb();
    closeModal();
  }

  function maintenancePlanModalHtml(editPlan=false){
    const plan=editPlan?maintenancePlanById(state.editId):null;
    const asset=plan?maintenanceAssetById(plan.assetId):maintenanceAssetById(state.editId);
    const selectedAssetId=plan?.assetId||asset?.id||'';
    const risk=plan?.riskLevel||asset?.riskLevel||'متوسطة';
    const frequency=plan?.frequency||maintenanceSuggestedFrequency(risk);
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">${plan?'تعديل خطة صيانة':'خطة صيانة وقائية'}</div><div class="panel-subtitle">تقترح الدورية حسب درجة الخطورة، ويمكن تعديلها يدويًا.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <input id="pm-plan-id" type="hidden" value="${plan?.id||''}">
      <div class="full"><label class="label">الجهاز</label><select id="pm-asset-id" class="select">${maintenanceAssetOptions(selectedAssetId)}</select></div>
      <div><label class="label">دورية الصيانة</label><select id="pm-frequency" class="select">${PM_FREQUENCIES.map(f=>`<option ${frequency===f?'selected':''}>${f}</option>`).join('')}</select></div>
      <div><label class="label">درجة الخطورة</label><select id="pm-risk" class="select">${RISK_LEVELS.map(r=>`<option ${risk===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div><label class="label">آخر صيانة</label><input id="pm-last" class="input" type="date" value="${maintenanceDateOnly(plan?.lastMaintenanceDate||asset?.lastMaintenanceDate||'')}"></div>
      <div><label class="label">الصيانة القادمة</label><input id="pm-next" class="input" type="date" value="${maintenanceDateOnly(plan?.nextDueDate||asset?.nextMaintenanceDate||maintenanceNextDate(nowLocalString(),frequency))}"></div>
      <div><label class="label">الفني المسؤول</label><select id="pm-assigned" class="select">${maintenanceUserOptions(plan?.assignedTo)}</select></div>
      <div class="full"><label class="label">ملاحظات</label><textarea id="pm-notes" class="textarea">${maintenanceEscape(plan?.notes||'')}</textarea></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="savePreventivePlan()">حفظ الخطة</button></div></div></div>`;
  }

  function savePreventivePlan(){
    if(!hasPermission('manage_maintenance_assets')) return alert('لا تملك صلاحية إدارة خطط الصيانة');
    const id=Number(document.getElementById('pm-plan-id')?.value||0);
    const asset=maintenanceAssetById(Number(document.getElementById('pm-asset-id')?.value||0));
    if(!asset) return alert('اختر جهازًا صحيحًا');
    const assignedId=Number(document.getElementById('pm-assigned')?.value||0);
    const assigned=getUserById(assignedId);
    const plan=id?maintenancePlanById(id):{id:nextId(db.preventiveMaintenancePlans),planNo:nextNo('PM',db.preventiveMaintenancePlans),createdAt:nowLocalString(),createdBy:state.currentUser.id};
    Object.assign(plan,{
      assetId:asset.id,
      itemId:asset.itemId||null,
      assetNameAr:asset.assetNameAr,
      serialNumber:asset.serialNumber,
      college:asset.college,
      mainDepartment:asset.mainDepartment,
      section:asset.section,
      location:asset.labRoom||asset.location||'',
      assetType:asset.assetType,
      riskLevel:document.getElementById('pm-risk')?.value,
      frequency:document.getElementById('pm-frequency')?.value,
      lastMaintenanceDate:maintenanceDateOnly(document.getElementById('pm-last')?.value),
      nextDueDate:maintenanceDateOnly(document.getElementById('pm-next')?.value),
      assignedTo:assignedId||null,
      assignedToName:assigned?.fullName||'',
      status:'مجدولة',
      notes:maintenanceText(document.getElementById('pm-notes')?.value),
      updatedAt:nowLocalString(),
      updatedBy:state.currentUser.id
    });
    asset.nextMaintenanceDate=plan.nextDueDate;
    if(!id) db.preventiveMaintenancePlans.push(plan);
    maintenanceAudit(id?'تعديل خطة صيانة وقائية':'إنشاء خطة صيانة وقائية','preventiveMaintenancePlan',plan.planNo,plan.assetNameAr,plan.college,plan.mainDepartment);
    saveDb();
    closeModal();
  }

  function maintenanceRecordModalHtml(){
    const plan=maintenancePlanById(state.editId);
    if(!plan) return '';
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">تنفيذ صيانة وقائية</div><div class="panel-subtitle">${maintenanceEscape(plan.assetNameAr)} - ${maintenanceEscape(plan.planNo)}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <input id="pm-record-plan" type="hidden" value="${plan.id}">
      <div><label class="label">تاريخ الصيانة</label><input id="pm-record-date" class="input" type="date" value="${maintenanceDateOnly(nowLocalString())}"></div>
      <div><label class="label">نوع الصيانة</label><input id="pm-record-type" class="input" value="صيانة وقائية"></div>
      <div><label class="label">المنفذ</label><select id="pm-record-performed" class="select">${maintenanceUserOptions(state.currentUser?.id)}</select></div>
      <div><label class="label">نتيجة الفحص</label><select id="pm-record-result" class="select"><option>مطابق</option><option>يحتاج متابعة</option><option>غير مطابق</option></select></div>
      <div class="full"><label class="label">الأعمال المنفذة</label><textarea id="pm-record-actions" class="textarea">فحص، تنظيف، معايرة، اختبار سلامة</textarea></div>
      <div class="full"><label class="label">وصف الإجراء</label><textarea id="pm-record-desc" class="textarea"></textarea></div>
      <div class="full"><label class="label">ملاحظات</label><textarea id="pm-record-notes" class="textarea"></textarea></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="savePreventiveRecord()">حفظ التنفيذ</button></div></div></div>`;
  }

  function savePreventiveRecord(){
    const plan=maintenancePlanById(Number(document.getElementById('pm-record-plan')?.value||0));
    if(!plan) return alert('خطة الصيانة غير موجودة');
    const asset=maintenanceAssetById(plan.assetId);
    const performedId=Number(document.getElementById('pm-record-performed')?.value||0);
    const performed=getUserById(performedId);
    const date=maintenanceDateOnly(document.getElementById('pm-record-date')?.value)||maintenanceDateOnly(nowLocalString());
    const result=document.getElementById('pm-record-result')?.value;
    const record={
      id:nextId(db.preventiveMaintenanceRecords),
      recordNo:nextNo('PMR',db.preventiveMaintenanceRecords),
      planId:plan.id,
      assetId:plan.assetId,
      assetNameAr:plan.assetNameAr,
      college:plan.college,
      mainDepartment:plan.mainDepartment,
      maintenanceDate:date,
      maintenanceType:maintenanceText(document.getElementById('pm-record-type')?.value),
      performedActions:maintenanceText(document.getElementById('pm-record-actions')?.value),
      result,
      description:maintenanceText(document.getElementById('pm-record-desc')?.value),
      notes:maintenanceText(document.getElementById('pm-record-notes')?.value),
      performedBy:performedId,
      performedByName:performed?.fullName||'',
      approvedBy:state.currentUser?.id||null,
      approvedAt:nowLocalString(),
      createdAt:nowLocalString()
    };
    db.preventiveMaintenanceRecords.unshift(record);
    plan.lastMaintenanceDate=date;
    plan.nextDueDate=maintenanceNextDate(date,plan.frequency);
    plan.status=result==='مطابق'?'مكتملة':'تحتاج متابعة';
    if(asset){
      asset.lastMaintenanceDate=date;
      asset.nextMaintenanceDate=plan.nextDueDate;
      asset.status=result==='مطابق'?'يعمل':'يحتاج متابعة';
    }
    maintenanceAudit('تنفيذ صيانة وقائية','preventiveMaintenanceRecord',record.recordNo,`${record.assetNameAr} - ${result}`,record.college,record.mainDepartment);
    saveDb();
    closeModal();
  }

  function classifyTicketPriority({stopped,safety,affects,recurring}){
    if(safety) return 'حرج يمس السلامة العامة';
    if(stopped && affects) return 'عالٍ يؤثر على استمرارية التشغيل';
    if(stopped || affects || recurring) return 'متوسط / عطل جزئي';
    return 'منخفض / ملاحظة تشغيلية';
  }

  function maintenanceTicketModalHtml(){
    const asset=maintenanceAssetById(state.editId)||maintenanceAssets()[0];
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">إنشاء بلاغ عطل</div><div class="panel-subtitle">يتم تصنيف درجة الطوارئ تلقائيًا من بيانات العطل.</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="full"><label class="label">الجهاز</label><select id="mt-asset-id" class="select">${maintenanceAssetOptions(asset?.id)}</select></div>
      <div><label class="label">منسق الجهة</label><select id="mt-coordinator" class="select">${maintenanceUserOptions(state.currentUser?.id)}</select></div>
      <div><label class="label">تاريخ حدوث العطل</label><input id="mt-failure-date" class="input" type="date" value="${maintenanceDateOnly(nowLocalString())}"></div>
      <div><label class="label">الجهاز متوقف كليًا؟</label><select id="mt-stopped" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">خطر على السلامة؟</label><select id="mt-safety" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">يؤثر على العملية؟</label><select id="mt-affects" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">عطل متكرر؟</label><select id="mt-recurring" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">رقم وثيق</label><input id="mt-wathiq" class="input"></div>
      <div class="full"><label class="label">وصف العطل</label><textarea id="mt-desc" class="textarea"></textarea></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveMaintenanceTicket()">حفظ البلاغ</button></div></div></div>`;
  }

  function saveMaintenanceTicket(){
    if(!hasPermission('create_maintenance_ticket')) return alert('لا تملك صلاحية إنشاء بلاغات الصيانة');
    const asset=maintenanceAssetById(Number(document.getElementById('mt-asset-id')?.value||0));
    if(!asset) return alert('اختر جهازًا صحيحًا');
    if(!isCentral() && !canAccessCollege(asset.college)) return scopeDeny();
    const coordinatorId=Number(document.getElementById('mt-coordinator')?.value||0);
    const coordinator=getUserById(coordinatorId);
    const flags={
      stopped:document.getElementById('mt-stopped')?.value==='yes',
      safety:document.getElementById('mt-safety')?.value==='yes',
      affects:document.getElementById('mt-affects')?.value==='yes',
      recurring:document.getElementById('mt-recurring')?.value==='yes'
    };
    const ticket={
      id:nextId(db.maintenanceTickets),
      ticketNumber:nextNo('MT',db.maintenanceTickets),
      assetId:asset.id,
      itemId:asset.itemId||null,
      assetNameAr:asset.assetNameAr,
      serialNumber:asset.serialNumber,
      college:asset.college,
      mainDepartment:asset.mainDepartment,
      section:asset.section,
      location:asset.labRoom||asset.location||'',
      requesterId:state.currentUser?.id||null,
      requesterName:state.currentUser?.fullName||'',
      coordinatorId:coordinatorId||null,
      coordinatorName:coordinator?.fullName||'',
      reportedAt:nowLocalString(),
      failureDate:maintenanceDateOnly(document.getElementById('mt-failure-date')?.value),
      faultDescription:maintenanceText(document.getElementById('mt-desc')?.value),
      isFullyStopped:flags.stopped,
      isSafetyRisk:flags.safety,
      affectsOperation:flags.affects,
      isRecurring:flags.recurring,
      priority:classifyTicketPriority(flags),
      status:'جديد',
      wathiqNumber:maintenanceText(document.getElementById('mt-wathiq')?.value),
      createdBy:state.currentUser?.id||null,
      createdAt:nowLocalString(),
      updatedAt:''
    };
    if(!ticket.faultDescription) return alert('أدخل وصف العطل');
    db.maintenanceTickets.unshift(ticket);
    if(flags.stopped || flags.safety){
      asset.status=flags.safety?'يحتاج متابعة':'متوقف';
      const item=asset.itemId?getItemById(asset.itemId):null;
      if(item) item.deviceStatus=asset.status;
    }
    maintenanceAudit('إنشاء بلاغ صيانة','maintenanceTicket',ticket.ticketNumber,ticket.faultDescription,ticket.college,ticket.mainDepartment);
    saveDb();
    closeModal();
  }

  function fieldVisitModalHtml(){
    const ticket=maintenanceTicketById(state.editId);
    if(!ticket) return '';
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">زيارة ميدانية</div><div class="panel-subtitle">${maintenanceEscape(ticket.ticketNumber)} - ${maintenanceEscape(ticket.assetNameAr)}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <input id="visit-ticket-id" type="hidden" value="${ticket.id}">
      <div><label class="label">الفني المكلف</label><select id="visit-tech" class="select">${maintenanceUserOptions(ticket.assignedTo||state.currentUser?.id)}</select></div>
      <div><label class="label">تاريخ ووقت الزيارة</label><input id="visit-datetime" class="input" type="datetime-local" value="${maintenanceDateOnly(nowLocalString())}T09:00"></div>
      <div><label class="label">يحتاج قطع غيار؟</label><select id="visit-spares" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">يحتاج مورد خارجي؟</label><select id="visit-vendor" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">غير قابل للإصلاح؟</label><select id="visit-not-repairable" class="select"><option value="no">لا</option><option value="yes">نعم</option></select></div>
      <div><label class="label">التوصية</label><select id="visit-recommendation" class="select">${VISIT_RECOMMENDATIONS.map(r=>`<option>${r}</option>`).join('')}</select></div>
      <div class="full"><label class="label">التشخيص الأولي</label><textarea id="visit-diagnosis" class="textarea"></textarea></div>
      <div class="full"><label class="label">الإجراء المتخذ</label><textarea id="visit-action" class="textarea"></textarea></div>
      <div class="full"><label class="label">تقرير الفني</label><textarea id="visit-report" class="textarea"></textarea></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveFieldVisit()">حفظ الزيارة</button></div></div></div>`;
  }

  function saveFieldVisit(){
    if(!hasPermission('approve_maintenance')) return alert('لا تملك صلاحية تسجيل الزيارات');
    const ticket=maintenanceTicketById(Number(document.getElementById('visit-ticket-id')?.value||0));
    if(!ticket) return alert('البلاغ غير موجود');
    const techId=Number(document.getElementById('visit-tech')?.value||0);
    const tech=getUserById(techId);
    const needsSpares=document.getElementById('visit-spares')?.value==='yes';
    const needsVendor=document.getElementById('visit-vendor')?.value==='yes';
    const notRepairable=document.getElementById('visit-not-repairable')?.value==='yes';
    const visitDate=document.getElementById('visit-datetime')?.value||nowLocalString();
    const visit={
      id:nextId(db.fieldVisits),
      visitNo:nextNo('FV',db.fieldVisits),
      ticketId:ticket.id,
      ticketNumber:ticket.ticketNumber,
      assetId:ticket.assetId,
      assetNameAr:ticket.assetNameAr,
      college:ticket.college,
      mainDepartment:ticket.mainDepartment,
      technicianId:techId,
      technicianName:tech?.fullName||'',
      visitDateTime:visitDate,
      siteCondition:'',
      assetDataVerified:true,
      initialDiagnosis:maintenanceText(document.getElementById('visit-diagnosis')?.value),
      needsSpareParts:needsSpares,
      needsExternalVendor:needsVendor,
      notRepairable,
      actionTaken:maintenanceText(document.getElementById('visit-action')?.value),
      recommendation:document.getElementById('visit-recommendation')?.value,
      technicianReport:maintenanceText(document.getElementById('visit-report')?.value),
      approvedBy:state.currentUser?.id||null,
      approvedAt:nowLocalString(),
      createdAt:nowLocalString()
    };
    if(!visit.technicianReport) return alert('لا يمكن حفظ الزيارة دون تقرير الفني');
    db.fieldVisits.unshift(visit);
    ticket.assignedTo=techId;
    ticket.assignedToName=tech?.fullName||'';
    ticket.status=needsSpares?'بانتظار قطع غيار':needsVendor?'محال لمورد خارجي':notRepairable?'تحت المعالجة':'مكتمل بانتظار اعتماد الجهة';
    ticket.responseTimeMinutes=ticket.responseTimeMinutes||maintenanceMinutesBetween(ticket.reportedAt,visitDate);
    ticket.updatedAt=nowLocalString();
    maintenanceAudit('تسجيل زيارة ميدانية','fieldVisit',visit.visitNo,visit.ticketNumber,visit.college,visit.mainDepartment);
    saveDb();
    closeModal();
  }

  function spareRequestModalHtml(){
    const ticket=maintenanceTicketById(state.editId);
    if(!ticket) return '';
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal"><div class="modal-header"><div><div class="panel-title">طلب قطعة غيار</div><div class="panel-subtitle">${maintenanceEscape(ticket.ticketNumber)} - ${maintenanceEscape(ticket.assetNameAr)}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="form-grid">
      <input id="sp-ticket-id" type="hidden" value="${ticket.id}">
      <div><label class="label">اسم القطعة</label><input id="sp-name" class="input"></div>
      <div><label class="label">الكمية</label><input id="sp-qty" type="number" min="1" class="input" value="1"></div>
      <div><label class="label">المورد المقترح</label><input id="sp-supplier" class="input"></div>
      <div><label class="label">التكلفة التقديرية</label><input id="sp-cost" type="number" min="0" class="input" value="0"></div>
      <div class="full"><label class="label">سبب الطلب</label><textarea id="sp-reason" class="textarea"></textarea></div>
      <div class="full"><label class="label">ملاحظات</label><textarea id="sp-notes" class="textarea"></textarea></div>
    </div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="saveSpareRequest()">حفظ الطلب</button></div></div></div>`;
  }

  function saveSpareRequest(){
    const ticket=maintenanceTicketById(Number(document.getElementById('sp-ticket-id')?.value||0));
    if(!ticket) return alert('البلاغ غير موجود');
    const partName=maintenanceText(document.getElementById('sp-name')?.value);
    if(!partName) return alert('أدخل اسم القطعة');
    const req={
      id:nextId(db.sparePartRequests),
      requestNo:nextNo('SP',db.sparePartRequests),
      ticketId:ticket.id,
      ticketNumber:ticket.ticketNumber,
      assetId:ticket.assetId,
      assetNameAr:ticket.assetNameAr,
      college:ticket.college,
      mainDepartment:ticket.mainDepartment,
      partName,
      quantity:Number(document.getElementById('sp-qty')?.value||1),
      requestReason:maintenanceText(document.getElementById('sp-reason')?.value),
      suggestedSupplier:maintenanceText(document.getElementById('sp-supplier')?.value),
      estimatedCost:Number(document.getElementById('sp-cost')?.value||0),
      status:'جديد',
      requestedAt:nowLocalString(),
      notes:maintenanceText(document.getElementById('sp-notes')?.value),
      createdBy:state.currentUser?.id||null,
      createdAt:nowLocalString()
    };
    db.sparePartRequests.unshift(req);
    ticket.status='بانتظار قطع غيار';
    maintenanceAudit('طلب قطعة غيار','sparePartRequest',req.requestNo,partName,req.college,req.mainDepartment);
    saveDb();
    closeModal();
  }

  function advanceSpareRequest(id){
    const req=(db.sparePartRequests||[]).find(row=>Number(row.id)===Number(id));
    if(!req) return;
    const order=['جديد','قيد المراجعة','معتمد','تم التوريد','تم التركيب'];
    const idx=order.indexOf(req.status);
    req.status=order[Math.min(idx+1,order.length-1)]||'قيد المراجعة';
    if(req.status==='تم التوريد') req.suppliedAt=nowLocalString();
    if(req.status==='تم التركيب'){
      req.installedAt=nowLocalString();
      const ticket=maintenanceTicketById(req.ticketId);
      if(ticket) ticket.status='تحت المعالجة';
    }
    req.updatedAt=nowLocalString();
    req.approvedBy=state.currentUser?.id||null;
    maintenanceAudit('تحديث حالة قطعة غيار','sparePartRequest',req.requestNo,req.status,req.college,req.mainDepartment);
    saveDb();
    render();
  }
  window.advanceSpareRequest=advanceSpareRequest;

  function closeMaintenanceTicket(id){
    const ticket=maintenanceTicketById(id);
    if(!ticket) return;
    const visits=(db.fieldVisits||[]).filter(visit=>Number(visit.ticketId)===Number(ticket.id));
    const hasReport=visits.some(visit=>maintenanceText(visit.technicianReport));
    if(!hasReport) return alert('لا يمكن إغلاق البلاغ دون تقرير فني وزيارة ميدانية');
    if(!confirm('تأكيد إغلاق البلاغ بعد اعتماد الجهة وإدارة التجهيزات؟')) return;
    ticket.status='مغلق';
    ticket.closedAt=nowLocalString();
    ticket.closedBy=state.currentUser?.id||null;
    ticket.downtimeMinutes=maintenanceMinutesBetween(ticket.failureDate||ticket.reportedAt,ticket.closedAt);
    ticket.closeTimeMinutes=maintenanceMinutesBetween(ticket.reportedAt,ticket.closedAt);
    const asset=maintenanceAssetById(ticket.assetId);
    if(asset){
      asset.status='يعمل';
      const item=asset.itemId?getItemById(asset.itemId):null;
      if(item) item.deviceStatus='يعمل';
    }
    maintenanceAudit('إغلاق بلاغ صيانة','maintenanceTicket',ticket.ticketNumber,ticket.assetNameAr,ticket.college,ticket.mainDepartment);
    saveDb();
    render();
  }
  window.closeMaintenanceTicket=closeMaintenanceTicket;

  function maintenanceQrImg(asset){
    const data=encodeURIComponent(`${location.origin||''}${location.pathname||''}#maintenanceAsset=${asset.id}`);
    return `<img class="maintenance-qr-img" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${data}"><div class="small">${maintenanceEscape(asset.qrCodeUrl||asset.serialNumber)}</div>`;
  }

  function openMaintenanceHashTarget(){
    const match=String(location.hash||'').match(/maintenanceAsset=(\d+)/);
    if(!match || !state.currentUser) return false;
    const asset=(db.maintenanceAssets||[]).find(row=>Number(row.id)===Number(match[1]));
    if(!asset) return false;
    if(!isCentral() && !canAccessCollege(asset.college)) return false;
    state.currentPage='maintenance';
    state.maintenanceTab='assets';
    state.modal='maintenanceAssetProfile';
    state.editId=asset.id;
    render();
    return true;
  }
  window.openMaintenanceHashTarget=openMaintenanceHashTarget;

  function maintenanceAssetProfileHtml(){
    const asset=maintenanceAssetById(state.editId);
    if(!asset) return '';
    const plans=(db.preventiveMaintenancePlans||[]).filter(plan=>Number(plan.assetId)===Number(asset.id));
    const records=(db.preventiveMaintenanceRecords||[]).filter(record=>Number(record.assetId)===Number(asset.id));
    const tickets=(db.maintenanceTickets||[]).filter(ticket=>Number(ticket.assetId)===Number(asset.id));
    const visits=(db.fieldVisits||[]).filter(visit=>Number(visit.assetId)===Number(asset.id));
    const spares=(db.sparePartRequests||[]).filter(req=>Number(req.assetId)===Number(asset.id));
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-xl"><div class="modal-header"><div><div class="panel-title">ملف الجهاز</div><div class="panel-subtitle">${maintenanceEscape(asset.assetNameAr)} - ${maintenanceEscape(asset.serialNumber)}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body"><div class="asset-profile-head"><div>${table(['الحقل','البيان'],[
      ['الجهاز',asset.assetNameAr],
      ['English',asset.assetNameEn||'—'],
      ['الرقم التسلسلي',asset.serialNumber],
      ['رقم الأصل',asset.assetNumber],
      ['القطاع',asset.college],
      ['القسم',asset.mainDepartment],
      ['الموقع',asset.labRoom||asset.location||'—'],
      ['الخطورة',asset.riskLevel],
      ['الحالة',asset.status],
      ['آخر صيانة',asset.lastMaintenanceDate||'—'],
      ['الصيانة القادمة',asset.nextMaintenanceDate||'—']
    ])}</div><div class="maintenance-qr">${maintenanceQrImg(asset)}</div></div>
    <div class="section-split"><div class="table-panel"><div class="table-head"><div class="panel-title">الصيانة الوقائية</div></div>${table(['الخطة','الدورية','القادمة','الحالة'],plans.map(p=>[p.planNo,p.frequency,p.nextDueDate,maintenanceStatusBadge(maintenancePlanStatus(p))]))}</div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">بلاغات الأعطال</div></div>${table(['البلاغ','الأولوية','الحالة','التاريخ'],tickets.map(t=>[t.ticketNumber,maintenanceStatusBadge(t.priority),maintenanceStatusBadge(t.status),formatDateTime(t.reportedAt)]))}</div></div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">السجل الكامل</div></div>${table(['النوع','الرقم','التاريخ','الوصف'],[
      ...records.map(r=>['صيانة وقائية',r.recordNo,formatDateTime(r.createdAt),r.result]),
      ...visits.map(v=>['زيارة ميدانية',v.visitNo,formatDateTime(v.visitDateTime),v.recommendation]),
      ...spares.map(s=>['قطعة غيار',s.requestNo,formatDateTime(s.requestedAt),`${s.partName} - ${s.status}`])
    ])}</div></div></div></div>`;
  }

  function maintenanceTicketProfileHtml(){
    const ticket=maintenanceTicketById(state.editId);
    if(!ticket) return '';
    const visits=(db.fieldVisits||[]).filter(v=>Number(v.ticketId)===Number(ticket.id));
    const spares=(db.sparePartRequests||[]).filter(s=>Number(s.ticketId)===Number(ticket.id));
    return `<div class="modal-backdrop" onclick="closeIfBackdrop(event)"><div class="modal modal-lg"><div class="modal-header"><div><div class="panel-title">ملف البلاغ</div><div class="panel-subtitle">${maintenanceEscape(ticket.ticketNumber)} - ${maintenanceEscape(ticket.assetNameAr)}</div></div><button class="btn btn-secondary btn-sm" onclick="closeModal()">إغلاق</button></div>
    <div class="modal-body">${table(['الحقل','البيان'],[
      ['الحالة',maintenanceStatusBadge(ticket.status)],
      ['الأولوية',maintenanceStatusBadge(ticket.priority)],
      ['القطاع',ticket.college],
      ['الموقع',ticket.location],
      ['مقدم البلاغ',ticket.requesterName],
      ['وصف العطل',ticket.faultDescription],
      ['زمن الاستجابة',`${ticket.responseTimeMinutes||0} دقيقة`],
      ['زمن التوقف',`${ticket.downtimeMinutes||0} دقيقة`]
    ])}
    <div class="table-panel"><div class="table-head"><div class="panel-title">الزيارات</div></div>${table(['الزيارة','الفني','التوصية','التقرير'],visits.map(v=>[v.visitNo,v.technicianName,v.recommendation,v.technicianReport]))}</div>
    <div class="table-panel"><div class="table-head"><div class="panel-title">قطع الغيار</div></div>${table(['الطلب','القطعة','الكمية','الحالة'],spares.map(s=>[s.requestNo,s.partName,s.quantity,maintenanceStatusBadge(s.status)]))}</div></div></div></div>`;
  }

  function printMaintenanceReport(){ openPrint(maintenanceReportData()); }
  function exportMaintenanceReport(){ exportExcel(maintenanceReportData(),'maintenance-report.xlsx'); }
  Object.assign(window,{printMaintenanceReport,exportMaintenanceReport,saveMaintenanceAsset,savePreventivePlan,savePreventiveRecord,saveMaintenanceTicket,saveFieldVisit,saveSpareRequest});

  modalHtml=function(){
    if(!state.modal) return '';
    if(state.modal==='maintenanceAsset') return maintenanceAssetModalHtml();
    if(state.modal==='maintenancePlan') return maintenancePlanModalHtml(false);
    if(state.modal==='maintenancePlanEdit') return maintenancePlanModalHtml(true);
    if(state.modal==='maintenanceRecord') return maintenanceRecordModalHtml();
    if(state.modal==='maintenanceTicket') return maintenanceTicketModalHtml();
    if(state.modal==='fieldVisit') return fieldVisitModalHtml();
    if(state.modal==='spareRequest') return spareRequestModalHtml();
    if(state.modal==='maintenanceAssetProfile') return maintenanceAssetProfileHtml();
    if(state.modal==='maintenanceTicketProfile') return maintenanceTicketProfileHtml();
    return previousMaintenanceModalHtml?previousMaintenanceModalHtml():'';
  };

  openModal=function(type,id=null,txType='receive'){
    if(['maintenanceAsset','maintenancePlan','maintenancePlanEdit','maintenanceRecord','maintenanceTicket','fieldVisit','spareRequest','maintenanceAssetProfile','maintenanceTicketProfile'].includes(type)){
      state.modal=type;
      state.editId=id;
      render();
      return;
    }
    return previousMaintenanceOpenModal?previousMaintenanceOpenModal(type,id,txType):undefined;
  };

  if(previousMaintenanceDoLogin){
    doLogin=function(){
      const result=previousMaintenanceDoLogin();
      setTimeout(()=>openMaintenanceHashTarget(),0);
      return result;
    };
  }

  if(previousMaintenanceSaveItem){
    saveItem=function(){
      const editId=state.editId;
      const beforeIds=new Set((db.items||[]).map(item=>Number(item.id)));
      const result=previousMaintenanceSaveItem();
      const changedItems=editId
        ? (db.items||[]).filter(item=>Number(item.id)===Number(editId))
        : (db.items||[]).filter(item=>!beforeIds.has(Number(item.id)));
      let createdAsset=false;
      changedItems.forEach(item=>{
        if(!maintenanceIsDeviceItem(item)) return;
        if(!maintenanceText(item.serialNumber)) return;
        if((db.maintenanceAssets||[]).some(asset=>Number(asset.itemId)===Number(item.id))) return;
        if(!confirm('تم تسجيل جهاز برقم تسلسلي. هل تريد إنشاء ملف أصل صيانة له الآن؟')) return;
        const asset=maintenanceCreateAssetFromItem(item);
        if(!asset){
          alert('لم يتم إنشاء أصل الصيانة، تحقق من عدم تكرار الرقم التسلسلي.');
          return;
        }
        maintenanceAudit('إنشاء أصل صيانة من سجل صنف','maintenanceAsset',asset.serialNumber,asset.assetNameAr,asset.college,asset.mainDepartment);
        saveDb();
        createdAsset=true;
      });
      if(createdAsset) render();
      return result;
    };
  }

  itemActionButtons=function(item){
    const base=previousMaintenanceItemActionButtons?previousMaintenanceItemActionButtons(item):'—';
    if(!maintenanceIsDeviceItem(item)) return base;
    const asset=(db.maintenanceAssets||[]).find(row=>Number(row.itemId)===Number(item.id));
    const extra=asset
      ? `<button class="btn btn-secondary btn-sm" onclick="openModal('maintenanceAssetProfile',${asset.id})">ملف الجهاز</button>`
      : hasPermission('manage_maintenance_assets')?`<button class="btn btn-primary btn-sm" onclick="openModal('maintenanceAsset',${item.id})">إنشاء أصل صيانة</button>`:'';
    if(!extra) return base;
    if(base && base.includes('flex-actions')) return base.replace('</div>',`${extra}</div>`);
    return `<div class="flex-actions">${extra}</div>`;
  };

  navItems=function(){
    const items=previousMaintenanceNavItems?previousMaintenanceNavItems():[];
    if(!hasPermission('view_maintenance')) return items;
    if(items.some(item=>item.id==='maintenance')) return items;
    const entry={id:'maintenance',label:'الصيانة والتشغيل',icon:typeof uiIcon==='function'?uiIcon('equipment'):'🛠',permission:'view_maintenance'};
    const idx=items.findIndex(item=>item.id==='items');
    if(idx>=0) items.splice(idx+1,0,entry);
    else items.push(entry);
    return items;
  };

  getPageTitle=function(){
    if(state.currentPage==='maintenance') return 'الصيانة والتشغيل';
    return previousMaintenanceGetPageTitle?previousMaintenanceGetPageTitle():'';
  };

  renderPageContent=function(){
    if(state.currentPage==='maintenance') return renderMaintenance();
    return previousMaintenanceRenderPageContent?previousMaintenanceRenderPageContent():'';
  };

  renderDashboard=function(){
    const base=previousMaintenanceRenderDashboard?previousMaintenanceRenderDashboard():'';
    const stats=maintenanceDashboardStats();
    return `${base}<div class="table-panel"><div class="table-head"><div class="panel-title">ملخص الصيانة والتشغيل</div><div class="panel-subtitle">مؤشرات مختصرة من وحدة الصيانة ضمن نطاق القطاع.</div></div>${table(['المؤشر','القيمة'],[
      ['الأجهزة المتوقفة',stats.stopped],
      ['البلاغات المفتوحة',stats.openTickets],
      ['الصيانة الوقائية المتأخرة',stats.overdue],
      ['البلاغات الحرجة',stats.criticalTickets]
    ])}</div>`;
  };

  ensureMaintenanceData();
})();
/* ===== end Maintenance and Operations Module v7.1 ===== */
