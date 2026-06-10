const TOKEN_KEY = 'socketai_auth_token';
const CASE_KEY = 'socketai_current_case_id';
const USER_KEY = 'socketai_user';

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let currentUser = null;
let currentCase = null;
let backendOnline = false;

try {
  const savedUser = localStorage.getItem(USER_KEY);
  if (savedUser) currentUser = JSON.parse(savedUser);
} catch {
  localStorage.removeItem(USER_KEY);
}

export function getAppBasePath() {
  const match = window.location.pathname.match(/^(\/socketai)(?:\/|$)/);
  return match ? match[1] : '';
}

export function apiUrl(path) {
  if (window.location.protocol === 'file:') {
    const normalized = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
    return new URL(normalized, window.location.origin).toString();
  }
  const apiPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return `${window.location.origin}${getAppBasePath()}${apiPath}`;
}

export function isOnline() {
  return backendOnline && Boolean(authToken);
}

export function getCurrentCase() {
  return currentCase;
}

export function getCurrentUser() {
  return currentUser;
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    body: options.body instanceof FormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });

  return parseJson(response);
}

export async function checkHealth() {
  const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
  const data = await response.json();
  backendOnline = response.ok && data.ok;
  return data;
}

export async function fetchAuthConfig() {
  const response = await fetch(apiUrl('/api/auth/config'), { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function authRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return parseJson(response);
}

function persistSession(token, user) {
  authToken = token;
  currentUser = user;
  backendOnline = true;
  localStorage.setItem(TOKEN_KEY, authToken);
  localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
}

export async function loginWithCredentials(login, password) {
  const identifier = String(login || '').trim();
  const body = identifier.includes('@')
    ? { email: identifier, password }
    : { username: identifier, password };

  const data = await authRequest('/api/auth/login', {
    method: 'POST',
    body,
  });
  persistSession(data.token, data.user);
  return currentUser;
}

export async function registerAccount(payload) {
  const data = await authRequest('/api/auth/register', {
    method: 'POST',
    body: payload,
  });
  persistSession(data.token, data.user);
  return currentUser;
}

export async function restoreSession() {
  if (window.location.protocol === 'file:') {
    backendOnline = false;
    return null;
  }

  await checkHealth();
  if (!authToken) return null;

  try {
    const data = await request('/api/auth/me');
    currentUser = data.user;
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    return currentUser;
  } catch {
    logout();
    return null;
  }
}

export function logout() {
  authToken = '';
  currentUser = null;
  currentCase = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(CASE_KEY);
}

export async function listCases() {
  const data = await request('/api/cases');
  return data.cases || [];
}

export async function createCase(payload) {
  const data = await request('/api/cases', { method: 'POST', body: payload });
  return data.case;
}

export async function loadCase(caseId) {
  const detail = await request(`/api/cases/${caseId}`);
  currentCase = detail.case;
  localStorage.setItem(CASE_KEY, caseId);
  return detail;
}

export async function selectCase(caseId) {
  return loadCase(caseId);
}

export async function createInvite(caseId, patientLabel) {
  return request(`/api/cases/${caseId}/invites`, {
    method: 'POST',
    body: { patientLabel: patientLabel || null },
  });
}

export async function fetchCaseFeedback(caseId) {
  return request(`/api/cases/${caseId}/feedback`);
}

export async function uploadScan(file, metrics = {}) {
  if (!isOnline() || !currentCase) return null;
  const form = new FormData();
  form.append('caseId', currentCase.id);
  form.append('file', file);
  form.append('metrics', JSON.stringify(metrics));
  return request('/api/scans', { method: 'POST', body: form });
}

export async function saveVersion(payload) {
  if (!isOnline() || !currentCase) return null;
  return request('/api/socket/generate', {
    method: 'POST',
    body: {
      caseId: currentCase.id,
      ...payload,
    },
  });
}

export async function refineAndSave(payload, versionPayload) {
  if (!isOnline() || !currentCase) return null;
  return request('/api/socket/refine', {
    method: 'POST',
    body: {
      caseId: currentCase.id,
      payload,
      ...versionPayload,
    },
  });
}

export async function recordExport(versionId, stlContent, report = {}, fileName = 'socket_ai_initial.stl') {
  if (!isOnline() || !currentCase) return null;
  return request('/api/socket/export', {
    method: 'POST',
    body: {
      caseId: currentCase.id,
      versionId,
      stlContent,
      fileName,
      report,
    },
  });
}

export async function fetchCaseDetail() {
  if (!isOnline() || !currentCase) return null;
  return request(`/api/cases/${currentCase.id}`);
}

export function getSavedCaseId() {
  return localStorage.getItem(CASE_KEY);
}
