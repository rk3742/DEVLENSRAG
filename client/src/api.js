import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('devlens_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getRepos = () => api.get('/repos');
export const getGithubRepos = () => api.get('/repos/github/list');
export const uploadZipData = (formData) => api.post('/repos/upload-zip', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

export const connectRepo = (data) => api.post('/repos/connect', data);
export const analyzeRepo = (data) => api.post('/repos/analyze', data);
export const getRepoStatus = (id) => api.get(`/repos/${id}/status`);
export const getRepoFiles = (id) => api.get(`/repos/${id}/files`);
export const syncRepo = (id) => api.post(`/repos/${id}/sync`);

export const runAIAnalysis = (id, data = {}) => api.post(`/analysis/${id}/run`, data);
export const getAnalysisStatus = (id) => api.get(`/analysis/${id}/status`);

export const getFileContent = (id, path) => api.get(`/repos/${id}/file`, { params: { path } });

export const getArchitecture = (id) => api.get(`/analysis/${id}/architecture`);
export const getStartHere = (id) => api.get(`/analysis/${id}/start-here`);
export const getDataFlow = (id) => api.get(`/analysis/${id}/data-flow`);
export const getIssues = (id) => api.get(`/analysis/${id}/issues`);

export const askQuestion = (id, question) => api.post(`/analysis/${id}/ask`, { question });

export const getProfile = () => api.get('/auth/profile');
export const deleteRepo = (id) => api.delete(`/repos/${id}`);
