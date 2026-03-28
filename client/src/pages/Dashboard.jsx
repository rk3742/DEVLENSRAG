import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { FileCode2, HardDrive, Clock, ArrowRight, Plus, Ghost, Search, Zap, Trash2 } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { getRepos, getProfile, deleteRepo } from '../api';

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [repos, setRepos] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // 1. Check for token in URL
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('devlens_token', token);
      navigate('/dashboard', { replace: true });
    }

    // 2. Fetch User Profile & Repos
    Promise.all([
      getProfile().catch(() => ({ data: { data: null } })), // Soft fail profile
      getRepos()
    ]).then(([profileRes, reposRes]) => {
      setUserProfile(profileRes.data?.data);
      setRepos(reposRes.data.data);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [searchParams, navigate]);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this repository and all its analysis data? This cannot be undone.')) return;

    try {
      await deleteRepo(id);
      setRepos(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary"></div></div>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div className="fade-in px-4 py-3">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-5 mt-4 gap-4">
        <div className="d-flex align-items-center gap-4">
          {userProfile ? (
            <img 
              src={userProfile.avatar_url || 'https://github.com/ghost.png'} 
              alt="avatar" 
              className="rounded-circle border border-primary border-opacity-50 p-1 shadow-lg shadow-primary-opacity"
              style={{ width: '64px', height: '64px', transform: 'scale(1.1)' }} 
            />
          ) : (
             <div className="rounded-circle border border-light border-opacity-20 d-flex align-items-center justify-content-center bg-dark" style={{ width: '64px', height: '64px' }}><Ghost className="text-muted" size={32}/></div>
          )}
          <div>
            <h2 className="mb-1 text-gradient fw-bold">Your Workspaces</h2>
            <p className="text-subtle mb-0 d-flex align-items-center gap-2">
              Welcome back, <span className="text-white fw-bold">{userProfile?.username || 'Explorer'}</span>. You have <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-20 px-2">{repos.length}</span> active repositories.
            </p>
          </div>
        </div>
        <div className="d-flex gap-3">
          <div className="d-none d-lg-flex flex-column align-items-end justify-content-center text-end">
            <div className="text-white fw-bold small">Storage Used</div>
            <div className="text-subtle extra-small opacity-75">
              {(repos.reduce((acc, r) => acc + parseFloat(r.totalSizeMB || 0), 0)).toFixed(2)} MB / 5 GB
            </div>
          </div>
          <Link to="/connect" className="btn-primary-gradient px-4 py-3 d-flex align-items-center gap-2 text-decoration-none rounded-pill shadow-xl hover-scale">
            <Plus size={20} strokeWidth={3} /> <span className="fw-bold">New Repository</span>
          </Link>
        </div>
      </div>

      <div className="row g-4 mb-5">
        {[
          { label: 'Total Files', value: repos.reduce((acc, r) => acc + (r.totalFiles || 0), 0), icon: <FileCode2 className="text-info" />, color: 'info' },
          { label: 'Intelligence Level', value: 'Level 4', icon: <Zap className="text-warning" />, color: 'warning' },
          { label: 'Analyzed Storage', value: `${(repos.reduce((acc, r) => acc + parseFloat(r.totalSizeMB || 0), 0)).toFixed(1)} MB`, icon: <HardDrive className="text-primary" />, color: 'primary' }
        ].map((stat, i) => (
          <div className="col-12 col-md-4" key={i}>
            <div className="glass-panel p-4 rounded-3xl border-light border-opacity-5 d-flex align-items-center gap-4 transition-all hover-glow h-100">
              <div className={`bg-${stat.color} bg-opacity-10 p-3 rounded-2xl border border-${stat.color} border-opacity-10`}>
                {stat.icon}
              </div>
              <div>
                <div className="text-subtle small fw-medium mb-1">{stat.label}</div>
                <div className="text-white h3 fw-bold mb-0">{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex align-items-center mb-5 bg-dark bg-opacity-30 border border-light border-opacity-5 p-2 rounded-pill shadow-inner max-w-lg mx-auto d-none d-lg-flex">
         <Search size={22} className="ms-3 text-subtle" />
         <input 
           type="text" 
           className="form-control border-0 bg-transparent text-white shadow-none px-3" 
           placeholder="Filter workspaces by name, owner, or status..."
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
         />
      </div>

      {filteredRepos.length === 0 ? (
        <div className="glass-panel text-center py-5 shadow-2xl border-light border-opacity-5 rounded-3xl mt-5">
          <div className="d-inline-flex p-4 rounded-circle bg-dark bg-opacity-50 border border-secondary border-opacity-25 mb-4 mb-4">
             <FaGithub size={60} className="text-subtle" />
          </div>
          <h3 className="fw-bold text-white mb-2">No Repositories Hooked</h3>
          <p className="text-subtle mb-5 max-w-md mx-auto px-4" style={{fontSize: '1.1rem'}}>Connect your first codebase to see the magic. We support GitHub links and local ZIP uploads.</p>
          <Link to="/connect" className="btn-primary-gradient px-5 py-3 rounded-pill text-decoration-none shadow-lg d-inline-flex align-items-center gap-2">
            Connect Your First Repo <ArrowRight size={20} />
          </Link>
        </div>
      ) : (
        <div className="row g-4">
          {filteredRepos.map((repo, idx) => (
            <div key={repo.id} className="col-12 col-md-6 col-lg-4 fade-in" style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: 'both' }}>
              <Link to={`/repo/${repo.id}`} className="text-decoration-none h-100 d-block group">
                <div className="glass-panel p-4 h-100 d-flex flex-column hover-bg border-light border-opacity-5 rounded-3xl" style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer', transformOrigin: 'center bottom', position: 'relative' }}>
                  <div className="d-flex justify-content-between align-items-start mb-4">
                    <div className="bg-primary bg-opacity-10 p-3 rounded-2xl border border-primary border-opacity-10 group-hover-bg-primary">
                        <FileCode2 size={24} className="text-primary group-hover-white" />
                    </div>
                    <div className="d-flex align-items-center gap-2">
                       <button 
                         className="btn btn-dark bg-opacity-30 border-light border-opacity-5 p-2 rounded-lg text-danger hover-bg-danger transition"
                         onClick={(e) => handleDelete(repo.id, e)}
                         title="Delete Repository"
                       >
                         <Trash2 size={16} />
                       </button>
                       <span className={`badge rounded-pill px-3 py-2 ${repo.status === 'ready' ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-20' : 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-20'} text-capitalize`}>
                         <span className={`d-inline-block rounded-circle me-2 ${repo.status === 'ready' ? 'bg-success' : 'bg-warning'}`} style={{width:'8px', height:'8px'}}></span>
                         {repo.status}
                       </span>
                    </div>
                  </div>
                  
                  <h4 className="mb-1 text-white fw-bold text-truncate">{repo.name}</h4>
                  <p className="text-subtle text-truncate small mb-4 opacity-75">{repo.owner}/{repo.name}</p>
                  
                  <div className="mt-auto pt-4 border-top border-light border-opacity-10 d-flex justify-content-between text-subtle small font-medium">
                    <div className="d-flex align-items-center gap-2"><HardDrive size={16} className="text-info opacity-75"/> <span className="text-light">{repo.totalFiles} files</span></div>
                    <div className="d-flex align-items-center gap-2"><Clock size={16} className="text-warning opacity-75"/> <span className="text-light">{new Date(repo.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
