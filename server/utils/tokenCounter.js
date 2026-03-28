/**
 * Token Counter Utility
 *
 * Approximates token counts for text content.
 * Uses the widely-accepted heuristic: ~4 characters ≈ 1 token for English text.
 * Code tends to be slightly more token-dense, so we apply language-specific multipliers.
 *
 * For production accuracy, replace with tiktoken or the Gemini tokenizer API.
 */

// Language-specific multipliers (code has more special chars → more tokens per char)
const LANGUAGE_MULTIPLIERS = {
  'JavaScript':       0.28,   // ~3.6 chars/token
  'TypeScript':       0.28,
  'Python':           0.27,   // ~3.7 chars/token (more readable)
  'Java':             0.26,   // ~3.8 chars/token (verbose)
  'C++':              0.30,   // ~3.3 chars/token (lots of symbols)
  'Go':               0.27,
  'Rust':             0.29,
  'Ruby':             0.27,
  'PHP':              0.28,
  'HTML':             0.22,   // ~4.5 chars/token (lots of tags)
  'CSS':              0.23,
  'JSON':             0.22,
  'YAML':             0.24,
  'Markdown':         0.25,   // ~4 chars/token (close to English)
  'SQL':              0.26,
};

const DEFAULT_MULTIPLIER = 0.25; // 4 chars per token

/**
 * Estimate the number of tokens in a string.
 * @param {string} text
 * @param {string} [language]
 * @returns {number}
 */
function countTokens(text, language) {
  if (!text) return 0;
  const multiplier = (language && LANGUAGE_MULTIPLIERS[language]) || DEFAULT_MULTIPLIER;
  return Math.ceil(text.length * multiplier);
}

/**
 * Estimate tokens for an array of lines.
 * @param {string[]} lines
 * @param {string} [language]
 * @returns {number}
 */
function countTokensForLines(lines, language) {
  // +1 per line for newline token
  const text = lines.join('\n');
  return countTokens(text, language);
}

module.exports = { countTokens, countTokensForLines };
