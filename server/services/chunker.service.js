const { countTokens } = require('../utils/tokenCounter');
const { CHUNK_TOKEN_LIMIT, CHUNK_OVERLAP_TOKENS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * @typedef {Object} FileChunk
 * @property {number} chunkIndex  - 0-based index within the file
 * @property {string} content     - Chunk text with file context header
 * @property {number} tokenCount  - Approximate token count
 * @property {number} startLine   - First line number (1-based)
 * @property {number} endLine     - Last line number (1-based)
 */

/**
 * Split a file's content into token-sized chunks suitable for LLM processing.
 *
 * Strategy:
 * 1. Try to split at logical boundaries (blank lines, function/class defs)
 * 2. Fall back to line-based splitting if no logical boundary found
 * 3. Add file context header to each chunk
 * 4. Maintain overlap between chunks for context continuity
 *
 * @param {string} content   - Raw file content
 * @param {string} filePath  - Relative file path (used in chunk headers)
 * @param {object} [options]
 * @param {string} [options.language] - Programming language
 * @param {number} [options.tokenLimit] - Max tokens per chunk
 * @param {number} [options.overlapTokens] - Token overlap between chunks
 * @returns {FileChunk[]}
 */
function chunkFile(content, filePath, options = {}) {
  const {
    language = null,
    tokenLimit = CHUNK_TOKEN_LIMIT,
    overlapTokens = CHUNK_OVERLAP_TOKENS,
  } = options;

  if (!content || !content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const totalTokens = countTokens(content, language);

  // If the entire file fits in one chunk, return it directly
  if (totalTokens <= tokenLimit) {
    return [{
      chunkIndex: 0,
      content: buildChunkContent(filePath, lines, 1, lines.length, language),
      tokenCount: totalTokens,
      startLine: 1,
      endLine: lines.length,
    }];
  }

  // File needs splitting
  const chunks = [];
  let currentStart = 0; // 0-based line index

  while (currentStart < lines.length) {
    // Find the end of this chunk
    const { endIndex, tokens } = findChunkEnd(
      lines,
      currentStart,
      tokenLimit,
      language
    );

    const startLine = currentStart + 1; // Convert to 1-based
    const endLine = endIndex + 1;

    const chunkLines = lines.slice(currentStart, endIndex + 1);
    const chunkContent = buildChunkContent(filePath, chunkLines, startLine, endLine, language);

    chunks.push({
      chunkIndex: chunks.length,
      content: chunkContent,
      tokenCount: countTokens(chunkContent, language),
      startLine,
      endLine,
    });

    // Calculate overlap: go back by overlapTokens worth of lines
    const overlapLines = estimateOverlapLines(lines, endIndex, overlapTokens, language);
    currentStart = Math.max(endIndex + 1 - overlapLines, endIndex + 1);

    // Safety: ensure forward progress
    if (currentStart <= (chunks.length > 1 ? chunks[chunks.length - 2].endLine - 1 : -1)) {
      currentStart = endIndex + 1;
    }
  }

  logger.debug(`Chunked ${filePath}: ${lines.length} lines → ${chunks.length} chunks`);
  return chunks;
}

/**
 * Find the end line index for a chunk, preferring logical break points.
 */
function findChunkEnd(lines, startIndex, tokenLimit, language) {
  let accumulatedTokens = 0;
  let lastGoodBreak = startIndex;
  let endIndex = startIndex;

  for (let i = startIndex; i < lines.length; i++) {
    const lineTokens = countTokens(lines[i] + '\n', language);
    accumulatedTokens += lineTokens;

    if (accumulatedTokens > tokenLimit) {
      // Went over limit — use last good break point
      endIndex = lastGoodBreak > startIndex ? lastGoodBreak : i - 1;
      // If single line exceeds limit, include it anyway
      if (endIndex < startIndex) endIndex = startIndex;
      return { endIndex, tokens: accumulatedTokens };
    }

    // Track logical break points
    if (isLogicalBreak(lines, i, language)) {
      lastGoodBreak = i;
    }

    endIndex = i;
  }

  // Reached end of file
  return { endIndex, tokens: accumulatedTokens };
}

/**
 * Check if a line is a logical break point (good place to split).
 */
function isLogicalBreak(lines, index, language) {
  const line = lines[index];
  const trimmed = line.trim();

  // Blank lines are always good breaks
  if (trimmed === '') return true;

  // Closing braces at root level (end of function/class)
  if (trimmed === '}' || trimmed === '};') return true;

  // Python: function/class definitions
  if (language === 'Python' && /^(def |class |async def )/.test(trimmed)) return true;

  // JS/TS: function/class/export definitions
  if (/^(function |class |export |module\.exports|const \w+ = (async )?(\(|function))/.test(trimmed)) {
    return true;
  }

  // Comment blocks (good semantic boundaries)
  if (trimmed.startsWith('/**') || trimmed.startsWith('///') || trimmed.startsWith('# ===')) {
    return true;
  }

  return false;
}

/**
 * Estimate how many lines correspond to N tokens of overlap.
 */
function estimateOverlapLines(lines, endIndex, overlapTokens, language) {
  let tokens = 0;
  let count = 0;

  for (let i = endIndex; i >= 0 && tokens < overlapTokens; i--) {
    tokens += countTokens(lines[i] + '\n', language);
    count++;
  }

  return count;
}

/**
 * Build the final chunk content with a context header.
 */
function buildChunkContent(filePath, chunkLines, startLine, endLine, language) {
  const header = `// File: ${filePath} | Lines: ${startLine}-${endLine}` +
    (language ? ` | Language: ${language}` : '');
  return header + '\n' + chunkLines.join('\n');
}

/**
 * Chunk all files in a parsed file list.
 * @param {Array} files - Array from fileParser.parseRepository()
 * @returns {{ chunks: Array, totalChunks: number }}
 */
function chunkAllFiles(files) {
  const allChunks = [];

  for (const file of files) {
    const fileChunks = chunkFile(file.content, file.filePath, {
      language: file.language,
    });
    allChunks.push({
      filePath: file.filePath,
      chunks: fileChunks,
    });
  }

  const totalChunks = allChunks.reduce((sum, f) => sum + f.chunks.length, 0);

  logger.info(`Chunking complete: ${files.length} files → ${totalChunks} chunks`);

  return { allChunks, totalChunks };
}

module.exports = { chunkFile, chunkAllFiles };
