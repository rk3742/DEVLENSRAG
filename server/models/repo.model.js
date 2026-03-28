const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { DB_BATCH_SIZE } = require('../config/constants');
const socketUtil = require('../utils/socket');

// ════════════════════════════════════════════════════════════════
// REPOSITORIES
// ════════════════════════════════════════════════════════════════

async function createRepository({ userId, githubUrl, owner, name, defaultBranch }) {
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO repositories (id, user_id, github_url, owner, name, default_branch, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, userId, githubUrl, owner, name, defaultBranch]
  );
  return id;
}

async function getRepositoryById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM repositories WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function getRepositoriesByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id, github_url, owner, name, default_branch, status,
            total_files, total_size_bytes, error_message, created_at, updated_at
     FROM repositories WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function updateRepoStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const values = [status];

  if (extra.clonePath !== undefined) {
    sets.push('clone_path = ?');
    values.push(extra.clonePath);
  }
  if (extra.totalFiles !== undefined) {
    sets.push('total_files = ?');
    values.push(extra.totalFiles);
  }
  if (extra.totalSizeBytes !== undefined) {
    sets.push('total_size_bytes = ?');
    values.push(extra.totalSizeBytes);
  }
  if (extra.errorMessage !== undefined) {
    sets.push('error_message = ?');
    values.push(extra.errorMessage);
  }

  values.push(id);
  await pool.execute(
    `UPDATE repositories SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  
  // Real-time update
  try {
    const io = socketUtil.getIo();
    io.to(`repo_${id}`).emit('repo_update', { id, status, ...extra });
  } catch (err) {
    // ignore socket error if not initialized
  }
}

async function deleteRepository(id) {
  // CASCADE will remove repo_files and file_chunks
  await pool.execute('DELETE FROM repositories WHERE id = ?', [id]);
}

// ════════════════════════════════════════════════════════════════
// REPO FILES — Batch insert for performance
// ════════════════════════════════════════════════════════════════

async function insertFilesBatch(repoId, files) {
  if (!files.length) return [];

  const fileIds = [];

  // Process in batches to avoid MySQL packet size limits
  for (let i = 0; i < files.length; i += DB_BATCH_SIZE) {
    const batch = files.slice(i, i + DB_BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = [];

    for (const file of batch) {
      const id = uuidv4();
      fileIds.push({ id, filePath: file.filePath });
      values.push(
        id,
        repoId,
        file.filePath,
        file.language,
        file.sizeBytes,
        file.lineCount,
        file.contentHash
      );
    }

    await pool.execute(
      `INSERT INTO repo_files (id, repo_id, file_path, language, size_bytes, line_count, content_hash)
       VALUES ${placeholders}`,
      values
    );
  }

  return fileIds;
}

async function getFilesByRepo(repoId, { language, limit, offset } = {}) {
  let query = 'SELECT * FROM repo_files WHERE repo_id = ?';
  const params = [repoId];

  if (language) {
    query += ' AND language = ?';
    params.push(language);
  }

  query += ' ORDER BY file_path ASC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit, 10) || 10);
    if (offset) {
      query += ' OFFSET ?';
      params.push(parseInt(offset, 10) || 0);
    }
  }

  const [rows] = await pool.query(query, params);
  return rows;
}

// ════════════════════════════════════════════════════════════════
// FILE CHUNKS — Batch insert
// ════════════════════════════════════════════════════════════════

async function insertChunksBatch(chunks) {
  if (!chunks.length) return;

  for (let i = 0; i < chunks.length; i += DB_BATCH_SIZE) {
    const batch = chunks.slice(i, i + DB_BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = [];

    for (const chunk of batch) {
      values.push(
        uuidv4(),
        chunk.fileId,
        chunk.chunkIndex,
        chunk.content,
        chunk.tokenCount,
        chunk.startLine,
        chunk.endLine
      );
    }

    await pool.execute(
      `INSERT INTO file_chunks (id, file_id, chunk_index, content, token_count, start_line, end_line)
       VALUES ${placeholders}`,
      values
    );
  }
}

async function getChunksByFile(fileId) {
  const [rows] = await pool.execute(
    'SELECT * FROM file_chunks WHERE file_id = ? ORDER BY chunk_index ASC',
    [fileId]
  );
  return rows;
}

module.exports = {
  createRepository,
  getRepositoryById,
  getRepositoriesByUser,
  updateRepoStatus,
  deleteRepository,
  insertFilesBatch,
  getFilesByRepo,
  insertChunksBatch,
  getChunksByFile,
};
