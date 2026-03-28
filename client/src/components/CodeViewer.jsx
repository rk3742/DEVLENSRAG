import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { File, FolderTree, ArrowLeft, Loader2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getRepoFiles, getFileContent, askQuestion } from '../api';

export default function CodeViewer({ repoId }) {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [fileError, setFileError] = useState(null);

  // AI Explain State
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState('');
  const [explainedText, setExplainedText] = useState('');

  useEffect(() => {
    async function fetchFiles() {
      try {
        const res = await getRepoFiles(repoId);
        // Only keep valid text source files (we filter binaries on backend anyway)
        setFiles(res.data.data.sort((a,b) => a.filePath.localeCompare(b.filePath)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingFiles(false);
      }
    }
    fetchFiles();
  }, [repoId]);

  const loadFileContent = async (path) => {
    setSelectedFilePath(path);
    setLoadingContent(true);
    setFileError(null);
    try {
      const res = await getFileContent(repoId, path);
      setFileContent(res.data.data);
    } catch (err) {
      setFileError(err.response?.data?.error?.message || err.message);
      setFileContent('Error loading file contents');
    } finally {
      setLoadingContent(false);
    }
  };

  if (loadingFiles) return <div className="p-4 text-center">Loading file tree...</div>;
  if (files.length === 0) return <div className="p-4 text-center text-muted">No files available to view.</div>;

  const monacoLanguage = (path) => {
    if (!path) return 'javascript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.go')) return 'go';
    if (path.endsWith('.rs')) return 'rust';
    if (path.endsWith('.java')) return 'java';
    return 'plaintext';
  };

  const handleEditorDidMount = (editor, monaco) => {
    editor.addAction({
      id: 'devlens-explain-code',
      label: '✨ DevLens AI: Explain Code',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async function (ed) {
        const selection = ed.getSelection();
        const text = ed.getModel().getValueInRange(selection);
        if (text.trim() === '') return;
        
        setExplainedText(text);
        setExplainResult('');
        setShowExplainModal(true);
        setExplainLoading(true);

        try {
          const prompt = `Please explain the following code snippet from ${selectedFilePath}:\n\n\`\`\`\n${text}\n\`\`\``;
          const res = await askQuestion(repoId, prompt);
          setExplainResult(res.data.data.answer);
        } catch (err) {
          setExplainResult('❌ Failed to fetch explanation: ' + (err.response?.data?.error?.message || err.message));
        } finally {
          setExplainLoading(false);
        }
      }
    });
  };

  return (
    <div className="h-100 d-flex flex-column fade-in" style={{ minHeight: '600px' }}>
      <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom border-light border-opacity-10">
        <h3 className="m-0 text-gradient d-flex align-items-center gap-2">
          {selectedFilePath ? (
             <><button className="btn btn-sm btn-outline-light p-1 me-2 rounded-circle" onClick={() => setSelectedFilePath(null)}><ArrowLeft size={16}/></button> {selectedFilePath}</>
          ) : (
            <><FolderTree size={20} className="mb-1"/> Code Viewer Explorer</>
          )}
        </h3>
      </div>
      
      {!selectedFilePath ? (
         <div className="flex-grow-1 overflow-auto pe-2 list-group list-group-flush" style={{ maxHeight: '600px' }}>
           {files.map(f => (
             <button 
                key={f.id} 
                onClick={() => loadFileContent(f.filePath)} 
                className="list-group-item list-group-item-action bg-transparent text-white border-0 py-2 px-3 d-flex align-items-center gap-3 hover-bg rounded mb-1"
                style={{ transition: 'all 0.2s' }}
             >
                <File size={16} className="text-secondary" />
                <span className="font-monospace small flex-grow-1 text-start">{f.filePath}</span>
                <span className="badge bg-secondary bg-opacity-25 text-white fw-normal">{f.language}</span>
                <span className="text-muted small" style={{fontSize:'0.7rem'}}>{f.lineCount} lines</span>
             </button>
           ))}
         </div>
      ) : (
         <div className="flex-grow-1 position-relative border border-secondary border-opacity-25 rounded overflow-hidden" style={{ height: '600px' }}>
            {loadingContent && (
               <div className="position-absolute top-50 start-50 translate-middle text-center z-1 w-100 h-100 d-flex justify-content-center align-items-center bg-dark bg-opacity-75">
                  <div className="spinner-border text-primary"></div>
               </div>
            )}
            {fileError ? (
               <div className="p-4 text-center text-danger">{fileError}</div>
            ) : (
              <Editor
                height="100%"
                theme="vs-dark"
                path={selectedFilePath}
                language={monacoLanguage(selectedFilePath)}
                value={fileContent}
                onMount={handleEditorDidMount}
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  padding: { top: 16 }
                }}
              />
            )}
         </div>
      )}

      {/* AI Explain Modal Overlay */}
      {showExplainModal && (
        <div className="position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 z-3 d-flex justify-content-center align-items-center p-4 fade-in">
          <div className="glass-panel w-100 h-100 d-flex flex-column overflow-hidden" style={{ maxWidth: '800px', maxHeight: '80vh' }}>
            <div className="p-3 border-bottom border-secondary border-opacity-25 d-flex justify-content-between align-items-center bg-dark bg-opacity-50">
              <h5 className="m-0 text-gradient d-flex align-items-center gap-2">✨ DevLens Insight</h5>
              <button className="btn btn-sm btn-outline-light rounded-circle p-1" onClick={() => setShowExplainModal(false)}><X size={16} /></button>
            </div>
            
            <div className="p-3 bg-black bg-opacity-25 border-bottom border-secondary border-opacity-25" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              <pre className="m-0 text-info fw-bold" style={{ fontSize: '0.8rem' }}>{explainedText}</pre>
            </div>

            <div className="p-4 flex-grow-1 overflow-auto bg-dark bg-opacity-10 markdown-body text-white w-100">
              {explainLoading ? (
                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-subtle">
                  <Loader2 className="spinner mb-3" size={32} color="#8b5cf6" />
                  <p>Analyzing code snippet...</p>
                </div>
              ) : (
                <ReactMarkdown>{explainResult}</ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
