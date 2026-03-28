const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const {
  GROQ_MODEL,
  GROQ_MAX_TOKENS,
  GROQ_TEMPERATURE,
  GROQ_RATE_LIMIT_DELAY_MS,
} = require('../config/constants');

// ── Singleton client ──────────────────────────────────────────
let groqClient = null;

function getClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new AppError(
        'GROQ_API_KEY is not set. Get one at https://console.groq.com',
        500,
        'MISSING_GROQ_KEY'
      );
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// ── Rate limiter (simple token bucket) ────────────────────────
let lastRequestTime = 0;

async function rateLimitWait() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < GROQ_RATE_LIMIT_DELAY_MS) {
    const waitMs = GROQ_RATE_LIMIT_DELAY_MS - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();
}

// ── Core completion function with retry ───────────────────────

/**
 * Send a chat completion request to Groq.
 *
 * @param {object} params
 * @param {string} params.systemPrompt - System-level instructions
 * @param {string} params.userPrompt   - User message / code input
 * @param {object} [params.options]
 * @param {string} [params.options.model]
 * @param {number} [params.options.maxTokens]
 * @param {number} [params.options.temperature]
 * @param {boolean} [params.options.jsonMode] - Request JSON response format
 * @param {number} [params.options.maxRetries] - Retry count on failure
 * @returns {Promise<string>} AI response text
 */
async function complete({ systemPrompt, userPrompt, options = {} }) {
  let {
    model = GROQ_MODEL,
    maxTokens = GROQ_MAX_TOKENS,
    temperature = GROQ_TEMPERATURE,
    jsonMode = false,
    maxRetries = 3,
  } = options;

  const client = getClient();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rateLimitWait();

      const requestParams = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: 1,
        stream: false,
      };

      // JSON mode for structured outputs
      if (jsonMode) {
        requestParams.response_format = { type: 'json_object' };
      }

      const startTime = Date.now();
      const completion = await client.chat.completions.create(requestParams);
      const duration = Date.now() - startTime;

      const response = completion.choices[0]?.message?.content;
      const usage = completion.usage;

      logger.debug('Groq completion', {
        model,
        durationMs: duration,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      });

      if (!response) {
        throw new Error('Empty response from Groq');
      }

      return response;

    } catch (err) {
      lastError = err;

      // Rate limit — wait and retry
      if (err.status === 429) {
        // SMART FALLBACK: If 70B is rate limited, switch to 8B for the next retry
        if (model.includes('70b')) {
          logger.warn(`AI Model ${model} hit TPD limit. Switching to llama-3.1-8b-instant for immediate completion...`);
          // We update the local variable used for the next iteration
          model = 'llama-3.1-8b-instant';
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const retryAfter = 5; // Fixed 5s for fast demo
        logger.warn(`Groq rate limited. Retrying in ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      // Server errors — retry with backoff
      if (err.status >= 500) {
        const backoff = Math.pow(2, attempt) * 1000;
        logger.warn(`Groq server error ${err.status}. Retrying in ${backoff}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      // Client errors — don't retry
      if (err.status >= 400 && err.status < 500) {
        throw new AppError(
          `Groq API error: ${err.message}`,
          `Groq API error: ${err.message} (Status: ${err.status || err.response?.status}, Data: ${JSON.stringify(err.response?.data || err.error || {})})`,
          502,
          'GROQ_API_ERROR'
        );
      }

      // Network errors — retry
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        const backoff = Math.pow(2, attempt) * 1000;
        logger.warn(`Groq network error. Retrying in ${backoff}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      // For any other unhandled error, rethrow
      throw err;
    }
  }

  throw new AppError(
    `Groq API failed after ${maxRetries} retries: ${lastError?.message} (Last Status: ${lastError?.status || lastError?.response?.status})`,
    502,
    'GROQ_API_EXHAUSTED'
  );
}

// ── Domain-specific analysis functions ────────────────────────

/**
 * Generate a concise summary of a single file.
 * @param {string} filePath
 * @param {string} content
 * @param {string} language
 * @returns {Promise<string>}
 */
async function summarizeFile(filePath, content, language, model = GROQ_MODEL) {
  return complete({
    systemPrompt: `You are a senior software engineer analyzing source code.
Provide a concise summary (2-4 sentences) of what this file does, its key exports/classes, and its role in the codebase.
Be specific, not generic. Mention function names, class names, and patterns used.`,
    userPrompt: `File: ${filePath}\nLanguage: ${language}\n\n${content}`,
    options: { maxTokens: 300, temperature: 0.1, model },
  });
}

/**
 * Generate an architecture overview from codebase context.
 * @param {string} codeContext
 * @param {string} repoName
 * @returns {Promise<string>}
 */
async function generateArchitectureOverview(codeContext, repoName, model = GROQ_MODEL) {
  return complete({
    systemPrompt: `You are a senior software architect. Given the following raw codebase files, generate a comprehensive architecture overview.

Include:
1. **Project Type**: What kind of application this is
2. **Tech Stack**: Languages, frameworks, libraries detected
3. **Architecture Pattern**: MVC, microservices, monolith, etc.
4. **Key Components**: Main modules/layers and their responsibilities
5. **Entry Points**: Where the application starts
6. **Data Flow**: How data moves through the system
7. **External Dependencies**: APIs, databases, services used

Format as clean Markdown.`,
    userPrompt: `Repository: ${repoName}\n\nCodebase:\n${codeContext}`,
    options: { maxTokens: 4096, temperature: 0.2 },
  });
}

/**
 * Generate a "Start Here" guide for new developers.
 * @param {string} architectureOverview
 * @param {string} codeContext
 * @param {string} repoName
 * @returns {Promise<string>}
 */
async function generateStartHereGuide(architectureOverview, codeContext, repoName) {
  return complete({
    systemPrompt: `You are a senior developer creating an onboarding guide for a new team member.
Based on the architecture overview and raw codebase, generate a practical "Start Here" guide.

Include:
1. **What This Project Does** (1-2 sentences)
2. **Prerequisites** (tools, accounts, etc.)
3. **Setup Steps** (how to run locally)
4. **Codebase Tour** (which files to read first and why, in order)
5. **Key Concepts** (domain terms, patterns to understand)
6. **Common Tasks** (how to add a feature, fix a bug, etc.)
7. **Where to Find Things** (directory guide)

Be practical and specific. Format as Markdown.`,
    userPrompt: `Repository: ${repoName}\n\nArchitecture:\n${architectureOverview}\n\nCodebase:\n${codeContext}`,
    options: { maxTokens: 4096, temperature: 0.3 },
  });
}

/**
 * Analyze data flow across codebase.
 * @param {string} codeContext
 * @param {string} repoName
 * @returns {Promise<string>}
 */
async function analyzeDataFlow(codeContext, repoName) {
  return complete({
    systemPrompt: `You are a senior software engineer analyzing data flow in a codebase.

Identify and describe:
1. **Data Sources**: Where data enters the system (APIs, user input, files, DB)
2. **Data Transformations**: How data is processed/transformed
3. **Data Storage**: Where data is persisted
4. **Data Outputs**: Where data exits (API responses, UI, exports)
5. **Key Data Models/Schemas**: Main data structures
6. **Flow Diagram**: Describe the flow in a way that could be visualized

Format as Markdown. Include a text-based flow diagram if possible.`,
    userPrompt: `Repository: ${repoName}\n\nCode excerpts:\n${codeContext}`,
    options: { maxTokens: 4096, temperature: 0.2 },
  });
}

/**
 * Ask a natural language question about code.
 * @param {string} question
 * @param {Array<{filePath: string, content: string}>} relevantChunks
 * @returns {Promise<string>}
 */
async function askAboutCode(question, relevantChunks) {
  const context = relevantChunks
    .map(c => `--- ${c.filePath} ---\n${c.content}`)
    .join('\n\n');

  return complete({
    systemPrompt: `You are a senior software engineer helping a developer understand a codebase.
Answer the question based on the provided code context. Be specific and reference exact file paths,
function names, and line numbers when possible. If the answer cannot be determined from the provided
context, say so clearly rather than guessing.`,
    userPrompt: `Question: ${question}\n\nRelevant code:\n${context}`,
    options: { maxTokens: 2048, temperature: 0.1 },
  });
}

/**
 * Detect code quality issues in a file chunk.
 * @param {string} filePath
 * @param {string} content
 * @param {string} language
 * @returns {Promise<object>}
 */
async function detectCodeIssues(filePath, content, language) {
  const response = await complete({
    systemPrompt: `You are a code quality analyzer. Analyze the given code and return a JSON object with:
{
  "complexity": { "score": 1-10, "details": "explanation" },
  "deadCode": [ { "line": number, "code": "snippet", "reason": "why it's dead" } ],
  "securityIssues": [ { "severity": "high|medium|low", "line": number, "issue": "description", "fix": "suggestion" } ],
  "suggestions": [ "improvement suggestion" ]
}

Be precise. Only flag real issues, not style preferences. Return valid JSON only.`,
    userPrompt: `File: ${filePath}\nLanguage: ${language}\n\n${content}`,
    options: { maxTokens: 2048, temperature: 0.1, jsonMode: true },
  });

  try {
    return JSON.parse(response);
  } catch {
    logger.warn(`Failed to parse JSON from code analysis for ${filePath}`);
    return {
      complexity: { score: 0, details: 'Analysis failed to return valid JSON' },
      deadCode: [],
      securityIssues: [],
      suggestions: [],
      rawResponse: response,
    };
  }
}

/**
 * Process multiple chunks with rate limiting.
 * @param {Array} items - Items to process
 * @param {Function} processFn - async function(item) → result
 * @param {number} [concurrency=1] - Max concurrent requests
 * @returns {Promise<Array>}
 */
async function processWithRateLimit(items, processFn, concurrency = 1) {
  const results = [];
  const total = items.length;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(item => processFn(item))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.warn('Batch item failed', { error: result.reason?.message });
        results.push(null);
      }
    }

    const processed = Math.min(i + concurrency, total);
    if (processed < total) {
      logger.info(`AI progress: ${processed}/${total} items processed`);
    }
  }

  return results;
}

/**
 * Perform a semantic 'Discovery Phase' to find relevant code files.
 * @param {string} fileTree
 * @param {string} repoName
 * @returns {Promise<string[]>}
 */
async function discoverImportantFiles(fileTree, repoName) {
  // Ultra-Aggressive Truncation: Fixes Groq 6000 TPM limit (413 errors)
  const truncatedTree = fileTree.length > 5000 ? fileTree.substring(0, 5000) + '\n...[TRUNCATED_DUE_TO_SIZE]' : fileTree;

  const response = await complete({
    systemPrompt: `You are a source code discovery engine. Given a repository file tree, identify the 15-20 most 'architecturally significant' files. 
Focus on:
- Entry points (main.js, app.py, index.ts)
- Controllers, Routes, Models
- Core business logic
- Config files (package.json, Dockerfile)
Exclude: images, tests, minor styles, binary files.

Return a JSON object: { "importantFiles": ["path/to/file1", "path/to/file2"] }`,
    userPrompt: `Repository: ${repoName}\n\nFile Tree:\n${truncatedTree}`,
    options: { maxTokens: 1000, temperature: 0, jsonMode: true }
  });

  try {
    const parsed = JSON.parse(response);
    return parsed.importantFiles || [];
  } catch (err) {
    logger.warn('Failed to parse discovery JSON');
    return [];
  }
}

module.exports = {
  complete,
  summarizeFile,
  generateArchitectureOverview,
  generateStartHereGuide,
  analyzeDataFlow,
  askAboutCode,
  detectCodeIssues,
  processWithRateLimit,
  discoverImportantFiles, // New
};
