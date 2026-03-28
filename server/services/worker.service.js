const { pool } = require('../config/db');
const logger = require('../utils/logger');
const repoModel = require('../models/repo.model');
const repoController = require('../controllers/repo.controller');
const analysisController = require('../controllers/analysis.controller');
const githubService = require('../services/github.service');
const analysisModel = require('../models/analysis.model');

/**
 * The Worker Service manages background tasks and ensures reliability.
 * It handles job resumption after server restarts and manages concurrency.
 */
class WorkerService {
  constructor() {
    this.isProcessing = false;
    this.checkInterval = 30000; // Check for stuck/new jobs every 30s
  }

  /**
   * Start the background maintenance worker.
   */
  start() {
    logger.info('⚙️ Background Worker Service started');
    
    // 1. Immediate cleanup on startup
    this.resumeStuckJobs();

    // 2. Periodic health check
    setInterval(() => {
      this.resumeStuckJobs();
    }, this.checkInterval);
  }

  /**
   * Find repositories that are 'pending', 'cloning', or 'parsing' but haven't been updated in a while.
   * This signifies a server crash or hang.
   */
  async resumeStuckJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Fetch all non-finalized repos
      // In a real production app, we would query for 'updated_at < NOW - 10 minutes'
      // For this SaaS refactor, we just look for any 'pending' or 'cloning' that might need kickstarting.
      const [rows] = await pool.execute(
        "SELECT * FROM repositories WHERE status IN ('pending', 'cloning', 'parsing') AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)"
      );

      if (rows.length > 0) {
        logger.info(`🔄 Found ${rows.length} stuck background jobs. Resuming...`);
        
        for (const repo of rows) {
          logger.info(`   Attempting to resume pipeline for: ${repo.owner}/${repo.name} (${repo.id})`);
          
          // We need the token - usually stored in req.user or .env
          // For resume, we use the GITHUB_TOKEN if available, or mark as failed if we can't get one.
          const token = process.env.GITHUB_TOKEN;
          
          if (!token) {
            logger.warn(`   Cannot resume ${repo.id}: No system GitHub token available.`);
            continue;
          }

          // Fetch repo info to satisfy the pipeline params
          try {
            const { owner, repo: name } = githubService.parseGitHubUrl(repo.github_url);
            const repoInfo = await githubService.getRepoInfo(owner, name, token);
            
            // Re-trigger background process (this handles cloning/parsing internally)
            repoController.processRepo(repo.id, {
              owner,
              repo: name,
              token,
              repoInfo,
              branch: repo.default_branch,
              userId: repo.user_id
            }).catch(e => logger.error(`   Resume failed for ${repo.id}: ${e.message}`));

          } catch (err) {
            logger.error(`   Failed to fetch resume info for ${repo.id}: ${err.message}`);
          }
        }
      }

      // 2. Resume stuck AI analyses
      const [analysisRows] = await pool.execute(
        "SELECT * FROM analysis_results WHERE status IN ('pending', 'processing') AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
      );

      if (analysisRows.length > 0) {
        logger.info(`🔄 Found ${analysisRows.length} stuck AI analyses. Resuming...`);
        for (const analysis of analysisRows) {
          const repo = await repoModel.getRepositoryById(analysis.repo_id);
          if (repo && repo.status === 'ready') {
            logger.info(`   Resuming AI pipeline for analysis ${analysis.id} (Repo: ${repo.name})`);
            analysisController.processAnalysis(analysis.id, repo.id, repo).catch(e => 
              logger.error(`   AI Resume failed for ${analysis.id}: ${e.message}`)
            );
          }
        }
      }
    } catch (err) {
      logger.error('Worker failed to check for stuck jobs', { error: err.message });
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new WorkerService();
