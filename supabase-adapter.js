// طبقة ربط تجريبية محسّنة مع Supabase.
// تحفظ بيانات النظام كاملة داخل جدول app_state بصيغة JSONB.
// هذه نسخة اختبار مشتركة بين الأجهزة، وليست تصميم قاعدة إنتاجية نهائيًا.

window.remoteSync = {
  enabled: false,
  connected: false,
  loading: false,
  lastError: '',
  lastSavedAt: '',
  lastLoadedAt: '',
  clientId: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(),
  suppressNextSave: false,
  saveTimer: null,
  channel: null,
  client: null
};

function remoteStateId(){
  return window.SUPABASE_APP_STATE_ID || 'taibah-university-demo';
}

function isSupabaseConfigured(){
  return Boolean(
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_URL).includes('PUT_YOUR') &&
    !String(window.SUPABASE_ANON_KEY).includes('PUT_YOUR') &&
    window.supabase
  );
}

function isValidSystemDb(value){
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.users) &&
    value.users.length > 0 &&
    Array.isArray(value.items) &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.needsRequests) &&
    Array.isArray(value.supportRequests)
  );
}

function syncStatusText(){
  if(!isSupabaseConfigured()) {
    return 'وضع محلي: البيانات محفوظة على هذا المتصفح فقط. ضع مفاتيح Supabase لتفعيل المشاركة بين الأجهزة.';
  }
  const err = remoteSync.lastError ? ` | آخر خطأ: ${remoteSync.lastError}` : '';
  const controls = remoteSync.connected
    ? ` <button class="btn btn-sm btn-secondary" onclick="manualDownloadRemote()">سحب من Supabase</button> <button class="btn btn-sm btn-success" onclick="manualUploadRemote()">رفع بيانات هذا الجهاز</button>`
    : '';
  if(remoteSync.connected) {
    return `متصل بقاعدة Supabase التجريبية: البيانات مشتركة بين الأجهزة.${controls}`;
  }
  if(remoteSync.loading) return 'جاري الاتصال بقاعدة Supabase التجريبية...';
  return `تم إعداد Supabase، لكن الاتصال لم يكتمل بعد.${err}`;
}

async function upsertRemoteDb(reason='auto'){
  if(!remoteSync.client) return false;
  const payload = {
    id: remoteStateId(),
    data: db,
    updated_at: new Date().toISOString(),
    updated_by: remoteSync.clientId
  };
  const { error } = await remoteSync.client
    .from('app_state')
    .upsert(payload, { onConflict: 'id' });
  if(error) throw error;
  remoteSync.lastSavedAt = payload.updated_at;
  return true;
}

function saveRemoteDb(){
  if(!remoteSync.connected || remoteSync.suppressNextSave) return;
  if(!isValidSystemDb(db)) return;
  clearTimeout(remoteSync.saveTimer);
  remoteSync.saveTimer = setTimeout(async()=>{
    try{
      await upsertRemoteDb('auto-save');
    }catch(e){
      console.error('Supabase save error:', e);
      remoteSync.lastError = e.message || String(e);
      if(typeof render === 'function') render();
    }
  }, 350);
}

async function loadRemoteRow(){
  const { data, error } = await remoteSync.client
    .from('app_state')
    .select('data,updated_at,updated_by')
    .eq('id', remoteStateId())
    .maybeSingle();
  if(error) throw error;
  return data;
}

async function applyRemoteDb(remoteData, updatedAt){
  if(!isValidSystemDb(remoteData)) {
    throw new Error('بيانات Supabase غير مكتملة وليست قاعدة نظام صالحة');
  }
  remoteSync.suppressNextSave = true;
  db = remoteData;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  remoteSync.lastLoadedAt = updatedAt || new Date().toISOString();
  remoteSync.suppressNextSave = false;
  if(typeof normalizeItemCodes === 'function') normalizeItemCodes();
  if(typeof cleanupDuplicateNonDevices === 'function') cleanupDuplicateNonDevices();
  if(typeof saveDb === 'function') {
    remoteSync.suppressNextSave = true;
    saveDb();
    remoteSync.suppressNextSave = false;
  }
}

async function manualUploadRemote(){
  if(!remoteSync.client) return alert('Supabase غير متصل.');
  if(!isValidSystemDb(db)) return alert('بيانات هذا الجهاز غير مكتملة ولا يمكن رفعها.');
  try{
    await upsertRemoteDb('manual-upload');
    alert('تم رفع بيانات هذا الجهاز إلى Supabase.');
    if(typeof render === 'function') render();
  }catch(e){
    remoteSync.lastError = e.message || String(e);
    alert('تعذر الرفع: ' + remoteSync.lastError);
    if(typeof render === 'function') render();
  }
}

async function manualDownloadRemote(){
  if(!remoteSync.client) return alert('Supabase غير متصل.');
  try{
    const row = await loadRemoteRow();
    if(!row || !row.data) return alert('لا توجد بيانات في Supabase.');
    await applyRemoteDb(row.data, row.updated_at);
    alert('تم سحب البيانات من Supabase.');
    if(typeof render === 'function') render();
  }catch(e){
    remoteSync.lastError = e.message || String(e);
    alert('تعذر السحب: ' + remoteSync.lastError);
    if(typeof render === 'function') render();
  }
}

async function initRemoteSync(){
  if(!isSupabaseConfigured()) return false;
  remoteSync.loading = true;
  try{
    remoteSync.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const row = await loadRemoteRow();

    if(row && row.data && isValidSystemDb(row.data)){
      await applyRemoteDb(row.data, row.updated_at);
    }else{
      // إذا كانت بيانات Supabase ناقصة مثل {"ready": true}، لا نستبدل بيانات الجهاز بها.
      // نرفع بيانات الجهاز الحالية/الافتراضية كبيانات نظام صالحة حتى تعمل كل الأجهزة.
      if(!isValidSystemDb(db)){
        throw new Error('بيانات الجهاز غير مكتملة، ولا توجد بيانات صالحة في Supabase');
      }
      await upsertRemoteDb('bootstrap-valid-local-db');
    }

    remoteSync.channel = remoteSync.client
      .channel('app_state_changes_' + remoteStateId())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.' + remoteStateId() }, async payload => {
        try{
          const row = payload.new;
          if(!row || row.updated_by === remoteSync.clientId || !row.data) return;
          if(!isValidSystemDb(row.data)) return;
          await applyRemoteDb(row.data, row.updated_at);
          if(typeof render === 'function') render();
        }catch(e){
          console.error('Supabase realtime apply error:', e);
          remoteSync.lastError = e.message || String(e);
        }
      })
      .subscribe(status => {
        if(status === 'SUBSCRIBED') remoteSync.connected = true;
        if(typeof render === 'function') render();
      });

    remoteSync.enabled = true;
    remoteSync.connected = true;
    return true;
  }catch(e){
    console.error('Supabase init error:', e);
    remoteSync.lastError = e.message || String(e);
    remoteSync.connected = false;
    return false;
  }finally{
    remoteSync.loading = false;
  }
}
