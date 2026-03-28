import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ConnectRepo from './pages/ConnectRepo';
import RepoDetails from './pages/RepoDetails';
import Landing from './pages/Landing';
import './App.css'; 

function App() {
  return (
    <div className="min-vh-100 bg-dark text-light font-sans d-flex flex-column">
      <Navbar />
      <main className="flex-grow-1 p-4">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/connect" element={<ConnectRepo />} />
          <Route path="/repo/:id" element={<RepoDetails />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
