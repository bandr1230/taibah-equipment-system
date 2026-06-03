/* Need calculation engine.
   Pure functions only: no DOM, no localStorage, no app state. */
/*
 * Source ownership signature.
 * Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
 * Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
 * This marker is source-level only and is not rendered in UI or reports.
 */
;(()=>{const __bjAljabriSourceSignature='BJ-TEIP-2026-SOURCE-SIGNATURE|Bandar bin Khalaf Aljabri|بندر بن خلف الجابري';void __bjAljabriSourceSignature;})();
(function(root,factory){
  const engine=factory();
  if(typeof module==='object' && module.exports) module.exports=engine;
  root.NeedEngine=engine;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const BASIS_OPTIONS=[
    {id:'per_student',label:'لكل طالب'},
    {id:'per_group',label:'لكل مجموعة'},
    {id:'per_section',label:'لكل شعبة'},
    {id:'per_experiment',label:'للتجربة كاملة'},
    {id:'reusable',label:'أداة قابلة لإعادة الاستخدام'}
  ];

  const UNIT_ALIASES={
    'مل':'مليتر',
    'ملل':'مليتر',
    'مللي':'مليتر',
    'مليلتر':'مليتر',
    'ملليلتر':'مليتر',
    'ملي لتر':'مليتر',
    'ml':'مليتر',
    'mL':'مليتر',
    'ل':'لتر',
    'L':'لتر',
    'liter':'لتر',
    'جم':'جرام',
    'غ':'جرام',
    'غرام':'جرام',
    'g':'جرام',
    'كجم':'كيلو',
    'كغ':'كيلو',
    'كيلوغرام':'كيلو',
    'kg':'كيلو',
    'حبه':'حبة',
    'قطعه':'قطعة'
  };

  function toNumber(value){
    const n=Number(value||0);
    return Number.isFinite(n) ? Math.max(n,0) : 0;
  }

  function canonicalUnit(unit){
    const u=String(unit||'').trim();
    return UNIT_ALIASES[u]||u;
  }

  function defaultRequestUnit(unit){
    const u=canonicalUnit(unit);
    if(u==='مليتر') return 'لتر';
    if(u==='جرام') return 'كيلو';
    return u||'عدد';
  }

  function unitFamily(unit){
    const u=canonicalUnit(unit);
    if(['مليتر','لتر'].includes(u)) return 'volume';
    if(['جرام','كيلو'].includes(u)) return 'weight';
    if(['حبة','عدد','قطعة','علبة','صندوق','كرتون','جهاز'].includes(u)) return 'count';
    return u;
  }

  function unitFactor(unit){
    const u=canonicalUnit(unit);
    if(u==='مليتر') return 1;
    if(u==='لتر') return 1000;
    if(u==='جرام') return 1;
    if(u==='كيلو') return 1000;
    return 1;
  }

  function canConvert(fromUnit,toUnit){
    return unitFamily(fromUnit)===unitFamily(toUnit);
  }

  function convertQty(qty,fromUnit,toUnit){
    const from=canonicalUnit(fromUnit);
    const to=canonicalUnit(toUnit);
    const value=toNumber(qty);
    if(from===to) return value;
    if(!canConvert(from,to)) return value;
    if(unitFamily(from)==='count') return value;
    return value*unitFactor(from)/unitFactor(to);
  }

  function roundQty(value){
    return Math.ceil(toNumber(value));
  }

  function roundPreview(value){
    return Math.ceil(toNumber(value)*100)/100;
  }

  function basisLabel(basis){
    return (BASIS_OPTIONS.find(o=>o.id===basis)||{}).label||basis||'غير محدد';
  }

  function normalizeKey(value){
    return String(value||'').trim().toLowerCase()
      .replace(/[إأآا]/g,'ا')
      .replace(/[ىي]/g,'ي')
      .replace(/ة/g,'ه')
      .replace(/^ال/,'')
      .replace(/\s+/g,' ');
  }

  function appliesToFirstTerm(semester){
    return semester==='الأول' || semester==='كلاهما' || semester==='both' || semester==='first';
  }

  function appliesToSecondTerm(semester){
    return semester==='الثاني' || semester==='كلاهما' || semester==='both' || semester==='second';
  }

  function parseRatioNumber(value){
    const raw=String(value||'').replace('%','').replace(',','.').trim();
    const match=raw.match(/[-+]?\d*\.?\d+/);
    const n=match ? Number(match[0]) : 0;
    return Number.isFinite(n) && n>0 ? n : 0;
  }

  function chemicalPreparationFactor(row){
    const mode=String(row.chemicalUsageMode||row.preparationMode||'direct').trim();
    if(!['solution_preparation','prepare_solution','prepared_from_concentrate'].includes(mode)) return 1;
    const percent=parseRatioNumber(
      row.preparationPercent ||
      row.solutionPercent ||
      row.targetConcentration ||
      row.finalConcentration ||
      row.solutionConcentration
    );
    if(!percent) return 1;
    return Math.min(percent/100,1);
  }

  function lifecyclePolicy(row,categoryKey){
    const raw=String(row.reusePolicy||row.lifecyclePolicy||row.usageLifecycle||'').trim();
    if(raw) return raw;
    if(categoryKey==='device') return 'reusable_peak';
    if(row.basis==='reusable') return 'reusable_peak';
    return 'single_use';
  }

  function isPeakBased(row){
    const policy=lifecyclePolicy(row,row.referenceCategoryKey||row.categoryKey||row.category);
    return ['reusable','reusable_peak','shared','durable','device'].includes(policy) || row.basis==='reusable';
  }

  function scheduleBucket(row,term){
    const week=Math.max(1,Math.min(15,Math.ceil(toNumber(row.academicWeek||row.weekNo||row.experimentWeek||1)||1)));
    const day=normalizeKey(row.scheduleDay||row.day||'unspecified_day')||'unspecified_day';
    const slot=normalizeKey(row.scheduleSlot||row.timeSlot||row.period||'unspecified_slot')||'unspecified_slot';
    return [term,week,day,slot].join('|');
  }

  function itemIdentityParts(row,mainDepartment,section){
    const category=normalizeKey(row.referenceCategoryKey||row.categoryKey||row.category||section);
    const specA=normalizeKey(row.specA||row.size||row.model||row.sourceConcentration||row.concentration);
    const specB=normalizeKey(row.specB||row.packageType||row.deviceCondition);
    return [
      normalizeKey(row.itemNameAr||row.itemNameEn),
      normalizeKey(row.requestUnit),
      normalizeKey(mainDepartment),
      normalizeKey(section),
      category,
      specA,
      category==='chemical' ? '' : specB
    ];
  }

  function calcMaterial(row){
    const categoryKey=String(row.referenceCategoryKey||row.categoryKey||row.category||'').trim();
    const isDevice=categoryKey==='device';
    const safe={
      experimentName:String(row.experimentName||'تجربة غير مسماة').trim()||'تجربة غير مسماة',
      semester:row.semester||'الأول',
      repeats:Math.max(1,toNumber(row.repeats)||1),
      maleSections:toNumber(row.maleSections),
      malePerSection:toNumber(row.malePerSection),
      femaleSections:toNumber(row.femaleSections),
      femalePerSection:toNumber(row.femalePerSection),
      groupSize:Math.max(1,toNumber(row.groupSize)||1),
      itemNameAr:String(row.itemNameAr||'').trim(),
      itemNameEn:String(row.itemNameEn||'').trim(),
      usageUnit:canonicalUnit(row.usageUnit||row.unit||'عدد'),
      requestUnit:canonicalUnit(row.requestUnit||defaultRequestUnit(row.usageUnit||row.unit||'عدد')),
      basis:row.basis||(isDevice?'per_section':'per_student'),
      qtyPerUse:toNumber(row.qtyPerUse),
      wastePercent:isDevice?0:toNumber(row.wastePercent),
      stockAvailable:toNumber(row.stockAvailable),
      referenceCategoryKey:categoryKey,
      reusePolicy:lifecyclePolicy(row,categoryKey),
      academicWeek:Math.max(1,Math.min(15,Math.ceil(toNumber(row.academicWeek||row.weekNo||row.experimentWeek||1)||1))),
      scheduleDay:String(row.scheduleDay||row.day||'').trim(),
      scheduleSlot:String(row.scheduleSlot||row.timeSlot||row.period||'').trim(),
      chemicalUsageMode:String(row.chemicalUsageMode||row.preparationMode||'concentrated_direct').trim(),
      sourceConcentration:String(row.sourceConcentration||row.stockConcentration||row.specA||row.concentration||'').trim(),
      targetConcentration:String(row.targetConcentration||row.finalConcentration||row.solutionConcentration||'').trim(),
      preparationPercent:toNumber(row.preparationPercent||row.solutionPercent||row.targetConcentration||row.finalConcentration),
      preparationVolume:toNumber(row.preparationVolume||row.finalSolutionVolume||row.displayQtyPerUse),
      preparationCount:toNumber(row.preparationCount||1),
      preparationCountMode:String(row.preparationCountMode||'').trim(),
      solutionVolumeTotal:toNumber(row.solutionVolumeTotal||row.finalSolutionTotal),
      specA:String(row.specA||'').trim(),
      specB:String(row.specB||'').trim()
    };
    const maleStudents=safe.maleSections*safe.malePerSection;
    const femaleStudents=safe.femaleSections*safe.femalePerSection;
    const students=maleStudents+femaleStudents;
    const sections=safe.maleSections+safe.femaleSections;
    const maleGroups=safe.maleSections ? safe.maleSections*Math.ceil(safe.malePerSection/safe.groupSize) : 0;
    const femaleGroups=safe.femaleSections ? safe.femaleSections*Math.ceil(safe.femalePerSection/safe.groupSize) : 0;
    const groups=maleGroups+femaleGroups;
    let baseQty=0;
    let effectiveRepeats=isDevice?1:safe.repeats;

    if(safe.basis==='per_student') baseQty=students*safe.qtyPerUse;
    else if(safe.basis==='per_group') baseQty=groups*safe.qtyPerUse;
    else if(safe.basis==='per_section') baseQty=sections*safe.qtyPerUse;
    else if(safe.basis==='per_experiment') baseQty=safe.qtyPerUse;
    else {
      baseQty=(isDevice?Math.max(sections,1):Math.max(groups,sections,1))*safe.qtyPerUse;
      effectiveRepeats=1;
    }

    const chemicalFactor=categoryKey==='chemical' ? chemicalPreparationFactor(row) : 1;
    const grossNeedUsage=(baseQty*effectiveRepeats*chemicalFactor)*(1+(safe.wastePercent/100));
    const grossNeed=convertQty(grossNeedUsage,safe.usageUnit,safe.requestUnit);
    return {
      ...safe,
      _refId:row._refId,
      referenceNo:row.referenceNo,
      courseName:row.courseName||'',
      courseCode:row.courseCode||'',
      academicYear:row.academicYear||'',
      unit:safe.requestUnit,
      maleStudents,
      femaleStudents,
      students,
      sections,
      groups,
      baseQty,
      effectiveRepeats,
      chemicalFactor,
      peakBased:isPeakBased(safe),
      grossNeedUsage,
      grossNeed
    };
  }

  function isValidMaterial(row){
    const hasItem=Boolean(row.itemNameAr||row.itemNameEn);
    const hasConsumption=toNumber(row.qtyPerUse)>0;
    const hasPopulation=row.students>0 || row.sections>0 || row.basis==='per_experiment' || row.basis==='reusable';
    return hasItem && hasConsumption && hasPopulation;
  }

  function aggregateRows(rows,options={}){
    const mainDepartment=options.mainDepartment||'القسم العام';
    const section=options.section||'القسم العام';
    const map=new Map();
    (rows||[]).map(calcMaterial).filter(isValidMaterial).forEach(row=>{
      const key=itemIdentityParts(row,mainDepartment,section).join('|');
      if(!map.has(key)){
        map.set(key,{
          key,
          erpCode:'',
          mainDepartment,
          section,
          category:section,
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
          courses:new Set(),
          reusableBuckets:{first:new Map(),second:new Map()},
          consumptiveGross:{first:0,second:0},
          calculationModes:new Set()
        });
      }
      const agg=map.get(key);
      if(row.itemNameAr && !agg.itemNameAr) agg.itemNameAr=row.itemNameAr;
      if(row.itemNameEn && !agg.itemNameEn) agg.itemNameEn=row.itemNameEn;
      const peak=isPeakBased(row);
      agg.calculationModes.add(peak?'peak':'sum');
      if(peak){
        if(appliesToFirstTerm(row.semester)){
          const bucket=scheduleBucket(row,'first');
          agg.reusableBuckets.first.set(bucket,(agg.reusableBuckets.first.get(bucket)||0)+row.grossNeed);
        }
        if(appliesToSecondTerm(row.semester)){
          const bucket=scheduleBucket(row,'second');
          agg.reusableBuckets.second.set(bucket,(agg.reusableBuckets.second.get(bucket)||0)+row.grossNeed);
        }
      }else{
        if(appliesToFirstTerm(row.semester)) agg.consumptiveGross.first+=row.grossNeed;
        if(appliesToSecondTerm(row.semester)) agg.consumptiveGross.second+=row.grossNeed;
      }
      agg.stockAvailable=Math.max(agg.stockAvailable,row.stockAvailable||0);
      agg.evidenceRows.push(row);
      agg.experiments.add(row.experimentName);
      if(row.courseName) agg.courses.add(row.courseName);
      agg.usageUnits.add(row.usageUnit);
    });
    return [...map.values()].map(agg=>{
      agg.term1Peak=roundPreview(Math.max(0,...agg.reusableBuckets.first.values()));
      agg.term2Peak=roundPreview(Math.max(0,...agg.reusableBuckets.second.values()));
      agg.term1Gross=roundPreview(agg.consumptiveGross.first+agg.term1Peak);
      agg.term2Gross=roundPreview(agg.consumptiveGross.second+agg.term2Peak);
      agg.peakBased=agg.calculationModes.has('peak');
      agg.calculationMode=agg.calculationModes.has('peak') && !agg.calculationModes.has('sum') ? 'peak' :
        agg.calculationModes.has('peak') ? 'mixed' : 'sum';
      agg.conflictCount=[...agg.reusableBuckets.first.values(),...agg.reusableBuckets.second.values()].filter(v=>v>0).length;
      let remainingStock=agg.stockAvailable;
      const term1NetRaw=Math.max(agg.term1Gross-remainingStock,0);
      remainingStock=Math.max(remainingStock-agg.term1Gross,0);
      const term2NetRaw=Math.max(agg.term2Gross-remainingStock,0);
      agg.term1NetRaw=term1NetRaw;
      agg.term2NetRaw=term2NetRaw;
      agg.term1Net=roundQty(term1NetRaw);
      agg.term2Net=roundQty(term2NetRaw);
      agg.grossTotal=roundPreview(agg.term1Gross+agg.term2Gross);
      agg.netTotal=roundQty(agg.term1Net+agg.term2Net);
      return agg;
    });
  }

  function findMergeTarget(agg,ctx,needsRequests){
    return (needsRequests||[]).find(req=>{
      if(['approved','rejected'].includes(req.status)) return false;
      if(!['educational_evidence_v5_9','educational_evidence_v5_9_1','educational_evidence_v5_9_2'].includes(req.calculationSource)) return false;
      const sameScope=req.college===ctx.college &&
        (req.mainDepartment||'القسم العام')===(ctx.mainDepartment||'القسم العام') &&
        req.section===ctx.section;
      const sameUnit=canonicalUnit(req.unit)===canonicalUnit(agg.unit);
      const sameItem=normalizeKey(req.itemNameAr||req.itemNameEn)===normalizeKey(agg.itemNameAr||agg.itemNameEn);
      return sameScope && sameUnit && sameItem;
    });
  }

  return {
    BASIS_OPTIONS,
    canonicalUnit,
    defaultRequestUnit,
    unitFamily,
    unitFactor,
    canConvert,
    convertQty,
    roundQty,
    roundPreview,
    basisLabel,
    normalizeKey,
    calcMaterial,
    aggregateRows,
    isPeakBased,
    chemicalPreparationFactor,
    scheduleBucket,
    itemIdentityParts,
    findMergeTarget
  };
});
