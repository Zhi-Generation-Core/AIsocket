import * as socketApi from './api-client.js';

const screens = {
  login: document.querySelector('#screen-login'),
  cases: document.querySelector('#screen-cases'),
  workspace: document.querySelector('#screen-workspace'),
};

const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');
const loginError = document.querySelector('#loginError');
const registerError = document.querySelector('#registerError');
const registerTab = document.querySelector('#registerTab');
const caseListEl = document.querySelector('#caseList');
const caseEmptyEl = document.querySelector('#caseEmpty');
const userLabelEl = document.querySelector('#userLabel');
const workspaceUserEl = document.querySelector('#workspaceUser');
const scanHistoryEl = document.querySelector('#scanHistory');
const feedbackPanelEl = document.querySelector('#feedbackPanel');
const versionDetailEl = document.querySelector('#versionDetail');
const modalRoot = document.querySelector('#modalRoot');

let workspaceReady = false;
let workspaceInitFn = null;
let currentVersions = [];
let currentScans = [];
let selectedVersionId = null;

const STATUS_LABELS = {
  ai_initial: 'AI åç',
  fitting_adjustment: 'è¯ç©¿ä¿®æ­£',
  follow_up: 'å¤è¯ä¼å',
  manufacturing_confirmed: 'å¶é ç¡®è®¤',
};

const SIDE_LABELS = { left: 'å·¦', right: 'å³', unknown: 'æªç¥' };

export function registerWorkspaceInit(fn) {
  workspaceInitFn = fn;
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
  document.body.dataset.screen = name;
}

function formatDate(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sideLabel(side) {
  return SIDE_LABELS[side] || side || 'æªç¥';
}

function switchAuthTab(tabName) {
  document.querySelectorAll('.auth-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === tabName);
  });
  document.querySelectorAll('[data-auth-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== tabName;
  });
  if (loginError) loginError.textContent = '';
  if (registerError) registerError.textContent = '';
}

async function loadAuthConfig() {
  try {
    const config = await socketApi.fetchAuthConfig();
    if (registerTab) registerTab.hidden = !config.allowRegister;
    return config;
  } catch {
    if (registerTab) registerTab.hidden = true;
    return { allowRegister: false };
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.textContent = '';
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  const form = new FormData(loginForm);
  const login = String(form.get('login') || '').trim();
  const password = String(form.get('password') || '');
  if (!login || !password) {
    loginError.textContent = 'è¯·å¡«åè´¦å·åå¯ç ';
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'ç»å½ä¸­...';
  try {
    await socketApi.loginWithCredentials(login, password);
    loginForm.reset();
    await openCaseScreen();
  } catch (error) {
    loginError.textContent = error.message || 'ç»å½å¤±è´¥';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ç»å½è®¾è®¡å°';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  registerError.textContent = '';
  const submitBtn = registerForm.querySelector('button[type="submit"]');
  const form = new FormData(registerForm);
  const orgName = String(form.get('orgName') || '').trim();
  const username = String(form.get('username') || '').trim();
  const email = String(form.get('email') || '').trim();
  const displayName = String(form.get('displayName') || '').trim();
  const password = String(form.get('password') || '');
  const passwordConfirm = String(form.get('passwordConfirm') || '');

  if (!orgName || !username || !email || !password) {
    registerError.textContent = 'è¯·å®æ´å¡«åæ³¨åä¿¡æ¯';
    return;
  }
  if (password.length < 8) {
    registerError.textContent = 'å¯ç è³å° 8 ä½';
    return;
  }
  if (password !== passwordConfirm) {
    registerError.textContent = 'ä¸¤æ¬¡è¾å¥çå¯ç ä¸ä¸è´';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'æ³¨åä¸­...';
  try {
    await socketApi.registerAccount({
      orgName,
      username,
      email,
      password,
      displayName: displayName || username,
    });
    registerForm.reset();
    await openCaseScreen();
  } catch (error) {
    registerError.textContent = error.message || 'æ³¨åå¤±è´¥';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'æ³¨åå¹¶è¿å¥';
  }
}

async function openCaseScreen() {
  const user = socketApi.getCurrentUser();
  if (userLabelEl) {
    userLabelEl.textContent = user?.displayName || user?.username || user?.email || 'æå¸';
  }
  showScreen('cases');
  await renderCaseList();
}

async function renderCaseList() {
  caseListEl.innerHTML = '<div class="empty">å è½½çä¾ä¸­...</div>';
  try {
    const cases = await socketApi.listCases();
    if (!cases.length) {
      caseListEl.innerHTML = '';
      if (caseEmptyEl) caseEmptyEl.hidden = false;
      return;
    }
    if (caseEmptyEl) caseEmptyEl.hidden = true;
    caseListEl.innerHTML = cases.map((item) => `
      <article class="case-list-item" data-case-id="${item.id}">
        <div class="case-list-head">
          <strong>${escapeHtml(item.patientName)} Â· ${escapeHtml(item.title)}</strong>
          <span class="status-pill">${escapeHtml(item.activityLevel || 'K3')}</span>
        </div>
        <div class="case-list-meta">
          <span>${sideLabel(item.side)}ä¾§ Â· ${escapeHtml(item.amputationSite || 'æªå¡«åé¨ä½')}</span>
          <span>${formatDate(item.updatedAt)}</span>
        </div>
        <div class="case-list-actions">
          <button type="button" class="primary-button small" data-open-case="${item.id}">è¿å¥è®¾è®¡å°</button>
        </div>
      </article>
    `).join('');
  } catch (error) {
    caseListEl.innerHTML = `<div class="empty">å è½½å¤±è´¥ï¼${escapeHtml(error.message)}</div>`;
  }
}

async function openWorkspace(caseId) {
  const detail = await socketApi.selectCase(caseId);
  currentVersions = detail.versions || [];
  currentScans = detail.scans || [];
  selectedVersionId = currentVersions[0]?.id || null;

  if (workspaceUserEl) {
    const user = socketApi.getCurrentUser();
    workspaceUserEl.textContent = user?.displayName || user?.username || 'æå¸';
  }

  showScreen('workspace');

  try {
    if (!workspaceReady && workspaceInitFn) {
      await workspaceInitFn({ localOnly: false });
      workspaceReady = true;
    }
  } catch (error) {
    console.error(error);
    alert(`3D æ¨¡åå è½½å¤±è´¥ï¼${error.message || error}\nè¯·å·æ°é¡µé¢æèç³»ç®¡çåæ£æ¥éæèµæºã`);
    showScreen('cases');
    return;
  }

  window.dispatchEvent(new CustomEvent('socketai:case-loaded', {
    detail: {
      caseInfo: detail.case,
      versions: currentVersions,
      scans: currentScans,
    },
  }));

  renderScanHistory(currentScans);
  await refreshFeedbackPanel();
}

async function handleCreateCase(event) {
  event.preventDefault();
  newCaseError.textContent = '';
  const form = new FormData(newCaseForm);
  const patientName = String(form.get('patientName') || '').trim();
  const title = String(form.get('title') || '').trim();
  if (!patientName || !title) {
    newCaseError.textContent = 'æ£èå§å/ç¼å·ä¸çä¾æ é¢ä¸ºå¿å¡«';
    return;
  }

  try {
    const created = await socketApi.createCase({
      patientName,
      anonymousCode: String(form.get('anonymousCode') || '').trim() || null,
      title,
      amputationSite: String(form.get('amputationSite') || '').trim() || null,
      side: form.get('side') || 'right',
      activityLevel: form.get('activityLevel') || 'K3',
      notes: String(form.get('notes') || '').trim() || null,
    });
    newCaseForm.reset();
    closeModal();
    await renderCaseList();
    await openWorkspace(created.id);
  } catch (error) {
    newCaseError.textContent = error.message || 'åå»ºå¤±è´¥';
  }
}

function renderScanHistory(scans = []) {
  if (!scanHistoryEl) return;
  if (!scans.length) {
    scanHistoryEl.innerHTML = '<div class="empty">å°æªä¸ä¼ æ«ææä»¶</div>';
    return;
  }
  scanHistoryEl.innerHTML = scans.slice(0, 5).map((scan) => `
    <div class="scan-item">
      <strong>${escapeHtml(scan.file_name)}</strong>
      <span>${escapeHtml(String(scan.format || '').toUpperCase())} Â· ${formatDate(scan.created_at)}</span>
    </div>
  `).join('');
}

function renderVersionTimeline(versions = [], activeId = selectedVersionId) {
  const timeline = document.querySelector('#versionTimeline');
  if (!timeline) return;
  currentVersions = versions;
  if (!versions.length) {
    timeline.innerHTML = '<button type="button" class="version active">å°æ äºç«¯çæ¬</button>';
    return;
  }
  timeline.innerHTML = versions.slice(0, 8).map((version) => {
    const active = version.id === activeId ? ' active' : '';
    return `<button type="button" class="version${active}" data-version-id="${version.id}">V${version.versionNumber} ${escapeHtml(version.label || '')}</button>`;
  }).join('');
}

function renderVersionDetail(version) {
  if (!versionDetailEl || !version) {
    if (versionDetailEl) {
      versionDetailEl.innerHTML = '<div class="empty">ç¹å»çæ¬æ¶é´çº¿æ¥çåæ°ä¸ç¶æ</div>';
    }
    return;
  }

  const params = version.parameters || {};
  versionDetailEl.innerHTML = `
    <div class="version-detail-head">
      <strong>V${version.versionNumber} Â· ${escapeHtml(version.label || '')}</strong>
      <span class="status-pill">${escapeHtml(STATUS_LABELS[version.status] || version.status || '--')}</span>
    </div>
    <div class="version-detail-meta">${escapeHtml(version.source || '')} Â· ${formatDate(version.createdAt)}</div>
    <div class="metric-grid compact">
      <div><span>åå®¹é</span><strong>${params.offsetMm ?? '--'} mm</strong></div>
      <div><span>ä¿®è¾¹</span><strong>${params.trimPercent ?? '--'}%</strong></div>
      <div><span>åå</span><strong>${params.reliefMm ?? '--'} mm</strong></div>
      <div><span>æ«ç«¯</span><strong>${params.distalMm ?? '--'} mm</strong></div>
    </div>
    ${version.notes ? `<div class="empty">${escapeHtml(version.notes)}</div>` : ''}
  `;
}

async function refreshFeedbackPanel() {
  if (!feedbackPanelEl || !socketApi.getCurrentCase()) return;
  feedbackPanelEl.innerHTML = '<div class="empty">å è½½æ£èåé¦...</div>';
  try {
    const data = await socketApi.fetchCaseFeedback(socketApi.getCurrentCase().id);
    const pain = data.painFeedback || [];
    const usage = data.usageLogs || [];
    const notes = data.feedback || [];
    const invites = data.invites || [];

    if (!pain.length && !usage.length && !notes.length) {
      feedbackPanelEl.innerHTML = '<div class="empty">ææ ç§»å¨ç«¯åé¦ãå¯çæéè¯·ç ä¾æ£èç»å®ã</div>';
      return;
    }

    const painRows = pain.slice(0, 4).map((item) => `
      <div class="feedback-item">
        <strong>${escapeHtml(item.region_id)} Â· ${escapeHtml(item.severity)}</strong>
        <span>${escapeHtml(item.pain_type || item.activity_scene || '')} Â· ${formatDate(item.created_at)}</span>
      </div>
    `).join('');

    const usageRows = usage.slice(0, 3).map((item) => `
      <div class="feedback-item">
        <strong>ä½©æ´ ${item.wear_minutes || 0} åé</strong>
        <span>èéåº¦ ${item.comfort_score ?? '--'} Â· ${formatDate(item.created_at)}</span>
      </div>
    `).join('');

    const noteRows = notes.slice(0, 2).map((item) => `
      <div class="feedback-item">
        <strong>${escapeHtml(item.feedback_type || 'åé¦')}</strong>
        <span>${escapeHtml(item.content || '')}</span>
      </div>
    `).join('');

    const inviteHint = invites.length
      ? `<div class="empty">æè¿éè¯·ç ï¼${escapeHtml(invites[0].invite_code)}</div>`
      : '';

    feedbackPanelEl.innerHTML = `${painRows}${usageRows}${noteRows}${inviteHint}`;
  } catch (error) {
    feedbackPanelEl.innerHTML = `<div class="empty">åé¦å è½½å¤±è´¥ï¼${escapeHtml(error.message)}</div>`;
  }
}

function openModal(title, bodyHtml) {
  if (!modalRoot) return;
  modalRoot.hidden = false;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="icon-button" data-close-modal aria-label="å³é­">Ã</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>
  `;
}

function closeModal() {
  if (!modalRoot) return;
  modalRoot.hidden = true;
  modalRoot.innerHTML = '';
}

function openNewCaseModal() {
  openModal('æ°å»ºçä¾', `
    <form id="newCaseForm" class="form-grid">
      <label>æ£èå§å/ç¼å·<input name="patientName" required placeholder="å¼ æ æ ANON-001" /></label>
      <label>å¿åç¼å·<input name="anonymousCode" placeholder="å¯é" /></label>
      <label>çä¾æ é¢<input name="title" required placeholder="å³ä¸è¢æ¥åèè®¾è®¡" /></label>
      <label>æªè¢é¨ä½<input name="amputationSite" placeholder="å³å¤§è¿ / å³å°è¿" /></label>
      <label>ä¾§å«
        <select name="side">
          <option value="right">å³</option>
          <option value="left">å·¦</option>
        </select>
      </label>
      <label>æ´»å¨ç­çº§
        <select name="activityLevel">
          <option value="K2">K2</option>
          <option value="K3" selected>K3</option>
          <option value="K4">K4</option>
        </select>
      </label>
      <label class="full">å¤æ³¨<textarea name="notes" rows="3" placeholder="ä¸´åºèæ¯ãè¯ç©¿é¶æ®µç­"></textarea></label>
      <p id="newCaseError" class="form-error"></p>
      <div class="form-actions full">
        <button type="button" class="ghost-button" data-close-modal>åæ¶</button>
        <button type="submit" class="primary-button">åå»ºå¹¶è¿å¥</button>
      </div>
    </form>
  `);
  document.querySelector('#newCaseForm')?.addEventListener('submit', handleCreateCase);
}

async function openInviteModal() {
  const currentCase = socketApi.getCurrentCase();
  if (!currentCase) return;
  try {
    const data = await socketApi.createInvite(currentCase.id, currentCase.patientName);
    openModal('æ£èéè¯·ç ', `
      <p class="modal-copy">è¯·å°æ­¤éè¯·ç æä¾ç»æ£èï¼ç¨äºç§»å¨ç«¯ç»å®æ¬çä¾ã</p>
      <div class="invite-code">${escapeHtml(data.inviteCode)}</div>
      <div class="form-actions">
        <button type="button" class="primary-button" id="copyInviteBtn">å¤å¶éè¯·ç </button>
        <button type="button" class="ghost-button" data-close-modal>å³é­</button>
      </div>
    `);
    document.querySelector('#copyInviteBtn')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(data.inviteCode);
      document.querySelector('#copyInviteBtn').textContent = 'å·²å¤å¶';
    });
  } catch (error) {
    openModal('çæå¤±è´¥', `<div class="empty">${escapeHtml(error.message)}</div>`);
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function bindGlobalEvents() {
  loginForm?.addEventListener('submit', handleLogin);
  registerForm?.addEventListener('submit', handleRegister);

  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => switchAuthTab(button.dataset.authTab));
  });

  document.querySelector('#logoutBtn')?.addEventListener('click', () => {
    socketApi.logout();
    showScreen('login');
  });

  document.querySelector('#workspaceLogoutBtn')?.addEventListener('click', () => {
    socketApi.logout();
    showScreen('login');
  });

  document.querySelector('#backToCasesBtn')?.addEventListener('click', async () => {
    showScreen('cases');
    await renderCaseList();
  });

  document.querySelector('#openNewCaseBtn')?.addEventListener('click', openNewCaseModal);
  document.querySelector('#sidebarNewCaseBtn')?.addEventListener('click', openNewCaseModal);
  document.querySelector('#inviteBtn')?.addEventListener('click', openInviteModal);
  document.querySelector('#refreshFeedbackBtn')?.addEventListener('click', refreshFeedbackPanel);

  caseListEl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-open-case]');
    if (!button) return;
    await openWorkspace(button.dataset.openCase);
  });

  document.querySelector('#versionTimeline')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-version-id]');
    if (!button) return;
    selectedVersionId = button.dataset.versionId;
    document.querySelectorAll('#versionTimeline .version').forEach((el) => {
      el.classList.toggle('active', el.dataset.versionId === selectedVersionId);
    });
    const version = currentVersions.find((item) => item.id === selectedVersionId);
    renderVersionDetail(version);
  });

  modalRoot?.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-modal]')) closeModal();
  });

  window.addEventListener('socketai:versions-updated', (event) => {
    const versions = event.detail?.versions || [];
    renderVersionTimeline(versions, selectedVersionId || versions[0]?.id);
    if (!selectedVersionId && versions[0]) {
      selectedVersionId = versions[0].id;
      renderVersionDetail(versions[0]);
    }
  });

  window.addEventListener('socketai:scans-updated', (event) => {
    renderScanHistory(event.detail?.scans || []);
  });
}

export async function startApp() {
  bindGlobalEvents();

  if (window.location.protocol === 'file:') {
    showScreen('workspace');
    if (workspaceInitFn) {
      await workspaceInitFn({ localOnly: true });
      workspaceReady = true;
    }
    return;
  }

  try {
    await socketApi.checkHealth();
    await loadAuthConfig();
  } catch {
    showScreen('login');
    if (loginError) loginError.textContent = 'æ æ³è¿æ¥åç«¯ï¼è¯·ç¨åéè¯';
    return;
  }

  try {
    const user = await socketApi.restoreSession();
    if (user) {
      await openCaseScreen();
      const savedCaseId = socketApi.getSavedCaseId();
      if (savedCaseId) {
        try {
          await openWorkspace(savedCaseId);
          return;
        } catch {
          localStorage.removeItem('socketai_current_case_id');
        }
      }
      return;
    }
  } catch {
    socketApi.logout();
  }

  showScreen('login');
}

export function updateCaseHeader(caseInfo) {
  const caseTitleEl = document.querySelector('#caseTitle');
  const caseMetaEl = document.querySelector('#caseMeta');
  if (caseTitleEl) {
    caseTitleEl.textContent = `${caseInfo.patientName || 'æ£è'} Â· ${caseInfo.title || 'æ¥åèè®¾è®¡'}`;
  }
  if (caseMetaEl) {
    caseMetaEl.textContent = `${caseInfo.activityLevel || 'K3'} æ´»å¨ç­çº§ Â· ${sideLabel(caseInfo.side)}ä¾§`;
  }
}

export function applyCaseToControls(caseInfo) {
  if (!caseInfo) return;
  const activity = document.querySelector('#activityLevel');
  if (activity && caseInfo.activityLevel) {
    activity.value = caseInfo.activityLevel;
    activity.dispatchEvent(new Event('input'));
  }
}

export { renderVersionTimeline, renderVersionDetail, refreshFeedbackPanel };

