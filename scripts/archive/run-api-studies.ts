/**
 * API-Based Studies for Ranjan Comparison
 *
 * Study 4: OpenAI Chat API - US IP (direct) - "in India" suffix
 * Study 5: OpenAI Chat API - India IP (proxy) - "in India" suffix
 * Study 6: OpenAI Web Search API - US IP - user_location=IN - "in India" suffix
 * Study 7: OpenAI Web Search API - India IP (proxy) - user_location=IN - "in India" suffix
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

const RANJAN_QUERIES = [
  "Which are the best budget dog food brands online?",
  "Can you suggest the best treat brands for dogs online?",
  "Which are the best dog food brands with high reviews?",
  "Which are the best dog food brands recommended by vets?",
  "Can you list a popular pet food brand with good meat content?",
  "Which brands offer gluten-free dog treats my dog will enjoy?",
  "Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?",
  "Which are the top healthy vegetarian dog biscuit brands available online?",
  "What are the best-tasting treat brands for dogs under ₹1000?",
  "Which brands offer low-calorie chicken dog treats?",
  "Which are the best dog treat brands for medium-sized dogs?",
  "Can you suggest some good Heads Up For Tails dog food options?",
  "Which brands offer the highest-rated gluten-free chicken dog biscuits?",
  "Can you suggest trusted brands that make healthy dog treats for puppies online?",
  "Which are the most recommended brands for crunchy dog biscuits for adult dogs?",
  "Which brand makes the most comfortable dog beds for small dogs in India?",
  "What's a trusted brand that offers interactive dog toys for large dogs?",
  "Which company has the best chew toys for small dogs that last long?",
  "Can you suggest a reliable brand that sells dog harnesses for puppies?",
  "What's one of the top Indian brands for wet cat food?"
];

// Cherry Proxy config for India
const INDIA_PROXY = {
  host: 'aus.360s5.com',
  port: 3600,
  auth: '10016865-zone-custom-region-IN-sessid-APIStudy-sessTime-120:WFRqYTzM'
};

interface StudyResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  timestamp: string;
  durationMs: number;
}

interface StudyData {
  studyId: string;
  studyName: string;
  studyNumber: number;
  surface: string;
  ipSource: string;
  localizationMethod: string;
  timestamp: string;
  successCount: number;
  totalCount: number;
  results: StudyResult[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function modifyQueryForIndia(query: string): string {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('in india') || lowerQuery.includes('indian')) {
    return query;
  }
  return query.replace(/\?$/, '') + ' in India?';
}

async function callChatCompletionsAPI(query: string, useProxy: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: query }],
      max_tokens: 2000
    });

    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    if (useProxy) {
      // For proxy, we need to use HTTP CONNECT tunnel
      const proxyReq = http.request({
        host: INDIA_PROXY.host,
        port: INDIA_PROXY.port,
        method: 'CONNECT',
        path: 'api.openai.com:443',
        headers: {
          'Proxy-Authorization': 'Basic ' + Buffer.from(INDIA_PROXY.auth).toString('base64')
        }
      });

      proxyReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Proxy connection failed: ${res.statusCode}`));
          return;
        }

        const req = https.request({
          ...options,
          socket,
          agent: false
        }, (response) => {
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.error) {
                reject(new Error(json.error.message));
              } else {
                resolve(json.choices[0].message.content);
              }
            } catch (e) {
              reject(new Error(`Parse error: ${body.substring(0, 200)}`));
            }
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });

      proxyReq.on('error', reject);
      proxyReq.end();
    } else {
      // Direct connection
      const req = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              resolve(json.choices[0].message.content);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    }
  });
}

async function callWebSearchAPI(query: string, useProxy: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    // Note: user_location parameter is not supported in current API
    // Localization relies on prompt content ("in India" suffix)
    const data = JSON.stringify({
      model: 'gpt-4o',
      tools: [{ type: 'web_search' }],
      input: query
    });

    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/responses',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    if (useProxy) {
      const proxyReq = http.request({
        host: INDIA_PROXY.host,
        port: INDIA_PROXY.port,
        method: 'CONNECT',
        path: 'api.openai.com:443',
        headers: {
          'Proxy-Authorization': 'Basic ' + Buffer.from(INDIA_PROXY.auth).toString('base64')
        }
      });

      proxyReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Proxy connection failed: ${res.statusCode}`));
          return;
        }

        const req = https.request({
          ...options,
          socket,
          agent: false
        }, (response) => {
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.error) {
                reject(new Error(json.error.message));
              } else {
                // Extract text from responses API output
                const output = json.output || [];
                const textItems = output.filter((item: any) => item.type === 'message');
                if (textItems.length > 0 && textItems[0].content) {
                  const textContent = textItems[0].content.filter((c: any) => c.type === 'output_text');
                  if (textContent.length > 0) {
                    resolve(textContent[0].text);
                  } else {
                    resolve(JSON.stringify(json.output));
                  }
                } else {
                  resolve(JSON.stringify(json));
                }
              }
            } catch (e) {
              reject(new Error(`Parse error: ${body.substring(0, 200)}`));
            }
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });

      proxyReq.on('error', reject);
      proxyReq.end();
    } else {
      const req = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              // Extract text from responses API output
              const output = json.output || [];
              const textItems = output.filter((item: any) => item.type === 'message');
              if (textItems.length > 0 && textItems[0].content) {
                const textContent = textItems[0].content.filter((c: any) => c.type === 'output_text');
                if (textContent.length > 0) {
                  resolve(textContent[0].text);
                } else {
                  resolve(JSON.stringify(json.output));
                }
              } else {
                resolve(JSON.stringify(json));
              }
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    }
  });
}

async function runStudy(
  studyNum: number,
  studyName: string,
  surface: string,
  apiType: 'chat' | 'websearch',
  useProxy: boolean,
  ipSource: string,
  localizationMethod: string,
  addIndiaSuffix: boolean = true
): Promise<StudyData> {
  console.log('\n' + '═'.repeat(70));
  console.log(`  STUDY ${studyNum}: ${studyName}`);
  console.log('═'.repeat(70));
  console.log(`Surface: ${surface}`);
  console.log(`IP Source: ${ipSource}`);
  console.log(`Localization: ${localizationMethod}`);
  console.log('─'.repeat(70));

  const results: StudyResult[] = [];

  for (let i = 0; i < RANJAN_QUERIES.length; i++) {
    const originalQuery = RANJAN_QUERIES[i];
    const submittedQuery = addIndiaSuffix ? modifyQueryForIndia(originalQuery) : originalQuery;

    console.log(`\n[${i + 1}/20] "${originalQuery.substring(0, 50)}..."`);
    if (submittedQuery !== originalQuery) {
      console.log(`  → Modified: "${submittedQuery.substring(0, 55)}..."`);
    }

    const queryStart = Date.now();
    try {
      let response: string;
      if (apiType === 'chat') {
        response = await callChatCompletionsAPI(submittedQuery, useProxy);
      } else {
        response = await callWebSearchAPI(submittedQuery, useProxy);
      }
      const duration = Date.now() - queryStart;

      results.push({
        queryIndex: i + 1,
        originalQuery,
        submittedQuery,
        response,
        timestamp: new Date().toISOString(),
        durationMs: duration
      });

      console.log(`  ✅ (${duration}ms) ${response.substring(0, 100).replace(/\n/g, ' ')}...`);

    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        originalQuery,
        submittedQuery,
        response: `ERROR: ${error}`,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - queryStart
      });
    }

    // Save intermediate every 5
    if ((i + 1) % 5 === 0) {
      const intermediatePath = `studies/study${studyNum}-intermediate-${i + 1}.json`;
      fs.writeFileSync(intermediatePath, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved to ${intermediatePath}`);
    }

    // Rate limiting delay
    await delay(2000);
  }

  const studyData: StudyData = {
    studyId: `study${studyNum}-${studyName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    studyName,
    studyNumber: studyNum,
    surface,
    ipSource,
    localizationMethod,
    timestamp: new Date().toISOString(),
    successCount: results.filter(r => !r.response.startsWith('ERROR')).length,
    totalCount: results.length,
    results
  };

  return studyData;
}

async function main() {
  const studyNum = parseInt(process.argv[2] || '4');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set in .env');
    process.exit(1);
  }

  // Ensure studies directory exists
  if (!fs.existsSync('studies')) {
    fs.mkdirSync('studies');
  }

  let studyData: StudyData;
  let outputPath: string;

  switch (studyNum) {
    case 4:
      studyData = await runStudy(
        4,
        'OpenAI Chat API - US IP - India Suffix',
        'OpenAI Chat Completions API',
        'chat',
        false,
        'US (direct)',
        'Prompt suffix "in India"'
      );
      outputPath = 'studies/study4-chat-api-us-india-suffix.json';
      break;

    case 5:
      studyData = await runStudy(
        5,
        'OpenAI Chat API - India IP - India Suffix',
        'OpenAI Chat Completions API',
        'chat',
        true,
        'India (Cherry Proxy)',
        'Prompt suffix "in India" + India IP'
      );
      outputPath = 'studies/study5-chat-api-india-proxy-india-suffix.json';
      break;

    case 6:
      studyData = await runStudy(
        6,
        'OpenAI Web Search API - US IP - India Suffix',
        'OpenAI Responses API with web_search',
        'websearch',
        false,
        'US (direct)',
        'Prompt suffix "in India" (web search enabled)'
      );
      outputPath = 'studies/study6-websearch-api-us-india-suffix.json';
      break;

    case 7:
      studyData = await runStudy(
        7,
        'OpenAI Web Search API - India IP - India Suffix',
        'OpenAI Responses API with web_search',
        'websearch',
        true,
        'India (Cherry Proxy)',
        'Prompt suffix "in India" + India IP (web search enabled)'
      );
      outputPath = 'studies/study7-websearch-api-india-proxy-india-suffix.json';
      break;

    case 8:
      studyData = await runStudy(
        8,
        'OpenAI Chat API - US IP - Original',
        'OpenAI Chat Completions API',
        'chat',
        false,
        'US (direct)',
        'Original prompts (no modification)',
        false  // No India suffix
      );
      outputPath = 'studies/study8-chat-api-us-original.json';
      break;

    case 9:
      studyData = await runStudy(
        9,
        'OpenAI Web Search API - US IP - Original',
        'OpenAI Responses API with web_search',
        'websearch',
        false,
        'US (direct)',
        'Original prompts (web search enabled)',
        false  // No India suffix
      );
      outputPath = 'studies/study9-websearch-api-us-original.json';
      break;

    case 10:
      studyData = await runStudy(
        10,
        'OpenAI Chat API - India IP - Original',
        'OpenAI Chat Completions API',
        'chat',
        true,  // Use India proxy
        'India (Cherry Proxy)',
        'Original prompts (no modification)',
        false  // No India suffix
      );
      outputPath = 'studies/study10-chat-api-india-original.json';
      break;

    case 11:
      studyData = await runStudy(
        11,
        'OpenAI Web Search API - India IP - Original',
        'OpenAI Responses API with web_search',
        'websearch',
        true,  // Use India proxy
        'India (Cherry Proxy)',
        'Original prompts (web search enabled)',
        false  // No India suffix
      );
      outputPath = 'studies/study11-websearch-api-india-original.json';
      break;

    default:
      console.error(`Unknown study number: ${studyNum}`);
      process.exit(1);
  }

  fs.writeFileSync(outputPath, JSON.stringify(studyData, null, 2));

  console.log('\n' + '═'.repeat(70));
  console.log(`  STUDY ${studyNum} COMPLETE`);
  console.log('═'.repeat(70));
  console.log(`Success: ${studyData.successCount}/${studyData.totalCount}`);
  console.log(`Saved to: ${outputPath}`);
}

main().catch(console.error);
