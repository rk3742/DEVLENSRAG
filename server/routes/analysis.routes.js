const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const analysisController = require('../controllers/analysis.controller');

// All analysis routes require authentication
router.use(authenticate);

// ── Trigger Analysis ──────────────────────────────────────────
router.post('/:repoId/run',          analysisController.runAnalysis);

// ── Analysis Status & Results ─────────────────────────────────
router.get('/:repoId/status',        analysisController.getAnalysisStatus);
router.get('/:repoId/architecture',  analysisController.getArchitecture);
router.get('/:repoId/start-here',    analysisController.getStartHere);
router.get('/:repoId/data-flow',     analysisController.getDataFlow);
router.get('/:repoId/summaries',     analysisController.getFileSummaries);
router.get('/:repoId/issues',        analysisController.getCodeIssues);

// ── Code Q&A ──────────────────────────────────────────────────
router.post('/:repoId/ask',          analysisController.askQuestion);

module.exports = router;
