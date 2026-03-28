const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const unzipper = require('unzipper');
const axios = require('axios');
const fsSync = require('fs');

const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const githubService = require('../services/github.service');
const cloneService = require('../services/clone.service');
const fileParserService = require('../services/fileParser.service');
const chunkerService = require('../services/chunker.service');
const repoModel = require('../models/repo.model');

/**
 * POST /api/repos/connect
 *
 * Validate GitHub token + fetch repo metadata.
 * Does NOT clone or parse — just validates and previews.
 */
async function connectRepo(req, res, next) {
  try {
    const { githubUrl, githubToken } = req.body;

    if (!githubUrl) {
      throw new AppError('githubUrl is required', 400, 'MISSING_FIELD');
    }

    const token = githubToken || req.user?.accessToken || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new AppError('GitHub token is required (provide githubToken or set GITHUB_TOKEN env or login with GitHub)', 400, 'MISSING_TOKEN');
    }

    // Parse URL
    const { owner, repo } = githubService.parseGitHubUrl(githubUrl);

    // Validate token
    const githubUser = await githubService.validateToken(token);

    // Fetch repo info
    const repoInfo = await githubService.getRepoInfo(owner, repo, token);

    // Validate size
    githubService.validateRepoSize(repoInfo.sizeMB);

    res.json({
      success: true,
      data: {
        repository: {
          owner,
          name: repo,
          fullName: repoInfo.fullName,
          description: repoInfo.description,
          defaultBranch: repoInfo.defaultBranch,
          language: repoInfo.language,
          isPrivate: repoInfo.isPrivate,
          sizeMB: repoInfo.sizeMB,
          stargazers: repoInfo.stargazers,
        },
        authenticatedAs: githubUser.login,
        message: `Repository validated. Ready to analyze. Estimated size: ${repoInfo.sizeMB} MB`,
      },
    });
  } catch (err) {
    next(err);
  }
}




/**
 * Handle direct zip upload logic
 */
async function uploadZip(req, res, next) {
  try {
    const file = req.file;
    const userId = req.user?.id || 'default-user';

    if (!file) {
      throw new AppError('No zip file uploaded', 400, 'MISSING_FILE');
    }

    const repoName = file.originalname.replace('.zip', '');
    const repoId = await repoModel.createRepository({
      userId,
      githubUrl: `local://zip/${file.filename}`,
      owner: 'local',
      name: repoName,
      defaultBranch: 'main',
    });

    res.status(202).json({
      success: true,
      data: {
        repoId,
        status: 'parsing',
        message: 'Zip uploaded. Extracting and parsing.',
      },
    });

    // Process Zip Async
    processZip(repoId, file).catch(err => {
      logger.error(`Background zip processing failed for ${repoId}`, { error: err.message });
    });

  } catch (err) {
    if (req.file && fsSync.existsSync(req.file.path)) {
      fsSync.unlinkSync(req.file.path);
    }
    next(err);
  }
}

/**
 * Process a ZIP asynchronously and pass it to fileParser pipeline
 */
async function processZip(repoId, file, manualClonePath = null) {
  let clonePath = manualClonePath;
  
  try {
    if (!clonePath) {
      await repoModel.updateRepoStatus(repoId, 'cloning'); 
      clonePath = path.join(__dirname, '../../repos', repoId);
      await fs.mkdir(clonePath, { recursive: true });

      logger.info(`Extracting ZIP ${file.filename} to ${clonePath}`);

      // Extract zip
      await new Promise((resolve, reject) => {
        fsSync.createReadStream(file.path)
          .pipe(unzipper.Extract({ path: clonePath }))
          .on('close', resolve)
          .on('error', reject);
      });

      // Cleanup temp zip
      fsSync.unlinkSync(file.path);
    } else {
      logger.info(`Skipping extraction: parsing existing path ${clonePath}`);
    }

    // Save path
    await repoModel.updateRepoStatus(repoId, 'parsing', { clonePath });

    // ── Step 4: Parse code files ────────────────────────────
    logger.info(`Parsing local zip for ${repoId}`);
    const { files, stats } = await fileParserService.parseRepository(clonePath);
    
    if (files.length === 0) {
      await repoModel.updateRepoStatus(repoId, 'ready', {
        totalFiles: 0,
        totalSizeBytes: 0,
      });
      logger.warn(`No parseable files found in local zip for ${repoId}`);
      return;
    }

    // Insert to DB
    await repoModel.insertFilesBatch(repoId, files);

    // Mark as ready
    await repoModel.updateRepoStatus(repoId, 'ready', {
      totalFiles: files.length,
      totalSizeBytes: stats.totalSizeBytes,
    });

    logger.info(`✓ Zip Analysis complete for ${repoId}`);

  } catch (err) {
    logger.error(`Zip Analysis failed for ${repoId}: ${err.message}`);
    await repoModel.updateRepoStatus(repoId, 'failed', { errorMessage: err.message }).catch(() => {});
  }
}

/**
 * Fetch GitHub Repos for the authenticated user
 */
async function listGithubRepos(req, res, next) {
  try {
    const accessToken = req.user?.accessToken;
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'OAuth token missing. Connect GitHub to view.' });
    }

    const githubRes = await axios.get('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const repos = githubRes.data
      .filter(r => !r.fork) // Optionally filter out forks
      .map(r => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        html_url: r.html_url,
        private: r.private,
        language: r.language,
        updated_at: r.updated_at
      }));

    res.json({ success: true, count: repos.length, data: repos });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(401).json({ success: false, message: 'GitHub token expired or invalid.' });
    }
    next(err);
  }
}

/**
 * POST /api/repos/analyze
 *
 * Full pipeline: clone → parse → chunk → persist.
 * Returns immediately with repo ID; processing is done in the background
 * (in Phase 1 it's synchronous; Phase 2 will use Bull queue).
 */
async function analyzeRepo(req, res, next) {
  let repoId = null;

  try {
    const { githubUrl, githubToken, branch } = req.body;
    const userId = req.userId;

    if (!githubUrl) {
      throw new AppError('githubUrl is required', 400, 'MISSING_FIELD');
    }

    const token = githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new AppError('GitHub token is required', 400, 'MISSING_TOKEN');
    }

    // ── Step 1: Validate ────────────────────────────────────
    const { owner, repo } = githubService.parseGitHubUrl(githubUrl);
    const repoInfo = await githubService.getRepoInfo(owner, repo, token);
    githubService.validateRepoSize(repoInfo.sizeMB);

    // ── Step 2: Check if already analyzed by this user ──────
    const existingRepos = await repoModel.getRepositoriesByUser(userId);
    const alreadyConnected = existingRepos.find(r => r.github_url === repoInfo.htmlUrl);

    if (alreadyConnected) {
      repoId = alreadyConnected.id;
      
      // If the existing repo is ready, we return immediately with it
      if (alreadyConnected.status === 'ready') {
        // Trigger a fake 'ready' emit after a short delay so the socket catches it, or frontend can handle it
        setTimeout(() => {
          try {
            const socketUtil = require('../utils/socketUtil');
            socketUtil.getIo().to(`repo_${repoId}`).emit('repo_update', { status: 'ready' });
          } catch(err) {}
        }, 1000);

        return res.status(200).json({
          success: true,
          data: {
            repoId,
            status: 'ready',
            message: 'Repository already analyzed.',
          },
        });
      }
      
      // If it failed or got stuck previously, forcefully restart the pipeline
      logger.info(`Restarting stalled/failed pipeline for ${owner}/${repo}`);
      
      res.status(202).json({
        success: true,
        data: {
          repoId,
          status: 'pending',
          message: 'Analysis restarted.',
        },
      });

      processRepo(repoId, {
        owner,
        repo,
        token,
        repoInfo,
        branch: branch || repoInfo.defaultBranch,
        userId,
      }).catch(err => {
        logger.error(`Background processing failed for repo ${repoId}`, { error: err.message });
      });

      return;
    }

    // ── Step 3: Create DB record ────────────────────────────
    repoId = await repoModel.createRepository({
      userId,
      githubUrl: repoInfo.htmlUrl,
      owner,
      name: repo,
      defaultBranch: branch || repoInfo.defaultBranch,
    });

    // Return immediately so the client can poll status
    res.status(202).json({
      success: true,
      data: {
        repoId,
        status: 'pending',
        message: 'Analysis started. Poll GET /api/repos/:id/status for progress.',
      },
    });

    // ── Continue processing asynchronously (fire-and-forget) ──
    processRepo(repoId, {
      owner,
      repo,
      token,
      repoInfo,
      branch: branch || repoInfo.defaultBranch,
      userId,
    }).catch(err => {
      logger.error(`Background processing failed for repo ${repoId}`, { error: err.message, stack: err.stack });
    });

  } catch (err) {
    // If we already created a DB record, mark it as failed
    if (repoId) {
      await repoModel.updateRepoStatus(repoId, 'failed', {
        errorMessage: err.message,
      }).catch(() => {});
    }
    next(err);
  }
}

/**
 * Background repo processing pipeline.
 */
async function processRepo(repoId, { owner, repo, token, repoInfo, branch, userId }) {
  let clonePath = null;

  try {
    // ── Step 3: Clone ───────────────────────────────────────
    await repoModel.updateRepoStatus(repoId, 'cloning');
    try {
      const socketUtil = require('../utils/socketUtil');
      socketUtil.getIo().to(`repo_${repoId}`).emit('repo_update', { status: 'cloning' });
    } catch(err) {}

    clonePath = cloneService.getClonePath(userId, repoId);
    const authUrl = githubService.buildAuthCloneUrl(repoInfo.cloneUrl, token);

    await cloneService.cloneRepo({
      cloneUrl: authUrl,
      destPath: clonePath,
      branch,
      shallow: true,
    });

    await repoModel.updateRepoStatus(repoId, 'parsing', { clonePath });
    try {
      const socketUtil = require('../utils/socketUtil');
      socketUtil.getIo().to(`repo_${repoId}`).emit('repo_update', { status: 'parsing' });
    } catch(err) {}

    // ── Step 4: Parse files ─────────────────────────────────
    logger.info(`Parsing files for ${owner}/${repo}`);
    const { files, stats } = await fileParserService.parseRepository(clonePath);

    if (files.length === 0) {
      await repoModel.updateRepoStatus(repoId, 'ready', {
        totalFiles: 0,
        totalSizeBytes: 0,
      });
      logger.warn(`No parseable files found in ${owner}/${repo}`);
      return;
    }

    // ── Step 5: Insert file records ─────────────────────────
    await repoModel.insertFilesBatch(repoId, files);

    // ── Step 6: Mark as ready ───────────────────────────────
    await repoModel.updateRepoStatus(repoId, 'ready', {
      totalFiles: files.length,
      totalSizeBytes: stats.totalSizeBytes,
    });
    try {
      const socketUtil = require('../utils/socketUtil');
      socketUtil.getIo().to(`repo_${repoId}`).emit('repo_update', { status: 'ready' });
    } catch(err) {}

    logger.info(`✓ Analysis complete for ${owner}/${repo}`, {
      files: files.length,
      sizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
      languages: Object.keys(stats.languageBreakdown).length,
    });

  } catch (err) {
    logger.error(`Pipeline failed for repo ${repoId}`, {
      error: err.message,
      stack: err.stack,
    });

    await repoModel.updateRepoStatus(repoId, 'failed', {
      errorMessage: err.message,
    }).catch(() => {});
    try {
      const socketUtil = require('../utils/socketUtil');
      socketUtil.getIo().to(`repo_${repoId}`).emit('repo_update', { status: 'failed', errorMessage: err.message });
    } catch(err) {}

  } finally {
    // Optionally cleanup clone — keep it for now so AI can reference files
    // await cloneService.cleanupRepo(clonePath);
  }
}

/**
 * GET /api/repos/:id/status
 */
async function getRepoStatus(req, res, next) {
  try {
    const { id } = req.params;
    const repo = await repoModel.getRepositoryById(id);

    if (!repo) {
      throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        id: repo.id,
        githubUrl: repo.github_url,
        owner: repo.owner,
        name: repo.name,
        status: repo.status,
        totalFiles: repo.total_files,
        totalSizeMB: (repo.total_size_bytes / (1024 * 1024)).toFixed(2),
        errorMessage: repo.error_message,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/repos
 */
async function listRepos(req, res, next) {
  try {
    const repos = await repoModel.getRepositoriesByUser(req.userId);

    res.json({
      success: true,
      data: repos.map(r => ({
        id: r.id,
        githubUrl: r.github_url,
        owner: r.owner,
        name: r.name,
        status: r.status,
        totalFiles: r.total_files,
        totalSizeMB: (r.total_size_bytes / (1024 * 1024)).toFixed(2),
        createdAt: r.created_at,
      })),
      count: repos.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/repos/:id/files
 */
async function getRepoFiles(req, res, next) {
  try {
    const { id } = req.params;
    const { language, limit = 100, offset = 0 } = req.query;

    const repo = await repoModel.getRepositoryById(id);
    if (!repo) {
      throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    const files = await repoModel.getFilesByRepo(id, {
      language,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      success: true,
      data: files.map(f => ({
        id: f.id,
        filePath: f.file_path,
        language: f.language,
        sizeBytes: f.size_bytes,
        lineCount: f.line_count,
      })),
      count: files.length,
      total: repo.total_files,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/repos/:id/file?path=...
 */
async function getFileContent(req, res, next) {
  try {
    const { id } = req.params;
    const filePath = req.query.path;
    
    if (!filePath) {
      throw new AppError('File path is required', 400, 'MISSING_PATH');
    }

    const repo = await repoModel.getRepositoryById(id);
    if (!repo || !repo.clone_path) {
      throw new AppError('Repository or local clone not found', 404, 'REPO_NOT_FOUND');
    }

    const fullPath = path.join(repo.clone_path, filePath);

    // Security: Prevent directory traversal
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(repo.clone_path);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new AppError('Invalid path access', 403, 'INVALID_PATH');
    }

    const content = await fs.readFile(resolvedPath, 'utf8');
    res.json({ success: true, data: content });
  } catch (err) {
    if (err.code === 'ENOENT') {
      next(new AppError('File not found', 404, 'FILE_NOT_FOUND'));
    } else {
      next(err);
    }
  }
}

/**
 * DELETE /api/repos/:id
 */
async function deleteRepo(req, res, next) {
  try {
    const { id } = req.params;
    const repo = await repoModel.getRepositoryById(id);

    if (!repo) {
      throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    // Cleanup disk
    if (repo.clone_path) {
      await cloneService.cleanupRepo(repo.clone_path);
    }

    // Delete from DB (CASCADE removes files + chunks)
    await repoModel.deleteRepository(id);

    logger.info(`Repository ${repo.owner}/${repo.name} deleted`, { repoId: id });

    res.json({
      success: true,
      message: `Repository ${repo.owner}/${repo.name} has been deleted`,
    });
  } catch (err) {
    next(err);
  }
}

async function syncRepo(req, res, next) {
  try {
    const { id } = req.params;
    const repo = await repoModel.getRepositoryById(id);
    if (!repo) throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');

    const token = req.user?.accessToken || process.env.GITHUB_TOKEN;

    // Handle Local ZIP re-sync (Re-parse only)
    if (repo.github_url.startsWith('local://zip/')) {
      logger.info(`Re-syncing local ZIP repository: ${id}`);
      await repoModel.updateRepoStatus(id, 'parsing');
      
      const { pool } = require('../config/db');
      await pool.execute('DELETE FROM repo_files WHERE repo_id = ?', [id]);

      // Re-trigger the parsing part of the ZIP pipeline
      // We pass a dummy 'file' object since we already have the clonePath
      processZip(id, { path: null, exists: true }, repo.clone_path).catch(err => 
        logger.error(`Zip Re-sync failed for ${id}: ${err.message}`)
      );

      return res.json({ success: true, message: 'Local repository re-parsing started.' });
    }

    // Handle GitHub Sync
    const { owner, repo: name } = githubService.parseGitHubUrl(repo.github_url);
    const repoInfo = await githubService.getRepoInfo(owner, name, token);

    await repoModel.updateRepoStatus(id, 'cloning');
    const { pool } = require('../config/db');
    await pool.execute('DELETE FROM repo_files WHERE repo_id = ?', [id]);

    processRepo(id, {
      owner,
      repo: name,
      token,
      repoInfo,
      branch: repo.default_branch,
      userId: repo.user_id
    }).catch(err => logger.error(`Sync failed for ${id}: ${err.message}`));

    res.json({ success: true, message: 'GitHub re-sync started.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  connectRepo,
  uploadZip,
  listGithubRepos,
  analyzeRepo,
  getRepoStatus,
  listRepos,
  getRepoFiles,
  getFileContent,
  deleteRepo,
  processRepo, // For worker resumption
  syncRepo, // For manual refresh
};
