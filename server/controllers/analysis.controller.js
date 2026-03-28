const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const aiService = require('../services/ai.service');
const repoModel = require('../models/repo.model');
const analysisModel = require('../models/analysis.model');
const socketUtil = require('../utils/socket'); // Real-time
const fs = require('fs').promises;
const path = require('path');

/**
 * POST /api/analysis/:repoId/run
 *
 * Trigger full AI analysis on a parsed repository.
 * Generates: file summaries → architecture overview → start-here guide → data flow.
 */
async function runAnalysis(req, res, next) {
  const { repoId } = req.params;
  const { model } = req.body;

  try {
    // Validate repo exists and is ready
    const repo = await repoModel.getRepositoryById(repoId);
    if (!repo) {
      throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    if (repo.status !== 'ready') {
      throw new AppError(
        `Repository is not ready for analysis. Current status: ${repo.status}`,
        400,
        'REPO_NOT_READY'
      );
    }

    // Create analysis record
    const analysisId = await analysisModel.createAnalysis(repoId, model);

    // Return immediately
    res.status(202).json({
      success: true,
      data: {
        analysisId,
        repoId,
        status: 'pending',
        message: 'AI analysis started. Poll GET /api/analysis/:repoId/status for progress.',
      },
    });

    // Process in background
    processAnalysis(analysisId, repoId, repo).catch(err => {
      logger.error(`Analysis pipeline failed for repo ${repoId}`, {
        error: err.message,
        stack: err.stack,
      });
    });

  } catch (err) {
    next(err);
  }
}

/**
 * Background analysis pipeline.
 */
async function processAnalysis(analysisId, repoId, repo, options = {}) {
  const startTime = Date.now();

  try {
    const analysis = await analysisModel.getAnalysisById(analysisId);
    if (!analysis) return;
    
    // Set model from options or from DB record
    const model = options.model || analysis.ai_model || 'llama-3.3-70b-versatile';

    await analysisModel.updateAnalysis(analysisId, { status: 'processing' });

    // ── Step 1: Get all files and their chunks ──────────────
    const files = await repoModel.getFilesByRepo(repoId);
    logger.info(`Starting AI analysis for ${repo.owner}/${repo.name}: ${files.length} files`);

    if (files.length === 0) {
      await analysisModel.updateAnalysis(analysisId, {
        status: 'ready',
        total_files_analyzed: 0,
        processing_time_ms: Date.now() - startTime,
      });
      return;
    }

    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Reading Code Files' });
    } catch(err) {}

    // ── Step 2: Intelligent File Discovery (The 'Hybrid' part of Vectorless RAG)
    logger.info('Starting Semantic Discovery Phase...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Semantic File Discovery' });
    } catch(err) {}

    const treeContext = files.map(f => f.file_path).join('\n').slice(0, 10000);
    
    // Ask AI to pick the most architecturally significant files
    const importantFilePaths = await aiService.discoverImportantFiles(treeContext, `${repo.owner}/${repo.name}`);
    
    let targetedFiles = files.filter(f => 
       importantFilePaths.some(important => f.file_path === important || f.file_path.includes(important))
    ).slice(0, 20);

    // ── FALLBACK: If discovery found nothing or few files, use the default source code ranking ──
    if (targetedFiles.length < 5) {
      logger.info('Discovery found few files. Falling back to default top source files.');
      const defaultFiles = files
        .filter(f => 
          f.file_path.endsWith('.js') || f.file_path.endsWith('.ts') || 
          f.file_path.endsWith('.jsx') || f.file_path.endsWith('.tsx') ||
          f.file_path.endsWith('.py') || f.file_path.endsWith('.java') ||
          f.file_path.endsWith('.go') || f.file_path.endsWith('.rb')
        )
        .slice(0, 20);
      
      // Combine and filter duplicates
      const seen = new Set(targetedFiles.map(f => f.id));
      for (const f of defaultFiles) {
        if (!seen.has(f.id)) targetedFiles.push(f);
      }
    }

    // ── Step 3: Get full content for targeted files ──────────
    const fileChunks = [];
    for (const file of targetedFiles) {
      try {
        const fullPath = path.join(repo.clone_path, file.file_path);
        const content = await fs.readFile(fullPath, 'utf8');
        
        fileChunks.push({
          fileId: file.id,
          filePath: file.file_path,
          language: file.language,
          content: content.slice(0, 2000) // 2k chars per file
        });
      } catch (err) {
        logger.warn(`Could not read file for analysis: ${file.file_path}`);
      }
    }

    // ── Step 4: Build giant code context string
    logger.info(`Building context from ${fileChunks.length} semantically relevant files...`);
    
    const codeContext = fileChunks
      .map(f => `--- ${f.filePath} ---\n${f.content}`)
      .join('\n\n')
      .slice(0, 25000); // 25k chars is ~6k tokens, safe for Groq

    const combinedContext = `File Tree:\n${treeContext.slice(0, 5000)}\n\nSubstantive Code:\n${codeContext}`;

    // ── Step 4: Generate architecture overview ──────────────
    logger.info('Generating architecture overview (Vectorless RAG)...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Generating Architecture Overview' });
    } catch(err) {}

    const architectureOverview = await aiService.generateArchitectureOverview(
      combinedContext,
      `${repo.owner}/${repo.name}`,
      model
    );

    await analysisModel.updateAnalysis(analysisId, {
      architecture_overview: architectureOverview,
    });

    logger.info('Sleeping for 5s to respect Groq TPM rate limits...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Rate Limit Cooldown (5s)' });
    } catch(err) {}
    await new Promise(resolve => setTimeout(resolve, 5000));

    // ── Step 5: Generate "Start Here" guide ─────────────────
    logger.info('Generating Start Here guide...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Generating Quickstart Guide' });
    } catch(err) {}

    const startHereGuide = await aiService.generateStartHereGuide(
      architectureOverview,
      combinedContext,
      `${repo.owner}/${repo.name}`
    );

    await analysisModel.updateAnalysis(analysisId, {
      start_here_guide: startHereGuide,
    });

    logger.info('Sleeping for 5s to respect Groq TPM rate limits...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Rate Limit Cooldown (5s)' });
    } catch(err) {}
    await new Promise(resolve => setTimeout(resolve, 5000));

    // ── Step 6: Analyze data flow ───────────────────────────
    logger.info('Analyzing data flow (Vectorless RAG)...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Mapping Data Flow' });
    } catch(err) {}

    const dataFlowAnalysis = await aiService.analyzeDataFlow(
      combinedContext,
      `${repo.owner}/${repo.name}`
    );

    await analysisModel.updateAnalysis(analysisId, {
      data_flow_analysis: dataFlowAnalysis,
    });

    // ── Step 7: Comprehensive Security & Quality Scan ──────
    logger.info('Performing Security & Quality Scan...');
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'processing', step: 'Security & Quality Scan' });
    } catch(err) {}

    const allIssues = [];
    for (const chunk of fileChunks) {
      try {
        const result = await aiService.detectCodeIssues(chunk.filePath, chunk.content, chunk.language);
        
        // Transform security issues
        if (result.securityIssues) {
          result.securityIssues.forEach(si => {
            allIssues.push({
              fileId: chunk.fileId,
              repoId: repo.id,
              issueType: 'security',
              severity: si.severity || 'medium',
              lineNumber: si.line || null,
              description: si.issue,
              codeSnippet: null,
              fixSuggestion: si.fix
            });
          });
        }

        // Transform dead code
        if (result.deadCode) {
          result.deadCode.forEach(dc => {
            allIssues.push({
              fileId: chunk.fileId,
              repoId: repo.id,
              issueType: 'quality',
              severity: 'low',
              lineNumber: dc.line || null,
              description: `Dead code detected: ${dc.reason}`,
              codeSnippet: dc.code,
              fixSuggestion: 'Remove unused code to improve maintainability.'
            });
          });
        }

        // Transform complexity / suggestions
        if (result.complexity && result.complexity.score > 7) {
          allIssues.push({
            fileId: chunk.fileId,
            repoId: repo.id,
            issueType: 'complexity',
            severity: 'medium',
            lineNumber: null,
            description: `High complexity detected: ${result.complexity.details}`,
            codeSnippet: null,
            fixSuggestion: 'Consider refactoring this module into smaller components.'
          });
        }

      } catch (err) {
        logger.warn(`Scan failed for ${chunk.filePath}: ${err.message}`);
      }
    }

    if (allIssues.length > 0) {
      await analysisModel.insertCodeIssuesBatch(allIssues);
    }

    // ── Step 8: Mark as ready ───────────────────────────────
    const processingTime = Date.now() - startTime;
    await analysisModel.updateAnalysis(analysisId, {
      status: 'ready',
      total_files_analyzed: targetedFiles.length,
      processing_time_ms: processingTime,
    });

    logger.info(`✓ AI analysis complete for ${repo.owner}/${repo.name}`, {
      filesAnalyzed: files.length,
      processingTimeSeconds: (processingTime / 1000).toFixed(1),
    });

    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'ready', step: 'Complete' });
    } catch(err) {}

  } catch (err) {
    logger.error(`Analysis failed for ${repo.owner}/${repo.name}`, {
      error: err.message,
      stack: err.stack,
    });

    await analysisModel.updateAnalysis(analysisId, {
      status: 'failed',
      error_message: err.message,
      processing_time_ms: Date.now() - startTime,
    }).catch(() => {});
    
    try {
      const io = socketUtil.getIo();
      io.to(`repo_${repo.id}`).emit('analysis_update', { status: 'failed', error_message: err.message });
    } catch(e) {}
  }
}

/**
 * GET /api/analysis/:repoId/status
 */
async function getAnalysisStatus(req, res, next) {
  try {
    const { repoId } = req.params;
    const analysis = await analysisModel.getAnalysisByRepo(repoId);

    if (!analysis) {
      throw new AppError('No analysis found for this repository', 404, 'ANALYSIS_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        id: analysis.id,
        repoId: analysis.repo_id,
        status: analysis.status,
        totalFilesAnalyzed: analysis.total_files_analyzed,
        processingTimeMs: analysis.processing_time_ms,
        hasArchitecture: !!analysis.architecture_overview,
        hasStartGuide: !!analysis.start_here_guide,
        hasDataFlow: !!analysis.data_flow_analysis,
        errorMessage: analysis.error_message,
        createdAt: analysis.created_at,
        updatedAt: analysis.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/:repoId/architecture
 */
async function getArchitecture(req, res, next) {
  try {
    const { repoId } = req.params;
    const analysis = await analysisModel.getAnalysisByRepo(repoId);

    if (!analysis || !analysis.architecture_overview) {
      return res.json({ success: true, analysisFound: false });
    }

    res.json({
      success: true,
      analysisFound: true,
      data: {
        repoId,
        architectureOverview: analysis.architecture_overview,
        generatedAt: analysis.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/:repoId/start-here
 */
async function getStartHere(req, res, next) {
  try {
    const { repoId } = req.params;
    const analysis = await analysisModel.getAnalysisByRepo(repoId);

    if (!analysis || !analysis.start_here_guide) {
      return res.json({ success: true, analysisFound: false });
    }

    res.json({
      success: true,
      analysisFound: true,
      data: {
        repoId,
        startHereGuide: analysis.start_here_guide,
        generatedAt: analysis.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/:repoId/data-flow
 */
async function getDataFlow(req, res, next) {
  try {
    const { repoId } = req.params;
    const analysis = await analysisModel.getAnalysisByRepo(repoId);

    if (!analysis || !analysis.data_flow_analysis) {
      return res.json({ success: true, analysisFound: false });
    }

    res.json({
      success: true,
      analysisFound: true,
      data: {
        repoId,
        dataFlowAnalysis: analysis.data_flow_analysis,
        generatedAt: analysis.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/:repoId/summaries
 */
async function getFileSummaries(req, res, next) {
  try {
    const { repoId } = req.params;
    const summaries = await analysisModel.getFileSummariesByRepo(repoId);

    res.json({
      success: true,
      data: summaries.map(s => ({
        fileId: s.file_id,
        filePath: s.file_path,
        language: s.language,
        summary: s.summary,
      })),
      count: summaries.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/analysis/:repoId/ask
 *
 * Natural language question about the codebase.
 */
async function askQuestion(req, res, next) {
  try {
    const { repoId } = req.params;
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      throw new AppError('question is required', 400, 'MISSING_FIELD');
    }

    // Get repo
    const repo = await repoModel.getRepositoryById(repoId);
    if (!repo) {
      throw new AppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    // Get files for context
    const files = await repoModel.getFilesByRepo(repoId, { limit: 10 }); // Limit to 10 files
    const relevantChunks = [];

    for (const file of files) {
      try {
        const fullPath = path.join(repo.clone_path, file.file_path);
        const content = await fs.readFile(fullPath, 'utf8');
        relevantChunks.push({
          filePath: file.file_path,
          content: content.length > 2000 ? content.slice(0, 2000) + '\n...[truncated]' : content, // 2000 char limit
        });
      } catch (err) {
        logger.warn(`Could not read file for Q&A: ${file.file_path}`);
      }
    }

    const answer = await aiService.askAboutCode(question, relevantChunks);

    res.json({
      success: true,
      data: {
        question,
        answer,
        contextFiles: relevantChunks.length,
        repo: `${repo.owner}/${repo.name}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/:repoId/issues
 */
async function getCodeIssues(req, res, next) {
  try {
    const { repoId } = req.params;
    const { issueType, severity, limit = 100, offset = 0 } = req.query;

    const issues = await analysisModel.getCodeIssuesByRepo(repoId, {
      issueType, severity, limit, offset,
    });

    const counts = await analysisModel.getIssueCountsByRepo(repoId);

    res.json({
      success: true,
      data: issues.map(i => ({
        id: i.id,
        filePath: i.file_path,
        language: i.language,
        issueType: i.issue_type,
        severity: i.severity,
        lineNumber: i.line_number,
        description: i.description,
        codeSnippet: i.code_snippet,
        fixSuggestion: i.fix_suggestion,
      })),
      summary: counts,
      count: issues.length,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  runAnalysis,
  getAnalysisStatus,
  getArchitecture,
  getStartHere,
  getDataFlow,
  getFileSummaries,
  askQuestion,
  getCodeIssues,
  processAnalysis, // For worker resumption
};
