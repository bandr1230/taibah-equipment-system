# دليل رفع ملفات نسخة المتصفح إلى GitHub

## الهدف
هذا الدليل يحدد الملفات المهمة التي يجب رفعها إلى GitHub حتى يعمل برنامج إدارة التجهيزات والمخزون على المتصفح، مع استبعاد الملفات الكبيرة أو المؤقتة أو الخاصة بتطبيق أندرويد.

## الطريقة الأسهل بعد كل تحديث
تم تجهيز سكربت ينشئ مجلدًا جاهزًا للرفع باسم:

`github_upload`

بعد كل تحديث شغل من جذر المشروع:

```bash
npm run prepare:github
```

سيقوم السكربت بالآتي:

- حذف محتوى `github_upload` السابق فقط.
- نسخ ملفات نسخة المتصفح المهمة من المشروع الأصلي.
- إضافة ملف `README_GITHUB_UPLOAD.md` داخل الحزمة.
- عدم حذف أو تعديل الملفات الأصلية في المشروع.

بعد ذلك ارفع محتوى مجلد `github_upload` إلى GitHub.

## الملفات الأساسية للتشغيل
هذه الملفات مطلوبة لتشغيل البرنامج في المتصفح:

- `index.html`
- `style.css`
- `app.js`
- `data.js`
- `need-engine.js`
- `ai-analyzer.js`
- `supabase-config.js`
- `supabase-adapter.js`
- `manifest.webmanifest`
- `service-worker.js`
- `taibah-logo.png`
- `icons/icon-192.png`
- `icons/icon-512.png`

## صفحة الرابط العام
هذه الملفات مطلوبة إذا أردت تشغيل روابط الأصول أو QR:

- `public-asset.html`
- `public-asset.js`

## ملفات Supabase
هذه الملفات مهمة إذا كان التشغيل متصلًا بقاعدة Supabase أو دوال التحليل:

- `supabase_schema.sql`
- `supabase/functions/ai-analyzer/index.ts`
- `supabase/functions/ai-analyzer/README.md`

ملاحظة: لا ترفع أي مفاتيح سرية أو `service_role` إلى GitHub. ملف `supabase-config.js` يجب أن يحتوي فقط على إعدادات عامة آمنة مثل رابط المشروع ومفتاح anon إذا كان مستخدمًا من المتصفح.

## ملفات البناء والاختبار والنشر
هذه الملفات مفيدة حتى يستطيع GitHub أو Vercel أو أي مطور بناء النسخة:

- `package.json`
- `package-lock.json`
- `scripts/build-web.mjs`
- `scripts/smoke-check.mjs`
- `scripts/verify-ownership-signature.mjs`
- `vercel.json`
- `.vercelignore`
- `.gitignore`

## ملفات توثيق اختيارية
ليست مطلوبة لتشغيل البرنامج، لكنها مفيدة للفهم والصيانة:

- `PERMISSIONS_MATRIX.md`
- `SUPPORT_WORKFLOW.md`
- `docs/01_project_overview.md`
- `docs/02_permissions_model.md`
- `docs/03_inventory_logic.md`
- `docs/04_assets_and_public_links.md`
- `docs/05_need_evidence.md`
- `docs/06_supabase_and_data_flow.md`
- `docs/07_support_requests.md`
- `docs/08_reports_and_exports.md`
- `docs/10_decisions_log.md`

## لا ترفع هذه الملفات عادة
هذه الملفات ليست مطلوبة لنسخة المتصفح، وقد تزيد حجم المستودع أو تسبب تشويشًا:

- `node_modules/`
- `www/`
- `android/`
- `taibah-apk/`
- `_archive_unused_files/`
- `_archive_removed_ai_assistant_*/`
- `reports/`
- أي ملف `*.apk`
- أي ملف `*.aab`
- أي ملف `*.zip`
- أي ملف `*.log`
- ملفات التقارير المؤقتة مثل `*_REPORT.md`
- ملفات اعتماد الاختبارات المؤقتة مثل `*_PASSED.md`

## أمر Git مقترح للملفات الأساسية
يمكنك استخدام هذا الأمر كبداية:

```bash
git add .gitignore .vercelignore vercel.json package.json package-lock.json \
  index.html style.css app.js data.js need-engine.js ai-analyzer.js \
  supabase-config.js supabase-adapter.js supabase_schema.sql \
  public-asset.html public-asset.js manifest.webmanifest service-worker.js \
  taibah-logo.png icons scripts supabase/functions/ai-analyzer
```

ولإضافة التوثيق الاختياري:

```bash
git add PERMISSIONS_MATRIX.md SUPPORT_WORKFLOW.md docs
```

## طريقة اختبار قبل الرفع
شغل هذه الأوامر قبل رفع التغييرات:

```bash
npm run test:smoke
npm run build
npm run verify:ownership
```

## ملاحظة عن مجلد `www`
مجلد `www` ناتج من أمر البناء `npm run build`. لا تحتاج رفعه إلى GitHub إذا كان النشر سيشغل البناء من المصدر. أما إذا كنت سترفع ملفات ثابتة يدويًا فقط، فيمكن أخذ محتوى `www` بعد البناء ورفعه لمنصة الاستضافة، لكن لا يفضل تخزينه داخل المستودع.

## ملاحظة عن GitHub Pages
إذا استخدمت GitHub Pages مباشرة بدون Vercel، فمسار `/public/asset/:id` الموجود في `vercel.json` لن يعمل كـ rewrite. عندها استخدم الرابط المباشر:

`public-asset.html?id=...`

أما إذا استخدمت Vercel مع GitHub، فملف `vercel.json` يدعم تحويل `/public/asset/:id` إلى صفحة العرض العامة.
