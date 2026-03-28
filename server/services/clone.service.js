const simpleGit = require('simple-git');
const fs = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { CLONE_BASE_PATH, MAX_CONCURRENT_CLONES, CLONE_TIMEOUT_MS } = require('../config/constants');

// ── Semaphore for concurrent clone limiting ────────────────────
let activeClones = 0;
const cloneQueue = [];

function acquireCloneSlot() {
  return new Promise((resolve) => {
    if (activeClones < MAX_CONCURRENT_CLONES) {
      activeClones++;
      resolve();
    } else {
      cloneQueue.push(resolve);
    }
  });
}

function releaseCloneSlot() {
  activeClones--;
  if (cloneQueue.length > 0) {
    activeClones++;
    const next = cloneQueue.shift();
    next();
  }
}

/**
 * Ensure the clone base directory exists.
 */
async function ensureCloneDir() {
  await fs.mkdir(CLONE_BASE_PATH, { recursive: true });
}

/**
 * Generate a unique clone destination path.
 * @param {string} userId
 * @param {string} repoId
 * @returns {string}
 */
function getClonePath(userId, repoId) {
  return path.join(CLONE_BASE_PATH, userId, repoId);
}

/**
 * Clone a GitHub repository to the local filesystem.
 *
 * @param {object} params
 * @param {string} params.cloneUrl - Authenticated HTTPS clone URL
 * @param {string} params.destPath - Local destination directory
 * @param {string} [params.branch] - Branch to clone (defaults to repo default)
 * @param {boolean} [params.shallow=true] - Shallow clone (depth 1)
 * @returns {Promise<{ path: string, duration: number }>}
 */
async function cloneRepo({ cloneUrl, destPath, branch, shallow = true }) {
  await ensureCloneDir();

  // Clean up if destination already exists (re-analysis)
  try {
    await fs.access(destPath);
    logger.info(`Cleaning up existing clone at ${destPath}`);
    await fs.rm(destPath, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist — good
  }

  await fs.mkdir(destPath, { recursive: true });

  logger.info(`Cloning repository to ${destPath}`, { shallow, branch });

  await acquireCloneSlot();
  const startTime = Date.now();

  try {
    const git = simpleGit({
      timeout: {
        block: CLONE_TIMEOUT_MS,
      },
    });

    const cloneOptions = [];
    if (shallow) {
      cloneOptions.push('--depth', '1');
    }
    if (branch) {
      cloneOptions.push('--branch', branch);
    }
    // Single branch for speed
    cloneOptions.push('--single-branch');

    await git.clone(cloneUrl, destPath, cloneOptions);

    const duration = Date.now() - startTime;
    logger.info(`Clone completed in ${(duration / 1000).toFixed(1)}s`, { destPath });

    return { path: destPath, duration };
  } catch (err) {
    // Clean up failed clone
    try {
      await fs.rm(destPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }

    if (err.message.includes('timeout')) {
      throw new AppError(
        'Repository clone timed out. The repository may be too large.',
        408,
        'CLONE_TIMEOUT'
      );
    }

    if (err.message.includes('Authentication')) {
      throw new AppError(
        'GitHub authentication failed during clone. Check your token permissions.',
        401,
        'CLONE_AUTH_FAILED'
      );
    }

    throw new AppError(
      `Failed to clone repository: ${err.message}`,
      500,
      'CLONE_FAILED'
    );
  } finally {
    releaseCloneSlot();
  }
}

/**
 * Remove a cloned repository from disk.
 * @param {string} clonePath
 */
async function cleanupRepo(clonePath) {
  if (!clonePath) return;
  try {
    await fs.rm(clonePath, { recursive: true, force: true });
    logger.info(`Cleaned up clone at ${clonePath}`);
  } catch (err) {
    logger.warn(`Failed to cleanup ${clonePath}: ${err.message}`);
  }
}

/**
 * Get the total size of a cloned directory in bytes.
 * @param {string} dirPath
 * @returns {Promise<number>}
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  async function walkDir(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        totalSize += stat.size;
      } else if (entry.isDirectory() && entry.name !== '.git') {
        await walkDir(fullPath);
      }
    }
  }

  await walkDir(dirPath);
  return totalSize;
}

module.exports = {
  getClonePath,
  cloneRepo,
  cleanupRepo,
  getDirectorySize,
};
