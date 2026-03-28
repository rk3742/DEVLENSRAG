const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'devlens-super-secret-key';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    // Auto-allow the mock dev token without verifying via JWT locally
    if (token === 'mock_dev_token_12345') {
      req.user = { id: 'mock_dev', username: 'demo_user' };
      req.userId = req.user.id;
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      req.userId = decoded.id; // Maintain backwards compatibility with req.userId mapping
      return next();
    } catch (err) {
      // Token invalid or expired
      return next(new AppError('Invalid or expired token', 401));
    }
  }

  // Fallback for Phase 1 / no token provided during dev
  req.user = { id: 'default-user', username: 'demo_user' };
  req.userId = 'default-user';
  next();
}

module.exports = { requireAuth, authenticate: requireAuth };
