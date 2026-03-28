import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, Map, FileCode, Search, Terminal, AlertCircle, ShieldAlert, Database, ArrowLeft, ExternalLink, FileStack, Zap, User, RefreshCw, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getRepoStatus, getArchitecture, getStartHere, getDataFlow, getIssues, askQuestion, syncRepo, runAIAnalysis } from '../api';
import CodeViewer from '../components/CodeViewer';
import { Link } from 'react-router-dom';

export default function RepoDetails() {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  const [activeTab, setActiveTab] = useState('architecture');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [architecture, setArchitecture] = useState(null);
  const [startHere, setStartHere] = useState(null);
  const [dataFlow, setDataFlow] = useState(null);
  const [issues, setIssues] = useState([]);
  
  // Chat state
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [asking, setAsking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncRepo(id);
      alert('GitHub synchronization started in the background.');
    } catch (err) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const repoRes = await getRepoStatus(id);
        setRepo(repoRes.data.data);
        
        // Fetch all analysis in parallel
        const [archRes, startRes, flowRes, issuesRes] = await Promise.allSettled([
          getArchitecture(id),
          getStartHere(id),
          getDataFlow(id),
          getIssues(id)
        ]);
        
        if (archRes.status === 'fulfilled' && archRes.value.data.analysisFound) {
          setArchitecture(archRes.value.data.data.architectureOverview);
        } else if (repoRes.data.data.status === 'ready') {
          // Quietly start analysis if it's missing
          runAIAnalysis(id).catch(() => {});
        }

        if (startRes.status === 'fulfilled' && startRes.value.data.analysisFound) {
          setStartHere(startRes.value.data.data.startHereGuide);
        }
        
        if (flowRes.status === 'fulfilled' && flowRes.value.data.analysisFound) {
          setDataFlow(flowRes.value.data.data.dataFlowAnalysis);
        }

        if (issuesRes.status === 'fulfilled') {
          setIssues(issuesRes.value.data.data);
        }
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    
    const userMsg = { role: 'user', content: question };
    setChatHistory(prev => [...prev, userMsg]);
    setQuestion('');
    setAsking(true);
    
    try {
      const res = await askQuestion(id, userMsg.content);
      setChatHistory(prev => [...prev, { role: 'bot', content: res.data.data.answer }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'bot', content: '❌ Failed to connect to AI: ' + err.message }]);
    } finally {
      setAsking(false);
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary"></div></div>;
  if (!repo) return <div className="alert alert-danger">Repository not found</div>;

  return (
    <div className="fade-in px-4 py-3">
      <div className="mb-5 pb-4 border-bottom border-light border-opacity-10 d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4">
        <div>
          <Link to="/dashboard" className="btn btn-link text-subtle p-0 mb-3 d-flex align-items-center gap-2 text-decoration-none hover-white transition">
            <ArrowLeft size={16} /> Back to Workspaces
          </Link>
          <div className="d-flex align-items-center gap-3">
            <div className="bg-primary bg-opacity-10 p-3 rounded-2xl border border-primary border-opacity-10 shadow-lg shadow-primary-opacity">
              <Zap size={32} className="text-primary" />
            </div>
            <div>
              <h1 className="fw-bold mb-1 text-white display-6">{repo.name}</h1>
              <p className="text-subtle mb-0 d-flex align-items-center gap-3">
                <span className="d-flex align-items-center gap-2 px-2 py-1 bg-dark bg-opacity-50 rounded border border-light border-opacity-5 small"><FileStack size={14} className="text-info"/> {repo.totalFiles} files</span>
                <span className="d-flex align-items-center gap-2 px-2 py-1 bg-dark bg-opacity-50 rounded border border-light border-opacity-5 small"><Database size={14} className="text-warning"/> {repo.totalSizeMB} MB</span>
                <a href={repo.githubUrl} target="_blank" rel="noopener noreferrer" className="text-accent text-decoration-none d-flex align-items-center gap-1 hover-white transition small">
                  View on GitHub <ExternalLink size={14} />
                </a>
              </p>
            </div>
          </div>
        </div>
        
        <div className="d-flex align-items-center gap-3">
           <button 
             className="btn btn-dark bg-opacity-30 border-light border-opacity-10 rounded-pill px-4 py-2 text-subtle hover-white d-flex align-items-center gap-2 transition"
             onClick={handleSync}
             disabled={syncing}
           >
             {syncing ? <Loader2 className="spinner" size={16}/> : <RefreshCw size={16} />}
             Sync Latest
           </button>
           <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-20 rounded-pill px-3 py-2 d-flex align-items-center gap-2">
             <span className="d-inline-block rounded-circle bg-success shadow-success" style={{width:'8px', height:'8px'}}></span>
             Ready for Insight
           </span>
        </div>
      </div>

      <div className="row">
        {/* Left Sidebar - Navigation */}
        <div className="col-12 col-md-3 mb-4">
          <div className="glass-panel p-2">
            <NavButton active={activeTab === 'architecture'} icon={<Map size={18}/>} label="Architecture" onClick={() => setActiveTab('architecture')} />
            <NavButton active={activeTab === 'start-here'} icon={<Terminal size={18}/>} label="Start Guide" onClick={() => setActiveTab('start-here')} />
            <NavButton active={activeTab === 'data-flow'} icon={<Database size={18}/>} label="Data Flow" onClick={() => setActiveTab('data-flow')} />
            <NavButton active={activeTab === 'issues'} icon={<ShieldAlert size={18}/>} label="Code Issues" onClick={() => setActiveTab('issues')} />
            <NavButton active={activeTab === 'code'} icon={<FileCode size={18}/>} label="Code Viewer" onClick={() => setActiveTab('code')} />
            <NavButton active={activeTab === 'chat'} icon={<Bot size={18}/>} label="Ask DevLens AI" onClick={() => setActiveTab('chat')} />
          </div>
        </div>

        {/* Right Content Area */}
        <div className="col-12 col-md-9">
          <div className="glass-panel p-5 min-vh-75 shadow-2xl border-light border-opacity-5 rounded-3xl">
            {activeTab === 'architecture' && (
              <div className="markdown-body fade-in">
                <div className="d-flex align-items-center gap-3 mb-5">
                   <div className="bg-primary bg-opacity-10 p-2 rounded-lg border border-primary border-opacity-10">
                      <Map size={24} className="text-primary" />
                   </div>
                   <h2 className="m-0 text-gradient fw-bold">System Architecture</h2>
                </div>
                <div className="markdown-content">
                  {architecture ? <ReactMarkdown>{architecture}</ReactMarkdown> : (
                    <div className="text-center py-5">
                        <div className="spinner-border text-primary mb-3"></div>
                        <p className="text-subtle">Generating architectural insights...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'start-here' && (
              <div className="markdown-body fade-in">
                <div className="d-flex align-items-center gap-3 mb-5">
                   <div className="bg-info bg-opacity-10 p-2 rounded-lg border border-info border-opacity-10">
                      <Terminal size={24} className="text-info" />
                   </div>
                   <h2 className="m-0 text-gradient fw-bold">Start Here Guide</h2>
                </div>
                <div className="markdown-content">
                  {startHere ? <ReactMarkdown>{startHere}</ReactMarkdown> : (
                    <div className="text-center py-5">
                        <div className="spinner-border text-info mb-3"></div>
                        <p className="text-subtle">Building your onboarding path...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'data-flow' && (
              <div className="markdown-body fade-in">
                <div className="d-flex align-items-center gap-3 mb-5">
                   <div className="bg-warning bg-opacity-10 p-2 rounded-lg border border-warning border-opacity-10">
                      <Database size={24} className="text-warning" />
                   </div>
                   <h2 className="m-0 text-gradient fw-bold">Data Flow Analysis</h2>
                </div>
                <div className="markdown-content">
                  {dataFlow ? <ReactMarkdown>{dataFlow}</ReactMarkdown> : (
                    <div className="text-center py-5">
                        <div className="spinner-border text-warning mb-3"></div>
                        <p className="text-subtle">Mapping information pathways...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'issues' && (
              <div className="fade-in">
                <div className="d-flex align-items-center gap-3 mb-5">
                   <div className="bg-danger bg-opacity-10 p-2 rounded-lg border border-danger border-opacity-10">
                      <ShieldAlert size={24} className="text-danger" />
                   </div>
                   <h2 className="m-0 text-gradient fw-bold">Code Health & Security</h2>
                </div>
                {issues.length === 0 ? (
                  <div className="text-center py-5">
                    <div className="bg-success bg-opacity-5 d-inline-flex p-4 rounded-circle mb-3">
                       <Bot size={48} className="text-success opacity-50" />
                    </div>
                    <h4 className="text-white">Clean Bill of Health!</h4>
                    <p className="text-subtle">No significant architectural issues or security leaks were found.</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-4">
                    {issues.map((issue, idx) => (
                      <div key={issue.id} className="glass-panel p-4 border-light border-opacity-5 hover-bg transition" style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <span className={`badge rounded-pill px-3 py-1 ${issue.severity === 'high' ? 'bg-danger bg-opacity-15 text-danger border border-danger border-opacity-20' : issue.severity === 'medium' ? 'bg-warning bg-opacity-15 text-warning border border-warning border-opacity-20' : 'bg-info bg-opacity-15 text-info border border-info border-opacity-20'} text-uppercase small fw-bold`}>
                            {issue.severity} Severity
                          </span>
                          <span className="text-subtle small font-monospace d-flex align-items-center gap-2">
                             <FileCode size={14}/> {issue.filePath} : {issue.lineNumber || '?'}
                          </span>
                        </div>
                        <p className="mb-0 text-white-50 leading-relaxed" style={{fontSize: '1.05rem'}}>{issue.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'code' && (
               <CodeViewer repoId={id} />
            )}

            {activeTab === 'chat' && (
              <div className="d-flex flex-column fade-in" style={{ height: '700px' }}>
                <div className="d-flex align-items-center gap-3 mb-5">
                   <div className="bg-primary bg-opacity-10 p-2 rounded-lg border border-primary border-opacity-10">
                      <Bot size={24} className="text-primary" />
                   </div>
                   <h2 className="m-0 text-gradient fw-bold">Ask DevLens AI</h2>
                </div>
                
                <div className="flex-grow-1 overflow-auto mb-4 pe-3 custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {chatHistory.length === 0 ? (
                    <div className="text-center text-subtle my-auto fade-in">
                      <div className="bg-dark bg-opacity-40 d-inline-flex p-4 rounded-circle mb-4 border border-light border-opacity-5">
                         <Bot size={64} className="opacity-40 floating" color="#818cf8" />
                      </div>
                      <h4 className="text-white fw-bold mb-2">Code Intelligence Ready</h4>
                      <p className="max-w-xs mx-auto opacity-60">Ask me anything about the architecture, logic, or dependencies of {repo.name}.</p>
                      <div className="d-flex justify-content-center gap-2 mt-4">
                         <span className="badge bg-dark border border-light border-opacity-10 px-3 py-2 rounded-pill font-normal cursor-pointer hover-bg" onClick={() => setQuestion("Explain the auth flow")}>Explain Auth Flow</span>
                         <span className="badge bg-dark border border-light border-opacity-10 px-3 py-2 rounded-pill font-normal cursor-pointer hover-bg" onClick={() => setQuestion("List all API routes")}>List API Routes</span>
                      </div>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl max-w-85 animate-slide-up ${msg.role === 'user' ? 'align-self-end bg-primary bg-opacity-10 border border-primary border-opacity-20 text-white shadow-lg' : 'align-self-start bg-dark bg-opacity-40 border border-light border-opacity-10 shadow-xl text-light'}`} style={{ width: 'fit-content', minWidth: '10%' }}>
                        <div className="d-flex align-items-center gap-2 mb-2 opacity-50 small fw-bold uppercase tracking-wider">
                           {msg.role === 'user' ? <><User size={14}/> Explorer</> : <><Bot size={14}/> DevLens AI</>}
                        </div>
                        <div className="markdown-body leading-relaxed"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                      </div>
                    ))
                  )}
                  {asking && (
                    <div className="align-self-start bg-dark bg-opacity-40 border border-light border-opacity-10 p-4 rounded-2xl shadow-xl">
                        <div className="d-flex align-items-center gap-3">
                           <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                           <span className="text-subtle animate-pulse">Consulting codebase knowledge graph...</span>
                        </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-4 border-top border-light border-opacity-5 relative">
                  <form onSubmit={handleAsk} className="d-flex gap-3">
                    <div className="flex-grow-1 relative">
                       <input
                        type="text"
                        className="form-control form-control-glass py-3 px-4 shadow-2xl"
                        placeholder="Ask a question about the code..."
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        disabled={asking}
                        style={{ paddingRight: '50px' }}
                      />
                    </div>
                    <button type="submit" className="btn-primary-gradient px-4 rounded-2xl shadow-lg transition-all" disabled={asking || !question.trim()}>
                      <Search size={22} strokeWidth={2.5} />
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-100 text-start border-0 py-3 px-4 mb-2 d-flex align-items-center gap-3 rounded-2xl transition-all duration-300 ${active ? 'bg-primary bg-opacity-15 text-white fw-bold border border-primary border-opacity-20 shadow-lg card-glow' : 'bg-transparent text-subtle hover-bg px-5'}`}
      style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <span className={`${active ? 'text-primary' : 'opacity-50'} transition-all duration-300`} style={{ transform: active ? 'scale(1.2)' : 'scale(1)' }}>{icon}</span>
      <span className="flex-grow-1">{label}</span>
      {active && <div className="rounded-circle bg-primary shadow-primary" style={{width:'6px', height:'6px'}}></div>}
    </button>
  );
}
