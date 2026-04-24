/* Need calculation engine.
   Pure functions only: no DOM, no localStorage, no app state. */
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

  function calcMaterial(row){
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
      basis:row.basis||'per_student',
      qtyPerUse:toNumber(row.qtyPerUse),
      wastePercent:toNumber(row.wastePercent),
      stockAvailable:toNumber(row.stockAvailable)
    };
    const maleStudents=safe.maleSections*safe.malePerSection;
    const femaleStudents=safe.femaleSections*safe.femalePerSection;
    const students=maleStudents+femaleStudents;
    const sections=safe.maleSections+safe.femaleSections;
    const maleGroups=safe.maleSections ? safe.maleSections*Math.ceil(safe.malePerSection/safe.groupSize) : 0;
    const femaleGroups=safe.femaleSections ? safe.femaleSections*Math.ceil(safe.femalePerSection/safe.groupSize) : 0;
    const groups=maleGroups+femaleGroups;
    let baseQty=0;
    let effectiveRepeats=safe.repeats;

    if(safe.basis==='per_student') baseQty=students*safe.qtyPerUse;
    else if(safe.basis==='per_group') baseQty=groups*safe.qtyPerUse;
    else if(safe.basis==='per_section') baseQty=sections*safe.qtyPerUse;
    else if(safe.basis==='per_experiment') baseQty=safe.qtyPerUse;
    else {
      baseQty=Math.max(groups,sections,1)*safe.qtyPerUse;
      effectiveRepeats=1;
    }

    const grossNeedUsage=(baseQty*effectiveRepeats)*(1+(safe.wastePercent/100));
    const grossNeed=convertQty(grossNeedUsage,safe.usageUnit,safe.requestUnit);
    return {
      ...safe,
      unit:safe.requestUnit,
      maleStudents,
      femaleStudents,
      students,
      sections,
      groups,
      baseQty,
      effectiveRepeats,
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
      const key=[
        normalizeKey(row.itemNameAr||row.itemNameEn),
        normalizeKey(row.requestUnit),
        normalizeKey(mainDepartment),
        normalizeKey(section)
      ].join('|');
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
          experiments:new Set()
        });
      }
      const agg=map.get(key);
      if(row.itemNameAr && !agg.itemNameAr) agg.itemNameAr=row.itemNameAr;
      if(row.itemNameEn && !agg.itemNameEn) agg.itemNameEn=row.itemNameEn;
      if(appliesToFirstTerm(row.semester)) agg.term1Gross+=row.grossNeed;
      if(appliesToSecondTerm(row.semester)) agg.term2Gross+=row.grossNeed;
      agg.stockAvailable=Math.max(agg.stockAvailable,row.stockAvailable||0);
      agg.evidenceRows.push(row);
      agg.experiments.add(row.experimentName);
      agg.usageUnits.add(row.usageUnit);
    });
    return [...map.values()].map(agg=>{
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
    findMergeTarget
  };
});
