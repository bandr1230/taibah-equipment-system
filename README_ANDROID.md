# منصة التجهيزات التعليمية - Android APK

هذا المشروع يعمل كواجهة ويب ثابتة، وتم تجهيزه ليتم تغليفه كتطبيق Android تجريبي باستخدام Capacitor بدون تغيير منطق البرنامج الحالي.

## ملف الدخول

- الملف الرئيسي: `index.html`
- ملفات الواجهة الأساسية: `style.css`, `app.js`, `data.js`, `supabase-adapter.js`, `supabase-config.js`, `need-engine.js`, `ai-analyzer.js`
- صفحة QR العامة: `public-asset.html`, `public-asset.js`
- مجلد البناء: `www`

## تثبيت الحزم

```bash
npm install
```

## بناء ملفات الويب

```bash
npm run build
```

ينسخ هذا الأمر ملفات التشغيل اللازمة إلى مجلد `www`، ويتجاهل `node_modules`, `android`, `.git`, `tmp`, `scratch`, `output`, و`www` القديم.

## إضافة Android لأول مرة

```bash
npm run android:add
```

أو مباشرة:

```bash
npx cap add android
```

## مزامنة Android بعد أي تعديل

```bash
npm run android:sync
```

أو:

```bash
npm run build
npx cap sync android
```

## فتح المشروع في Android Studio

```bash
npm run android:open
```

## تشغيل التطبيق على جهاز أو محاكي

```bash
npm run android:run
```

## بناء APK تجريبي

بعد إنشاء مجلد `android`:

```bash
cd android
.\gradlew assembleDebug
```

غالبًا ستجد ملف APK هنا:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## إعدادات التطبيق

- appId: `sa.edu.taibah.equipment`
- appName: `منصة التجهيزات التعليمية`
- webDir: `www`
- Android scheme: `https`
- PWA name: `منصة التجهيزات التعليمية`
- PWA short_name: `التجهيزات`

## Android permissions

بعد إنشاء مجلد `android`، راجع:

```text
android/app/src/main/AndroidManifest.xml
```

وتأكد من وجود:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

لا تضف صلاحية `CAMERA` إلا عند تفعيل ميزة مسح QR/Barcode بالكاميرا داخل التطبيق فعليًا.

## اسم التطبيق في Android

بعد إنشاء مجلد `android`، راجع:

```text
android/app/src/main/res/values/strings.xml
```

وتأكد من:

```xml
<string name="app_name">منصة التجهيزات التعليمية</string>
```

## ملاحظات الاتصال

- التطبيق يعتمد على HTTPS للاتصال بـ Supabase وCDN.
- لا يتم تفعيل `cleartextTraffic` افتراضيًا.
- Service Worker لا يخزن طلبات Supabase أو API ولا يخزن طلبات POST.
- إذا ظهرت مشاكل CORS أو Mixed Content في WebView، عالج مصدر الرابط أو إعدادات الخادم بدل فتح إعدادات غير آمنة.

## ملاحظات الجوال

- الواجهة RTL من `index.html`.
- الجداول الحالية تعتمد على التمرير الأفقي عند الحاجة.
- عند اختبار APK، راجع شاشة الدخول، القائمة الجانبية، التقارير، صفحة QR العامة، وصفحات الصيانة والمحلل الذكي.
