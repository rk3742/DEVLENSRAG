const { Octokit } = require('@octokit/rest');
const { retry } = require('@octokit/plugin-retry');
const { throttling } = require('@octokit/plugin-throttling');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { MAX_REPO_SIZE_MB } = require('../config/constants');

// Extend Octokit with retry + throttling
const SmartOctokit = Octokit.plugin(retry, throttling);

/**
 * Create an authenticated Octokit instance.
 * @param {string} token - GitHub PAT or OAuth token
 * @returns {Octokit}
 */
function createClient(token) {
  return new SmartOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        logger.warn(`GitHub rate limit hit for ${options.method} ${options.url}`);
        if (retryCount < 2) {
          logger.info(`Retrying after ${retryAfter} seconds`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        logger.warn(`GitHub secondary rate limit for ${options.method} ${options.url}`);
        if (retryCount < 1) return true;
        return false;
      },
    },
    retry: {
      doNotRetry: ['429'],
    },
  });
}

/**
 * Validate a GitHub token by fetching the authenticated user.
 * @param {string} token
 * @returns {Promise<object>} GitHub user info
 */
async function validateToken(token) {
  try {
    const octokit = createClient(token);
    const { data } = await octokit.rest.users.getAuthenticated();
    logger.info(`GitHub token valid for user: ${data.login}`);
    return {
      login: data.login,
      id: data.id,
      avatar_url: data.avatar_url,
    };
  } catch (err) {
    if (err.status === 401) {
      throw new AppError('Invalid GitHub token', 401, 'INVALID_GITHUB_TOKEN');
    }
    throw new AppError(`GitHub API error: ${err.message}`, 502, 'GITHUB_API_ERROR');
  }
}

/**
 * Parse a GitHub URL into owner and repo name.
 * Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
 * @param {string} url
 * @returns {{ owner: string, repo: string }}
 */
function parseGitHubUrl(url) {
  const patterns = [
    // https://github.com/owner/repo
    /github\.com\/([^\/]+)\/([^\/\s.]+)/,
    // git@github.com:owner/repo.git
    /github\.com:([^\/]+)\/([^\/\s.]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  throw new AppError(
    'Invalid GitHub URL. Expected format: https://github.com/owner/repo',
    400,
    'INVALID_GITHUB_URL'
  );
}

/**
 * Fetch repository metadata from GitHub API.
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<object>}
 */
async function getRepoInfo(owner, repo, token) {
  try {
    const octokit = createClient(token);
    const { data } = await octokit.rest.repos.get({ owner, repo });

    const sizeMB = (data.size / 1024).toFixed(2); // GitHub returns size in KB

    return {
      fullName:       data.full_name,
      description:    data.description,
      defaultBranch:  data.default_branch,
      language:       data.language,
      isPrivate:      data.private,
      sizeMB:         parseFloat(sizeMB),
      sizeKB:         data.size,
      stargazers:     data.stargazers_count,
      forks:          data.forks_count,
      htmlUrl:        data.html_url,
      cloneUrl:       data.clone_url,
      createdAt:      data.created_at,
      updatedAt:      data.updated_at,
    };
  } catch (err) {
    if (err.status === 404) {
      throw new AppError(
        `Repository ${owner}/${repo} not found. Check the URL and permissions.`,
        404,
        'REPO_NOT_FOUND'
      );
    }
    if (err.status === 403) {
      throw new AppError(
        'Access denied. Your token may not have access to this repository.',
        403,
        'REPO_ACCESS_DENIED'
      );
    }
    throw new AppError(`GitHub API error: ${err.message}`, 502, 'GITHUB_API_ERROR');
  }
}

/**
 * Validate that the repo is within the allowed size limit.
 * @param {number} sizeMB
 */
function validateRepoSize(sizeMB) {
  if (sizeMB > MAX_REPO_SIZE_MB) {
    throw new AppError(
      `Repository is ${sizeMB} MB, which exceeds the ${MAX_REPO_SIZE_MB} MB limit. ` +
      'Contact support for large repository analysis.',
      413,
      'REPO_TOO_LARGE'
    );
  }
}

/**
 * Build an authenticated clone URL for private repos.
 * @param {string} cloneUrl - Public HTTPS clone URL
 * @param {string} token
 * @returns {string}
 */
function buildAuthCloneUrl(cloneUrl, token) {
  // https://github.com/owner/repo.git → https://x-access-token:TOKEN@github.com/owner/repo.git
  return cloneUrl.replace('https://', `https://x-access-token:${token}@`);
}

module.exports = {
  createClient,
  validateToken,
  parseGitHubUrl,
  getRepoInfo,
  validateRepoSize,
  buildAuthCloneUrl,
};
