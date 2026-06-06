# ai-analyzer Edge Function

هذه الدالة هي الربط الحقيقي لوحدة المحلل الذكي. الواجهة تستدعي:

```js
supabase.functions.invoke("ai-analyzer", { body })
```

وتقوم الدالة بقراءة بيانات النظام من `public.app_state`، وتحاول أيضًا قراءة الجداول الاسمية إن وجدت مثل:
`maintenance_assets`, `maintenance_tickets`, `preventive_maintenance_plans`,
`preventive_maintenance_records`, `items`, `issue_requests`, `stock_movements`.

المتغيرات المطلوبة في Supabase:

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_APP_STATE_ID=taibah-university-demo
OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
```

تشغيل محلي:

```bash
supabase functions serve ai-analyzer --env-file .env.local
```

نشر:

```bash
supabase functions deploy ai-analyzer
```

اختبار:

```bash
supabase functions invoke ai-analyzer --body '{"analysis_type":"maintenance"}'
```

الواجهة لا تحتوي على أي مفتاح OpenAI. إذا لم يوجد `OPENAI_API_KEY` سترجع الدالة:

```json
{
  "meta": {
    "used_ai": false,
    "used_fallback": true,
    "message": "تم استخدام التحليل المحلي لأن مفتاح الذكاء الاصطناعي غير مضبوط."
  }
}
```

وعند نجاح الذكاء الاصطناعي ترجع:

```json
{
  "meta": {
    "used_ai": true,
    "used_fallback": false,
    "message": "تم تشغيل التحليل الذكي بنجاح."
  }
}
```
