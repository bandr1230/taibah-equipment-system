# تقرير إصلاحات مراجعة PR

## النطاق
تم تنفيذ حزمة إصلاحات آمنة على الفرع الحالي لمعالجة أعلى نقاط المخاطر التي ظهرت في المراجعة:
- الأمان.
- جودة الكود.
- الأخطاء الوظيفية.
- حالات السباق.
- قابلية الاختبار.
- قابلية الصيانة.

## الملفات المعدلة
- `app.js`
- `ai-analyzer.js`
- `supabase_schema.sql`
- `supabase/functions/ai-analyzer/index.ts`
- `service-worker.js`
- `android/app/src/main/AndroidManifest.xml`
- `package.json`
- `package-lock.json`
- `scripts/smoke-check.mjs`
- `www/*` بعد تشغيل build
- `android/app/src/main/assets/public/*` بعد تشغيل Capacitor sync

## الإصلاحات المنفذة

### 1. الأمان
- تم إيقاف صلاحيات `anon` على جدول `public.app_state` في Supabase.
- تم جعل سياسات `app_state` للمستخدمين الموثقين فقط بدل سياسات demo المفتوحة.
- تم تغيير `ai_analysis_runs.sector_id` إلى `text` ليتوافق مع أسماء القطاعات و`all` التي يرسلها التطبيق.
- تم تحديث Edge Function حتى يحفظ `sector_id` كنطاق نصي بدل محاولة تحويله إلى UUID.
- تم تعطيل نسخ بيانات تطبيق Android احتياطيًا:
  - `android:allowBackup="false"`
  - `android:fullBackupContent="false"`
- تم إضافة طبقة escape عامة لخلايا الجداول في `app.js` لتقليل خطر Stored XSS، مع السماح فقط بعناصر HTML التشغيلية المعروفة مثل badges/buttons/radio inputs.

### 2. جودة الكود وقابلية الصيانة
- تم إيقاف تسجيل صفحة المحلل الذكي القديمة داخل `app.js` حتى لا تتنافس مع صفحة المحلل الحالية في `ai-analyzer.js`.
- بقيت دوال النسخة القديمة كمرجع توافق فقط، بينما `ai-analyzer.js` أصبح مالك مسار `analyst`.
- تم تثبيت إصدارات Capacitor بدل استخدام `latest`.

### 3. أخطاء المحلل الذكي
- تم تثبيت نطاق التحليل لحظة تشغيل المحلل:
  - نوع التحليل.
  - القطاع.
  - التاريخ من/إلى.
  - نص البحث.
  - المستخدم.
- لم يعد `aiLatestRun()` يعرض نتيجة قديمة من قطاع أو فلتر مختلف.
- تقارير المحلل الذكي أصبحت تعتمد على النتائج المرئية حسب نطاق المستخدم بدل كل سجلات `db.aiAnalysisRuns`.
- توصيات المحلل في التقارير أصبحت مرتبطة بنتائج مرئية فقط.

### 4. حالات السباق
- تم منع تغيّر الفلاتر أثناء انتظار استجابة التحليل من التأثير على نتيجة محفوظة لاحقًا.
- تم جعل تحديث توصية المحلل البعيد `PATCH` منتظرًا داخل اعتماد/رفض التوصية بدل fire-and-forget.
- تم تحديث Service Worker إلى نسخة جديدة واستخدام network-first لصفحة `index.html` حتى لا تبقى واجهة قديمة عالقة بعد التحديث.

### 5. الاختبارات
- تمت إضافة `npm run test:smoke`.
- فحص smoke يتحقق من:
  - Syntax لملفات JavaScript الأساسية.
  - وجود ملفات السكربت المشار إليها في `index.html`.
  - صحة سكربتات `www` بعد البناء.

## نتائج التشغيل
- `node --check app.js`: نجح.
- `node --check ai-analyzer.js`: نجح.
- `node --check data.js`: نجح.
- `node --check service-worker.js`: نجح.
- `node --check scripts/smoke-check.mjs`: نجح.
- `npm run build`: نجح.
- `npm run test:smoke`: نجح.
- `npx cap sync android`: نجح.
- `node --check www/app.js`: نجح.
- `node --check www/ai-analyzer.js`: نجح.

## ما لم يتم تنفيذه ضمن هذه الحزمة
- بناء APK لم يتم تشغيله لأن Java/JAVA_HOME غير متوفرين في البيئة الحالية.
- لم يتم نقل نظام تسجيل الدخول إلى Supabase Auth؛ ما زالت بيانات المستخدمين التجريبية داخل `data.js` جزءًا من بنية demo الحالية.
- لم يتم حل مشكلة آخر-حفظ-يفوز في مزامنة `app_state` بالكامل؛ هذا يحتاج تصميم backend أو عمليات RPC ذرية.

## ملاحظات تحقق
- تم التأكد أن ملفات المساعد الذكي غير محملة في `index.html` أو `www/index.html`.
- تم التأكد أن صلاحية `use_ai_assistant` تزال من المستخدمين في `data.js`.
- تعذر الفحص البصري عبر Browser plugin بسبب فشل تشغيل Node REPL في sandbox ويندوز، لذلك تم الاعتماد على فحص HTTP/build/smoke.

## التوصية التالية
المرحلة التالية الأفضل تكون فصل المصادقة والمزامنة عن الواجهة:
1. نقل تسجيل الدخول إلى Supabase Auth أو Backend موثق.
2. تحويل عمليات الصرف والدعم والترقيم إلى RPC/transactions ذرية.
3. إلغاء تخزين كلمات المرور داخل `data.js`.
4. إضافة اختبارات تشغيلية لمسارات الدعم والصيانة والمحلل الذكي.
