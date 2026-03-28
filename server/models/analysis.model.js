const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { DB_BATCH_SIZE } = require('../config/constants');

// ════════════════════════════════════════════════════════════════
// ANALYSIS RESULTS
// ════════════════════════════════════════════════════════════════

async function createAnalysis(repoId, model = 'llama-3.3-70b-versatile') {
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO analysis_results (id, repo_id, status, ai_model) VALUES (?, ?, 'pending', ?)`,
    [id, repoId, model]
  );
  return id;
}

async function getAnalysisByRepo(repoId) {
  const [rows] = await pool.execute(
    'SELECT * FROM analysis_results WHERE repo_id = ? ORDER BY created_at DESC LIMIT 1',
    [repoId]
  );
  return rows[0] || null;
}

async function updateAnalysis(id, updates) {
  const sets = [];
  const values = [];

  const allowedFields = [
    'architecture_overview', 'start_here_guide', 'data_flow_analysis',
    'status', 'error_message', 'total_files_analyzed', 'processing_time_ms',
  ];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return;

  values.push(id);
  await pool.execute(
    `UPDATE analysis_results SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
}

// ════════════════════════════════════════════════════════════════
// FILE SUMMARIES
// ════════════════════════════════════════════════════════════════

async function insertFileSummariesBatch(summaries) {
  if (!summaries.length) return;

  for (let i = 0; i < summaries.length; i += DB_BATCH_SIZE) {
    const batch = summaries.slice(i, i + DB_BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
    const values = [];

    for (const s of batch) {
      values.push(uuidv4(), s.fileId, s.repoId, s.summary);
    }

    await pool.execute(
      `INSERT INTO file_summaries (id, file_id, repo_id, summary) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE summary = VALUES(summary)`,
      values
    );
  }
}

async function getFileSummariesByRepo(repoId) {
  const [rows] = await pool.execute(
    `SELECT fs.id, fs.file_id, fs.summary, rf.file_path, rf.language
     FROM file_summaries fs
     JOIN repo_files rf ON fs.file_id = rf.id
     WHERE fs.repo_id = ?
     ORDER BY rf.file_path ASC`,
    [repoId]
  );
  return rows;
}

// ════════════════════════════════════════════════════════════════
// CODE ISSUES
// ════════════════════════════════════════════════════════════════

async function insertCodeIssuesBatch(issues) {
  if (!issues.length) return;

  for (let i = 0; i < issues.length; i += DB_BATCH_SIZE) {
    const batch = issues.slice(i, i + DB_BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = [];

    for (const issue of batch) {
      values.push(
        uuidv4(),
        issue.fileId,
        issue.repoId,
        issue.issueType,
        issue.severity,
        issue.lineNumber || null,
        issue.description,
        issue.codeSnippet || null,
        issue.fixSuggestion || null
      );
    }

    await pool.execute(
      `INSERT INTO code_issues (id, file_id, repo_id, issue_type, severity, line_number, description, code_snippet, fix_suggestion)
       VALUES ${placeholders}`,
      values
    );
  }
}

async function getCodeIssuesByRepo(repoId, { issueType, severity, limit = 100, offset = 0 } = {}) {
  let query = `SELECT ci.*, rf.file_path, rf.language
               FROM code_issues ci
               JOIN repo_files rf ON ci.file_id = rf.id
               WHERE ci.repo_id = ?`;
  const params = [repoId];

  if (issueType) {
    query += ' AND ci.issue_type = ?';
    params.push(issueType);
  }
  if (severity) {
    query += ' AND ci.severity = ?';
    params.push(severity);
  }

  query += ' ORDER BY FIELD(ci.severity, "high", "medium", "low", "info"), rf.file_path ASC';
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

  const [rows] = await pool.query(query, params);
  return rows;
}

async function getIssueCountsByRepo(repoId) {
  const [rows] = await pool.execute(
    `SELECT issue_type, severity, COUNT(*) as count
     FROM code_issues WHERE repo_id = ?
     GROUP BY issue_type, severity
     ORDER BY FIELD(severity, 'high', 'medium', 'low', 'info')`,
    [repoId]
  );
  return rows;
}

async function getAnalysisById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM analysis_results WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  createAnalysis,
  getAnalysisByRepo,
  getAnalysisById, // New
  updateAnalysis,
  insertFileSummariesBatch,
  getFileSummariesByRepo,
  insertCodeIssuesBatch,
  getCodeIssuesByRepo,
  getIssueCountsByRepo,
};
