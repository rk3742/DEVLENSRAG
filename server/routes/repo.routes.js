const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const repoController = require('../controllers/repo.controller');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// All repo routes require authentication
router.use(authenticate);

// ── Repo Connection & Analysis ────────────────────────────────
router.post('/connect',    repoController.connectRepo);
router.post('/analyze',    repoController.analyzeRepo);

// ── Repo Queries ──────────────────────────────────────────────
router.get('/',            repoController.listRepos);
router.get('/github/list', repoController.listGithubRepos);
router.post('/upload-zip', upload.single('zipfile'), repoController.uploadZip);
router.get('/:id/status',  repoController.getRepoStatus);
router.get('/:id/files',   repoController.getRepoFiles);
router.get('/:id/file',    repoController.getFileContent);


// ── Repo Management ──────────────────────────────────────────
router.post('/:id/sync',   repoController.syncRepo);
router.delete('/:id',      repoController.deleteRepo);

module.exports = router;
