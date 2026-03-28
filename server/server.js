require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const { testConnection } = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────────
const repoRoutes = require('./routes/repo.routes');
const analysisRoutes = require('./routes/analysis.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

// ── Security & parsing middleware ─────────────────────────────
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ───────────────────────────────────────────
app.use(morgan('short', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'devlens-ai',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/analysis', analysisRoutes);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// ── Global error handler (must be last) ───────────────────────
app.use(errorHandler);

const http = require('http');
const socketUtil = require('./utils/socket'); // Real-time websockets
const workerService = require('./services/worker.service'); // Background jobs

// ── Start server ──────────────────────────────────────────────
async function start() {
  try {
    await testConnection();
    const server = http.createServer(app);
    socketUtil.init(server); // attach socket.io
    workerService.start(); // start background maintenance worker

    server.listen(PORT, () => {
      logger.info(`🚀 DevLens AI server running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   AI Engine: Groq (${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'})`);
      logger.info(`   Health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { error: reason });
});

start();

module.exports = app;
