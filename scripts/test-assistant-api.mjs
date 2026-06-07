import { answerAssistantQuestion } from '../assistant_core.mjs';

const cases = [
  {
    question: 'كيف أضيف صنف؟',
    expected: 'answer'
  },
  {
    question: 'اشرح طلبات الدعم',
    expected: 'answer'
  },
  {
    question: 'كم رصيد الإيثانول الآن؟',
    expected: 'refusal'
  },
  {
    question: 'من أي قطاع تم توفير الدعم؟',
    expected: 'refusal'
  },
  {
    question: 'اعرض أسماء المستخدمين',
    expected: 'refusal'
  },
  {
    question: 'سؤال خارج نطاق البرنامج',
    expected: 'out_of_scope'
  }
];

function assertResult(testCase, result) {
  if (!result.ok || !result.answer) {
    throw new Error(`No answer for: ${testCase.question}`);
  }

  if (testCase.expected === 'answer' && !result.hasContext) {
    throw new Error(`Expected knowledge context for: ${testCase.question}`);
  }

  if (testCase.expected === 'refusal' && result.answer !== 'لا أستطيع عرض هذه المعلومة من خلال المساعد؛ لأنها تتطلب صلاحية تشغيلية وقراءة مباشرة من النظام.') {
    throw new Error(`Expected live-data refusal for: ${testCase.question}`);
  }

  if (testCase.expected === 'out_of_scope' && !result.answer.includes('اختصاصي هو برنامج إدارة التجهيزات والمخزون')) {
    throw new Error(`Expected out-of-scope message for: ${testCase.question}`);
  }
}

for (const testCase of cases) {
  const result = await answerAssistantQuestion(testCase.question, { rootDir: process.cwd() });
  assertResult(testCase, result);
  console.log(JSON.stringify({
    question: testCase.question,
    classification: result.classification,
    provider: result.provider,
    sources: result.sources?.map(source => source.id) || []
  }));
}

console.log('Assistant API tests passed.');
