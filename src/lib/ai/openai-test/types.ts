export interface TestResult {
  api: 'responses' | 'chat-completions';
  model: string;
  prompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
}

export interface TestCase {
  name: string;
  prompt: string;
  systemPrompt?: string;
  expectedBehavior: string;
}
