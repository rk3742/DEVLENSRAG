import { Link, useLocation } from 'react-router-dom';
import { Terminal, LayoutDashboard, Plus, User } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

export default function Navbar() {
  const location = useLocation();
  const token = localStorage.getItem('devlens_token');

  return (
    <nav className="navbar navbar-expand-lg glass-nav sticky-top py-3 animate-slide-down">
      <div className="container px-4">
        <Link to="/" className="navbar-brand d-flex align-items-center gap-3 text-white transition-all transform hover-scale-105">
          <div className="bg-primary bg-opacity-10 p-2 rounded-xl border border-primary border-opacity-10 shadow-lg shadow-primary-opacity">
             <Terminal size={24} color="#818cf8" strokeWidth={3} />
          </div>
          <span className="fw-bold tracking-wider fs-4" style={{ letterSpacing: '2px' }}>DEVLENS<span className="text-gradient">AI</span></span>
        </Link>
        <button className="navbar-toggler border-0 shadow-none px-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <div className="d-flex flex-column gap-1">
             <div className="bg-white rounded-full bg-opacity-50" style={{height:'2px', width:'24px'}}></div>
             <div className="bg-white rounded-full bg-opacity-50" style={{height:'2px', width:'18px'}}></div>
             <div className="bg-white rounded-full bg-opacity-50" style={{height:'2px', width:'24px'}}></div>
          </div>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto align-items-center gap-3 mt-4 mt-lg-0">
            {token && (
              <li className="nav-item">
                <Link to="/dashboard" className={`nav-link text-white d-flex align-items-center gap-2 px-3 py-2 rounded-pill transition-all ${location.pathname === '/dashboard' ? 'bg-primary bg-opacity-10 fw-bold border border-primary border-opacity-10 shadow-sm' : 'opacity-60 hover-bg'}`}>
                  <LayoutDashboard size={18} />
                  Dashboard
                </Link>
              </li>
            )}
            <li className="nav-item ms-lg-2">
              <Link to="/connect" className="btn-primary-gradient rounded-fill px-4 py-2 d-flex align-items-center gap-2 text-decoration-none shadow-lg">
                <Plus size={18} />
                <span className="fw-bold">New Repo</span>
              </Link>
            </li>
            {!token && (
              <li className="nav-item ms-lg-2">
                 <button onClick={() => {
                   const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                   window.location.href = `${baseUrl}/auth/github`;
                 }} className="btn btn-outline-light border-light border-opacity-10 rounded-pill px-4 py-2 d-flex align-items-center gap-2 transition-all hover-white fw-bold">
                    <FaGithub size={18} />
                    Login
                 </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
