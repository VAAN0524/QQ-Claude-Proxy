/**
 * Skills Management Page Application
 * Handles skills CRUD operations
 */

// API base URL
const API_BASE = '/api';

// Application State
const state = {
  skills: [],
  filteredSkills: [],
  currentFilter: 'all',
  searchQuery: '',
  selectedFiles: [],
  currentSkill: null,
  viewMode: 'list', // 'grid' or 'list'
  selectedSkills: new Set(), // Set of selected skill names
};

/**
 * Utility Functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * API Functions
 */
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * 安全地为元素添加事件监听器
 */
function safeAddEventListener(elementId, event, handler) {
  const element = document.getElementById(elementId);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn(`[safeAddEventListener] Element not found: ${elementId}`);
  }
}

async function fetchSkills() {
  console.log('[fetchSkills] 开始获取技能列表...');
  try {
    const data = await apiRequest('/skills');
    console.log('[fetchSkills] API 响应:', data);
    const skills = data.skills || [];
    console.log('[fetchSkills] 获取到技能数量:', skills.length);
    return skills;
  } catch (error) {
    console.error('[fetchSkills] 获取技能失败:', error);
    throw error;
  }
}

async function fetchSkillDetail(skillName) {
  const data = await apiRequest(`/skills/detail?name=${encodeURIComponent(skillName)}`);
  return data.skill || null;
}

async function uploadSkill(files) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE}/skills/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

async function deleteSkill(skillName) {
  const data = await apiRequest('/skills/delete', {
    method: 'DELETE',
    body: JSON.stringify({ name: skillName }),
  });
  return data;
}

async function toggleSkillEnabled(skillName, enabled) {
  const data = await apiRequest('/skills/enable', {
    method: 'PUT',
    body: JSON.stringify({ name: skillName, enabled }),
  });
  return data;
}

async function installSkillFromGithub(url) {
  const response = await fetch(`${API_BASE}/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * UI Render Functions
 */
function renderSkillsGrid() {
  const container = document.getElementById('skillsContainer');
  if (!container) return;

  // Filter skills
  let filtered = state.skills;

  if (state.currentFilter === 'enabled') {
    filtered = filtered.filter(s => s.enabled);
  } else if (state.currentFilter === 'disabled') {
    filtered = filtered.filter(s => !s.enabled);
  }

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.trigger.toLowerCase().includes(query)
    );
  }

  state.filteredSkills = filtered;

  // Update count
  document.getElementById('skillsCount').textContent = `${filtered.length} 个技能`;

  if (filtered.length === 0) {
    const emptyMsg = state.searchQuery || state.currentFilter !== 'all'
      ? '没有找到匹配的技能'
      : '暂无技能';
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <p>${escapeHtml(emptyMsg)}</p>
      </div>
    `;
    return;
  }

  // Set view mode class
  container.className = `skills-container skills-view-${state.viewMode}`;

  // Render based on view mode
  if (state.viewMode === 'list') {
    container.innerHTML = filtered.map(skill => renderSkillListItem(skill)).join('');
  } else {
    container.innerHTML = `
      <div class="skills-grid">
        ${filtered.map(skill => renderSkillCard(skill)).join('')}
      </div>
    `;
  }

  // Update batch toolbar visibility
  updateBatchToolbar();

  // Attach event listeners
  attachSkillListeners();
}

function renderSkillListItem(skill) {
  const isSelected = state.selectedSkills.has(skill.name);
  return `
    <div class="skill-list-item ${!skill.enabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" data-skill-name="${escapeHtml(skill.name)}">
      <input type="checkbox" class="skill-list-checkbox" data-skill-name="${escapeHtml(skill.name)}" ${isSelected ? 'checked' : ''}>
      <div class="skill-list-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>
      <div class="skill-list-content">
        <div class="skill-list-name">${escapeHtml(skill.name)}</div>
        <div class="skill-list-trigger">${escapeHtml(skill.trigger)}</div>
      </div>
      <div class="skill-list-toggle">
        <label class="switch">
          <input type="checkbox" class="skill-enable-toggle" data-skill-name="${escapeHtml(skill.name)}" ${skill.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="skill-list-actions">
        <button class="skill-list-btn" data-action="detail" data-skill-name="${escapeHtml(skill.name)}" title="详情">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function renderSkillCard(skill) {
  return `
    <div class="skill-card ${!skill.enabled ? 'disabled' : ''}" data-skill-name="${escapeHtml(skill.name)}">
      <div class="skill-card-header">
        <div class="skill-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="skill-card-title">
          <div class="skill-card-name">${escapeHtml(skill.name)}</div>
          <div class="skill-card-trigger">${escapeHtml(skill.trigger)}</div>
        </div>
        <label class="switch skill-card-toggle">
          <input type="checkbox" class="skill-enable-toggle" data-skill-name="${escapeHtml(skill.name)}"
                 ${skill.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="skill-card-body">
        <p class="skill-card-description">${escapeHtml(skill.description)}</p>
        ${skill.capabilities && skill.capabilities.length > 0 ? `
          <div class="skill-card-tags">
            ${skill.capabilities.slice(0, 3).map(cap =>
              `<span class="skill-tag">${escapeHtml(cap)}</span>`
            ).join('')}
            ${skill.capabilities.length > 3 ? `<span class="skill-tag">+${skill.capabilities.length - 3}</span>` : ''}
          </div>
        ` : ''}
      </div>
      <div class="skill-card-footer">
        <span class="skill-card-path" title="${escapeHtml(skill.path)}">${escapeHtml(skill.path)}</span>
        <div class="skill-card-actions">
          <button class="btn-icon-small" data-action="detail" data-skill-name="${escapeHtml(skill.name)}" title="详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Event Listeners
 */
function attachSkillListeners() {
  // Toggle switches
  document.querySelectorAll('.skill-enable-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const skillName = e.target.dataset.skillName;
      const enabled = e.target.checked;

      try {
        await toggleSkillEnabled(skillName, enabled);

        // Update UI
        const card = document.querySelector(`.skill-card[data-skill-name="${escapeHtml(skillName)}"]`);
        if (enabled) {
          card.classList.remove('disabled');
        } else {
          card.classList.add('disabled');
        }

        showToast(`${skillName} 已${enabled ? '启用' : '禁用'}`, 'success');

        // Refresh skills data
        const skills = await fetchSkills();
        state.skills = skills;
      } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
        e.target.checked = !enabled;
      }
    });
  });

  // Detail buttons
  document.querySelectorAll('[data-action="detail"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const skillName = btn.dataset.skillName;
      openSkillDetailModal(skillName);
    });
  });

  // Card click (open detail)
  document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on toggle or action buttons
      if (e.target.closest('.switch') || e.target.closest('.skill-card-actions')) {
        return;
      }
      const skillName = card.dataset.skillName;
      openSkillDetailModal(skillName);
    });
  });

  // List item checkboxes
  document.querySelectorAll('.skill-list-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const skillName = e.target.dataset.skillName;
      if (e.target.checked) {
        state.selectedSkills.add(skillName);
      } else {
        state.selectedSkills.delete(skillName);
      }
      updateBatchToolbar();
      renderSkillsGrid();
    });
  });

  // List item clicks (except on interactive elements)
  document.querySelectorAll('.skill-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't trigger if clicking on checkbox, toggle, or action buttons
      if (e.target.closest('.skill-list-checkbox') ||
          e.target.closest('.switch') ||
          e.target.closest('.skill-list-actions')) {
        return;
      }
      const skillName = item.dataset.skillName;
      openSkillDetailModal(skillName);
    });
  });
}

/**
 * Batch Operations
 */
function updateBatchToolbar() {
  const toolbar = document.getElementById('batchToolbar');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectedCount = document.getElementById('selectedCount');

  const hasSelection = state.selectedSkills.size > 0;

  // Show/hide toolbar
  toolbar.style.display = hasSelection || state.filteredSkills.length > 0 ? 'flex' : 'none';

  // Update selected count
  selectedCount.textContent = `已选择 ${state.selectedSkills.size} 项`;

  // Update select all checkbox state
  if (state.filteredSkills.length > 0 && state.selectedSkills.size === state.filteredSkills.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (state.selectedSkills.size > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

function toggleSelectAll(checked) {
  state.filteredSkills.forEach(skill => {
    if (checked) {
      state.selectedSkills.add(skill.name);
    } else {
      state.selectedSkills.delete(skill.name);
    }
  });
  updateBatchToolbar();
  renderSkillsGrid();
}

async function batchEnableSkills(enable) {
  if (state.selectedSkills.size === 0) {
    showToast('请先选择要操作的技能', 'info');
    return;
  }

  const skillNames = Array.from(state.selectedSkills);
  const results = { success: 0, failed: 0 };

  for (const skillName of skillNames) {
    try {
      await toggleSkillEnabled(skillName, enable);
      results.success++;
    } catch (error) {
      results.failed++;
    }
  }

  // Clear selection
  state.selectedSkills.clear();

  // Refresh skills
  const skills = await fetchSkills();
  state.skills = skills;
  renderSkillsGrid();

  showToast(`已${enable ? '启用' : '禁用'} ${results.success} 个技能${results.failed > 0 ? `，${results.failed} 个失败` : ''}`, results.failed > 0 ? 'error' : 'success');
}

/**
 * View Toggle
 */
function setupViewToggle() {
  const viewBtns = document.querySelectorAll('.view-btn');

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewMode = btn.dataset.view;
      renderSkillsGrid();
    });
  });
}

/**
 * Search and Filter
 */
function setupSearchAndFilter() {
  const searchInput = document.getElementById('searchInput');

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderSkillsGrid();
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentFilter = tab.dataset.filter;
      renderSkillsGrid();
    });
  });
}

/**
 * Upload Modal
 */
function openUploadModal() {
  state.selectedFiles = [];
  updateUploadList();
  document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('active');
  state.selectedFiles = [];
}

function updateUploadList() {
  const listContainer = document.getElementById('uploadList');
  const filesContainer = document.getElementById('uploadFiles');
  const confirmBtn = document.getElementById('confirmUploadBtn');

  if (state.selectedFiles.length === 0) {
    listContainer.style.display = 'none';
    confirmBtn.disabled = true;
    return;
  }

  listContainer.style.display = 'block';
  confirmBtn.disabled = false;

  filesContainer.innerHTML = state.selectedFiles.map((file, index) => `
    <div class="upload-file-item">
      <svg class="upload-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
      </svg>
      <span class="upload-file-name">${escapeHtml(file.name)}</span>
      <span class="upload-file-size">${formatFileSize(file.size)}</span>
      <div class="upload-file-remove" data-index="${index}" title="移除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
    </div>
  `).join('');

  // Attach remove button listeners
  filesContainer.querySelectorAll('.upload-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      state.selectedFiles.splice(index, 1);
      updateUploadList();
    });
  });
}

function setupUploadModal() {
  const uploadArea = document.getElementById('uploadArea');
  const folderInput = document.getElementById('folderInput');
  const selectFolderBtn = document.getElementById('selectFolderBtn');

  // Click to select folder
  uploadArea.addEventListener('click', () => {
    folderInput.click();
  });

  selectFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    folderInput.click();
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.md') || f.isDirectory()
    );
    state.selectedFiles.push(...files);
    updateUploadList();
  });

  // File input change
  folderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    state.selectedFiles.push(...files);
    updateUploadList();
  });

  // Confirm upload
  document.getElementById('confirmUploadBtn').addEventListener('click', async () => {
    if (state.selectedFiles.length === 0) return;

    try {
      const result = await uploadSkill(state.selectedFiles);

      if (result.success) {
        showToast('技能上传成功', 'success');
        closeUploadModal();

        // Refresh skills list
        const skills = await fetchSkills();
        state.skills = skills;
        renderSkillsGrid();
      } else {
        showToast('上传失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      showToast('上传失败: ' + error.message, 'error');
    }
  });
}

/**
 * Tab Navigation
 */
function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  if (tabBtns.length === 0) {
    console.warn('[setupTabNavigation] No tab buttons found');
    return;
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Update button states
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content visibility
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });

      if (tabName === 'github') {
        document.getElementById('githubTab').classList.add('active');
      } else if (tabName === 'local') {
        document.getElementById('localTab').classList.add('active');
      }
    });
  });
}

/**
 * GitHub Install
 */
function setupGithubInstall() {
  const urlInput = document.getElementById('githubUrlInput');
  const installBtn = document.getElementById('installFromGithubBtn');
  const statusEl = document.getElementById('installStatus');

  if (!urlInput || !installBtn || !statusEl) {
    console.warn('[setupGithubInstall] Required elements not found');
    return;
  }

  installBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();

    if (!url) {
      showToast('请输入 GitHub 仓库 URL', 'error');
      return;
    }

    // Show loading state
    statusEl.className = 'install-status loading';
    statusEl.textContent = '正在安装，请稍候...';
    statusEl.style.display = 'block';
    installBtn.disabled = true;

    try {
      const result = await installSkillFromGithub(url);

      if (result.success) {
        statusEl.className = 'install-status success';
        statusEl.textContent = result.message || '安装成功！';

        showToast('技能安装成功！', 'success');

        // Refresh skills list
        setTimeout(async () => {
          const skills = await fetchSkills();
          state.skills = skills;
          renderSkillsGrid();

          // Close modal after a short delay
          setTimeout(() => {
            closeUploadModal();
            // Reset state
            urlInput.value = '';
            statusEl.style.display = 'none';
            statusEl.className = 'install-status';
          }, 1500);
        }, 500);
      } else {
        throw new Error(result.message || '安装失败');
      }
    } catch (error) {
      statusEl.className = 'install-status error';
      statusEl.textContent = error.message || '安装失败，请检查 URL 是否正确';
      showToast('安装失败: ' + error.message, 'error');
    } finally {
      installBtn.disabled = false;
    }
  });

  // Allow Enter key to trigger install
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      installBtn.click();
    }
  });
}

/**
 * Skill Detail Modal
 */
async function openSkillDetailModal(skillName) {
  state.currentSkill = skillName;

  try {
    const skill = await fetchSkillDetail(skillName);
    if (!skill) {
      showToast('获取技能详情失败', 'error');
      return;
    }

    const modal = document.getElementById('skillDetailModal');
    const title = document.getElementById('skillDetailTitle');
    const body = document.getElementById('skillDetailBody');

    title.textContent = skill.name;

    body.innerHTML = `
      <div class="skill-detail-content">
        <div class="skill-detail-info">
          <div class="skill-detail-section">
            <h3>基本信息</h3>
            <div class="skill-detail-meta">
              <span class="skill-detail-label">技能名称</span>
              <span class="skill-detail-value">${escapeHtml(skill.name)}</span>
              <span class="skill-detail-label">触发词</span>
              <span class="skill-detail-value">${escapeHtml(skill.trigger)}</span>
              <span class="skill-detail-label">状态</span>
              <span class="skill-detail-value">${skill.enabled ? '已启用' : '已禁用'}</span>
              <span class="skill-detail-label">路径</span>
              <span class="skill-detail-value" style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(skill.path)}</span>
            </div>
          </div>

          <div class="skill-detail-section">
            <h3>描述</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">${escapeHtml(skill.description)}</p>
          </div>

          ${skill.capabilities && skill.capabilities.length > 0 ? `
            <div class="skill-detail-section">
              <h3>功能</h3>
              <ul class="skill-detail-capabilities">
                ${skill.capabilities.map(cap => `<li>${escapeHtml(cap)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${skill.useCases && skill.useCases.length > 0 ? `
            <div class="skill-detail-section">
              <h3>使用场景</h3>
              <ul class="skill-detail-use-cases">
                ${skill.useCases.map(uc => `<li>${escapeHtml(uc)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>

        <div class="skill-detail-info">
          ${skill.fullDocumentation ? `
            <div class="skill-detail-section" style="flex: 1;">
              <h3>完整文档</h3>
              <div class="skill-detail-code">
                <pre>${escapeHtml(skill.fullDocumentation)}</pre>
              </div>
            </div>
          ` : `
            <div class="skill-detail-section">
              <h3>文档</h3>
              <p style="color: var(--text-muted); text-align: center; padding: var(--spacing-lg);">
                此技能暂无完整文档
              </p>
            </div>
          `}

          ${skill.parameters && Object.keys(skill.parameters).length > 0 ? `
            <div class="skill-detail-section">
              <h3>参数</h3>
              <div class="skill-detail-meta">
                ${Object.entries(skill.parameters).map(([key, param]) => `
                  <span class="skill-detail-label">${escapeHtml(key)}</span>
                  <span class="skill-detail-value">
                    ${param.required ? '必需' : '可选'}: ${escapeHtml(param.description)}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    modal.classList.add('active');
  } catch (error) {
    showToast('获取技能详情失败: ' + error.message, 'error');
  }
}

function closeSkillDetailModal() {
  document.getElementById('skillDetailModal').classList.remove('active');
  state.currentSkill = null;
}

async function deleteCurrentSkill() {
  if (!state.currentSkill) return;

  if (!confirm(`确定要删除技能 "${state.currentSkill}" 吗？此操作不可撤销！`)) {
    return;
  }

  try {
    await deleteSkill(state.currentSkill);
    showToast('技能已删除', 'success');
    closeSkillDetailModal();

    // Refresh skills list
    const skills = await fetchSkills();
    state.skills = skills;
    renderSkillsGrid();
  } catch (error) {
    showToast('删除失败: ' + error.message, 'error');
  }
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icon = getToastIcon(type);
  toast.innerHTML = `
    <div class="toast-icon ${type}">${icon}</div>
    <div class="toast-message">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getToastIcon(type) {
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`
  };
  return icons[type] || icons.info;
}

/**
 * Initialization
 */
async function init() {
  console.log('[Skills] Initializing...');
  try {
    // Fetch skills
    console.log('[Skills] Fetching skills from API...');
    const skills = await fetchSkills();
    console.log('[Skills] Received skills:', skills);
    state.skills = skills;
    renderSkillsGrid();
    console.log('[Skills] Skills rendered successfully');

    // Setup search and filter
    setupSearchAndFilter();

    // Setup view toggle
    setupViewToggle();

    // Setup upload modal
    setupUploadModal();

    // Setup tab navigation
    setupTabNavigation();

    // Setup GitHub install
    setupGithubInstall();

    // Event listeners (with null checks)
    safeAddEventListener('refreshBtn', 'click', async () => {
      try {
        const skills = await fetchSkills();
        state.skills = skills;
        renderSkillsGrid();
        showToast('已刷新', 'success');
      } catch (error) {
        showToast('刷新失败: ' + error.message, 'error');
      }
    });

    safeAddEventListener('uploadSkillBtn', 'click', openUploadModal);
    safeAddEventListener('closeUploadBtn', 'click', closeUploadModal);
    safeAddEventListener('cancelUploadBtn', 'click', closeUploadModal);

    // Skill detail modal
    safeAddEventListener('closeSkillDetailBtn', 'click', closeSkillDetailModal);
    safeAddEventListener('cancelSkillDetailBtn', 'click', closeSkillDetailModal);
    safeAddEventListener('deleteSkillBtn', 'click', deleteCurrentSkill);

    // Select all checkbox
    safeAddEventListener('selectAllCheckbox', 'change', (e) => {
      toggleSelectAll(e.target.checked);
    });

    // Batch operations
    safeAddEventListener('batchEnableBtn', 'click', () => {
      batchEnableSkills(true);
    });

    safeAddEventListener('batchDisableBtn', 'click', () => {
      batchEnableSkills(false);
    });

    // Close modals on overlay click
    safeAddEventListener('uploadModal', 'click', (e) => {
      if (e.target.id === 'uploadModal') {
        closeUploadModal();
      }
    });

    safeAddEventListener('skillDetailModal', 'click', (e) => {
      if (e.target.id === 'skillDetailModal') {
        closeSkillDetailModal();
      }
    });

    showToast('技能管理已加载', 'success');
    console.log('[Skills] Initialization complete');
  } catch (error) {
    console.error('[Skills] Initialization failed:', error);
    showToast('加载失败: ' + error.message, 'error');
    document.getElementById('skillsContainer').innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <p>加载失败: ${escapeHtml(error.message)}</p>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">请检查浏览器控制台获取更多信息</p>
      </div>
    `;
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
