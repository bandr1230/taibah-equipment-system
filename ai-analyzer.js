/*
 * Source ownership signature.
 * Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
 * Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
 * This marker is source-level only and is not rendered in UI or reports.
 */
;(()=>{const __bjAljabriSourceSignature='BJ-TEIP-2026-SOURCE-SIGNATURE|Bandar bin Khalaf Aljabri|بندر بن خلف الجابري';void __bjAljabriSourceSignature;})();
(function(){
  const AI_ANALYSIS_TYPES=[
    {id:'needs',label:'تحليل الاحتياج'},
    {id:'inventory',label:'تحليل المخزون'},
    {id:'maintenance',label:'تحليل الصيانة'},
    {id:'spending_efficiency',label:'تحليل كفاءة الإنفاق'},
    {id:'risk',label:'تحليل المخاطر'},
    {id:'executive',label:'تقرير تنفيذي'}
  ];
  const AI_STATUS_LABELS={excellent:'ممتاز',good:'جيد',warning:'تنبيه',critical:'حرج'};
  const AI_PRIORITY_LABELS={low:'منخفضة',medium:'متوسطة',high:'عالية',critical:'حرجة'};

  function aiText(value){return String(value??'').trim();}
  function aiEscape(value){return aiText(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function aiDateOnly(value){const raw=aiText(value); const match=raw.match(/\d{4}-\d{2}-\d{2}/); return match?match[0]:raw.slice(0,10);}
  function aiNow(){return typeof nowLocalString==='function'?nowLocalString():new Date().toISOString().slice(0,16);}
  function aiCurrentUserId(){return state.currentUser?.id||null;}
  function aiIsCentral(){return typeof isCentral==='function' ? isCentral() : state.currentUser?.role==='admin';}
  function aiCanApprove(){return hasPermission('approve_ai_recommendation') || hasPermission('manage_users') || state.currentUser?.role==='admin';}
  function aiCanRun(){return hasPermission('run_ai_analysis') || state.currentUser?.role==='admin';}
  function aiTypeLabel(type){return AI_ANALYSIS_TYPES.find(item=>item.id===type)?.label||type;}
  function aiEntityName(type,id){
    if(!id) return '—';
    if(type==='item'){
      const item=(db.items||[]).find(row=>String(row.id)===String(id));
      return item?(typeof itemName==='function'?itemName(item):item.nameAr||item.name||id):id;
    }
    if(type==='asset'){
      const asset=(db.maintenanceAssets||[]).find(row=>String(row.id)===String(id));
      return asset?.assetNameAr||asset?.assetNameEn||id;
    }
    if(type==='ticket'){
      const ticket=(db.maintenanceTickets||[]).find(row=>String(row.id)===String(id)||String(row.ticketNumber)===String(id));
      return ticket?.ticketNumber||id;
    }
    if(type==='request'){
      const need=(db.needsRequests||[]).find(row=>String(row.id)===String(id)||String(row.requestNo)===String(id));
      return need?.requestNo||id;
    }
    return id;
  }

  function aiPushPermission(key,label){
    if(typeof PERMISSIONS==='undefined') return;
    if(!PERMISSIONS.some(permission=>permission.key===key)) PERMISSIONS.push({key,label});
  }

  function ensureAiAnalyzerData(){
    db.aiAnalysisRuns=Array.isArray(db.aiAnalysisRuns)?db.aiAnalysisRuns:[];
    db.aiRecommendations=Array.isArray(db.aiRecommendations)?db.aiRecommendations:[];
    aiPushPermission('view_ai_analyzer','عرض المحلل الذكي');
    aiPushPermission('run_ai_analysis','تشغيل تحليلات المحلل الذكي');
    aiPushPermission('approve_ai_recommendation','اعتماد أو رفض توصيات المحلل الذكي');
    aiPushPermission('report_ai_analysis','تقارير المحلل الذكي');
    (db.users||[]).forEach(user=>{
      if(user.role==='admin'){
        user.permissions=['all'];
        return;
      }
      const perms=new Set(user.permissions||[]);
      if(perms.has('view_reports') || perms.has('view_equipment') || perms.has('report_senior')){
        perms.add('view_ai_analyzer');
        perms.add('run_ai_analysis');
        perms.add('report_ai_analysis');
      }
      if(perms.has('approve_need') || perms.has('approve_maintenance') || user.college==='إدارة التجهيزات'){
        perms.add('approve_ai_recommendation');
      }
      user.permissions=[...perms];
    });
  }

  function ensureAiAnalyzerState(){
    ensureAiAnalyzerData();
    if(!state.aiAnalysisType) state.aiAnalysisType='needs';
    if(typeof state.aiAnalysisSector==='undefined') state.aiAnalysisSector=aiIsCentral()?'all':state.currentUser?.college||'all';
    if(typeof state.aiAnalysisDateFrom==='undefined') state.aiAnalysisDateFrom='';
    if(typeof state.aiAnalysisDateTo==='undefined') state.aiAnalysisDateTo='';
    if(typeof state.aiAnalysisEntityQuery==='undefined') state.aiAnalysisEntityQuery='';
    if(typeof state.aiAnalysisStatus==='undefined') state.aiAnalysisStatus='idle';
    if(typeof state.aiAnalysisMessage==='undefined') state.aiAnalysisMessage='';
    if(typeof state.aiSelectedRunId==='undefined') state.aiSelectedRunId=null;
  }

  function aiSectorOptions(){
    const current=state.aiAnalysisSector||'all';
    if(!aiIsCentral()) return `<option value="${aiEscape(state.currentUser?.college||'')}">${aiEscape(state.currentUser?.college||'قطاعي')}</option>`;
    const colleges=['all',...(typeof COLLEGE_OPTIONS!=='undefined'?COLLEGE_OPTIONS:[])];
    return colleges.map(value=>`<option value="${aiEscape(value)}" ${current===value?'selected':''}>${value==='all'?'كل القطاعات':aiEscape(value)}</option>`).join('');
  }

  function aiSetType(type){ensureAiAnalyzerState(); state.aiAnalysisType=type||'needs'; state.aiSelectedRunId=null; render();}
  function aiSetSector(value){ensureAiAnalyzerState(); state.aiAnalysisSector=aiIsCentral()?value:(state.currentUser?.college||value); render();}
  function aiSetDateFrom(value){ensureAiAnalyzerState(); state.aiAnalysisDateFrom=value||''; render();}
  function aiSetDateTo(value){ensureAiAnalyzerState(); state.aiAnalysisDateTo=value||''; render();}
  function aiSetEntityQuery(value){ensureAiAnalyzerState(); state.aiAnalysisEntityQuery=value||'';}
  Object.assign(window,{aiSetType,aiSetSector,aiSetDateFrom,aiSetDateTo,aiSetEntityQuery});

  function aiCaptureScope(type=state.aiAnalysisType||'needs'){
    const sector=aiIsCentral()?(state.aiAnalysisSector||'all'):(state.currentUser?.college||'');
    return {
      type,
      sector_id:sector||'all',
      date_from:state.aiAnalysisDateFrom||'',
      date_to:state.aiAnalysisDateTo||'',
      entity_query:state.aiAnalysisEntityQuery||'',
      requested_by:aiCurrentUserId()
    };
  }

  function aiWithScope(scope,callback){
    const previous={
      type:state.aiAnalysisType,
      sector:state.aiAnalysisSector,
      from:state.aiAnalysisDateFrom,
      to:state.aiAnalysisDateTo,
      query:state.aiAnalysisEntityQuery
    };
    state.aiAnalysisType=scope.type;
    state.aiAnalysisSector=scope.sector_id;
    state.aiAnalysisDateFrom=scope.date_from||'';
    state.aiAnalysisDateTo=scope.date_to||'';
    state.aiAnalysisEntityQuery=scope.entity_query||'';
    try{return callback();}
    finally{
      state.aiAnalysisType=previous.type;
      state.aiAnalysisSector=previous.sector;
      state.aiAnalysisDateFrom=previous.from;
      state.aiAnalysisDateTo=previous.to;
      state.aiAnalysisEntityQuery=previous.query;
    }
  }

  function aiWithinDate(row,fields){
    const from=aiDateOnly(state.aiAnalysisDateFrom||'');
    const to=aiDateOnly(state.aiAnalysisDateTo||'');
    if(!from && !to) return true;
    const dates=fields.map(field=>aiDateOnly(row[field])).filter(Boolean);
    if(!dates.length) return false;
    return dates.some(date=>(!from||date>=from)&&(!to||date<=to));
  }

  function aiSectorMatch(college){
    const sector=aiIsCentral()?(state.aiAnalysisSector||'all'):(state.currentUser?.college||'');
    return sector==='all' || aiText(college)===aiText(sector);
  }

  function aiScopedRows(rows,collegeGetter,dateFields){
    const query=aiText(state.aiAnalysisEntityQuery).toLowerCase();
    return (rows||[])
      .filter(row=>aiSectorMatch(collegeGetter(row)))
      .filter(row=>aiWithinDate(row,dateFields))
      .filter(row=>!query || JSON.stringify(row).toLowerCase().includes(query));
  }

  function aiNorm(value){
    return aiText(value).toLowerCase().replace(/[إأآا]/g,'ا').replace(/[ة]/g,'ه').replace(/[ى]/g,'ي').replace(/[^\u0600-\u06FFa-z0-9%]+/g,'');
  }

  function aiGroup(rows,keyFn){
    const map=new Map();
    rows.forEach(row=>{
      const key=keyFn(row)||'غير محدد';
      if(!map.has(key)) map.set(key,{key,rows:[],qty:0,count:0});
      const bucket=map.get(key);
      bucket.rows.push(row);
      bucket.qty+=Number(row.qty||row.estimatedNeed||row.deficit||0);
      bucket.count+=1;
    });
    return [...map.values()].sort((a,b)=>b.qty-a.qty || b.count-a.count);
  }

  function aiFinding(title,description,evidence,priority='medium',type='sector',id=''){
    return {title,description,evidence,priority,related_entity_type:type,related_entity_id:String(id||'')};
  }
  function aiRecommendation(title,description,recommendation_type='review',priority='medium',expected_impact='تحسين القرار وتقليل الهدر.',type='sector',id=''){
    return {title,description,recommendation_type,priority,expected_impact,requires_approval:true,related_entity_type:type,related_entity_id:String(id||'')};
  }
  function aiBase(type,summary,status='good',risk='medium',confidence=.72){
    return {analysis_type:type,executive_summary:summary,overall_status:status,risk_level:risk,confidence_score:confidence,data_quality_notes:[],key_findings:[],recommendations:[],suggested_actions:[],charts:[]};
  }

  function aiNeedsAnalysis(){
    const needs=aiScopedRows(db.needsRequests||[],row=>row.college,['createdAt','reviewedAt','updatedAt','sectorApprovedAt']);
    const evidence=aiScopedRows(db.needEvidence||[],row=>row.college,['createdAt','updatedAt']);
    const byItem=aiGroup(needs,row=>row.itemNameAr||row.itemNameEn||row.itemName);
    const result=aiBase('needs',`تم تحليل ${needs.length} طلب احتياج و${evidence.length} شاهد ضمن النطاق المحدد.`,needs.length?'warning':'good',needs.length>8?'high':'medium',(needs.length||evidence.length)?0.78:0.45);
    if(!needs.length && !evidence.length) result.data_quality_notes.push('لا توجد طلبات أو شواهد كافية في النطاق المحدد.');
    byItem.slice(0,5).forEach(group=>{
      result.key_findings.push(aiFinding(`احتياج مرتفع: ${group.key}`,`إجمالي الكميات المطلوبة ${group.qty} عبر ${group.count} طلبات.`,`طلبات مرتبطة: ${group.rows.map(r=>r.requestNo).filter(Boolean).join('، ')||'غير متوفر'}`,'high','request',group.rows[0]?.id));
    });
    const weak=needs.filter(need=>!(need.justification||need.notes||'').trim() && !evidence.some(ev=>String(ev.needId)===String(need.id)));
    if(weak.length){
      result.key_findings.push(aiFinding('طلبات ضعيفة التبرير',`يوجد ${weak.length} طلبًا بلا تبرير واضح أو شاهد مرتبط.`,'غياب التبرير والشواهد يقلل موثوقية القرار.','high','request',weak[0].id));
      result.recommendations.push(aiRecommendation('إعادة مراجعة الطلبات ضعيفة التبرير','إعادة هذه الطلبات لاستكمال الشواهد أو المبررات قبل الاعتماد.','review','high','رفع جودة الاعتماد وتقليل الهدر.','request',weak[0].id));
    }
    const duplicate=byItem.find(group=>group.count>1);
    if(duplicate) result.recommendations.push(aiRecommendation(`دمج طلبات ${duplicate.key}`,`يوجد تكرار في ${duplicate.count} طلبات لنفس الصنف أو أصناف متقاربة، ويوصى بدمجها في بند واحد عند الرفع.`,`review`,'medium','توحيد الطلبات وتسهيل الطرح والمنافسة.','request',duplicate.rows[0]?.id));
    if(byItem[0]) result.recommendations.push(aiRecommendation(`مراجعة أولوية ${byItem[0].key}`,`الصنف الأعلى احتياجًا يحتاج مراجعة رصيد وشواهد قبل الاعتماد النهائي.`,`approve`,'high','توجيه الاعتماد للأكثر أثرًا تعليميًا.','request',byItem[0].rows[0]?.id));
    result.suggested_actions=['مراجعة الطلبات بلا شواهد.','دمج الأصناف المتكررة قبل الرفع.','مقارنة الاحتياج بالرصيد الحالي قبل الاعتماد.'];
    result.charts.push({title:'أعلى الأصناف احتياجًا',type:'bar',data:byItem.slice(0,8).map(g=>({label:g.key,value:g.qty,count:g.count}))});
    return result;
  }

  function aiInventoryAnalysis(){
    const items=aiScopedRows(db.items||[],row=>row.college,['createdAt','updatedAt','lastEditedAt']);
    const tx=aiScopedRows(db.transactions||[],row=>row.college,['transactionAt','createdAt','updatedAt']);
    const low=items.filter(item=>Number(item.qty||0)<=Number(item.minQty||0));
    const issued=aiGroup(tx.filter(row=>row.type==='issue'&&['approved','completed'].includes(row.status||'approved')),row=>{
      const item=(db.items||[]).find(i=>Number(i.id)===Number(row.itemId));
      return item?(typeof itemName==='function'?itemName(item):item.nameAr||item.name):row.itemName;
    });
    const result=aiBase('inventory',`تم تحليل ${items.length} صنفًا و${tx.length} حركة مخزون.`,low.length?'warning':'good',low.length>5?'high':'medium',items.length?0.8:0.5);
    low.slice(0,6).forEach(item=>result.key_findings.push(aiFinding(`رصيد منخفض: ${typeof itemName==='function'?itemName(item):item.nameAr}`,`الرصيد الحالي ${item.qty} ${item.unit} والحد الأدنى ${item.minQty}.`,'الرصيد أقل أو يساوي الحد الأدنى.','high','item',item.id)));
    issued.slice(0,5).forEach(group=>result.key_findings.push(aiFinding(`صرف مرتفع: ${group.key}`,`إجمالي الصرف ${group.qty} عبر ${group.count} حركات.`,'حركات صرف معتمدة ضمن الفترة.','medium','item',group.rows[0]?.itemId)));
    const surplus=items.filter(item=>Number(item.qty||0)>Math.max(Number(item.minQty||0)*2,Number(item.minQty||0)+5));
    if(low.length) result.recommendations.push(aiRecommendation('رفع احتياج أو طلب دعم للأصناف المنخفضة',`يوجد ${low.length} أصناف تحت الحد الأدنى وتحتاج معالجة قبل الاستهلاك القادم.`,'purchase','high','خفض خطر تعطل التجارب أو الخدمات.','item',low[0].id));
    if(surplus.length && low.length) result.recommendations.push(aiRecommendation('إعادة توزيع المخزون قبل الشراء',`توجد أصناف بفائض في قطاعات وأصناف منخفضة في قطاعات أخرى، وينبغي فحص قابلية الدعم الداخلي.`,'redistribute','medium','تقليل الشراء والاستفادة من الرصيد المتاح.','sector',surplus[0].college));
    result.suggested_actions=['تحديث الحدود الدنيا للأصناف كثيرة الصرف.','فحص الأصناف الراكدة قبل طلب شراء جديد.','مقارنة الفائض بين القطاعات قبل الطرح.'];
    result.charts.push({title:'الأصناف تحت الحد الأدنى',type:'table',data:low.map(i=>({item:typeof itemName==='function'?itemName(i):i.nameAr,qty:i.qty,minQty:i.minQty,sector:i.college}))});
    return result;
  }

  function aiMaintenanceAnalysis(){
    const assets=aiScopedRows(db.maintenanceAssets||[],row=>row.college,['createdAt','updatedAt','lastMaintenanceDate','nextMaintenanceDate']);
    const tickets=aiScopedRows(db.maintenanceTickets||[],row=>row.college,['reportedAt','failureDate','closedAt','createdAt']);
    const plans=aiScopedRows(db.preventiveMaintenancePlans||[],row=>row.college,['lastMaintenanceDate','nextDueDate','createdAt']);
    const stopped=assets.filter(asset=>/متوقف|خارج|stopped|down/i.test(`${asset.status||''}`));
    const overdue=plans.filter(plan=>{
      const due=aiDateOnly(plan.nextDueDate);
      return due && due<aiDateOnly(aiNow()) && !/مكتمل/.test(plan.status||'');
    });
    const byAsset=aiGroup(tickets,row=>row.assetNameAr||row.serialNumber||row.assetId);
    const avg=(values)=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;
    const responseValues=tickets.map(t=>Number(t.responseTimeMinutes||0)).filter(Boolean);
    const closeValues=tickets.map(t=>Number(t.closeTimeMinutes||t.downtimeMinutes||0)).filter(Boolean);
    const result=aiBase('maintenance',`تم تحليل ${assets.length} أصلًا و${tickets.length} بلاغًا و${plans.length} خطة صيانة.`,stopped.length||overdue.length?'warning':'good',stopped.length?'high':'medium',assets.length?0.76:0.5);
    if(stopped.length) result.key_findings.push(aiFinding('أجهزة متوقفة',`يوجد ${stopped.length} أجهزة متوقفة أو خارج الخدمة.`,'حالة الجهاز في سجل الأصول.','high','asset',stopped[0].id));
    if(overdue.length) result.key_findings.push(aiFinding('صيانة وقائية متأخرة',`يوجد ${overdue.length} خطط صيانة تجاوزت موعدها.`,'مقارنة تاريخ الاستحقاق بتاريخ اليوم.','high','asset',overdue[0].assetId));
    if(byAsset[0]&&byAsset[0].count>1) result.key_findings.push(aiFinding(`جهاز كثير الأعطال: ${byAsset[0].key}`,`تكرر البلاغ ${byAsset[0].count} مرات.`,'بلاغات الأعطال المرتبطة بنفس الجهاز.','medium','asset',byAsset[0].rows[0]?.assetId));
    if(stopped[0]) result.recommendations.push(aiRecommendation('متابعة الأجهزة المتوقفة','تعيين زيارة فنية أو قرار استبدال/تكهين للأجهزة المتوقفة.','maintenance','high','رفع جاهزية المعامل وتقليل توقف التشغيل.','asset',stopped[0].id));
    if(overdue[0]) result.recommendations.push(aiRecommendation('تنفيذ الصيانة الوقائية المتأخرة','جدولة الصيانة المتأخرة خلال أقرب أسبوع عمل.','maintenance','high','خفض الأعطال الطارئة ورفع السلامة.','asset',overdue[0].assetId));
    if(byAsset[0]&&byAsset[0].count>=3) result.recommendations.push(aiRecommendation('تقييم الاستبدال لجهاز كثير الأعطال',`الجهاز ${byAsset[0].key} تجاوز حد البلاغات المتكررة ويحتاج قرار فني.`,'replace','high','تقليل تكلفة التشغيل المتكررة.','asset',byAsset[0].rows[0]?.assetId));
    result.suggested_actions=[`متوسط الاستجابة: ${avg(responseValues)} دقيقة.`,`متوسط الإغلاق: ${avg(closeValues)} دقيقة.`,'إظهار البلاغات الحرجة أعلى قائمة المتابعة.'];
    result.charts.push({title:'الأجهزة الأكثر بلاغًا',type:'bar',data:byAsset.slice(0,8).map(g=>({label:g.key,value:g.count}))});
    return result;
  }

  function aiSpendingAnalysis(){
    const inventory=aiInventoryAnalysis();
    const maintenance=aiMaintenanceAnalysis();
    const result=aiBase('spending_efficiency','تم دمج مؤشرات المخزون والصرف والصيانة لاستخراج فرص التوفير.',inventory.risk_level==='high'?'warning':'good','medium',.7);
    result.key_findings=[...inventory.key_findings.slice(0,3),...maintenance.key_findings.slice(0,3)];
    result.recommendations=[
      aiRecommendation('تفعيل إعادة التوزيع قبل الشراء','اعتماد قاعدة تشغيلية: لا يرفع طلب شراء لصنف له فائض في قطاع آخر قبل فحص الدعم الداخلي.','redistribute','high','خفض الشراء غير الضروري.','sector','all'),
      ...inventory.recommendations.filter(r=>['redistribute','purchase'].includes(r.recommendation_type)).slice(0,2),
      ...maintenance.recommendations.filter(r=>['replace','maintenance'].includes(r.recommendation_type)).slice(0,2)
    ];
    result.suggested_actions=['تقرير شهري لفرص التوفير.','ربط البلاغات المتكررة بتوصية استبدال.','مراجعة الأصناف الراكدة قبل المنافسات.'];
    result.charts=[...inventory.charts.slice(0,1),...maintenance.charts.slice(0,1)];
    return result;
  }

  function aiRiskAnalysis(){
    const maintenance=aiMaintenanceAnalysis();
    const items=aiScopedRows(db.items||[],row=>row.college,['createdAt','updatedAt','lastEditedAt']);
    const sensitive=items.filter(item=>/كيميائية|حمض|ايثانول|ethanol|acid|hcl/i.test(`${item.section||''} ${item.nameAr||''} ${item.nameEn||''}`));
    const result=aiBase('risk','تم تحليل مخاطر الأجهزة والصيانة والأصناف الحساسة والبلاغات الحرجة.',maintenance.risk_level==='high'?'critical':'warning',maintenance.risk_level==='high'?'high':'medium',.73);
    result.key_findings=[...maintenance.key_findings];
    if(sensitive.length) result.key_findings.push(aiFinding('أصناف حساسة تحتاج متابعة',`يوجد ${sensitive.length} أصناف كيميائية أو حساسة ضمن النطاق.`,'تصنيف الصنف واسمه يشير إلى حساسية تشغيلية.','medium','item',sensitive[0].id));
    result.recommendations=[
      ...maintenance.recommendations.slice(0,3),
      aiRecommendation('مراجعة إجراءات السلامة للأصناف الحساسة','تأكيد تخزين وتداول الأصناف الحساسة وربطها بسجل مخاطر القطاع.','safety_action','medium','خفض مخاطر السلامة والامتثال.','item',sensitive[0]?.id||'')
    ];
    result.suggested_actions=['إغلاق فجوات الصيانة المتأخرة.','فرز البلاغات الحرجة يوميًا.','تحديث مواقع الأصناف الحساسة.'];
    result.charts=[...maintenance.charts];
    return result;
  }

  function aiExecutiveAnalysis(){
    const needs=aiNeedsAnalysis(), inventory=aiInventoryAnalysis(), maintenance=aiMaintenanceAnalysis(), spending=aiSpendingAnalysis(), risk=aiRiskAnalysis();
    const allFindings=[...risk.key_findings,...spending.key_findings,...needs.key_findings,...inventory.key_findings,...maintenance.key_findings];
    const allRecommendations=[...risk.recommendations,...spending.recommendations,...needs.recommendations,...inventory.recommendations,...maintenance.recommendations];
    const result=aiBase('executive','ملخص تنفيذي موحد يجمع الاحتياج والمخزون والصيانة والمخاطر وفرص التوفير.',risk.risk_level==='high'?'warning':'good',risk.risk_level,.78);
    result.key_findings=allFindings.slice(0,10);
    result.recommendations=allRecommendations.slice(0,10);
    result.suggested_actions=['اعتماد قائمة أولويات أسبوعية.','مراجعة أعلى 5 مخاطر مع الجهات.','تفعيل فرص التوفير قبل أي منافسة جديدة.','تثبيت مؤشرات المحلل في التقرير الشهري.'];
    result.charts=[{title:'ملخص المؤشرات',type:'table',data:[
      {indicator:'طلبات الاحتياج',value:(db.needsRequests||[]).length},
      {indicator:'الأصناف',value:(db.items||[]).length},
      {indicator:'أصول الصيانة',value:(db.maintenanceAssets||[]).length},
      {indicator:'التوصيات القائمة',value:(db.aiRecommendations||[]).filter(r=>r.status==='pending').length}
    ]}];
    return result;
  }

  function aiLocalAnalyze(type){
    return ({needs:aiNeedsAnalysis,inventory:aiInventoryAnalysis,maintenance:aiMaintenanceAnalysis,spending_efficiency:aiSpendingAnalysis,risk:aiRiskAnalysis,executive:aiExecutiveAnalysis}[type]||aiExecutiveAnalysis)();
  }

  function aiValidateResult(result,type){
    const out=result&&typeof result==='object'?result:aiLocalAnalyze(type);
    out.analysis_type=out.analysis_type||type;
    out.executive_summary=aiText(out.executive_summary)||'لا يوجد ملخص متاح.';
    out.overall_status=['excellent','good','warning','critical'].includes(out.overall_status)?out.overall_status:'warning';
    out.risk_level=['low','medium','high','critical'].includes(out.risk_level)?out.risk_level:'medium';
    out.confidence_score=Number.isFinite(Number(out.confidence_score))?Math.max(0,Math.min(1,Number(out.confidence_score))):.5;
    out.data_quality_notes=Array.isArray(out.data_quality_notes)?out.data_quality_notes:[];
    out.key_findings=Array.isArray(out.key_findings)?out.key_findings:[];
    out.recommendations=Array.isArray(out.recommendations)?out.recommendations:[];
    out.suggested_actions=Array.isArray(out.suggested_actions)?out.suggested_actions:[];
    out.charts=Array.isArray(out.charts)?out.charts:[];
    out.meta=out.meta&&typeof out.meta==='object'?out.meta:{};
    out.meta.used_ai=Boolean(out.meta.used_ai);
    out.meta.used_fallback=Boolean(out.meta.used_fallback);
    out.meta.records_analyzed=out.meta.records_analyzed||aiLocalRecordsAnalyzed();
    out.meta.generated_at=out.meta.generated_at||new Date().toISOString();
    aiEnsureSparseGuidance(out,type);
    return out;
  }

  function aiLocalRecordsAnalyzed(){
    return {
      assets:(db.maintenanceAssets||[]).length,
      tickets:(db.maintenanceTickets||[]).length,
      plans:(db.preventiveMaintenancePlans||[]).length,
      items:(db.items||[]).length,
      requests:(db.needsRequests||[]).length,
      movements:(db.transactions||[]).length
    };
  }

  function aiEnsureSparseGuidance(result,type){
    const records=result.meta?.records_analyzed||{};
    const total=Object.values(records).reduce((sum,value)=>sum+Number(value||0),0);
    if(result.key_findings.length && result.recommendations.length) return;
    if(type==='maintenance'){
      if(!Number(records.plans||0)){
        result.key_findings.push(aiFinding('لا توجد خطط صيانة وقائية كافية','لا تظهر خطط صيانة وقائية ضمن النطاق الحالي، وهذا يقلل دقة تحليل جاهزية الأجهزة.','عدد خطط الصيانة الوقائية في النطاق يساوي صفر.','medium','asset',''));
        result.recommendations.push(aiRecommendation('إنشاء خطط صيانة للأجهزة عالية الخطورة','ابدأ بربط الأجهزة عالية الخطورة بخطط صيانة وقائية شهرية أو ربع سنوية حسب طبيعة الجهاز.','maintenance','high','رفع جاهزية الأجهزة وتقليل الأعطال المفاجئة.','asset',''));
      }
      if(Number(records.tickets||0)<3){
        result.recommendations.push(aiRecommendation('تجميع بيانات أعطال لمدة شهر','عدد البلاغات الحالي قليل ولا يكفي لاستخراج نمط أعطال موثوق.','review','medium','تحسين جودة التنبؤ بالأجهزة كثيرة الأعطال.','ticket',''));
      }
    }
    if(total<3){
      result.data_quality_notes.push('البيانات قليلة في النطاق الحالي؛ التوصيات تشغيلية أولية وليست استنتاجًا نهائيًا.');
      if(!result.key_findings.length) result.key_findings.push(aiFinding('بيانات محدودة','النطاق الحالي لا يحتوي سجلات كافية لبناء نمط تحليلي قوي.','عدد السجلات المحللة منخفض.','low','sector',''));
      if(!result.recommendations.length) result.recommendations.push(aiRecommendation('استكمال بيانات التشغيل','أضف بيانات صيانة ومخزون واحتياج لمدة شهر على الأقل للحصول على تحليل أدق.','review','medium','تحسين جودة القرارات والتوصيات.','sector',''));
    }
    if(!result.key_findings.length){
      result.key_findings.push(aiFinding('لا توجد مؤشرات حرجة واضحة','لم تظهر أنماط خطرة أو متكررة ضمن النطاق الحالي، وقد يكون السبب قلة البيانات أو استقرار الوضع التشغيلي.','قراءة السجلات المتاحة ضمن الفلاتر الحالية.','low','sector',''));
    }
    if(!result.recommendations.length){
      result.recommendations.push(aiRecommendation('استمرار التوثيق وربط البيانات','استمر في تسجيل الحركات والبلاغات وخطط الصيانة لتحسين جودة التحليل القادم.','review','low','رفع موثوقية المؤشرات المستقبلية.','sector',''));
    }
  }

  function aiFunctionEndpoint(){
    if(window.AI_ANALYZER_ENDPOINT) return window.AI_ANALYZER_ENDPOINT;
    if(window.SUPABASE_URL) return `${String(window.SUPABASE_URL).replace(/\/$/,'')}/functions/v1/ai-analyzer`;
    return '';
  }

  function aiRemoteAnalyzerEnabled(){
    return Boolean(
      window.AI_ANALYZER_ENDPOINT ||
      window.ENABLE_REMOTE_AI_ANALYZER === true ||
      window.ENABLE_AI_ANALYZER_BACKEND === true ||
      window.AI_ANALYZER_AUTO_BACKEND === true
    );
  }

  function aiPayload(type,scope=aiCaptureScope(type)){
    return {
      analysis_type:type,
      sector_id:scope.sector_id||'all',
      sector:scope.sector_id||'all',
      date_from:scope.date_from||null,
      date_to:scope.date_to||null,
      search_query:scope.entity_query||'',
      entity_id:null,
      requested_by:scope.requested_by
    };
  }

  function aiNormalizeBackendPayload(data){
    const result=data?.result||data;
    if(!result || typeof result!=='object') throw new Error('استجابة المحلل الذكي غير صالحة.');
    const persisted=data?.persisted_run||data?.meta?.persisted_run||result?.meta?.persisted_run||null;
    if(persisted) Object.defineProperty(result,'_persistedRun',{value:persisted,enumerable:false});
    return result;
  }

  async function aiRequestBackend(type,payload=aiPayload(type)){
    if(window.supabase?.functions?.invoke){
      const {data,error}=await window.supabase.functions.invoke('ai-analyzer',{body:payload});
      if(error) throw error;
      return aiNormalizeBackendPayload(data);
    }
    const endpoint=aiFunctionEndpoint();
    if(!endpoint) throw new Error('لم يتم ضبط رابط ai-analyzer.');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch(endpoint,{
        method:'POST',
        signal:controller.signal,
        headers:{
          'Content-Type':'application/json',
          apikey:window.SUPABASE_ANON_KEY||'',
          Authorization:`Bearer ${window.SUPABASE_ANON_KEY||''}`
        },
        body:JSON.stringify(payload)
      });
      if(!res.ok) throw new Error(`ai-analyzer ${res.status}`);
      const json=await res.json();
      return aiNormalizeBackendPayload(json);
    }finally{
      clearTimeout(timeout);
    }
  }

  function aiSupabaseRest(path){
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return '';
    return `${String(window.SUPABASE_URL).replace(/\/$/,'')}/rest/v1/${path}`;
  }

  function aiUuidOrNull(value){
    const raw=aiText(value);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)?raw:null;
  }

  async function aiPatchRemoteRecommendation(rec,patch){
    if(!rec?.remote_id) return;
    const endpoint=aiSupabaseRest(`ai_recommendations?id=eq.${encodeURIComponent(rec.remote_id)}`);
    if(!endpoint) return;
    return fetch(endpoint,{
      method:'PATCH',
      headers:{
        apikey:window.SUPABASE_ANON_KEY,
        Authorization:`Bearer ${window.SUPABASE_ANON_KEY}`,
        'Content-Type':'application/json',
        Prefer:'return=minimal'
      },
      body:JSON.stringify(patch)
    }).catch(()=>{});
  }

  function aiInputSummary(type,source,scope=aiCaptureScope(type)){
    return {
      analysis_type:type,
      sector:scope.sector_id||'all',
      date_from:scope.date_from||'',
      date_to:scope.date_to||'',
      entity_query:scope.entity_query||'',
      source
    };
  }

  function aiPersistRun(result,source='local',scope=aiCaptureScope(result.analysis_type||state.aiAnalysisType)){
    ensureAiAnalyzerData();
    const type=result.analysis_type||scope.type||state.aiAnalysisType;
    const persisted=result._persistedRun||null;
    const remoteRun=persisted?.run||persisted||null;
    const remoteRecommendations=Array.isArray(persisted?.recommendations)?persisted.recommendations:[];
    const run={
      id:nextId(db.aiAnalysisRuns),
      remote_id:remoteRun?.id||null,
      analysis_type:type,
      sector_id:scope.sector_id||'all',
      date_from:scope.date_from||'',
      date_to:scope.date_to||'',
      requested_by:scope.requested_by,
      input_summary:aiInputSummary(type,source,scope),
      ai_result_json:result,
      status:'completed',
      confidence_score:result.confidence_score,
      created_at:aiNow(),
      approved_by:null,
      approved_at:null,
      notes:source==='backend'?'تم التحليل عبر ai-analyzer.':(result.meta?.used_fallback?'تم التحليل محليًا لأن خدمة ai-analyzer غير متاحة.':'تم التحليل محليًا من بيانات البرنامج.')
    };
    db.aiAnalysisRuns.unshift(run);
    (result.recommendations||[]).forEach((rec,index)=>{
      const remoteRec=remoteRecommendations[index]||null;
      db.aiRecommendations.unshift({
        id:nextId(db.aiRecommendations),
        remote_id:remoteRec?.id||null,
        remote_analysis_run_id:remoteRun?.id||null,
        analysis_run_id:run.id,
        recommendation_type:rec.recommendation_type||'review',
        title:rec.title||'توصية',
        description:rec.description||'',
        priority:rec.priority||'medium',
        risk_level:rec.priority||result.risk_level||'medium',
        expected_impact:rec.expected_impact||'',
        related_entity_type:rec.related_entity_type||'sector',
        related_entity_id:String(rec.related_entity_id||''),
        status:'pending',
        created_at:run.created_at,
        approved_by:null,
        approved_at:null,
        rejected_by:null,
        rejected_at:null,
        rejection_reason:''
      });
    });
    auditLog('تشغيل المحلل الذكي','aiAnalysisRun',run.id,`${aiTypeLabel(type)} - ${source}`,run.sector_id||'كل القطاعات','المحلل الذكي');
    saveDb();
    state.aiSelectedRunId=run.id;
    return run;
  }

  async function runAiAnalyzer(){
    ensureAiAnalyzerState();
    if(!aiCanRun()) return alert('لا تملك صلاحية تشغيل المحلل الذكي.');
    const type=state.aiAnalysisType||'needs';
    const scope=aiCaptureScope(type);
    state.aiAnalysisStatus='running';
    state.aiAnalysisMessage='جاري تشغيل التحليل...';
    render();
    const remoteEnabled=aiRemoteAnalyzerEnabled();
    let source=remoteEnabled?'backend':'local';
    let result;
    try{
      if(remoteEnabled){
        result=await aiRequestBackend(type,aiPayload(type,scope));
      }else{
        result=aiWithScope(scope,()=>aiLocalAnalyze(type));
        result.meta={...(result.meta||{}),used_ai:false,used_fallback:false,local_analysis:true,message:'تم تشغيل تحليل محلي من بيانات البرنامج.'};
      }
    }catch(error){
      console.error('ai-analyzer invoke failed:', error);
      source='local';
      result=aiWithScope(scope,()=>aiLocalAnalyze(type));
      result.meta={...(result.meta||{}),used_ai:false,used_fallback:true,message:'تم استخدام تحليل محلي احتياطي لتعذر الاتصال بخدمة المحلل الذكي.'};
    }
    result=aiWithScope(scope,()=>aiValidateResult(result,type));
    aiPersistRun(result,source,scope);
    state.aiAnalysisStatus='completed';
    state.aiAnalysisMessage=result.meta?.message || (source==='backend'?'تم تشغيل التحليل عبر ai-analyzer.':'تم استخدام تحليل محلي احتياطي.');
    render();
  }
  window.runAiAnalyzer=runAiAnalyzer;

  function aiLatestRun(){
    ensureAiAnalyzerData();
    const selected=(db.aiAnalysisRuns||[]).find(run=>Number(run.id)===Number(state.aiSelectedRunId));
    if(selected && aiRunMatchesCurrentScope(selected)) return selected;
    return (db.aiAnalysisRuns||[]).find(run=>aiRunMatchesCurrentScope(run))||null;
  }

  function aiRunSector(run){
    return aiText(run?.sector_id||run?.input_summary?.sector||'all')||'all';
  }

  function aiRunMatchesViewer(run){
    const sector=aiRunSector(run);
    if(aiIsCentral()){
      if(state.collegeFilter && state.collegeFilter!=='all' && sector!==state.collegeFilter) return false;
      return true;
    }
    return sector && sector!=='all' && aiText(sector)===aiText(state.currentUser?.college);
  }

  function aiRunMatchesCurrentScope(run){
    const scope=aiCaptureScope(state.aiAnalysisType||'needs');
    if(!run || run.analysis_type!==scope.type) return false;
    if(aiRunSector(run)!==(scope.sector_id||'all')) return false;
    if(aiText(run.date_from||'')!==aiText(scope.date_from||'')) return false;
    if(aiText(run.date_to||'')!==aiText(scope.date_to||'')) return false;
    if(aiText(run.input_summary?.entity_query||'')!==aiText(scope.entity_query||'')) return false;
    return aiRunMatchesViewer(run);
  }

  function aiVisibleRuns(){
    ensureAiAnalyzerData();
    return (db.aiAnalysisRuns||[]).filter(aiRunMatchesViewer);
  }

  function aiVisibleRecommendations(status=null){
    const visibleRunIds=new Set(aiVisibleRuns().map(run=>String(run.id)));
    return (db.aiRecommendations||[]).filter(rec=>
      (!status || rec.status===status) &&
      visibleRunIds.has(String(rec.analysis_run_id))
    );
  }

  function aiStatusBadge(status){
    const cls=status==='approved'?'badge-ok':status==='rejected'?'badge-danger':'badge-warning';
    const label={approved:'معتمدة',rejected:'مرفوضة',pending:'بانتظار المراجعة'}[status]||status||'بانتظار المراجعة';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function aiSourceBadge(result){
    if(!result) return '';
    if(result.meta?.used_ai) return '<span class="badge badge-ok">تحليل ذكي</span>';
    if(result.meta?.used_fallback && aiRemoteAnalyzerEnabled()) return '<span class="badge badge-warning">تحليل محلي احتياطي</span>';
    if(result.meta?.used_fallback || result.meta?.local_analysis) return '<span class="badge badge-info">تحليل محلي</span>';
    return '<span class="badge badge-info">تحليل قواعدي</span>';
  }

  function aiAnalysisStatusTone(result){
    if(state.aiAnalysisStatus==='running') return 'running';
    if(result?.meta?.used_fallback && aiRemoteAnalyzerEnabled()) return 'warning';
    if(result?.meta?.used_ai) return 'remote';
    if(result) return 'local';
    return 'idle';
  }

  function aiAnalysisDisplayMessage(result){
    if(state.aiAnalysisStatus==='running') return 'جاري التحليل';
    if(result?.meta?.used_fallback && !aiRemoteAnalyzerEnabled()) return 'تم تشغيل تحليل محلي من بيانات البرنامج.';
    return state.aiAnalysisMessage || result?.meta?.message || 'جاهز';
  }

  async function approveAiRecommendation(id){
    ensureAiAnalyzerData();
    if(!aiCanApprove()) return alert('لا تملك صلاحية اعتماد توصيات المحلل الذكي.');
    const rec=db.aiRecommendations.find(row=>Number(row.id)===Number(id));
    if(!rec) return alert('التوصية غير موجودة.');
    if(!confirm('اعتماد التوصية يحفظ قرار المراجعة فقط ولا ينفذ أي إجراء تلقائي. هل تريد المتابعة؟')) return;
    rec.status='approved';
    rec.approved_by=aiCurrentUserId();
    rec.approved_at=aiNow();
    rec.rejected_by=null;
    rec.rejected_at=null;
    rec.rejection_reason='';
    await aiPatchRemoteRecommendation(rec,{status:'approved',approved_by:aiUuidOrNull(rec.approved_by),approved_at:new Date().toISOString(),rejected_by:null,rejected_at:null,rejection_reason:null});
    auditLog('اعتماد توصية المحلل الذكي','aiRecommendation',rec.id,rec.title,'المحلل الذكي',rec.related_entity_type);
    saveDb();
    render();
  }

  async function rejectAiRecommendation(id){
    ensureAiAnalyzerData();
    if(!aiCanApprove()) return alert('لا تملك صلاحية رفض توصيات المحلل الذكي.');
    const rec=db.aiRecommendations.find(row=>Number(row.id)===Number(id));
    if(!rec) return alert('التوصية غير موجودة.');
    const reason=prompt('سبب رفض التوصية','');
    if(reason===null) return;
    rec.status='rejected';
    rec.rejected_by=aiCurrentUserId();
    rec.rejected_at=aiNow();
    rec.rejection_reason=reason;
    rec.approved_by=null;
    rec.approved_at=null;
    await aiPatchRemoteRecommendation(rec,{status:'rejected',rejected_by:aiUuidOrNull(rec.rejected_by),rejected_at:new Date().toISOString(),rejection_reason:reason,approved_by:null,approved_at:null});
    auditLog('رفض توصية المحلل الذكي','aiRecommendation',rec.id,reason||rec.title,'المحلل الذكي',rec.related_entity_type);
    saveDb();
    render();
  }
  Object.assign(window,{approveAiRecommendation,rejectAiRecommendation});

  function aiRecommendationsForRun(run){
    return (db.aiRecommendations||[]).filter(rec=>Number(rec.analysis_run_id)===Number(run?.id));
  }

  function aiRecommendationsTable(run){
    const rows=aiRecommendationsForRun(run).map(rec=>[
      aiPriorityLabel(rec.priority),
      rec.title,
      rec.description,
      rec.expected_impact||'—',
      `${rec.related_entity_type||'—'}: ${aiEntityName(rec.related_entity_type,rec.related_entity_id)}`,
      aiStatusBadge(rec.status),
      aiCanApprove()?`<div class="flex-actions"><button class="btn btn-success btn-sm" onclick="approveAiRecommendation(${rec.id})">اعتماد</button><button class="btn btn-danger btn-sm" onclick="rejectAiRecommendation(${rec.id})">رفض</button></div>`:'—'
    ]);
    return table(['الأولوية','التوصية','الوصف','الأثر المتوقع','الارتباط','الحالة','إجراء'],rows);
  }

  function aiPriorityLabel(priority){return AI_PRIORITY_LABELS[priority]||priority||'متوسطة';}

  function aiFindingsHtml(result){
    if(!result.key_findings?.length) return '<div class="smart-empty">لا توجد نتائج كافية في النطاق الحالي.</div>';
    return `<div class="ai-card-grid">${result.key_findings.slice(0,8).map(item=>`<div class="ai-finding-card"><span>${aiPriorityLabel(item.priority)}</span><strong>${aiEscape(item.title)}</strong><p>${aiEscape(item.description)}</p><em>${aiEscape(item.evidence||'')}</em></div>`).join('')}</div>`;
  }

  function aiChartsHtml(result){
    if(!result.charts?.length) return '';
    return `<div class="section-split">${result.charts.slice(0,2).map(chart=>`<div class="table-panel"><div class="table-head"><div class="panel-title">${aiEscape(chart.title)}</div></div>${table(Object.keys((chart.data||[])[0]||{label:'البيان',value:'القيمة'}),(chart.data||[]).map(row=>Object.values(row)))}</div>`).join('')}</div>`;
  }

  function aiReportData(run=aiLatestRun()){
    const result=run?.ai_result_json||aiLocalAnalyze(state.aiAnalysisType||'executive');
    return {
      title:`تقرير المحلل الذكي - ${aiTypeLabel(result.analysis_type)}`,
      headers:['البند','القيمة','ملاحظة'],
      rows:[
        ['نوع التحليل',aiTypeLabel(result.analysis_type),'—'],
        ['القطاع',run?.sector_id||'كل القطاعات','—'],
        ['الفترة',`${run?.date_from||'—'} إلى ${run?.date_to||'—'}`,'—'],
        ['الحالة العامة',AI_STATUS_LABELS[result.overall_status]||result.overall_status,'—'],
        ['مستوى المخاطر',aiPriorityLabel(result.risk_level),'—'],
        ['درجة الثقة',`${Math.round(Number(result.confidence_score||0)*100)}%`,'—'],
        ['الملخص التنفيذي',result.executive_summary,'—'],
        ...((result.key_findings||[]).map(f=>[`نتيجة: ${f.title}`,f.description,f.evidence||'—'])),
        ...((run?aiRecommendationsForRun(run):result.recommendations||[]).map(r=>[`توصية: ${r.title}`,r.description||r.expected_impact,r.status?`الحالة: ${r.status}`:(r.expected_impact||'—')]))
      ]
    };
  }
  function printAiReport(){openPrint(aiReportData());}
  function exportAiReport(){exportExcel(aiReportData(),'ai-analysis-report.xlsx');}
  function saveAiReport(){const run=aiLatestRun(); if(!run)return alert('شغل التحليل أولًا ثم احفظ التقرير.'); run.notes='تم حفظ التقرير من الواجهة'; auditLog('حفظ تقرير المحلل الذكي','aiAnalysisRun',run.id,aiTypeLabel(run.analysis_type),run.sector_id||'كل القطاعات','المحلل الذكي'); saveDb(); alert('تم حفظ تقرير المحلل الذكي.');}
  Object.assign(window,{printAiReport,exportAiReport,saveAiReport});

  function renderAiAnalyzer(){
    ensureAiAnalyzerState();
    if(!hasPermission('view_ai_analyzer')) return `<div class="panel"><div class="panel-title">المحلل الذكي</div><div class="panel-subtitle">لا تملك صلاحية عرض هذه الصفحة.</div></div>`;
    const run=aiLatestRun();
    const result=run?.ai_result_json||null;
    const tabs=AI_ANALYSIS_TYPES.map(type=>`<button class="report-tab ${state.aiAnalysisType===type.id?'active':''}" onclick="aiSetType('${type.id}')">${type.label}</button>`).join('');
    return `<div class="ai-analyzer-page">
      <div class="report-tabs ai-analysis-tabs">${tabs}</div>
      <div class="panel ai-control-panel">
        <div class="ai-filter-head">
          <div>
            <div class="panel-title">نطاق التحليل</div>
            <div class="panel-subtitle">اختر نوع التحليل من الأزرار أعلاه، ثم اضبط القطاع والفترة والبحث من هذه البطاقة فقط.</div>
          </div>
          <div class="ai-current-type-pill">${aiTypeLabel(state.aiAnalysisType)}</div>
        </div>
        <div class="ai-filter-grid">
          <div class="ai-selected-type-card">
            <span>نوع التحليل الحالي</span>
            <strong>${aiTypeLabel(state.aiAnalysisType)}</strong>
            <em>يتغير من شريط أنواع التحليل بالأعلى</em>
          </div>
          <label class="ai-filter-field"><span>القطاع</span><select class="select" onchange="aiSetSector(this.value)">${aiSectorOptions()}</select></label>
          <label class="ai-filter-field"><span>من تاريخ</span><input class="input" type="date" value="${aiEscape(state.aiAnalysisDateFrom)}" onchange="aiSetDateFrom(this.value)"></label>
          <label class="ai-filter-field"><span>إلى تاريخ</span><input class="input" type="date" value="${aiEscape(state.aiAnalysisDateTo)}" onchange="aiSetDateTo(this.value)"></label>
          <label class="ai-filter-field ai-filter-search"><span>الصنف أو الجهاز عند الحاجة</span><input class="input" placeholder="ابحث باسم صنف، جهاز، بلاغ، مقرر..." value="${aiEscape(state.aiAnalysisEntityQuery)}" oninput="aiSetEntityQuery(this.value)"></label>
        </div>
        <div class="report-actions ai-actions">
          <button class="btn btn-primary" onclick="runAiAnalyzer()" ${state.aiAnalysisStatus==='running'||!aiCanRun()?'disabled':''}>تشغيل التحليل</button>
          <button class="btn btn-secondary" onclick="printAiReport()">تصدير PDF</button>
          <button class="btn btn-secondary" onclick="exportAiReport()">تصدير Excel</button>
          <button class="btn btn-secondary" onclick="saveAiReport()">حفظ التقرير</button>
        </div>
        <div class="alert ai-governance-note">هذه التوصيات مساعدة ولا تغني عن المراجعة الفنية أو الإدارية. المحلل لا يعتمد ولا يغلق ولا ينشئ أوامر صرف تلقائيًا.</div>
      </div>
      <div class="ai-status-line ai-status-${aiAnalysisStatusTone(result)}"><strong>حالة التحليل:</strong> ${aiAnalysisDisplayMessage(result)} ${run?`<span>آخر تشغيل: ${formatDateTime(run.created_at)} | الثقة ${Math.round(Number(run.confidence_score||0)*100)}%</span>`:''}</div>
      ${result?`<div class="panel ai-summary-panel"><div class="table-head"><div class="panel-title">${aiTypeLabel(result.analysis_type)}</div>${aiSourceBadge(result)}</div><p>${aiEscape(result.executive_summary)}</p><div class="ai-meta"><span>${AI_STATUS_LABELS[result.overall_status]||result.overall_status}</span><span>المخاطر: ${aiPriorityLabel(result.risk_level)}</span><span>الثقة: ${Math.round(Number(result.confidence_score||0)*100)}%</span></div>${result.data_quality_notes?.length?`<div class="alert">${result.data_quality_notes.map(aiEscape).join('<br>')}</div>`:''}</div>${aiFindingsHtml(result)}<div class="table-panel"><div class="table-head"><div class="panel-title">التوصيات</div></div>${aiRecommendationsTable(run)}</div>${aiChartsHtml(result)}`:`<div class="panel"><div class="panel-title">لم يتم تشغيل التحليل بعد</div><div class="panel-subtitle">اختر نوع التحليل من الأزرار العليا، ثم اضبط نطاق الفلاتر واضغط تشغيل التحليل. سيتم حفظ النتيجة والتوصيات في سجل المحلل الذكي.</div></div>`}
    </div>`;
  }

  const previousAiNavItems=navItems;
  navItems=function(){
    ensureAiAnalyzerData();
    const items=(previousAiNavItems?previousAiNavItems():[]).filter(item=>item.id!=='analyst');
    if(!hasPermission('view_ai_analyzer')) return items;
    const entry={id:'analyst',label:'المحلل الذكي',icon:typeof uiIcon==='function'?uiIcon('sparkles'):'AI',permission:'view_ai_analyzer'};
    const idx=items.findIndex(item=>item.id==='executive');
    if(idx>=0) items.splice(idx+1,0,entry);
    else items.unshift(entry);
    return items;
  };

  const previousAiGetPageTitle=getPageTitle;
  getPageTitle=function(){
    if(state.currentPage==='analyst') return 'المحلل الذكي';
    return previousAiGetPageTitle?previousAiGetPageTitle():'';
  };

  const previousAiRenderPageContent=renderPageContent;
  renderPageContent=function(){
    if(state.currentPage==='analyst') return renderAiAnalyzer();
    return previousAiRenderPageContent?previousAiRenderPageContent():'';
  };

  const previousAiAvailableReportTabs=availableReportTabs;
  availableReportTabs=function(){
    const tabs=previousAiAvailableReportTabs?previousAiAvailableReportTabs():[];
    if(hasPermission('report_ai_analysis')){
      [
        ['ai_results','نتائج المحلل الذكي','report_ai_analysis'],
        ['ai_approved','التوصيات المعتمدة','report_ai_analysis'],
        ['ai_rejected','التوصيات المرفوضة','report_ai_analysis'],
        ['ai_risks','تقرير المخاطر','report_ai_analysis'],
        ['ai_savings','فرص التوفير','report_ai_analysis']
      ].forEach(tab=>{if(!tabs.some(item=>item[0]===tab[0])) tabs.push(tab);});
    }
    return tabs;
  };

  const previousAiReportData=reportData;
  reportData=function(){
    ensureAiAnalyzerData();
    const tab=state.reportTab;
    if(tab==='ai_results') return {title:'تقرير نتائج المحلل الذكي',headers:['التاريخ','النوع','القطاع','الحالة','الثقة','الملخص'],rows:aiVisibleRuns().map(run=>[formatDateTime(run.created_at),aiTypeLabel(run.analysis_type),run.sector_id||'كل القطاعات',run.status,`${Math.round(Number(run.confidence_score||0)*100)}%`,run.ai_result_json?.executive_summary||'—'])};
    if(tab==='ai_approved') return aiRecommendationsReport('approved','تقرير التوصيات المعتمدة');
    if(tab==='ai_rejected') return aiRecommendationsReport('rejected','تقرير التوصيات المرفوضة');
    if(tab==='ai_risks') return {title:'تقرير مخاطر المحلل الذكي',headers:['التاريخ','التحليل','مستوى المخاطر','النتيجة','الدليل'],rows:aiVisibleRuns().flatMap(run=>(run.ai_result_json?.key_findings||[]).filter(f=>['high','critical'].includes(f.priority)).map(f=>[formatDateTime(run.created_at),aiTypeLabel(run.analysis_type),aiPriorityLabel(f.priority),f.title,f.evidence||'—']))};
    if(tab==='ai_savings') return {title:'تقرير فرص التوفير',headers:['التاريخ','التوصية','الأولوية','الأثر المتوقع','الحالة'],rows:aiVisibleRecommendations().filter(r=>['redistribute','purchase','replace'].includes(r.recommendation_type)).map(r=>[formatDateTime(r.created_at),r.title,aiPriorityLabel(r.priority),r.expected_impact||'—',r.status])};
    return previousAiReportData?previousAiReportData():{title:'تقرير',headers:[],rows:[]};
  };

  function aiRecommendationsReport(status,title){
    return {title,headers:['التاريخ','التوصية','النوع','الأولوية','الأثر','الارتباط','المراجع'],rows:aiVisibleRecommendations(status).map(r=>[formatDateTime(r.created_at),r.title,r.recommendation_type,aiPriorityLabel(r.priority),r.expected_impact||'—',`${r.related_entity_type}: ${aiEntityName(r.related_entity_type,r.related_entity_id)}`,status==='approved'?actorName(r.approved_by):actorName(r.rejected_by)])};
  }

  ensureAiAnalyzerData();
})();
