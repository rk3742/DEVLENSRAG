import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon, AlertCircle, Loader2, UploadCloud, FolderGit2, Zap, Database, Bot } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { connectRepo, analyzeRepo, getRepoStatus, runAIAnalysis, getAnalysisStatus, getGithubRepos, uploadZipData } from '../api';
import { io } from 'socket.io-client';


export default function ConnectRepo() {
  const [tab, setTab] = useState('url'); // 'url', 'myrepos', 'zip'
  
  // URL Tab state
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  
  // My Repos Tab state
  const [myRepos, setMyRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  
  // Zip Tab state
  const [zipFile, setZipFile] = useState(null);

  // Common UI State
  const [step, setStep] = useState(1); // 1: URL/Upload, 2: Preview & Model, 3: Processing
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  
  // Pipeline status tracking
  const [repoId, setRepoId] = useState(null);
  const [parseStatus, setParseStatus] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [aiStepMessage, setAiStepMessage] = useState('Vectorless RAG');

  const navigate = useNavigate();

  useEffect(() => {
    if (tab === 'myrepos') {
      fetchMyRepos();
    }
  }, [tab]);

  const fetchMyRepos = async () => {
    setReposLoading(true);
    setError(null);
    try {
      const res = await getGithubRepos();
      setMyRepos(res.data.data);
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Please login with GitHub first to view your repositories.");
      } else {
        setError(err.response?.data?.message || err.message);
      }
    } finally {
      setReposLoading(false);
    }
  };

  const handleSelectRepo = (repoUrl) => {
    setUrl(repoUrl);
    setTab('url');
  };

  const handleZipChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setZipFile(e.target.files[0]);
    }
  };

  const handleZipUpload = async (e) => {
    e.preventDefault();
    if (!zipFile) return;
    
    setLoading(true);
    setError(null);
    setStep(3);
    setParseStatus('uploading');
    
    try {
      const formData = new FormData();
      formData.append('zipfile', zipFile);
      
      const res = await uploadZipData(formData);
      const id = res.data.data.repoId;
      setRepoId(id);
      
      startPollingPipeline(id);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message);
      setStep(1);
      setLoading(false);
    }
  };

  // 1. Validate GitHub URL and get preview
  const handlePreview = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await connectRepo({ githubUrl: url, githubToken: token });
      setPreview(res.data.data.repository);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Start full analysis pipeline
  const handleStartAnalysis = async () => {
    setLoading(true);
    setStep(3);
    setParseStatus('cloning');
    
    try {
      // Step A: Parse repo into database
      const res = await analyzeRepo({ githubUrl: url, githubToken: token });
      const id = res.data.data.repoId;
      setRepoId(id);
      
      startPollingPipeline(id);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      setStep(2);
      setLoading(false);
    }
  };

  // Used for both ZIP and GitHub after parsing starts
  const startPollingPipeline = (id) => {
    const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    
    socket.emit('subscribe_repo', id);
    
    // Listen for parse pipeline
    socket.on('repo_update', (data) => {
      setParseStatus(data.status);
      if (data.status === 'ready') {
        startAiAnalysis(id, socket);
      } else if (data.status === 'failed') {
        socket.disconnect();
        setError(data.errorMessage || 'Parsing failed');
        setStep(1);
        setLoading(false);
      }
    });

    // Listen for AI pipeline
    socket.on('analysis_update', (data) => {
      setAiStatus(data.status);
      if (data.step) {
        setAiStepMessage(data.step);
      }
      
      if (data.status === 'ready') {
        socket.disconnect();
        navigate(`/repo/${id}`);
      } else if (data.status === 'failed') {
        socket.disconnect();
        setError(data.error_message || 'AI Analysis failed');
        setStep(1);
        setLoading(false);
      }
    });

    // Cleanup unmount
    return () => { socket.disconnect(); };
  };

  // 3. Start AI Analysis phase
  const startAiAnalysis = async (id, socket) => {
    setAiStatus('starting');
    setAiStepMessage('Initializing AI Models');
    try {
      await runAIAnalysis(id, { model: selectedModel });
      // Wait for socket to receive 'analysis_update' events automatically
    } catch (err) {
      if(socket) socket.disconnect();
      setError(err.response?.data?.error?.message || err.message);
      setStep(1);
      setLoading(false);
    }
  };

  return (
    <div className="row justify-content-center mt-3 fade-in">
      <div className="col-12 col-md-10 col-lg-8">
        
        {step === 1 && (
          <div className="d-flex justify-content-center mb-5 gap-3 p-2 bg-dark bg-opacity-30 rounded-full border border-light border-opacity-5 mx-auto" style={{ width: 'fit-content', borderRadius: '100px' }}>
            <button 
              className={`px-4 py-2 rounded-full transition-all duration-300 d-flex align-items-center gap-2 border-0 ${tab === 'url' ? 'bg-primary text-white shadow-lg fw-bold px-5' : 'bg-transparent text-subtle hover-bg px-4'}`} 
              onClick={() => setTab('url')}
            >
              <LinkIcon size={16}/> GitHub URL
            </button>
            <button 
              className={`px-4 py-2 rounded-full transition-all duration-300 d-flex align-items-center gap-2 border-0 ${tab === 'myrepos' ? 'bg-primary text-white shadow-lg fw-bold px-5' : 'bg-transparent text-subtle hover-bg px-4'}`} 
              onClick={() => setTab('myrepos')}
            >
              <FaGithub size={16}/> My Repos
            </button>
            <button 
              className={`px-4 py-2 rounded-full transition-all duration-300 d-flex align-items-center gap-2 border-0 ${tab === 'zip' ? 'bg-primary text-white shadow-lg fw-bold px-5' : 'bg-transparent text-subtle hover-bg px-4'}`} 
              onClick={() => setTab('zip')}
            >
              <UploadCloud size={16}/> Upload ZIP
            </button>
          </div>
        )}

        <div className="glass-panel p-5 shadow-2xl border-light border-opacity-5 rounded-3xl overflow-hidden relative">
           <div className="position-absolute top-0 start-0 w-100 h-1 bg-gradient-to-r from-transparent via-primary-opacity to-transparent opacity-50" style={{height:'2px'}}></div>

          <div className="text-center mb-5">
            <div className="d-inline-flex justify-content-center align-items-center rounded-2xl bg-primary bg-opacity-10 border border-primary border-opacity-10 mb-4 shadow-lg shadow-primary-opacity" style={{ width: '80px', height: '80px' }}>
              {tab === 'zip' ? <UploadCloud size={40} color="#8b5cf6" className="floating" /> : <FaGithub size={40} color="#8b5cf6" className="floating" />}
            </div>
            <h2 className="fw-bold text-white mb-2 display-6">Import Codebase</h2>
            <p className="text-subtle opacity-75 max-w-sm mx-auto">Bring your code into DevLens AI vectorless memory and start exploring insights.</p>
          </div>

          {error && (
            <div className="alert bg-danger bg-opacity-10 border border-danger text-danger d-flex align-items-center gap-2 mb-4">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && tab === 'url' && (
            <form onSubmit={handlePreview}>
              <div className="mb-4">
                <label className="form-label text-subtle fw-medium mb-2 d-flex align-items-center gap-2">
                  <LinkIcon size={16} /> Repository URL
                </label>
                <input type="url" className="form-control form-control-glass py-3" placeholder="https://github.com/facebook/react" value={url} onChange={(e) => setUrl(e.target.value)} required />
              </div>
              <div className="mb-4">
                <label className="form-label text-subtle fw-medium mb-2 d-flex justify-content-between">
                  <span>GitHub Personal Access Token</span>
                  <span className="small opacity-50">Optional if OAuth used</span>
                </label>
                <input type="password" className="form-control form-control-glass py-2" placeholder="ghp_..." value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary-gradient w-100 py-3 mt-2 d-flex justify-content-center align-items-center gap-2" disabled={loading || !url}>
                {loading ? <><Loader2 className="spinner" size={20} /> Verifying...</> : 'Connect Repository'}
              </button>
            </form>
          )}

          {step === 1 && tab === 'myrepos' && (
            <div className="fade-in">
              {reposLoading ? (
                 <div className="text-center p-5"><Loader2 className="spinner text-primary" size={48} /></div>
              ) : myRepos.length > 0 ? (
                <div className="list-group list-group-flush border border-light border-opacity-5 rounded-2xl overflow-hidden bg-black bg-opacity-30 shadow-inner" style={{ maxHeight: '400px' }}>
                  {myRepos.map(repo => (
                    <button 
                      key={repo.id} 
                      onClick={() => handleSelectRepo(repo.html_url)} 
                      className="list-group-item list-group-item-action bg-transparent text-light border-light border-opacity-5 d-flex justify-content-between align-items-center p-4 hover-bg transition-all"
                    >
                      <div className="d-flex align-items-center gap-4">
                        <div className="bg-dark bg-opacity-50 p-2 rounded-lg border border-light border-opacity-10">
                           <FolderGit2 size={24} className="text-primary" />
                        </div>
                        <div className="text-start">
                          <div className="fw-bold text-white mb-1" style={{fontSize:'1.1rem'}}>{repo.name}</div>
                          <div className="small text-subtle opacity-60 font-monospace">{repo.full_name}</div>
                        </div>
                      </div>
                      <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 rounded-pill px-3 py-2 fw-normal">{repo.language || 'Any'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-subtle py-5 bg-black bg-opacity-20 rounded-2xl border border-dashed border-light border-opacity-10">
                   <AlertCircle size={32} className="mb-3 opacity-30"/>
                   <p>No repositories found. Ensure you are logged in.</p>
                </div>
              )}
            </div>
          )}

          {step === 1 && tab === 'zip' && (
            <form onSubmit={handleZipUpload}>
              <div className="mb-4">
                <label className="form-label text-subtle fw-medium mb-2">Upload Local Repository (.zip)</label>
                <input 
                  type="file" 
                  accept=".zip" 
                  className="form-control form-control-glass py-3" 
                  onChange={handleZipChange} 
                  required 
                />
              </div>
              <button type="submit" className="btn-primary-gradient w-100 py-3 mt-2 d-flex justify-content-center align-items-center gap-2" disabled={loading || !zipFile}>
                {loading ? <><Loader2 className="spinner" size={20} /> Uploading & Processing...</> : 'Upload & Start Analysis'}
              </button>
            </form>
          )}

          {step === 2 && preview && (
            <div className="fade-in">
              <div className="p-5 rounded-3xl border border-primary border-opacity-10 bg-primary bg-opacity-5 shadow-2xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)' }}>
                <div className="position-absolute top-0 end-0 p-4 opacity-10">
                   <FaGithub size={120} />
                </div>
                <h3 className="fw-bold mb-3 text-white display-6">{preview.fullName}</h3>
                <p className="text-subtle mb-4 leading-relaxed opacity-80" style={{fontSize: '1.1rem'}}>{preview.description || 'A codebase ready for deep architectural analysis.'}</p>
                <div className="d-flex flex-wrap gap-4 text-white font-medium mb-0">
                  <div className="d-flex align-items-center gap-2 bg-dark bg-opacity-50 px-3 py-2 rounded-xl border border-light border-opacity-5">
                     <div className="rounded-circle bg-primary" style={{width:'8px', height:'8px'}}></div>
                     {preview.language || 'Multi-language'}
                  </div>
                  <div className="d-flex align-items-center gap-2 bg-dark bg-opacity-50 px-3 py-2 rounded-xl border border-light border-opacity-5">
                     <span className="text-warning text-lg">★</span> {preview.stargazers} stars
                  </div>
                <div className="d-flex align-items-center gap-2 bg-dark bg-opacity-50 px-3 py-2 rounded-xl border border-light border-opacity-5">
                     <Database size={16} className="text-info"/> {preview.sizeMB} MB
                  </div>
                </div>

                <div className="mt-5 pt-4 border-top border-light border-opacity-10">
                  <h5 className="text-white fw-bold mb-4 d-flex align-items-center gap-2">
                    <Zap size={18} className="text-primary"/> Select Analysis Engine
                  </h5>
                  <div className="row g-3">
                    {[
                      { id: 'llama-3.3-70b-versatile', name: 'Balanced Pro', desc: 'Standard production engine.', icon: <Zap size={20}/> },
                      { id: 'deepseek-r1-distill-llama-70b', name: 'Deep Reasoner', desc: 'Best for complex logic & bug hunting.', icon: <Bot size={20}/> },
                      { id: 'llama-3.1-8b-instant', name: 'Fast Overview', desc: 'Lightning fast architectural sweep.', icon: <UploadCloud size={20}/> }
                    ].map(m => (
                      <div className="col-md-4" key={m.id}>
                        <div 
                          className={`p-3 rounded-2xl border transition-all cursor-pointer h-100 ${selectedModel === m.id ? 'bg-primary bg-opacity-10 border-primary shadow-lg' : 'bg-dark bg-opacity-30 border-light border-opacity-10 hover-bg'}`}
                          onClick={() => setSelectedModel(m.id)}
                        >
                          <div className={`mb-3 ${selectedModel === m.id ? 'text-primary' : 'text-subtle'}`}>{m.icon}</div>
                          <div className="text-white fw-bold small mb-1">{m.name}</div>
                          <div className="text-subtle extra-small opacity-70" style={{fontSize:'0.75rem'}}>{m.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="d-flex gap-4 mt-5">
                <button type="button" className="btn-glass flex-grow-1 py-3 rounded-2xl hover-bg" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn-primary-gradient flex-grow-1 py-3 rounded-2xl d-flex justify-content-center align-items-center gap-2 shadow-xl" onClick={handleStartAnalysis} disabled={loading}>
                  {loading ? <Loader2 className="spinner" size={20} /> : <><Zap size={20} /> Start Insight Analysis</>}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-5 fade-in">
              <div className="position-relative d-inline-block mb-4">
                <Loader2 className="spinner" size={48} color="#8b5cf6" />
              </div>
              <h4 className="fw-bold mb-3 text-white">Analyzing Codebase...</h4>
              <div className="text-start mx-auto" style={{ maxWidth: '300px' }}>
                <div className="mb-2 d-flex justify-content-between align-items-center">
                  <span className={parseStatus ? 'text-white' : 'text-secondary'}>1. Cloning & Parsing</span>
                  <span className="small text-uppercase text-info">{parseStatus}</span>
                </div>
                <div className="mb-2 d-flex justify-content-between align-items-center">
                  <span className={aiStatus ? 'text-white' : 'text-secondary'}>2. {aiStepMessage}</span>
                  <span className="small text-uppercase text-warning">{aiStatus}</span>
                </div>
                <div className="mb-2 d-flex justify-content-between align-items-center">
                  <span className={aiStatus === 'ready' ? 'text-white' : 'text-secondary'}>3. Generating Insights</span>
                  <span className="small text-uppercase text-success">{aiStatus === 'ready' ? 'done' : ''}</span>
                </div>
              </div>
            </div>
          )}

        </div>
        
        <style>{`
          .spinner { animation: spin 2s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
