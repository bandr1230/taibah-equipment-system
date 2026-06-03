/*
 * Source ownership signature.
 * Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
 * Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
 * This marker is source-level only and is not rendered in UI or reports.
 */
;(()=>{const __bjAljabriSourceSignature='BJ-TEIP-2026-SOURCE-SIGNATURE|Bandar bin Khalaf Aljabri|بندر بن خلف الجابري';void __bjAljabriSourceSignature;})();
(function(){
  const root=document.getElementById('public-root');
  const logo='taibah-logo.png';

  function text(value){
    const raw=String(value??'').trim();
    return raw || 'غير متوفر';
  }

  function escapeHtml(value){
    return text(value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function getParam(name){
    return new URLSearchParams(window.location.search).get(name);
  }

  function validDb(value){
    return Boolean(value && typeof value==='object' && Array.isArray(value.items));
  }

  function normalized(value){
    return String(value??'').trim().toLowerCase()
      .replace(/[إأآا]/g,'ا')
      .replace(/[ة]/g,'ه')
      .replace(/[ى]/g,'ي');
  }

  function looksLikeDevice(...values){
    const raw=values.map(value=>String(value??'').trim()).join(' ');
    const text=normalized(raw);
    return text.includes('اجهزه')
      || text.includes('جهاز')
      || /device|equipment|microscope|centrifuge|analy[sz]er|spectrophotometer|autoclave|incubator|freez|frzer|refrigerator|fridge/i.test(raw);
  }

  function isDeviceAsset(source,asset){
    if(!asset) return false;
    const item=(source.items||[]).find(row=>sameId(row.id,asset.itemId));
    if(item) return looksLikeDevice(item.section,item.unit,item.nameAr,item.name,item.nameEn,item.code);
    return looksLikeDevice(asset.section,asset.unit,asset.assetNameAr,asset.assetNameEn);
  }

  function localDb(){
    try{
      if(typeof db!=='undefined' && validDb(db)) return db;
    }catch(e){}
    try{
      const raw=localStorage.getItem(typeof STORAGE_KEY!=='undefined'?STORAGE_KEY:'taibah_university_supply_system_v5_8');
      const parsed=raw?JSON.parse(raw):null;
      return validDb(parsed)?parsed:null;
    }catch(e){
      return null;
    }
  }

  async function remoteDb(){
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.fetch) return null;
    if(String(window.SUPABASE_URL).includes('PUT_YOUR') || String(window.SUPABASE_ANON_KEY).includes('PUT_YOUR')) return null;
    const base=String(window.SUPABASE_URL).replace(/\/$/,'');
    const stateId=encodeURIComponent(window.SUPABASE_APP_STATE_ID || 'taibah-university-demo');
    const url=`${base}/rest/v1/app_state?id=eq.${stateId}&select=data,updated_at&limit=1`;
    const res=await fetch(url,{
      method:'GET',
      cache:'no-store',
      headers:{
        apikey:window.SUPABASE_ANON_KEY,
        Authorization:`Bearer ${window.SUPABASE_ANON_KEY}`
      }
    });
    if(!res.ok) return null;
    const rows=await res.json();
    const data=Array.isArray(rows) && rows[0] ? rows[0].data : null;
    return validDb(data)?data:null;
  }

  function sameId(a,b){
    const left=String(a??'').trim();
    const right=String(b??'').trim();
    if(!left || !right) return false;
    return left===right || Number(left)===Number(right);
  }

  function findAsset(source,id){
    if(!source || !id) return null;
    return (source.maintenanceAssets||[]).find(asset=>sameId(asset.id,id) && isDeviceAsset(source,asset)) || null;
  }

  function latestRecord(source,assetId){
    return (source.preventiveMaintenanceRecords||[])
      .filter(record=>sameId(record.assetId,assetId))
      .sort((a,b)=>String(b.maintenanceDate||b.approvedAt||b.createdAt||'').localeCompare(String(a.maintenanceDate||a.approvedAt||a.createdAt||'')))[0] || null;
  }

  function latestPlan(source,assetId){
    return (source.preventiveMaintenancePlans||[])
      .filter(plan=>sameId(plan.assetId,assetId))
      .sort((a,b)=>String(b.nextDueDate||b.updatedAt||b.createdAt||'').localeCompare(String(a.nextDueDate||a.updatedAt||a.createdAt||'')))[0] || null;
  }

  function statusClass(value){
    const s=String(value||'');
    if(s.includes('متوقف') || s.includes('غير مطابق') || s.includes('حرج') || s.includes('متأخر')) return 'bad';
    if(s.includes('متابعة') || s.includes('مستحق') || s.includes('جزئي')) return 'warn';
    return '';
  }

  function field(label,value){
    return `<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
  }

  function renderNotFound(){
    root.className='page';
    root.innerHTML=`<section class="card empty">لم يتم العثور على الأصل أو أن الرابط غير صحيح.</section>`;
  }

  function renderAsset(asset,source){
    const record=latestRecord(source,asset.id);
    const plan=latestPlan(source,asset.id);
    const inspectionStatus=record ? 'فحص دوري مكتمل' : (plan ? text(plan.status) : 'لا يوجد فحص دوري مسجل');
    const result=record ? text(record.result) : 'غير متوفر';
    const lastDate=record ? text(record.maintenanceDate || record.approvedAt || record.createdAt) : text(asset.lastMaintenanceDate);
    const performer=record ? text(record.performedByName || record.approvedByName) : 'غير متوفر';
    const approvedNotes=record && (record.approvedAt || record.approvedBy) ? text(record.notes || record.description) : 'لا توجد ملاحظات معتمدة';
    const currentStatus=text(asset.status || result);
    root.className='page';
    root.innerHTML=`
      <header class="header">
        <div class="brand">
          <img class="logo" src="${logo}" alt="جامعة طيبة">
          <div>
            <h1>بطاقة أصل عامة</h1>
            <div class="sub">منصة التجهيزات التعليمية</div>
          </div>
        </div>
        <span class="badge ${statusClass(currentStatus)}">${escapeHtml(currentStatus)}</span>
      </header>
      <section class="card">
        <div class="title">${escapeHtml(asset.assetNameAr || asset.nameAr || asset.name || 'أصل تعليمي')}</div>
        <div class="grid">
          ${field('اسم الأصل / الجهاز',asset.assetNameAr || asset.nameAr || asset.name)}
          ${field('الرقم التسلسلي',asset.serialNumber)}
          ${field('القطاع',asset.college)}
          ${field('القسم',asset.mainDepartment || asset.section)}
          ${field('الموقع',asset.labRoom || asset.location)}
          ${field('نوع الأصل',asset.assetType)}
        </div>
      </section>
      <section class="card">
        <div class="title">آخر فحص دوري</div>
        <div class="grid">
          ${field('حالة آخر فحص دوري',inspectionStatus)}
          ${field('نتيجة المطابقة',result)}
          ${field('تاريخ آخر فحص',lastDate)}
          ${field('الجهة المنفذة',performer)}
          ${field('الملاحظات المعتمدة',approvedNotes)}
        </div>
      </section>
      <div class="footer">هذه الصفحة عامة ومخصصة للقراءة فقط. لا تعرض أي صلاحيات أو إجراءات داخلية.</div>
    `;
  }

  async function init(){
    const id=String(getParam('id') || getParam('assetId') || '').trim();
    if(!id) return renderNotFound();
    const local=localDb();
    let remote=null;
    try{ remote=await remoteDb(); }catch(e){ remote=null; }
    const remoteAsset=findAsset(remote,id);
    const localAsset=findAsset(local,id);
    if(remoteAsset) return renderAsset(remoteAsset,remote);
    if(localAsset) return renderAsset(localAsset,local);
    renderNotFound();
  }

  init();
})();
