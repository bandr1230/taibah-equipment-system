const STORAGE_KEY='taibah_university_supply_system_v5_5';

let COLLEGE_OPTIONS=['كلية الصيدلة','كلية التمريض','كلية الطب','كلية الأسنان'];
let SECTION_OPTIONS=['المواد الكيميائية','المستهلكات التعليمية','الأجهزة التعليمية'];
let USER_SECTION_OPTIONS=['الكل',...SECTION_OPTIONS];
const UNIT_OPTIONS=['كيلو','جرام','لتر','مليتر','حبة','عدد','كرتون','صندوق','علبة','قطعة','جهاز'];

const PERMISSIONS=[
  {key:'view_executive',label:'عرض اللوحة التنفيذية'},
  {key:'view_dashboard',label:'عرض لوحة القطاع'},
  {key:'view_items',label:'عرض الأصناف والمخزون'},
  {key:'add_item',label:'إضافة صنف'},
  {key:'edit_item',label:'تعديل صنف'},
  {key:'delete_item',label:'حذف صنف'},
  {key:'view_transactions',label:'عرض الصرف والحركات'},
  {key:'add_issue',label:'إنشاء طلب صرف'},
  {key:'approve_issue',label:'اعتماد طلبات الصرف'},
  {key:'view_exchange',label:'عرض طلب الدعم بين القطاعات'},
  {key:'request_support',label:'إنشاء طلب دعم من قطاع آخر'},
  {key:'approve_support',label:'اعتماد طلبات الدعم'},
  {key:'view_needs',label:'عرض طلبات الاحتياج'},
  {key:'create_need',label:'رفع طلب احتياج'},
  {key:'approve_need',label:'اعتماد طلبات الاحتياج'},
  {key:'view_need_evidence',label:'عرض شواهد الاحتياج'},
  {key:'create_need_evidence',label:'إضافة وتعديل شواهد الاحتياج'},
  {key:'view_equipment',label:'عرض المتابعة المركزية لإدارة التجهيزات'},
  {key:'view_reports',label:'عرض صفحة التقارير'},
  {key:'report_senior',label:'تقرير الإدارة العليا'},
  {key:'report_inventory',label:'تقرير المخزون العام'},
  {key:'report_transactions',label:'تقرير الصرف والحركات'},
  {key:'report_needs',label:'تقرير طلبات الاحتياج'},
  {key:'report_support',label:'تقرير الدعم بين القطاعات'},
  {key:'report_low',label:'تقرير الأصناف تحت الحد الأدنى'},
  {key:'view_audit',label:'عرض سجل التدقيق'},
  {key:'manage_users',label:'إدارة المستخدمين والصلاحيات'},
  {key:'manage_org',label:'إدارة القطاعات والأقسام والترميز'}
];

const REPORT_PERMISSION_KEYS=['report_senior','report_inventory','report_transactions','report_needs','report_support','report_low'];

const DEFAULT_DATA={
  settings:{
    colleges:[
      {name:'كلية الصيدلة',code:'PHRM'},
      {name:'كلية التمريض',code:'NURS'},
      {name:'كلية الطب',code:'MED'},
      {name:'كلية الأسنان',code:'DENT'},
      {name:'إدارة التجهيزات',code:'EQPM'}
    ],
    sections:[
      {name:'المواد الكيميائية',code:'CHM'},
      {name:'المستهلكات التعليمية',code:'CON'},
      {name:'الأجهزة التعليمية',code:'DEV'}
    ]
  },
  users:[
    {id:1,fullName:'بندر بن خلف الجابري',username:'admin',password:'123',role:'admin',jobTitle:'مدير النظام',college:'إدارة التجهيزات',department:'الكل',phone:'0500000000',email:'admin@taibahu.edu.sa',nationalId:'1000000000',isActive:true,permissions:['all'],createdAt:'2026-04-11T08:00'},
    {id:2,fullName:'مسؤول كلية الصيدلة',username:'pharmacy',password:'123',role:'user',jobTitle:'مسؤول مخزون الكلية',college:'كلية الصيدلة',department:'المواد الكيميائية',phone:'0501111111',email:'pharmacy@taibahu.edu.sa',nationalId:'1000000001',isActive:true,permissions:['view_executive','view_dashboard','view_items','add_item','edit_item','view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support','view_needs','create_need','view_need_evidence','create_need_evidence','view_reports','report_inventory','report_transactions','report_needs','report_support','report_low'],createdAt:'2026-04-11T08:30'},
    {id:3,fullName:'مسؤول كلية التمريض',username:'nursing',password:'123',role:'user',jobTitle:'مسؤول مخزون الكلية',college:'كلية التمريض',department:'المستهلكات التعليمية',phone:'0502222222',email:'nursing@taibahu.edu.sa',nationalId:'1000000002',isActive:true,permissions:['view_executive','view_dashboard','view_items','add_item','edit_item','view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support','view_needs','create_need','view_need_evidence','create_need_evidence','view_reports','report_inventory','report_transactions','report_needs','report_support','report_low'],createdAt:'2026-04-11T09:00'},
    {id:4,fullName:'مسؤول كلية الطب',username:'medicine',password:'123',role:'user',jobTitle:'مسؤول مخزون الكلية',college:'كلية الطب',department:'الأجهزة التعليمية',phone:'0503333333',email:'medicine@taibahu.edu.sa',nationalId:'1000000003',isActive:true,permissions:['view_executive','view_dashboard','view_items','add_item','edit_item','view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support','view_needs','create_need','view_need_evidence','create_need_evidence','view_reports','report_inventory','report_transactions','report_needs','report_support','report_low'],createdAt:'2026-04-11T09:20'},
    {id:5,fullName:'مسؤول كلية الأسنان',username:'dentistry',password:'123',role:'user',jobTitle:'مسؤول مخزون الكلية',college:'كلية الأسنان',department:'المستهلكات التعليمية',phone:'0504444444',email:'dentistry@taibahu.edu.sa',nationalId:'1000000004',isActive:true,permissions:['view_executive','view_dashboard','view_items','add_item','edit_item','view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support','view_needs','create_need','view_need_evidence','create_need_evidence','view_reports','report_inventory','report_transactions','report_needs','report_support','report_low'],createdAt:'2026-04-11T09:40'},
    {id:6,fullName:'حساب إدارة التجهيزات',username:'equipment',password:'123',role:'user',jobTitle:'إدارة التجهيزات',college:'إدارة التجهيزات',department:'الكل',phone:'0505555555',email:'equipment@taibahu.edu.sa',nationalId:'1000000005',isActive:true,permissions:['view_executive','view_dashboard','view_items','add_item','edit_item','delete_item','view_transactions','add_issue','approve_issue','view_exchange','request_support','approve_support','view_needs','create_need','approve_need','view_equipment','view_reports','report_senior','report_inventory','report_transactions','report_needs','report_support','report_low','view_audit','manage_users','manage_org'],createdAt:'2026-04-11T10:00'}
  ],
  items:[
    {id:1,college:'كلية الصيدلة',name:'حمض الكلوريدريك HCl',nameAr:'حمض الكلوريدريك HCl',nameEn:'Hydrochloric Acid',code:'PHRM-CHM-001',section:'المواد الكيميائية',unit:'لتر',qty:45,minQty:10,location:'R-A1',notes:'',serialNumber:'',deviceStatus:'',createdAt:'2026-04-10T09:15',createdBy:1},
    {id:2,college:'كلية الصيدلة',name:'هيدروكسيد الصوديوم NaOH',nameAr:'هيدروكسيد الصوديوم NaOH',nameEn:'Sodium Hydroxide',code:'PHRM-CHM-002',section:'المواد الكيميائية',unit:'كيلو',qty:8,minQty:5,location:'R-A2',notes:'',serialNumber:'',deviceStatus:'',createdAt:'2026-04-10T10:10',createdBy:1},
    {id:3,college:'كلية الصيدلة',name:'إيثانول 96%',nameAr:'إيثانول 96%',nameEn:'Ethanol 96%',code:'PHRM-CHM-003',section:'المواد الكيميائية',unit:'لتر',qty:120,minQty:20,location:'R-B1',notes:'',serialNumber:'',deviceStatus:'',createdAt:'2026-04-10T11:00',createdBy:2},
    {id:4,college:'كلية التمريض',name:'قفازات لاتكس M',nameAr:'قفازات لاتكس M',nameEn:'Latex Gloves M',code:'NURS-CON-001',section:'المستهلكات التعليمية',unit:'صندوق',qty:25,minQty:10,location:'S-C1',notes:'',serialNumber:'',deviceStatus:'',createdAt:'2026-04-10T11:30',createdBy:3},
    {id:5,college:'كلية الأسنان',name:'كمامات طبية',nameAr:'كمامات طبية',nameEn:'Medical Masks',code:'DENT-CON-001',section:'المستهلكات التعليمية',unit:'علبة',qty:0,minQty:5,location:'D-S2',notes:'',serialNumber:'',deviceStatus:'',createdAt:'2026-04-10T12:00',createdBy:5},
    {id:6,college:'كلية الطب',name:'مجهر تعليمي',nameAr:'مجهر تعليمي',nameEn:'Teaching Microscope',code:'MED-DEV-001',section:'الأجهزة التعليمية',unit:'جهاز',qty:6,minQty:1,location:'LAB-D1',notes:'أجهزة معمل الأحياء الدقيقة',serialNumber:'MIC-TA-2026-001',deviceStatus:'يعمل',createdAt:'2026-04-10T12:20',createdBy:4},
    {id:7,college:'كلية الطب',name:'جهاز طرد مركزي تعليمي',nameAr:'جهاز طرد مركزي تعليمي',nameEn:'Teaching Centrifuge',code:'MED-DEV-002',section:'الأجهزة التعليمية',unit:'جهاز',qty:2,minQty:1,location:'LAB-D2',notes:'مخصص للتدريب العملي',serialNumber:'CEN-TA-2026-002',deviceStatus:'تحت الصيانة',createdAt:'2026-04-10T12:40',createdBy:4}
  ],
  transactions:[
    {id:1,type:'receive',status:'approved',itemId:1,college:'كلية الصيدلة',section:'المواد الكيميائية',qty:20,unit:'لتر',transactionAt:'2026-04-11T08:15',notes:'دفعة استلام للمختبر',createdBy:2},
    {id:2,type:'issue',status:'pending',itemId:4,college:'كلية التمريض',section:'المستهلكات التعليمية',qty:5,unit:'صندوق',transactionAt:'2026-04-11T10:20',notes:'طلب صرف لمعمل الطلاب',createdBy:3},
    {id:3,type:'receive',status:'approved',itemId:6,college:'كلية الطب',section:'الأجهزة التعليمية',qty:1,unit:'جهاز',transactionAt:'2026-04-11T11:00',notes:'إضافة جهاز جديد للمعمل',createdBy:4}
  ],
  needsRequests:[
    {id:1,requestNo:'NR-2026-0001',college:'كلية الأسنان',section:'المستهلكات التعليمية',itemNameAr:'قفازات فحص',itemNameEn:'Examination Gloves',qty:20,unit:'صندوق',notes:'احتياج للعيادات التعليمية',status:'pending',workflowStage:'مراجعة إدارة التجهيزات',createdAt:'2026-04-12T09:30',createdBy:5}
  ],
  needEvidence:[],
  supportRequests:[
    {id:1,requestNo:'SR-2026-0001',itemId:1,itemName:'حمض الكلوريدريك HCl',section:'المواد الكيميائية',fromCollege:'كلية الطب',toCollege:'كلية الصيدلة',qty:3,unit:'لتر',supportType:'دعم تشغيلي',notes:'احتياج عاجل لتجربة تعليمية',attachmentName:'',status:'pending_owner',workflowStage:'بانتظار موافقة الجهة المالكة',createdAt:'2026-04-12T10:00',createdBy:4}
  ],
  auditLogs:[
    {id:1,action:'تهيئة النظام',targetType:'system',targetId:'-',college:'جامعة طيبة',department:'الكل',details:'تم إنشاء بيانات تجريبية نظيفة للعرض',createdAt:'2026-04-12T08:00',createdBy:1}
  ]
};

function deepClone(obj){return JSON.parse(JSON.stringify(obj))}
function loadData(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw){localStorage.setItem(STORAGE_KEY,JSON.stringify(DEFAULT_DATA));return deepClone(DEFAULT_DATA)}
  try{return JSON.parse(raw)}catch(e){localStorage.setItem(STORAGE_KEY,JSON.stringify(DEFAULT_DATA));return deepClone(DEFAULT_DATA)}
}
let db=loadData();
if(!db.settings)db.settings=deepClone(DEFAULT_DATA.settings);
if(!Array.isArray(db.settings.colleges))db.settings.colleges=deepClone(DEFAULT_DATA.settings.colleges);
if(!Array.isArray(db.settings.sections))db.settings.sections=deepClone(DEFAULT_DATA.settings.sections);
COLLEGE_OPTIONS=db.settings.colleges.filter(x=>x.name!=='إدارة التجهيزات').map(x=>x.name);
SECTION_OPTIONS=db.settings.sections.map(x=>x.name);
USER_SECTION_OPTIONS=['الكل',...SECTION_OPTIONS];
if(!Array.isArray(db.needsRequests))db.needsRequests=[];
if(!Array.isArray(db.supportRequests))db.supportRequests=[];
if(!Array.isArray(db.needEvidence))db.needEvidence=[];
if(!Array.isArray(db.auditLogs))db.auditLogs=[];
db.users=(db.users||[]).map(u=>{
  const perms=Array.isArray(u.permissions)?[...u.permissions]:[];
  if(u.role==='admin')return {...u,college:u.college||u.department||'كلية الصيدلة',department:u.department||'الكل',permissions:['all']};
  if(perms.includes('view_dashboard')&&!perms.includes('view_executive'))perms.unshift('view_executive');
  if(perms.includes('view_transactions')&&!perms.includes('view_needs'))perms.push('view_needs');
  if(perms.includes('view_needs')&&!perms.includes('create_need'))perms.push('create_need');
  if(perms.includes('view_needs')&&!perms.includes('view_need_evidence'))perms.push('view_need_evidence');
  if(perms.includes('create_need')&&!perms.includes('create_need_evidence'))perms.push('create_need_evidence');
  if((u.college==='إدارة التجهيزات'||perms.includes('manage_users'))&&!perms.includes('view_equipment'))perms.push('view_equipment');
  if((u.college==='إدارة التجهيزات'||perms.includes('manage_users'))&&!perms.includes('approve_need'))perms.push('approve_need');
  if(perms.includes('view_reports')){for(const key of REPORT_PERMISSION_KEYS){if(!perms.includes(key))perms.push(key)}}
  if((u.college==='إدارة التجهيزات'||perms.includes('manage_users'))&&!perms.includes('view_audit'))perms.push('view_audit');
  return {...u,college:u.college||u.department||'كلية الصيدلة',department:u.department||'الكل',permissions:[...new Set(perms)]};
});
db.items=(db.items||[]).map(item=>({...item,college:item.college||'كلية الصيدلة',nameAr:item.nameAr||item.name||'',nameEn:item.nameEn||''}));
db.transactions=(db.transactions||[]).map(t=>({...t,college:t.college||(db.items||[]).find(i=>i.id===t.itemId)?.college||'كلية الصيدلة'}));

function freshDefaultDb(){
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function isCompleteDbShape(value){
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.users) &&
    value.users.some(u=>u.username==='admin' && u.password) &&
    Array.isArray(value.items) &&
    Array.isArray(value.transactions) &&
    Array.isArray(value.needsRequests) &&
    Array.isArray(value.supportRequests)
  );
}
function repairDbIfNeeded(sourceLabel='unknown'){
  if(!isCompleteDbShape(db)){
    console.warn('تم إصلاح بيانات النظام لأنها غير مكتملة:', sourceLabel, db);
    db = freshDefaultDb();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
  if(!Array.isArray(db.users) || !db.users.some(u=>u.username==='admin')){
    const fresh = freshDefaultDb();
    db.users = fresh.users;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
}
repairDbIfNeeded('initial-load');

let state={currentUser:null,currentPage:'executive',search:'',collegeFilter:'all',sectionFilter:'all',modal:null,editId:null,transactionType:'issue',reportTab:'inventory',sidebarOpen:false};
