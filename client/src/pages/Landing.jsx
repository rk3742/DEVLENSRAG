import React from 'react';
import { Link } from 'react-router-dom';
import { FaGithub, FaBolt, FaCodeBranch, FaProjectDiagram, FaSearch, FaRocket } from 'react-icons/fa';

export default function Landing() {
  const features = [
    {
      icon: <FaBolt className="text-warning fs-1 mb-3" />,
      title: "Vectorless RAG Engine",
      description: "Blazing fast codebase mapping without the chunking latency. Harness massive AI context windows directly."
    },
    {
      icon: <FaProjectDiagram className="text-info fs-1 mb-3" />,
      title: "Architecture Visualized",
      description: "Auto-generate high-level architectural overviews, data flows, and structural diagrams instantly."
    },
    {
      icon: <FaCodeBranch className="text-success fs-1 mb-3" />,
      title: "Codebase Onboarding",
      description: "Instantly create dynamic 'Start Here' guides for new developers joining the repository."
    },
    {
      icon: <FaSearch className="text-primary fs-1 mb-3" />,
      title: "Context-Aware Q&A",
      description: "Chat with your repository. DevLens AI answers any question with precise references to your codebase."
    }
  ];

  return (
    <div className="landing-page position-relative overflow-hidden w-100" style={{ minHeight: '100vh', marginTop: '-1.5rem', paddingTop: '1.5rem' }}>
      
      {/* Dynamic Background Effects */}
      <div className="position-absolute top-0 start-0 w-100 h-100" style={{ zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="position-absolute rounded-circle" style={{
          width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(111, 66, 193, 0.15) 0%, rgba(0,0,0,0) 70%)',
          top: '-10%', left: '-10%', filter: 'blur(60px)'
        }}></div>
        <div className="position-absolute rounded-circle" style={{
          width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(13, 110, 253, 0.1) 0%, rgba(0,0,0,0) 70%)',
          bottom: '10%', right: '-5%', filter: 'blur(60px)'
        }}></div>
      </div>

      <div className="container position-relative" style={{ zIndex: 1, paddingTop: '10vh' }}>
        {/* Hero Section */}
        <div className="row justify-content-center text-center mb-5 pb-5">
          <div className="col-lg-8">
            <div className="d-inline-flex align-items-center bg-dark border border-secondary rounded-pill px-3 py-1 mb-4" style={{ boxShadow: '0 0 15px rgba(111, 66, 193, 0.3)' }}>
              <span className="badge bg-primary rounded-pill me-2">New</span>
              <span className="text-light small">DevLens AI 1.0 is now live</span>
            </div>
            
            <h1 className="display-3 fw-bolder text-white mb-4" style={{ letterSpacing: '-0.03em' }}>
              Understand Any Codebase <br/>
              <span style={{ 
                background: 'linear-gradient(90deg, #b19cd9, #0d6efd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>Instantly.</span>
            </h1>
            
            <p className="lead text-secondary mb-5 px-md-5" style={{ fontSize: '1.2rem', lineHeight: '1.6' }}>
              Connect your GitHub repository, upload a zip, or drop a link. DevLens AI builds an instant knowledge graph, writes onboarding docs, traces data flow, and answers questions using an advanced Vectorless RAG engine.
            </p>
            
            <div className="d-flex justify-content-center gap-3">
              <Link to="/dashboard" className="btn btn-primary btn-lg rounded-pill px-5 py-3 fw-bold d-flex align-items-center gap-2" style={{ transition: 'transform 0.2s', boxShadow: '0 4px 20px rgba(13, 110, 253, 0.4)' }}>
                <FaRocket /> Start Analyzing
              </Link>
              <button onClick={() => {
                const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                window.location.href = `${baseUrl}/auth/github`;
              }} className="btn btn-light btn-lg rounded-pill px-5 py-3 fw-bold d-flex align-items-center gap-2" style={{ transition: 'transform 0.2s' }}>
                <FaGithub /> Login with GitHub
              </button>
            </div>
          </div>
        </div>

        {/* Browser Mockup Demo Visual */}
        <div className="row justify-content-center mb-5 pb-5 fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <div className="col-12 col-xl-10">
            <div className="card bg-dark border-secondary overflow-hidden shadow-lg" style={{ borderRadius: '1rem', boxShadow: '0 25px 60px -15px rgba(99, 102, 241, 0.5), 0 0 0 1px rgba(255,255,255,0.1)' }}>
              <div className="card-header bg-black border-bottom border-light border-opacity-10 d-flex align-items-center px-3 py-3">
                <div className="d-flex gap-2">
                  <div className="rounded-circle bg-danger" style={{width: '12px', height: '12px'}}></div>
                  <div className="rounded-circle bg-warning" style={{width: '12px', height: '12px'}}></div>
                  <div className="rounded-circle bg-success" style={{width: '12px', height: '12px'}}></div>
                </div>
                <div className="mx-auto bg-dark rounded text-secondary text-center small" style={{width: '300px', padding: '2px'}}>devlens.ai/repo/facebook/react</div>
              </div>
              <div className="card-body p-0 position-relative" style={{ height: '400px', background: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)' }}>
                {/* Abstract visualization of repo structure */}
                <div className="d-flex h-100">
                  <div className="w-25 border-end border-secondary p-3" style={{ opacity: 0.8 }}>
                    <div className="bg-secondary rounded mb-2 w-75" style={{height:'10px', opacity:0.3}}></div>
                    <div className="bg-secondary rounded mb-2 w-50" style={{height:'10px', opacity:0.3}}></div>
                    <div className="bg-secondary rounded mb-4 w-100" style={{height:'10px', opacity:0.3}}></div>
                    <div className="bg-secondary rounded mb-2 w-75" style={{height:'10px', opacity:0.5}}></div>
                    <div className="bg-primary rounded mb-2 w-50" style={{height:'10px', opacity:0.8}}></div>
                  </div>
                  <div className="w-75 p-4 position-relative">
                    <div className="spinner-grow text-primary position-absolute" style={{top:'30%', left:'40%', width:'3rem', height:'3rem', opacity:0.4}} role="status"></div>
                    <h5 className="text-light mb-4">Architecture Overview Generated</h5>
                    <div className="bg-secondary rounded mb-3 w-100" style={{height:'15px', opacity:0.2}}></div>
                    <div className="bg-secondary rounded mb-3 w-75" style={{height:'15px', opacity:0.2}}></div>
                    <div className="bg-secondary rounded mb-3 w-85" style={{height:'15px', opacity:0.2}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="row g-4 py-5 mb-5 fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
          {features.map((feature, idx) => (
            <div className="col-md-6 col-lg-3 text-center px-4" key={idx}>
              <div className="mb-4 d-inline-flex justify-content-center align-items-center rounded-circle bg-dark bg-opacity-50 border border-light border-opacity-10 shadow-sm" style={{ width: '80px', height: '80px' }}>
                {feature.icon}
              </div>
              <h4 className="text-white mb-3">{feature.title}</h4>
              <p className="text-secondary small">{feature.description}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
