# تقرير تحديث مجلد taibah-apk لمطابقة البرنامج الأصلي

تاريخ التحديث: 2026-06-01

## الهدف

تحديث مجلد `taibah-apk` الخاص بتطبيق Android حتى يطابق ملفات البرنامج الأصلية الحالية، بما يشمل ملفات التشغيل، نسخة `www`، وملفات Android التي يعتمد عليها Capacitor.

## سبب التحديث

كانت نسخة `taibah-apk` أقدم من نسخة البرنامج الأصلية:

- `taibah-apk/app.js` كان بحجم أقدم من `app.js` الحالي.
- ملفات `taibah-apk/www` كانت مبنية من نسخة قديمة.
- `taibah-apk/package.json` كان يستخدم `latest` لحزم Capacitor، بينما الأصل يستخدم إصدارات مثبتة.
- `taibah-apk/android/app/src/main/AndroidManifest.xml` كان يحتوي على `android:allowBackup="true"`، بينما الأصل الحالي يعطل النسخ الاحتياطي.

## الملفات التي تمت مزامنتها من الأصل إلى taibah-apk

- `app.js`
- `data.js`
- `ai-analyzer.js`
- `need-engine.js`
- `index.html`
- `public-asset.html`
- `public-asset.js`
- `style.css`
- `service-worker.js`
- `manifest.webmanifest`
- `supabase-adapter.js`
- `supabase-config.js`
- `supabase_schema.sql`
- `taibah-logo.png`
- `package.json`
- `package-lock.json`
- `capacitor.config.json`
- `icons/`
- `scripts/build-web.mjs`
- `scripts/smoke-check.mjs`
- `scripts/verify-ownership-signature.mjs`
- `android/app/src/main/AndroidManifest.xml`

## تحديثات Android المهمة

تمت مطابقة ملف:

`taibah-apk/android/app/src/main/AndroidManifest.xml`

مع الأصل، وأصبح يحتوي على:

```xml
android:allowBackup="false"
android:fullBackupContent="false"
```

## الأوامر التي تم تنفيذها داخل taibah-apk

```bash
npm.cmd install
npm.cmd run verify:ownership
npm.cmd run build
npm.cmd run test:smoke
npx.cmd cap sync android
```

## نتائج التحقق

- تم تثبيت/تحديث الحزم بنجاح.
- فحص بصمة الملكية نجح.
- بناء ملفات `www` داخل `taibah-apk` نجح.
- فحص smoke نجح.
- مزامنة Capacitor مع Android نجحت.
- تمت مقارنة SHA256 لملفات التشغيل الأساسية بين الأصل و`taibah-apk`، وكانت النتيجة مطابقة.

## الملفات التي تأكدت مطابقتها بالهاش

- `app.js`
- `data.js`
- `ai-analyzer.js`
- `need-engine.js`
- `index.html`
- `style.css`
- `service-worker.js`
- `package.json`
- `www/app.js`
- `www/data.js`
- `www/ai-analyzer.js`
- `android/app/src/main/assets/public/app.js`
- `android/app/src/main/AndroidManifest.xml`

## بناء APK

تمت محاولة بناء APK debug عبر:

```bash
.\gradlew.bat assembleDebug
```

لكن البيئة الحالية لا تحتوي على Java/JDK مضبوط:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

لذلك لم يتم إنتاج APK جديد من داخل هذه البيئة. يحتاج البناء النهائي إلى تثبيت JDK وضبط `JAVA_HOME`.

## ملاحظات

- لم يتم حذف الملفات القديمة أو مجلدات العمل داخل `taibah-apk`.
- توجد داخل `taibah-apk` مجلدات غير تشغيلية قديمة مثل `scratch`, `output`, `tmp`, وبعض ملفات العرض السابقة، لكنها لا تدخل في تشغيل Android بعد `cap sync`.
- مصدر تشغيل Android الفعلي أصبح محدثًا داخل:
  - `taibah-apk/www`
  - `taibah-apk/android/app/src/main/assets/public`

## القرار

مجلد `taibah-apk` أصبح مطابقًا للبرنامج الأصلي من ناحية ملفات التشغيل والويب وAndroid assets. يبقى فقط بناء APK النهائي بعد تجهيز Java/JDK.

## تحديث لاحق - إنتاج APK محدث

تم حل عوائق البناء كالتالي:

- استخدام Java المرفق مع Android Studio من:
  `C:\Program Files\Android\Android Studio\jbr`
- إضافة الإعداد التالي إلى:
  `taibah-apk/android/gradle.properties`

```properties
android.overridePathCheck=true
```

وذلك لأن مسار المشروع يحتوي على أحرف عربية على Windows.

بعد ذلك تم تنفيذ:

```bash
.\gradlew.bat assembleDebug
```

ونجح البناء.

ملف APK المحدث:

```text
taibah-apk/android/app/build/outputs/apk/debug/app-debug.apk
```

كما تم إنشاء نسخة أسهل للوصول:

```text
taibah-apk/Taibah-Equipment-latest-debug.apk
```

بيانات ملف APK المحدث:

- الحجم: 4,766,213 bytes
- SHA256: `70997303F96BE50C571456EBA8DD7E7D4572B9ECCD2BF674A6F20389C257EF2E`

تم التأكد أن APK يحتوي على ملفات الويب المحدثة داخل:

- `assets/public/app.js`
- `assets/public/data.js`
- `assets/public/index.html`

## تحديث 2026-06-04 - مقياس جاهزية المعامل

تمت مزامنة تحديث مقياس جاهزية المعامل والمقررات إلى تطبيق Android.

### الملفات المحدثة

- `app.js`
- `style.css`
- `index.html`
- `service-worker.js`

### منع ظهور نسخة قديمة

تم تحديث مفاتيح النسخة داخل `index.html` إلى:

```text
app.js?v=20260604-readiness-v79
style.css?v=20260604-readiness-v79
```

وتم تحديث اسم كاش Service Worker إلى:

```text
educational-equipment-platform-v2-20260604-readiness-v79
```

### التحقق والبناء

- نجح بناء ملفات الويب داخل المشروع الأصلي وداخل `taibah-apk`.
- نجح `test:smoke` في النسختين.
- نجح فحص بصمة الملكية في النسختين.
- نجحت مزامنة Capacitor في النسختين.
- نجح `gradlew assembleDebug`.
- تم فحص محتوى APK والتأكد من وجود طبقة:
  `Laboratory Readiness Operational Routing v7.9`
- تم التأكد أن APK يحتوي على مفاتيح النسخة والكاش الجديدة.

### ملف APK النهائي

```text
Taibah-Equipment-latest-debug.apk
```

- الحجم: 5,024,553 bytes
- SHA256: `FD46D0D40EE0933B20682253FD786D7FF60DEB2A1B3B54236746FB9619C1DDF8`

## تحديث 2026-06-04 - منع تضارب هوية الأصناف

تمت مزامنة إصلاح مطابقة الأصناف إلى تطبيق Android، بحيث لا يستخدم مقياس الجاهزية أو مسار الدعم رصيد صنف عام لصنف ذي مقاس أو سعة أو تركيز محدد.

### قواعد المطابقة المحدثة

- `سحاحة` لا تطابق `سحاحة 50 مل`.
- `سحاحة 25 مل` لا تطابق `سحاحة 50 مل`.
- المقاسات والسعات والتركيزات والأرقام والمواد المميزة أصبحت جزءًا من هوية الصنف.
- تحديد مصدر الدعم وتنفيذ التحويل يتحققان من هوية الصنف داخل الدالة، وليس من واجهة الاختيار فقط.
- يعرض جدول الجاهزية اسم سجل المخزون المطابق أسفل الرصيد الحي.

### نسخة الكاش

```text
app.js?v=20260604-item-identity-v80
style.css?v=20260604-item-identity-v80
educational-equipment-platform-v2-20260604-item-identity-v80
```

### ملف APK النهائي

```text
Taibah-Equipment-latest-debug.apk
```

- الحجم: 5,026,910 bytes
- SHA256: `2D1EEDA84C9360F9BD6AD708BA3A9B4400B9183FF03E3A925FFFCB7A26687614`
