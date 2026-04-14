// v5.6.6 - مزامنة Supabase عبر REST مباشر.
// تحفظ بيانات النظام كاملة في public.app_state.data.
// للاختبار المشترك فقط، وليس تصميم قاعدة إنتاجية نهائيًا.

window.remoteSync = {
  enabled:false, connected:false, loading:false, lastError:'',
  lastSavedAt:'', lastLoadedAt:'',
  clientId:(crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(),
  suppressNextSave:false, saveTimer:null
};

function remoteStateId(){ return window.SUPABASE_APP_STATE_ID || 'taibah-university-demo'; }
function isSupabaseConfigured(){
  return Boolean(window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_URL).includes('PUT_YOUR') &&
    !String(window.SUPABASE_ANON_KEY).includes('PUT_YOUR'));
}
function apiUrl(){
  return `${String(window.SUPABASE_URL).replace(/\/$/,'')}/rest/v1/app_state`;
}
function apiHeaders(extra={}){
  return {
    apikey: window.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
    'Content-Type':'application/json',
    ...extra
  };
}
function isValidSystemDb(value){
  return Boolean(value && typeof value==='object' &&
    Array.isArray(value.users) && value.users.length>0 &&
    value.users.some(u=>u.username==='admin') &&
    Array.isArray(value.items) &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.needsRequests) &&
    Array.isArray(value.supportRequests));
}
function ensureLocalDbValid(label='check'){
  if(typeof repairDbIfNeeded === 'function') repairDbIfNeeded(label);
  return isValidSystemDb(db);
}
function syncStatusText(){
  if(!isSupabaseConfigured()) return 'وضع محلي: البيانات محفوظة على هذا المتصفح فقط.';
  const err = remoteSync.lastError ? ` | آخر خطأ: ${remoteSync.lastError}` : '';
  const controls = remoteSync.connected
    ? ` <button class="btn btn-sm btn-secondary" onclick="manualDownloadRemote()">سحب من Supabase</button> <button class="btn btn-sm btn-success" onclick="manualUploadRemote()">رفع بيانات هذا الجهاز</button>`
    : '';
  if(remoteSync.connected) return `متصل بقاعدة Supabase التجريبية v5.6.6: البيانات مشتركة بين الأجهزة.${controls}`;
  if(remoteSync.loading) return 'جاري الاتصال بقاعدة Supabase التجريبية...';
  return `تم إعداد Supabase، لكن الاتصال لم يكتمل بعد.${err}`;
}
async function restFetch(path='', options={}){
  const res = await fetch(apiUrl()+path, {
    mode:'cors',
    cache:'no-store',
    ...options,
    headers: apiHeaders(options.headers || {})
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch(e){ body = text; }
  if(!res.ok){
    const msg = typeof body === 'string' ? body : (body && (body.message || body.error || JSON.stringify(body)));
    throw new Error(`HTTP ${res.status}: ${msg || res.statusText}`);
  }
  return body;
}
async function fetchRemoteRow(){
  const id = encodeURIComponent(remoteStateId());
  const rows = await restFetch(`?id=eq.${id}&select=id,data,updated_at,updated_by&limit=1`, {method:'GET'});
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
async function upsertRemoteDb(reason='auto'){
  if(!ensureLocalDbValid('before-upload')) throw new Error('بيانات الجهاز غير مكتملة');
  const payload = {
    id: remoteStateId(),
    data: db,
    updated_at: new Date().toISOString(),
    updated_by: remoteSync.clientId
  };
  await restFetch('', {
    method:'POST',
    headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });
  remoteSync.lastSavedAt = payload.updated_at;
  return true;
}
async function applyRemoteDb(remoteData, updatedAt){
  if(!isValidSystemDb(remoteData)) throw new Error('بيانات Supabase غير مكتملة وليست قاعدة نظام صالحة');
  remoteSync.suppressNextSave = true;
  db = remoteData;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  remoteSync.lastLoadedAt = updatedAt || new Date().toISOString();
  if(typeof normalizeItemCodes === 'function') normalizeItemCodes();
  if(typeof cleanupDuplicateNonDevices === 'function') cleanupDuplicateNonDevices();
  if(typeof repairDbIfNeeded === 'function') repairDbIfNeeded('after-download');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  remoteSync.suppressNextSave = false;
}
function saveRemoteDb(){
  if(!remoteSync.connected || remoteSync.suppressNextSave) return;
  clearTimeout(remoteSync.saveTimer);
  remoteSync.saveTimer = setTimeout(async()=>{
    try { await upsertRemoteDb('auto'); }
    catch(e){ console.error('Supabase save error', e); remoteSync.lastError=e.message||String(e); if(typeof render==='function') render(); }
  }, 500);
}
async function manualUploadRemote(){
  try{
    await upsertRemoteDb('manual');
    alert('تم رفع بيانات هذا الجهاز إلى Supabase.');
    if(typeof render==='function') render();
  }catch(e){
    remoteSync.lastError=e.message||String(e);
    alert('تعذر الرفع: '+remoteSync.lastError);
    if(typeof render==='function') render();
  }
}
async function manualDownloadRemote(){
  try{
    const row = await fetchRemoteRow();
    if(!row || !row.data) return alert('لا توجد بيانات في Supabase.');
    await applyRemoteDb(row.data, row.updated_at);
    alert('تم سحب البيانات من Supabase.');
    if(typeof render==='function') render();
  }catch(e){
    remoteSync.lastError=e.message||String(e);
    alert('تعذر السحب: '+remoteSync.lastError);
    if(typeof render==='function') render();
  }
}
async function initRemoteSync(){
  if(!isSupabaseConfigured()) return false;
  remoteSync.loading = true;
  try{
    ensureLocalDbValid('init');
    const row = await fetchRemoteRow();
    if(row && row.data && isValidSystemDb(row.data)){
      await applyRemoteDb(row.data, row.updated_at);
    }else{
      await upsertRemoteDb('bootstrap');
    }
    remoteSync.enabled = true;
    remoteSync.connected = true;
    remoteSync.lastError = '';
    return true;
  }catch(e){
    console.error('Supabase REST init error:', e);
    remoteSync.lastError = e.message || String(e);
    remoteSync.connected = false;
    return false;
  }finally{
    remoteSync.loading = false;
  }
}
