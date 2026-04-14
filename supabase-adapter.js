// طبقة ربط تجريبية مع Supabase.
// تستخدم جدولًا واحدًا app_state لتخزين بيانات النظام كاملة بصيغة JSONB.
// هذا مناسب للتجربة أمام الإدارة، وليس بديلًا عن تصميم قاعدة إنتاجية لاحقًا.

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

function isSupabaseConfigured(){
  return Boolean(
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_URL).includes('PUT_YOUR') &&
    !String(window.SUPABASE_ANON_KEY).includes('PUT_YOUR') &&
    window.supabase
  );
}

function syncStatusText(){
  if(!isSupabaseConfigured()) return 'وضع محلي: البيانات محفوظة على هذا المتصفح فقط. ضع مفاتيح Supabase لتفعيل المشاركة بين الأجهزة.';
  if(remoteSync.connected) return 'متصل بقاعدة Supabase التجريبية: البيانات مشتركة بين الأجهزة حسب الصلاحيات.';
  if(remoteSync.loading) return 'جاري الاتصال بقاعدة Supabase التجريبية...';
  return 'تم إعداد Supabase، لكن الاتصال لم يكتمل بعد. راجع المفاتيح أو إعدادات الجدول.';
}

function saveRemoteDb(){
  if(!remoteSync.connected || remoteSync.suppressNextSave) return;
  clearTimeout(remoteSync.saveTimer);
  remoteSync.saveTimer = setTimeout(async()=>{
    try{
      const payload = {
        id: window.SUPABASE_APP_STATE_ID || 'taibah-university-demo',
        data: db,
        updated_at: new Date().toISOString(),
        updated_by: remoteSync.clientId
      };
      const { error } = await remoteSync.client
        .from('app_state')
        .upsert(payload, { onConflict: 'id' });
      if(error) throw error;
      remoteSync.lastSavedAt = payload.updated_at;
    }catch(e){
      console.error('Supabase save error:', e);
      remoteSync.lastError = e.message || String(e);
    }
  }, 250);
}

async function initRemoteSync(){
  if(!isSupabaseConfigured()) return false;
  remoteSync.loading = true;
  try{
    remoteSync.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const stateId = window.SUPABASE_APP_STATE_ID || 'taibah-university-demo';
    const { data, error } = await remoteSync.client
      .from('app_state')
      .select('data,updated_at,updated_by')
      .eq('id', stateId)
      .maybeSingle();
    if(error) throw error;

    if(data && data.data){
      remoteSync.suppressNextSave = true;
      db = data.data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      remoteSync.lastLoadedAt = data.updated_at || new Date().toISOString();
      remoteSync.suppressNextSave = false;
    }else{
      const seed = {
        id: stateId,
        data: db,
        updated_at: new Date().toISOString(),
        updated_by: remoteSync.clientId
      };
      const { error: insertError } = await remoteSync.client
        .from('app_state')
        .insert(seed);
      if(insertError) throw insertError;
      remoteSync.lastSavedAt = seed.updated_at;
    }

    remoteSync.channel = remoteSync.client
      .channel('app_state_changes_' + stateId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.' + stateId }, payload => {
        const row = payload.new;
        if(!row || row.updated_by === remoteSync.clientId || !row.data) return;
        remoteSync.suppressNextSave = true;
        db = row.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        remoteSync.lastLoadedAt = row.updated_at || new Date().toISOString();
        remoteSync.suppressNextSave = false;
        if(typeof render === 'function') render();
      })
      .subscribe(status => {
        remoteSync.connected = status === 'SUBSCRIBED' || remoteSync.connected;
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
