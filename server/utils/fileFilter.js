const path = require('path');
const { minimatch } = require('minimatch');
const {
  IGNORED_DIRS,
  IGNORED_EXTENSIONS,
  EXTENSION_LANGUAGE_MAP,
  SPECIAL_FILE_MAP,
  MAX_FILE_SIZE_BYTES,
} = require('../config/constants');

/**
 * Check if a directory name should be skipped.
 * @param {string} dirName - Base name of the directory
 * @returns {boolean}
 */
function shouldIgnoreDir(dirName) {
  return IGNORED_DIRS.includes(dirName) || dirName.startsWith('.');
}

/**
 * Check if a file should be skipped based on extension, size, or name.
 * @param {string} filePath - Relative file path
 * @param {number} [fileSize] - File size in bytes
 * @returns {boolean}
 */
function shouldIgnoreFile(filePath, fileSize) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);

  // Skip hidden files
  if (baseName.startsWith('.') && !SPECIAL_FILE_MAP[baseName]) {
    return true;
  }

  // Skip by extension
  if (IGNORED_EXTENSIONS.includes(ext)) {
    return true;
  }

  // Skip oversized files
  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    return true;
  }

  // Skip files with no extension and not in special map (likely binaries)
  if (!ext && !SPECIAL_FILE_MAP[baseName]) {
    // Allow common extensionless files
    const allowedNoExt = ['Makefile', 'Dockerfile', 'Procfile', 'Gemfile', 'Rakefile', 'LICENSE', 'README', 'CHANGELOG'];
    if (!allowedNoExt.some(name => baseName.toUpperCase().startsWith(name.toUpperCase()))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the programming language from file extension or name.
 * @param {string} filePath
 * @returns {string|null}
 */
function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);

  // Check special file names first
  if (SPECIAL_FILE_MAP[baseName]) {
    return SPECIAL_FILE_MAP[baseName];
  }

  // Check extension map
  if (EXTENSION_LANGUAGE_MAP[ext]) {
    return EXTENSION_LANGUAGE_MAP[ext];
  }

  return null;
}

/**
 * Check if file content looks like binary (contains null bytes).
 * Checks the first 8KB of a buffer.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isBinaryBuffer(buffer) {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

module.exports = {
  shouldIgnoreDir,
  shouldIgnoreFile,
  detectLanguage,
  isBinaryBuffer,
};
