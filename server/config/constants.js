const path = require('path');

module.exports = {
  // ── Clone Settings ──────────────────────────────────────────
  CLONE_BASE_PATH: path.resolve(process.env.CLONE_BASE_PATH || './repos'),
  MAX_REPO_SIZE_MB: parseInt(process.env.MAX_REPO_SIZE_MB, 10) || 500,
  MAX_CONCURRENT_CLONES: parseInt(process.env.MAX_CONCURRENT_CLONES, 10) || 3,
  CLONE_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes

  // ── File Parser Settings ────────────────────────────────────
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1 MB — skip files larger than this
  MAX_TOTAL_FILES: 50000,               // safety cap

  // ── Chunker Settings ────────────────────────────────────────
  CHUNK_TOKEN_LIMIT: 4000,    // Optimized for Groq 6000 TPM free tier limits
  CHUNK_OVERLAP_TOKENS: 200,  // overlap between adjacent chunks

  // ── Groq AI Settings ───────────────────────────────────────
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  GROQ_MAX_TOKENS: parseInt(process.env.GROQ_MAX_TOKENS, 10) || 1500,
  GROQ_TEMPERATURE: parseFloat(process.env.GROQ_TEMPERATURE) || 0.1,
  GROQ_MAX_CONCURRENT_REQUESTS: parseInt(process.env.GROQ_MAX_CONCURRENT_REQUESTS, 10) || 5,
  GROQ_RATE_LIMIT_RPM: 30,     // Groq free tier: 30 req/min
  GROQ_RATE_LIMIT_DELAY_MS: 3000, // ~3s between requests to stay under 30 RPM and within TPM


  // ── Directories to always ignore ────────────────────────────
  IGNORED_DIRS: [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'vendor',
    'bower_components',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '__pycache__',
    '.venv',
    'venv',
    'env',
    '.tox',
    '.eggs',
    'target',          // Java/Rust build output
    'Pods',            // iOS CocoaPods
    '.gradle',
    '.idea',
    '.vscode',
    '.DS_Store',
    'coverage',
    '.nyc_output',
    'tmp',
    'temp',
    'logs',
  ],

  // ── File extensions to always ignore (binaries, media, etc.) ─
  IGNORED_EXTENSIONS: [
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.tiff',
    // Fonts
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    // Audio/Video
    '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg', '.webm',
    // Archives
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.jar', '.war',
    // Binaries / Compiled
    '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.class', '.pyc', '.pyo',
    '.wasm', '.bin',
    // Data files (usually large)
    '.sqlite', '.db', '.sqlite3',
    // Lock files (not useful for AI analysis)
    '.lock',
    // Maps
    '.map',
    // PDFs / Docs
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  ],

  // ── File extensions → language mapping ──────────────────────
  EXTENSION_LANGUAGE_MAP: {
    '.js':    'JavaScript',
    '.jsx':   'JavaScript (JSX)',
    '.ts':    'TypeScript',
    '.tsx':   'TypeScript (TSX)',
    '.mjs':   'JavaScript (ESM)',
    '.cjs':   'JavaScript (CJS)',
    '.py':    'Python',
    '.rb':    'Ruby',
    '.java':  'Java',
    '.kt':    'Kotlin',
    '.go':    'Go',
    '.rs':    'Rust',
    '.c':     'C',
    '.cpp':   'C++',
    '.cc':    'C++',
    '.h':     'C/C++ Header',
    '.hpp':   'C++ Header',
    '.cs':    'C#',
    '.swift': 'Swift',
    '.php':   'PHP',
    '.sql':   'SQL',
    '.html':  'HTML',
    '.htm':   'HTML',
    '.css':   'CSS',
    '.scss':  'SCSS',
    '.sass':  'Sass',
    '.less':  'Less',
    '.json':  'JSON',
    '.yaml':  'YAML',
    '.yml':   'YAML',
    '.xml':   'XML',
    '.md':    'Markdown',
    '.txt':   'Text',
    '.sh':    'Shell',
    '.bash':  'Bash',
    '.zsh':   'Zsh',
    '.ps1':   'PowerShell',
    '.bat':   'Batch',
    '.dockerfile': 'Dockerfile',
    '.toml':  'TOML',
    '.ini':   'INI',
    '.cfg':   'Config',
    '.env':   'Environment',
    '.r':     'R',
    '.lua':   'Lua',
    '.dart':  'Dart',
    '.ex':    'Elixir',
    '.exs':   'Elixir Script',
    '.erl':   'Erlang',
    '.hs':    'Haskell',
    '.scala': 'Scala',
    '.clj':   'Clojure',
    '.vue':   'Vue',
    '.svelte':'Svelte',
    '.tf':    'Terraform',
    '.proto': 'Protocol Buffers',
    '.graphql':'GraphQL',
    '.gql':   'GraphQL',
  },

  // ── Special filenames (no extension) → language ─────────────
  SPECIAL_FILE_MAP: {
    'Dockerfile':     'Dockerfile',
    'Makefile':       'Makefile',
    'Jenkinsfile':    'Groovy',
    'Vagrantfile':    'Ruby',
    'Gemfile':        'Ruby',
    'Rakefile':       'Ruby',
    'Procfile':       'Procfile',
    '.gitignore':     'Git Config',
    '.dockerignore':  'Docker Config',
    '.eslintrc':      'JSON',
    '.prettierrc':    'JSON',
    '.babelrc':       'JSON',
    '.editorconfig':  'EditorConfig',
  },

  // ── DB batch insert size ────────────────────────────────────
  DB_BATCH_SIZE: 500,
};
