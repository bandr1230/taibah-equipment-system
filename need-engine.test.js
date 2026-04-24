const assert = require('assert');
const NeedEngine = require('./need-engine.js');

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to equal ${expected}`);
}

function testUnitConversion() {
  assert.strictEqual(NeedEngine.canonicalUnit('ملليلتر'), 'مليتر');
  assert.strictEqual(NeedEngine.defaultRequestUnit('مليتر'), 'لتر');
  assert.strictEqual(NeedEngine.defaultRequestUnit('جرام'), 'كيلو');
  approx(NeedEngine.convertQty(250, 'مليتر', 'لتر'), 0.25);
  approx(NeedEngine.convertQty(1500, 'جرام', 'كيلو'), 1.5);
  assert.strictEqual(NeedEngine.roundQty(0.25), 1);
  assert.strictEqual(NeedEngine.roundQty(1.01), 2);
}

function testPerStudentCalculation() {
  const row = NeedEngine.calcMaterial({
    experimentName: 'معايرة',
    semester: 'الأول',
    repeats: 2,
    maleSections: 2,
    malePerSection: 10,
    femaleSections: 1,
    femalePerSection: 8,
    groupSize: 4,
    itemNameAr: 'إيثانول',
    usageUnit: 'مليتر',
    requestUnit: 'لتر',
    basis: 'per_student',
    qtyPerUse: 10,
    wastePercent: 10,
    stockAvailable: 0
  });

  assert.strictEqual(row.students, 28);
  assert.strictEqual(row.sections, 3);
  assert.strictEqual(row.groups, 8);
  approx(row.grossNeedUsage, 616);
  approx(row.grossNeed, 0.616);
}

function testPerGroupCalculation() {
  const row = NeedEngine.calcMaterial({
    semester: 'الأول',
    repeats: 1,
    maleSections: 1,
    malePerSection: 24,
    femaleSections: 0,
    femalePerSection: 0,
    groupSize: 4,
    itemNameAr: 'أنبوب اختبار',
    usageUnit: 'عدد',
    requestUnit: 'عدد',
    basis: 'per_group',
    qtyPerUse: 2
  });

  assert.strictEqual(row.groups, 6);
  assert.strictEqual(row.grossNeed, 12);
}

function testReusableIgnoresRepeats() {
  const row = NeedEngine.calcMaterial({
    semester: 'الأول',
    repeats: 5,
    maleSections: 1,
    malePerSection: 20,
    groupSize: 5,
    itemNameAr: 'حامل أنابيب',
    usageUnit: 'عدد',
    requestUnit: 'عدد',
    basis: 'reusable',
    qtyPerUse: 1
  });

  assert.strictEqual(row.groups, 4);
  assert.strictEqual(row.effectiveRepeats, 1);
  assert.strictEqual(row.grossNeed, 4);
}

function testAggregateSameItemAcrossExperiments() {
  const rows = [
    {
      experimentName: 'تجربة أ',
      semester: 'الأول',
      repeats: 1,
      maleSections: 1,
      malePerSection: 20,
      groupSize: 4,
      itemNameAr: 'إيثانول',
      usageUnit: 'مليتر',
      requestUnit: 'لتر',
      basis: 'per_student',
      qtyPerUse: 20,
      stockAvailable: 0.5
    },
    {
      experimentName: 'تجربة ب',
      semester: 'الثاني',
      repeats: 1,
      maleSections: 1,
      malePerSection: 25,
      groupSize: 5,
      itemNameAr: 'الايثانول',
      usageUnit: 'مليتر',
      requestUnit: 'لتر',
      basis: 'per_student',
      qtyPerUse: 30,
      stockAvailable: 0.25
    }
  ];
  const aggregates = NeedEngine.aggregateRows(rows, {
    mainDepartment: 'المعامل والمختبرات',
    section: 'المواد الكيميائية'
  });

  assert.strictEqual(aggregates.length, 1);
  const ethanol = aggregates[0];
  assert.strictEqual(ethanol.evidenceRows.length, 2);
  assert.strictEqual(ethanol.stockAvailable, 0.5);
  approx(ethanol.term1Gross, 0.4);
  approx(ethanol.term2Gross, 0.75);
  assert.strictEqual(ethanol.term1Net, 0);
  assert.strictEqual(ethanol.term2Net, 1);
  assert.strictEqual(ethanol.netTotal, 1);
}

function testBothSemestersAndRoundingUp() {
  const aggregates = NeedEngine.aggregateRows([{
    experimentName: 'تجربة مشتركة',
    semester: 'كلاهما',
    repeats: 1,
    maleSections: 1,
    malePerSection: 10,
    groupSize: 5,
    itemNameAr: 'محلول',
    usageUnit: 'مليتر',
    requestUnit: 'لتر',
    basis: 'per_student',
    qtyPerUse: 60,
    stockAvailable: 0
  }], { mainDepartment: 'القسم العام', section: 'المواد الكيميائية' });

  assert.strictEqual(aggregates.length, 1);
  approx(aggregates[0].term1Gross, 0.6);
  approx(aggregates[0].term2Gross, 0.6);
  assert.strictEqual(aggregates[0].term1Net, 1);
  assert.strictEqual(aggregates[0].term2Net, 1);
  assert.strictEqual(aggregates[0].netTotal, 2);
}

function testFindMergeTarget() {
  const ctx = {
    college: 'كلية الصيدلة',
    mainDepartment: 'المعامل والمختبرات',
    section: 'المواد الكيميائية'
  };
  const aggregate = NeedEngine.aggregateRows([{
    experimentName: 'تجربة',
    semester: 'الأول',
    repeats: 1,
    maleSections: 1,
    malePerSection: 1,
    groupSize: 1,
    itemNameAr: 'إيثانول',
    usageUnit: 'مليتر',
    requestUnit: 'لتر',
    basis: 'per_student',
    qtyPerUse: 10
  }], ctx)[0];
  const requests = [
    {
      id: 1,
      itemNameAr: 'الايثانول',
      unit: 'لتر',
      college: 'كلية الصيدلة',
      mainDepartment: 'المعامل والمختبرات',
      section: 'المواد الكيميائية',
      status: 'pending_sector_approval',
      calculationSource: 'educational_evidence_v5_9_1'
    },
    {
      id: 2,
      itemNameAr: 'إيثانول',
      unit: 'لتر',
      college: 'كلية الصيدلة',
      mainDepartment: 'المعامل والمختبرات',
      section: 'المواد الكيميائية',
      status: 'approved',
      calculationSource: 'educational_evidence_v5_9_1'
    }
  ];

  assert.strictEqual(NeedEngine.findMergeTarget(aggregate, ctx, requests).id, 1);
}

const tests = [
  testUnitConversion,
  testPerStudentCalculation,
  testPerGroupCalculation,
  testReusableIgnoresRepeats,
  testAggregateSameItemAcrossExperiments,
  testBothSemestersAndRoundingUp,
  testFindMergeTarget
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}

console.log(`تم اجتياز ${tests.length} اختبارات لمحرك الاحتياج.`);
