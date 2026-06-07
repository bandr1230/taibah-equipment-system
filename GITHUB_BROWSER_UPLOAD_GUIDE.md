# دليل رفع نسخة المتصفح إلى GitHub

## الهدف
هذا الدليل يحدد الملفات المهمة التي يجب رفعها إلى GitHub حتى تعمل نسخة المتصفح من برنامج إدارة التجهيزات والمخزون، مع استبعاد الملفات الكبيرة أو المؤقتة أو الخاصة بتطبيق أندرويد.

## الطريقة الأسهل بعد كل تحديث
تم تجهيز سكربت ينشئ مجلدًا جاهزًا للرفع باسم:

`github_upload`

بعد كل تحديث شغل من جذر المشروع:

```bash
npm run prepare:github
```

سيقوم السكربت بالآتي:

- حذف محتوى `github_upload` السابق فقط.
- نسخ أحدث ملفات تشغيل المتصفح من المشروع الأصلي.
- نسخ ملفات المساعد الذكي الموحد وملف API الخاص به.
- نسخ ملف `README_GITHUB_UPLOAD.md` داخل الحزمة.
- عدم حذف أو تعديل الملفات الأصلية في المشروع.

بعد ذلك ارفع محتوى مجلد `github_upload` إلى GitHub.

## ملفات البرنامج الأساسية
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

## صفحة الرابط العام و QR
- `public-asset.html`
- `public-asset.js`

## ملفات Supabase
- `supabase_schema.sql`
- `supabase/functions/ai-analyzer/index.ts`
- `supabase/functions/ai-analyzer/README.md`

ملاحظة: لا ترفع أي مفاتيح سرية أو `service_role`. ملف `supabase-config.js` يجب أن يحتوي فقط على إعدادات عامة آمنة مثل رابط المشروع ومفتاح anon إذا كان مستخدمًا من المتصفح.

## ملفات المساعد الذكي / API
- `assistant_chat.html`
- `assistant_core.mjs`
- `api/assistant/chat.js`
- `knowledge_chunks/program_chunks.json`
- `.env.example`

المساعد يعمل عبر:

`POST /api/assistant/chat`

ولا تضع أي مفتاح API داخل ملفات المتصفح. عند الحاجة لتغيير المزود استخدم متغيرات البيئة في السيرفر فقط:

```env
ASSISTANT_PROVIDER=mock
LOCAL_MODEL_URL=
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_API_KEY=
LLM_API_KEY=
ASSISTANT_MODEL=
LLM_MODEL=
```

## ملفات البناء والاختبار والنشر
- `package.json`
- `package-lock.json`
- `scripts/build-web.mjs`
- `scripts/smoke-check.mjs`
- `scripts/test-assistant-api.mjs`
- `scripts/verify-ownership-signature.mjs`
- `vercel.json`
- `.vercelignore`
- `.gitignore`

## ملفات التوثيق المفيدة
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

## طريقة الاختبار قبل الرفع
شغل هذه الأوامر قبل رفع التغييرات:

```bash
npm run test:assistant
npm run test:smoke
npm run build
npm run verify:ownership
```

## ملاحظة عن مجلد `www`
مجلد `www` ناتج من أمر البناء `npm run build`. لا تحتاج رفعه إلى GitHub إذا كان النشر سيشغل البناء من المصدر. أما إذا كنت سترفع ملفات ثابتة يدويًا فقط، فيمكن أخذ محتوى `www` بعد البناء ورفعه لمنصة الاستضافة، لكن لا يفضل تخزينه داخل المستودع.

## ملاحظة عن GitHub Pages
إذا استخدمت GitHub Pages مباشرة بدون Vercel، فلن تعمل مسارات serverless مثل `/api/assistant/chat` أو rewrite الخاص بـ `/public/asset/:id`. لتشغيل المساعد الذكي تحتاج منصة تدعم API مثل Vercel، أو خادم Node مناسب.
