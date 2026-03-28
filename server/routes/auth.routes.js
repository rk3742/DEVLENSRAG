const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/github', authController.githubLogin);
router.get('/github/callback', authController.githubCallback);
router.get('/profile', requireAuth, authController.getProfile);

module.exports = router;
