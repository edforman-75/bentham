import type { TestResult, TestCase } from './types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function testChatCompletions(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();

  const messages: { role: string; content: string }[] = [];
  if (testCase.systemPrompt) {
    messages.push({ role: 'system', content: testCase.systemPrompt });
  }
  messages.push({ role: 'user', content: testCase.prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  if (data.error) {
    throw new Error(data.error.message);
  }

  return {
    api: 'chat-completions',
    model: data.model,
    prompt: testCase.prompt,
    response: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    latencyMs,
    cost: estimateCost(data.usage.prompt_tokens, data.usage.completion_tokens),
  };
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  // GPT-4o pricing (as of Jan 2026)
  const inputCostPer1M = 2.50;
  const outputCostPer1M = 10.00;

  return (inputTokens / 1_000_000 * inputCostPer1M) +
         (outputTokens / 1_000_000 * outputCostPer1M);
}
