const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { shouldIgnoreDir, shouldIgnoreFile, detectLanguage, isBinaryBuffer } = require('../utils/fileFilter');
const { MAX_FILE_SIZE_BYTES, MAX_TOTAL_FILES } = require('../config/constants');

/**
 * @typedef {Object} ParsedFile
 * @property {string} filePath    - Relative path from repo root
 * @property {string} language    - Detected programming language
 * @property {number} sizeBytes   - File size
 * @property {number} lineCount   - Number of lines
 * @property {string} contentHash - SHA-256 hash of content
 * @property {string} content     - Raw file content (UTF-8)
 */

/**
 * Recursively parse all source files in a cloned repository.
 *
 * @param {string} repoPath - Absolute path to the cloned repo root
 * @returns {Promise<{ files: ParsedFile[], stats: object }>}
 */
async function parseRepository(repoPath) {
  const files = [];
  const stats = {
    totalFilesScanned: 0,
    totalFilesAccepted: 0,
    totalFilesSkipped: 0,
    totalSizeBytes: 0,
    skippedReasons: {
      ignoredDir: 0,
      ignoredExtension: 0,
      tooLarge: 0,
      binary: 0,
      readError: 0,
    },
    languageBreakdown: {},
  };

  await walkDirectory(repoPath, repoPath, files, stats);

  logger.info('Repository parsing complete', {
    accepted: stats.totalFilesAccepted,
    skipped: stats.totalFilesSkipped,
    totalSizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
    languages: Object.keys(stats.languageBreakdown).length,
  });

  return { files, stats };
}

/**
 * Recursive directory walker with filtering.
 */
async function walkDirectory(rootPath, currentPath, files, stats) {
  // Safety cap
  if (files.length >= MAX_TOTAL_FILES) {
    logger.warn(`File cap reached (${MAX_TOTAL_FILES}), stopping parse`);
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (err) {
    logger.warn(`Cannot read directory: ${currentPath}`, { error: err.message });
    return;
  }

  for (const entry of entries) {
    if (files.length >= MAX_TOTAL_FILES) break;

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

    // ── Handle directories ──────────────────────────────────
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) {
        stats.skippedReasons.ignoredDir++;
        continue;
      }
      await walkDirectory(rootPath, fullPath, files, stats);
      continue;
    }

    // ── Handle symlinks — skip them ─────────────────────────
    if (entry.isSymbolicLink()) {
      stats.totalFilesSkipped++;
      continue;
    }

    // ── Handle files ────────────────────────────────────────
    if (!entry.isFile()) continue;

    stats.totalFilesScanned++;

    // Size check
    let fileStat;
    try {
      fileStat = await fs.stat(fullPath);
    } catch {
      stats.skippedReasons.readError++;
      stats.totalFilesSkipped++;
      continue;
    }

    if (fileStat.size > MAX_FILE_SIZE_BYTES) {
      stats.skippedReasons.tooLarge++;
      stats.totalFilesSkipped++;
      continue;
    }

    if (fileStat.size === 0) {
      stats.totalFilesSkipped++;
      continue;
    }

    // Extension/name check
    if (shouldIgnoreFile(relativePath, fileStat.size)) {
      stats.skippedReasons.ignoredExtension++;
      stats.totalFilesSkipped++;
      continue;
    }

    // Read file
    let buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch (err) {
      logger.debug(`Cannot read file: ${relativePath}`, { error: err.message });
      stats.skippedReasons.readError++;
      stats.totalFilesSkipped++;
      continue;
    }

    // Binary check
    if (isBinaryBuffer(buffer)) {
      stats.skippedReasons.binary++;
      stats.totalFilesSkipped++;
      continue;
    }

    const content = buffer.toString('utf-8');
    const language = detectLanguage(relativePath);
    const lineCount = content.split('\n').length;
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

    files.push({
      filePath: relativePath,
      language: language || 'Unknown',
      sizeBytes: fileStat.size,
      lineCount,
      contentHash,
      content,
    });

    stats.totalFilesAccepted++;
    stats.totalSizeBytes += fileStat.size;

    // Track language breakdown
    const lang = language || 'Unknown';
    stats.languageBreakdown[lang] = (stats.languageBreakdown[lang] || 0) + 1;
  }
}

module.exports = { parseRepository };
