const axios = require('axios');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'devlens-super-secret-key';

/**
 * Handle initial redirect to GitHub OAuth
 */
function githubLogin(req, res) {
  if (!process.env.GITHUB_CLIENT_ID) {
    // Development fallback if user didn't set up OAuth App
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?token=mock_dev_token_12345`);
  }

  const redirectUri = `http://${req.headers.host}/api/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user user:email repo`;
  
  res.redirect(githubAuthUrl);
}

/**
 * Handle callback from GitHub, exchange code for token, and authenticate user
 */
async function githubCallback(req, res, next) {
  const { code } = req.query;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?error=missing_code`);
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error('No access token returned from GitHub');
    }

    // 2. Get user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const githubUser = userResponse.data;

    // 3. Upsert user in database
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE github_id = ? OR email = ?',
      [githubUser.id, githubUser.email || '']
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await pool.query(
        'UPDATE users SET username = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?',
        [githubUser.login, githubUser.avatar_url, userId]
      );
    } else {
      userId = require('uuid').v4();
      await pool.query(
        'INSERT INTO users (id, github_id, username, email, avatar_url) VALUES (?, ?, ?, ?, ?)',
        [userId, githubUser.id, githubUser.login, githubUser.email || '', githubUser.avatar_url]
      );
    }

    // 4. Generate JWT
    const JWT_SECRET = process.env.JWT_SECRET || 'devlens-super-secret-key';
    
    const token = jwt.sign(
      { id: userId, username: githubUser.login, accessToken },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Redirect back to frontend with token
    res.redirect(`${FRONTEND_URL}/dashboard?token=${token}`);

  } catch (err) {
    console.error('GitHub Auth Error:', err.message);
    res.redirect(`${FRONTEND_URL}?error=auth_failed`);
  }
}

/**
 * Get current user profile
 */
async function getProfile(req, res, next) {
  try {
    const userId = req.user.id;
    // In our mock logic, userId might be 'user-timestamp' or mock_dev_token_12345
    if (userId.startsWith('user-') || userId === 'mock_dev') {
      return res.json({
        success: true,
        data: {
          id: userId,
          username: 'demo_user',
          avatar_url: 'https://github.com/ghost.png',
        }
      });
    }

    const [rows] = await pool.query('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { githubLogin, githubCallback, getProfile };
