import type { TestResult, TestCase } from './types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function testResponsesApi(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      input: testCase.prompt,
      instructions: testCase.systemPrompt || undefined,
    }),
  });

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  if (data.error) {
    throw new Error(data.error.message);
  }

  // Responses API returns different structure
  const outputText = data.output
    .filter((item: any) => item.type === 'message')
    .map((item: any) => item.content.map((c: any) => c.text).join(''))
    .join('');

  return {
    api: 'responses',
    model: data.model,
    prompt: testCase.prompt,
    response: outputText,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    latencyMs,
    cost: estimateCost(data.usage.input_tokens, data.usage.output_tokens),
  };
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  // Same pricing, but Responses API has better cache hits over time
  const inputCostPer1M = 2.50;
  const outputCostPer1M = 10.00;

  return (inputTokens / 1_000_000 * inputCostPer1M) +
         (outputTokens / 1_000_000 * outputCostPer1M);
}
