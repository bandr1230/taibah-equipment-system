تعليمات نشر مختصرة:

1) ارفع ملفات الواجهة إلى GitHub أو Vercel أو أي استضافة ثابتة.
2) نفذ Redeploy مع Clear Cache إذا كانت هناك نسخة قديمة.
3) شغل ملف supabase_schema.sql داخل Supabase SQL Editor عند أول تهيئة أو بعد إضافة الجداول الجديدة.
4) اربط الواجهة بملف supabase-config.js الحالي حتى تحفظ البيانات في Supabase.
5) لا تضع أي مفتاح OpenAI أو مفتاح ذكاء اصطناعي داخل ملفات الواجهة.

المحلل الذكي:

1) اضبط أسرار Supabase Edge Function:
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_APP_STATE_ID=taibah-university-demo
   OPENAI_API_KEY
   OPENAI_MODEL=gpt-4.1-mini

2) انشر الدالة:
   supabase functions deploy ai-analyzer

3) اختبر الدالة:
   supabase functions invoke ai-analyzer --body '{"analysis_type":"maintenance"}'

4) عند عدم توفر الدالة تستخدم الواجهة تحليلًا محليًا احتياطيًا. أما إذا كانت الدالة منشورة لكن OPENAI_API_KEY غير مضبوط، فالدالة نفسها ترجع نتيجة fallback مع meta.used_fallback=true وتحفظها في ai_analysis_runs و ai_recommendations.

ملاحظة: تصدير Excel يعتمد على مكتبة XLSX المحملة من CDN في index.html.
