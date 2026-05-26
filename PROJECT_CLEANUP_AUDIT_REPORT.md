# تقرير فحص وتنظيف ملفات المشروع

## 1. إجمالي عدد الملفات التي تم فحصها
- تم فحص 246 ملفًا قبل النقل، مع استبعاد أي مسار داخل `_archive_unused_files` لأنه لم يكن موجودًا عند بدء العملية.
- بعد النقل أصبح مجلد `_archive_unused_files` يحتوي على 168 ملفًا، لأن الأرشيف السابق `archive-cleanup-20260513` كان يحتوي ملفات فرعية كثيرة.

## 2. قائمة الملفات الأساسية التي تم الحفاظ عليها
تم الحفاظ على ملفات التشغيل والنشر والواجهة الأساسية، ومنها:

- `index.html`
- `app.js`
- `data.js`
- `style.css`
- `manifest.webmanifest`
- `service-worker.js`
- `package.json`
- `vercel.json`
- `capacitor.config.json`
- `supabase-config.js`
- `supabase-adapter.js`
- `supabase_schema.sql`
- `need-engine.js`
- `ai-analyzer.js`
- `public-asset.html`
- `public-asset.js`
- `taibah-logo.png`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `scripts/build-web.mjs`
- `www/`
- `supabase/`
- `node_modules/`

تم تحديث `scripts/build-web.mjs` فقط لضمان أن ملفات المساعد التي يستدعيها `index.html` يتم نسخها إلى `www` أثناء البناء. هذا تعديل بناء/نشر وليس تعديلًا في منطق البرنامج.

## 3. قائمة الملفات التي تم نقلها إلى _archive_unused_files

| الملف/المجلد المنقول | سبب النقل |
|---|---|
| `archive-cleanup-20260513/` | أرشيف تنظيف سابق يحتوي مخرجات عروض وصور وملفات scratch قديمة، وغير مستخدم في تشغيل البرنامج الحالي. |
| `CLEANUP_REPORT.md` | تقرير تنظيف قديم غير مستدعى من البرنامج. |
| `docs_forbidden_terms_scan.md` | تقرير فحص نصي مؤقت سابق ولا يدخل ضمن قاعدة المعرفة المعتمدة. |
| `SYSTEM_AUDIT_REVIEW.md` | تقرير مراجعة قديم وغير مستدعى في التشغيل. |
| `docs/09_codex_commands.md` | ملف أوامر كودكس مستبعد من knowledge chunks وليس مرجعًا تشغيليًا للبرنامج. |
| `docs/docs_cleanup_audit.md` | تقرير تنظيف docs سابق وغير مطلوب للتشغيل. |
| `data/chunks.json` | ملف chunks قديم لمسار RAG تجريبي وليس مستخدمًا من الواجهة الحالية التي تعتمد `knowledge_chunks/program_chunks.json`. |
| `src/01_load_documents.py` | سكريبت RAG/بحث تجريبي قديم غير مستدعى من `package.json` أو HTML. |
| `src/02_chunk_documents.py` | سكريبت RAG/تقطيع تجريبي قديم غير مستدعى من التشغيل. |
| `src/03_keyword_search.py` | سكريبت بحث كلمات قديم غير مستخدم في واجهة المساعد الحالية. |
| `src/04_smart_keyword_search.py` | سكريبت بحث تجريبي قديم غير مستخدم في البرنامج الحالي. |
| `need-engine.test.js` | ملف اختبار منفصل غير مرتبط بسكربت `package.json` ولا يدخل في التشغيل. |
| `operational_data_adapter_test.md` | ملف تعليمات اختبار Console قديم بعد اعتماد Phase 3A. |
| `supabase-test.html` | صفحة اختبار Supabase منفصلة وغير مستخدمة في تشغيل البرنامج الرئيسي. |
| `knowledge_chunks/test_search_chunks.js` | ملف اختبار محرك بحث Phase 2 ولم يعد جزءًا من التشغيل أو الواجهة. |
| `knowledge_chunks/ASSISTANT_AI_DEMO_KNOWLEDGE_LOAD_FIX_REPORT.md` | تقرير إصلاح مؤقت بعد اعتماد تقارير نهائية لاحقة. |
| `knowledge_chunks/ASSISTANT_AI_DEMO_SERVER_UPDATE_REPORT.md` | تقرير تحديث خادم demo مؤقت وليس ملف اعتماد نهائي. |
| `knowledge_chunks/ASSISTANT_AI_DEMO_UI_POLISH_REPORT.md` | تقرير تلميع واجهة سابق استبدله تقرير الجاهزية النهائي. |
| `knowledge_chunks/ASSISTANT_AI_DEMO_USER_CONTEXT_FIX_REPORT.md` | تقرير إصلاح مؤقت لسياق المستخدم في صفحة demo. |
| `knowledge_chunks/ASSISTANT_GENERATIVE_FULL_MOCK_REPORT.md` | تقرير تنفيذ مرحلي قديم، وتم حفظ ملخص المرحلة النهائي. |
| `knowledge_chunks/ASSISTANT_GENERATIVE_MOCK_REPORT.md` | تقرير Mock أولي قديم بعد اعتماد تقارير نهائية. |
| `knowledge_chunks/ASSISTANT_GENERATIVE_MOCK_TEST_PASSED.md` | تقرير اختبار سابق، والاعتماد النهائي محفوظ في `ASSISTANT_AI_MOCK_FINAL_TEST_PASSED.md`. |
| `knowledge_chunks/ASSISTANT_LLM_SERVER_SECURITY_REVIEW.md` | تقرير مراجعة أمان سابق، والاعتماد النهائي محفوظ في `ASSISTANT_LLM_SERVER_READY_NOT_ACTIVATED.md`. |
| `knowledge_chunks/ASSISTANT_OPERATIONAL_GENERATION_FIX_REPORT.md` | تقرير إصلاح مرحلي بعد استقرار واجهة المساعد. |
| `knowledge_chunks/ASSISTANT_ROUTER_DEMO_REPORT.md` | تقرير demo مؤقت للراوتر بعد اعتماد مراحل لاحقة. |
| `knowledge_chunks/ASSISTANT_ROUTER_DEMO_SERVER_REPORT.md` | تقرير خادم demo مؤقت وغير لازم للتشغيل. |
| `knowledge_chunks/ASSISTANT_ROUTER_EXTERNAL_EXAMPLES_CLEANUP.md` | تقرير تنظيف أمثلة خارجية مؤقت. |
| `knowledge_chunks/ASSISTANT_ROUTER_PHASE2_BROWSER_SEARCH_REPORT.md` | تقرير ربط بحث Phase 2 داخل المتصفح، واستبدلته واجهة المساعد النهائية. |
| `knowledge_chunks/ASSISTANT_ROUTER_PHASE2_LOAD_FIX_REPORT.md` | تقرير إصلاح تحميل مؤقت. |
| `knowledge_chunks/chunks_build_report.md` | تقرير بناء chunks مؤقت، مع الحفاظ على `program_chunks.json` والاعتمادات النهائية. |
| `knowledge_chunks/keywords_improvement_report.md` | تقرير تحسين كلمات مفتاحية مؤقت بعد اعتماد Phase 2. |
| `knowledge_chunks/live_data_guard_report.md` | تقرير إصلاح حارس البيانات الفعلية، والاعتماد النهائي محفوظ. |
| `knowledge_chunks/PHASE3_DATA_SOURCE_AUDIT.md` | تقرير تحليل مصادر بيانات مرحلي بعد اكتمال Phase 3A. |
| `knowledge_chunks/PHASE3A_ADAPTER_LOAD_CHECK.md` | تقرير فحص تحميل مؤقت. |
| `knowledge_chunks/PHASE3A_ADAPTER_TEMP_LOAD_REPORT.md` | تقرير تحميل مؤقت بعد تجاوز المرحلة. |
| `knowledge_chunks/PHASE3A_CONSOLE_TEST_PASSED.md` | تقرير اختبار Console مرحلي بعد وجود `PHASE3A_STABLE_SUMMARY.md`. |
| `knowledge_chunks/PHASE3A_GLOBAL_SCOPE_FIX_PASSED.md` | تقرير اختبار إصلاح نطاق مرحلي بعد استقرار Phase 3A. |
| `knowledge_chunks/PHASE3A_GLOBAL_SCOPE_FIX_REPORT.md` | تقرير إصلاح نطاق مرحلي. |
| `knowledge_chunks/PHASE3A_INTENT_ROUTER_LOAD_REPORT.md` | تقرير تحميل راوتر مؤقت. |
| `knowledge_chunks/PHASE3A_INTENT_ROUTER_REPORT.md` | تقرير بناء راوتر مرحلي بعد دمجه لاحقًا. |
| `knowledge_chunks/PHASE3A_INTENT_ROUTER_TEST_PASSED.md` | تقرير اختبار راوتر مرحلي. |
| `knowledge_chunks/PHASE3A_OPERATIONAL_ADAPTER_REPORT.md` | تقرير بناء Phase 3A مرحلي بعد ملخص الاستقرار. |
| `knowledge_chunks/PHASE3A_SUPPORT_PRIVACY_TEST_PASSED.md` | تقرير اختبار خصوصية مرحلي بعد اعتماد الملخص المستقر. |
| `knowledge_chunks/rag_search_test_report.md` | تقرير اختبار بحث RAG سابق. |
| `knowledge_chunks/rag_search_test_report_v2.md` | تقرير اختبار بحث RAG سابق بعد التحسين. |
| `knowledge_chunks/search_demo_build_report.md` | تقرير بناء demo بحث قديم. |
| `knowledge_chunks/search_engine_build_report.md` | تقرير بناء محرك بحث قديم. |
| `knowledge_chunks/search_engine_guard_report.md` | تقرير حارس بحث قديم. |
| `knowledge_chunks/search_engine_test_report.md` | تقرير اختبار محرك بحث قديم. |

## 4. سبب نقل كل ملف
الأسباب موضحة في الجدول أعلاه. القاعدة العامة للنقل كانت:

- تقرير مؤقت قديم استبدله اعتماد نهائي.
- ملف اختبار منفصل غير مستخدم في تشغيل البرنامج.
- سكريبت RAG قديم لا يدخل في `index.html` أو `package.json`.
- أرشيف سابق أو ملفات scratch ومخرجات عروض.
- صفحة اختبار منفصلة لا تدخل في تشغيل البرنامج الرئيسي.

## 5. قائمة الملفات المشكوك فيها التي لم يتم نقلها
تم ترك الملفات التالية لأنها قد تكون مفيدة أو مرتبطة بالتشغيل أو التوثيق، حتى لو لم تكن كلها مستدعاة مباشرة:

- `README_ANDROID.md`
- `README_CHANGES_v5_8.txt`
- `README_DEMO.md`
- `README_DEPLOY.txt`
- `SUPPORT_WORKFLOW.md`
- `PERMISSIONS_MATRIX.md`
- `assistant_ai_demo.html`
- `assistant_router_demo.html`
- `assistant_router_demo_server.js`
- `assistant_llm_server.js`
- `knowledge_chunks/search_chunks.js`
- `knowledge_chunks/search_demo.html`
- `knowledge_chunks/search_demo_server.js`
- `knowledge_chunks/LIVE_DATA_GUARD_PASSED.md`
- `knowledge_chunks/PHASE2_APPROVAL.md`
- `knowledge_chunks/PHASE2_STABLE_SUMMARY.md`
- `knowledge_chunks/PHASE3A_STABLE_SUMMARY.md`
- `knowledge_chunks/ASSISTANT_GENERATIVE_STAGE_SUMMARY.md`
- `knowledge_chunks/ASSISTANT_EXECUTIVE_BRIEF.md`
- `knowledge_chunks/ASSISTANT_AI_INTERNAL_DEMO_READY_REPORT.md`
- `knowledge_chunks/ASSISTANT_AI_MOCK_FINAL_TEST_PASSED.md`
- `knowledge_chunks/ASSISTANT_LLM_SERVER_READY_NOT_ACTIVATED.md`
- `knowledge_chunks/ASSISTANT_IN_APP_INTEGRATION_REPORT.md`

## 6. قائمة الملفات التي يجب عدم حذفها نهائيًا
لا تحذف نهائيًا:

- ملفات التشغيل: `index.html`, `app.js`, `data.js`, `style.css`.
- ملفات Supabase: `supabase-config.js`, `supabase-adapter.js`, `supabase_schema.sql`, ومجلد `supabase/`.
- ملفات النشر: `package.json`, `vercel.json`, `capacitor.config.json`, `scripts/build-web.mjs`, ومجلد `www/`.
- ملفات PWA: `manifest.webmanifest`, `service-worker.js`, `icons/`.
- ملفات المساعد المعتمدة:
  - `operational_data_adapter.js`
  - `assistant_intent_router.js`
  - `assistant_context_builder.js`
  - `assistant_answer_guard.js`
  - `assistant_llm_mock.js`
  - `assistant_llm_server.js`
  - `assistant_ai_orchestrator.js`
  - `assistant_ai_demo.html`
  - `assistant_router_demo.html`
  - `assistant_router_demo_server.js`
- ملفات المعرفة المعتمدة:
  - `knowledge_chunks/program_chunks.json`
  - `knowledge_chunks/PHASE2_APPROVAL.md`
  - `knowledge_chunks/PHASE2_STABLE_SUMMARY.md`
  - `knowledge_chunks/PHASE3A_STABLE_SUMMARY.md`
  - `knowledge_chunks/ASSISTANT_GENERATIVE_STAGE_SUMMARY.md`
  - `knowledge_chunks/ASSISTANT_EXECUTIVE_BRIEF.md`
  - `knowledge_chunks/ASSISTANT_AI_INTERNAL_DEMO_READY_REPORT.md`
  - `knowledge_chunks/ASSISTANT_AI_MOCK_FINAL_TEST_PASSED.md`
  - `knowledge_chunks/ASSISTANT_LLM_SERVER_READY_NOT_ACTIVATED.md`
- ملفات docs الأساسية:
  - `docs/01_project_overview.md`
  - `docs/02_permissions_model.md`
  - `docs/03_inventory_logic.md`
  - `docs/04_assets_and_public_links.md`
  - `docs/05_need_evidence.md`
  - `docs/06_supabase_and_data_flow.md`
  - `docs/07_support_requests.md`
  - `docs/08_reports_and_exports.md`
  - `docs/10_decisions_log.md`

## 7. هل يوجد احتمال أن النقل يؤثر على تشغيل البرنامج؟
الاحتمال منخفض جدًا.

تمت مراجعة الاستدعاءات الأساسية:

- لا توجد إشارة إلى `_archive_unused_files` داخل `index.html`.
- لا توجد إشارة إلى `_archive_unused_files` داخل `assistant_ai_demo.html`.
- الملفات الأساسية موجودة بعد النقل.
- ملفات المساعد التي يستدعيها `index.html` موجودة.
- `knowledge_chunks/program_chunks.json` ما زال موجودًا.
- تم تشغيل `node --check` على:
  - `app.js`
  - `data.js`
  - `scripts/build-web.mjs`
  - ملفات المساعد الأساسية المختارة.
- تم تشغيل `npm.cmd run build` بنجاح.
- بعد البناء، تأكد وجود:
  - `www/assistant_context_builder.js`
  - `www/assistant_ai_orchestrator.js`
  - `www/knowledge_chunks/program_chunks.json`

ملاحظة: فشل أمر `npm run build` عبر PowerShell بسبب سياسة تشغيل `npm.ps1` في Windows، ثم تم تشغيله بنجاح باستخدام `npm.cmd run build`.

## 8. توصية نهائية

| التصنيف | التوصية |
|---|---|
| الملفات المنقولة إلى `_archive_unused_files` | آمن للحذف لاحقًا بعد فترة مراجعة، لكن لا تحذف الآن. |
| ملفات README وملفات demo المعتمدة | تحتاج مراجعة قبل أي حذف. |
| ملفات التشغيل والمساعد والمعرفة المعتمدة | لا تحذف. |

التوصية العملية:

اترك `_archive_unused_files` داخل المشروع لمدة دورة اختبار واحدة على الأقل. إذا لم تظهر أي مشكلة تشغيل أو نشر، يمكن لاحقًا حذف محتوياته نهائيًا بقرار مستقل.
