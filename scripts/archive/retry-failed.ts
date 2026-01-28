import 'dotenv/config';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';

const INDIA_PROXY = {
  host: 'aus.360s5.com',
  port: 3600,
  auth: '10016865-zone-custom-region-IN-sessid-RetryStudy-sessTime-120:WFRqYTzM'
};

const queries = [
  { study: 10, idx: 3, q: 'Which are the best dog food brands with high reviews?', api: 'chat' },
  { study: 10, idx: 7, q: 'Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?', api: 'chat' },
  { study: 11, idx: 6, q: 'Which brands offer gluten-free dog treats my dog will enjoy?', api: 'websearch' }
];

async function callAPI(query: string, apiType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isChatAPI = apiType === 'chat';
    const data = JSON.stringify(isChatAPI
      ? { model: 'gpt-4o', messages: [{ role: 'user', content: query }], max_tokens: 2000 }
      : { model: 'gpt-4o', tools: [{ type: 'web_search' }], input: query }
    );

    const proxyReq = http.request({
      host: INDIA_PROXY.host,
      port: INDIA_PROXY.port,
      method: 'CONNECT',
      path: 'api.openai.com:443',
      headers: { 'Proxy-Authorization': 'Basic ' + Buffer.from(INDIA_PROXY.auth).toString('base64') }
    });

    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { reject(new Error('Proxy failed')); return; }

      const req = https.request({
        hostname: 'api.openai.com',
        port: 443,
        path: isChatAPI ? '/v1/chat/completions' : '/v1/responses',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
          'Content-Length': Buffer.byteLength(data)
        },
        socket, agent: false
      }, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) reject(new Error(json.error.message));
            else if (isChatAPI) resolve(json.choices[0].message.content);
            else {
              const output = json.output || [];
              const msg = output.find((i: any) => i.type === 'message');
              const txt = msg?.content?.find((c: any) => c.type === 'output_text');
              resolve(txt?.text || JSON.stringify(json));
            }
          } catch (e) {
            reject(new Error('Parse error: ' + body.substring(0, 100)));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    proxyReq.on('error', reject);
    proxyReq.end();
  });
}

async function main() {
  for (const { study, idx, q, api } of queries) {
    console.log('Retrying Study', study, 'Query', idx, '...');
    try {
      const response = await callAPI(q, api);
      console.log('  ✅ Success:', response.substring(0, 80) + '...');

      // Update the JSON file
      const file = study === 10 ? 'studies/study10-chat-api-india-original.json' : 'studies/study11-websearch-api-india-original.json';
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const result = data.results.find((r: any) => r.queryIndex === idx);
      if (result) {
        result.response = response;
        result.timestamp = new Date().toISOString();
        data.successCount = data.results.filter((r: any) => !r.response.startsWith('ERROR')).length;
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        console.log('  💾 Updated', file);
      }
    } catch (e) {
      console.log('  ❌ Failed:', e);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

main();
