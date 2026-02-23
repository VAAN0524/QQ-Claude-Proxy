/**
 * Agent Configuration Page Application
 * Handles Agent configuration management
 */

// API base URL
const API_BASE = '/api';

// Agent definitions
const AGENT_DEFINITIONS = {
  code: {
    id: 'code',
    name: 'Code Agent',
    description: '代码编写、分析和重构专家，支持多种编程语言',
    icon: 'code',
    capabilities: ['Code', 'Analyze', 'File'],
    defaultPriority: 10,
    defaultTimeout: 60000,
    defaultEnabled: true,
    color: '#007acc'
  },
  browser: {
    id: 'browser',
    name: 'Browser Agent',
    description: '网页自动化操作专家，支持浏览器控制和页面交互',
    icon: 'browser',
    capabilities: ['Web', 'File'],
    defaultPriority: 8,
    defaultTimeout: 120000,
    defaultEnabled: true,
    color: '#4ec9b0'
  },
  shell: {
    id: 'shell',
    name: 'Shell Agent',
    description: '命令执行专家，支持 Shell 命令和系统操作',
    icon: 'shell',
    capabilities: ['Shell', 'File'],
    defaultPriority: 7,
    defaultTimeout: 30000,
    defaultEnabled: true,
    color: '#f14c4c'
  },
  websearch: {
    id: 'websearch',
    name: 'Web Search Agent',
    description: '网络搜索专家，快速获取最新信息和数据',
    icon: 'search',
    capabilities: ['General', 'Complex'],
    defaultPriority: 9,
    defaultTimeout: 60000,
    defaultEnabled: true,
    color: '#75beff'
  },
  data: {
    id: 'data',
    name: 'Data Analysis Agent',
    description: '数据分析专家，支持 CSV、JSON 等格式数据处理',
    icon: 'data',
    capabilities: ['Analyze', 'File'],
    defaultPriority: 6,
    defaultTimeout: 30000,
    defaultEnabled: true,
    color: '#dcdcaa'
  },
  vision: {
    id: 'vision',
    name: 'Vision Agent',
    description: '图像分析专家，支持图片理解和视觉内容处理',
    icon: 'vision',
    capabilities: ['Analyze', 'General'],
    defaultPriority: 5,
    defaultTimeout: 60000,
    defaultEnabled: true,
    color: '#c586c0'
  },
  claude: {
    id: 'claude',
    name: 'Claude Agent',
    description: '通用 Claude Agent，处理常规对话和任务',
    icon: 'claude',
    capabilities: ['General', 'Complex'],
    defaultPriority: 5,
    defaultTimeout: 300000,
    defaultEnabled: true,
    color: '#ce9178'
  }
};

// Application State
const state = {
  config: null,
  agents: {},
  stats: {},
  currentAgent: null,
};

/**
 * Utility Functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(num) {
  return new Intl.NumberFormat('zh-CN').format(num);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}小时 ${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟 ${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
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
      // 为 404 错误提供更友好的消息
      if (response.status === 404 && endpoint.includes('/agents/')) {
        throw new Error('Agent 未在后端初始化。请检查配置文件或重启服务。');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

async function fetchAgents() {
  const data = await apiRequest('/agents');
  return data.agents || {};
}

async function fetchAgentStats(agentId) {
  const data = await apiRequest(`/agents/stats?id=${encodeURIComponent(agentId)}`);
  return data.stats || {};
}

async function updateAgentConfig(agentId, config) {
  const data = await apiRequest('/agents/update', {
    method: 'PUT',
    body: JSON.stringify({ agentId, config }),
  });
  return data;
}

async function updateSystemConfig(config) {
  const data = await apiRequest('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  return data;
}

/**
 * UI Render Functions
 */
function renderAgentsGrid() {
  const container = document.getElementById('agentsGrid');
  if (!container) return;

  const agentDefs = Object.values(AGENT_DEFINITIONS);

  container.innerHTML = agentDefs.map(agentDef => {
    const agentState = state.agents[agentDef.id] || {};
    const stats = state.stats[agentDef.id] || {};

    // 使用默认值处理未加载的 agent
    const enabled = agentState.enabled !== undefined ? agentState.enabled : agentDef.defaultEnabled;
    const priority = agentState.priority !== undefined ? agentState.priority : agentDef.defaultPriority;
    const timeout = agentState.timeout !== undefined ? agentState.timeout : agentDef.defaultTimeout;

    return `
      <div class="agent-card ${!enabled ? 'disabled' : ''}" data-agent-id="${agentDef.id}">
        <div class="agent-card-header">
          <div class="agent-card-title">
            <div class="agent-card-icon" style="color: ${agentDef.color}">
              ${getAgentIcon(agentDef.icon)}
            </div>
            <div>
              <div class="agent-card-name">${escapeHtml(agentDef.name)}</div>
              <span class="agent-card-status ${enabled ? 'enabled' : 'disabled'}">
                ${enabled ? '已启用' : '已禁用'}
              </span>
            </div>
          </div>
          <label class="switch">
            <input type="checkbox" class="agent-toggle" data-agent-id="${agentDef.id}"
                   ${enabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="agent-card-body">
          <p class="agent-card-description">${escapeHtml(agentDef.description)}</p>

          <div class="agent-config-field">
            <div class="agent-config-label">
              <span>优先级</span>
              <span class="agent-config-value">${priority}</span>
            </div>
            <input type="range" class="range-slider priority-slider"
                   data-agent-id="${agentDef.id}"
                   min="1" max="100" value="${priority}">
          </div>

          <div class="agent-config-field">
            <div class="agent-config-label">
              <span>超时时间</span>
              <span class="agent-config-value">${formatDuration(timeout)}</span>
            </div>
            <input type="range" class="range-slider timeout-slider"
                   data-agent-id="${agentDef.id}"
                   min="10000" max="600000" step="10000"
                   value="${timeout}">
          </div>

          <div class="agent-capabilities">
            ${agentDef.capabilities.map(cap =>
              `<span class="capability-badge">${cap}</span>`
            ).join('')}
          </div>
        </div>
        <div class="agent-card-footer">
          <div class="agent-stats">
            ${stats.totalExecutions !== undefined ? `
              <div class="agent-stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span>执行: ${formatNumber(stats.totalExecutions)}</span>
              </div>
            ` : ''}
            ${stats.successRate !== undefined ? `
              <div class="agent-stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>成功率: ${Math.round(stats.successRate * 100)}%</span>
              </div>
            ` : ''}
          </div>
          <div class="agent-card-actions">
            <button class="btn-icon-small" data-action="detail" data-agent-id="${agentDef.id}" title="详情">
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
  }).join('');

  // Attach event listeners
  attachAgentCardListeners();
}

function getAgentIcon(iconType) {
  const icons = {
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>`,
    browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>`,
    shell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>`,
    data: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>`,
    vision: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`,
    claude: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`
  };
  return icons[iconType] || icons.claude;
}

/**
 * Event Listeners
 */
function attachAgentCardListeners() {
  // Toggle switches
  document.querySelectorAll('.agent-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const agentId = e.target.dataset.agentId;
      const enabled = e.target.checked;

      try {
        await updateAgentConfig(agentId, { enabled });
        // 确保 state.agents[agentId] 存在
        if (!state.agents[agentId]) {
          state.agents[agentId] = {};
        }
        state.agents[agentId].enabled = enabled;

        // Update UI
        const card = document.querySelector(`.agent-card[data-agent-id="${agentId}"]`);
        const statusBadge = card.querySelector('.agent-card-status');

        if (enabled) {
          card.classList.remove('disabled');
          statusBadge.classList.remove('disabled');
          statusBadge.classList.add('enabled');
          statusBadge.textContent = '已启用';
        } else {
          card.classList.add('disabled');
          statusBadge.classList.remove('enabled');
          statusBadge.classList.add('disabled');
          statusBadge.textContent = '已禁用';
        }

        showToast(`${AGENT_DEFINITIONS[agentId].name} 已${enabled ? '启用' : '禁用'}`, 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
        e.target.checked = !enabled;
      }
    });
  });

  // Priority sliders
  document.querySelectorAll('.priority-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const agentId = e.target.dataset.agentId;
      const value = parseInt(e.target.value);
      const valueDisplay = e.target.parentElement.querySelector('.agent-config-value');
      valueDisplay.textContent = value;
    });

    slider.addEventListener('change', async (e) => {
      const agentId = e.target.dataset.agentId;
      const priority = parseInt(e.target.value);

      try {
        await updateAgentConfig(agentId, { priority });
        // 确保 state.agents[agentId] 存在
        if (!state.agents[agentId]) {
          state.agents[agentId] = {};
        }
        state.agents[agentId].priority = priority;
        showToast(`优先级已更新: ${priority}`, 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
      }
    });
  });

  // Timeout sliders
  document.querySelectorAll('.timeout-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const agentId = e.target.dataset.agentId;
      const value = parseInt(e.target.value);
      const valueDisplay = e.target.parentElement.querySelector('.agent-config-value');
      valueDisplay.textContent = formatDuration(value);
    });

    slider.addEventListener('change', async (e) => {
      const agentId = e.target.dataset.agentId;
      const timeout = parseInt(e.target.value);

      try {
        await updateAgentConfig(agentId, { timeout });
        // 确保 state.agents[agentId] 存在
        if (!state.agents[agentId]) {
          state.agents[agentId] = {};
        }
        state.agents[agentId].timeout = timeout;
        showToast(`超时时间已更新: ${formatDuration(timeout)}`, 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
      }
    });
  });

  // Detail buttons
  document.querySelectorAll('[data-action="detail"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const agentId = btn.dataset.agentId;
      openAgentDetailModal(agentId);
    });
  });
}

/**
 * Agent Detail Modal
 */
function openAgentDetailModal(agentId) {
  const agentDef = AGENT_DEFINITIONS[agentId];
  const agentState = state.agents[agentId] || {};

  state.currentAgent = agentId;

  const modal = document.getElementById('agentDetailModal');
  const title = document.getElementById('agentDetailTitle');
  const body = document.getElementById('agentDetailBody');

  title.textContent = agentDef.name;

  body.innerHTML = `
    <div class="detail-section">
      <h3>基本信息</h3>
      <div class="detail-row">
        <span class="detail-label">Agent ID</span>
        <span class="detail-value">${escapeHtml(agentDef.id)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">描述</span>
        <span class="detail-value">${escapeHtml(agentDef.description)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">能力</span>
        <span class="detail-value">
          ${agentDef.capabilities.map(cap =>
            `<span class="capability-badge">${cap}</span>`
          ).join(' ')}
        </span>
      </div>
    </div>

    <div class="detail-section">
      <h3>配置选项</h3>
      <div class="detail-actions">
        <div class="detail-action-group">
          <label>启用状态</label>
          <div class="detail-input-group">
            <label class="switch">
              <input type="checkbox" id="detailEnabled"
                     ${agentState.enabled ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <div class="detail-action-group">
          <label>优先级 (1-100)</label>
          <div class="detail-input-group">
            <input type="number" id="detailPriority" class="form-input"
                   min="1" max="100" value="${agentState.priority || agentDef.defaultPriority}">
          </div>
        </div>
        <div class="detail-action-group">
          <label>超时时间 (毫秒)</label>
          <div class="detail-input-group">
            <input type="number" id="detailTimeout" class="form-input"
                   min="5000" max="600000" step="1000"
                   value="${agentState.timeout || agentDef.defaultTimeout}">
            <span class="detail-input-unit">ms</span>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <div class="detail-action-group">
          <label>模型 (仅 Code/Coordinator)</label>
          <div class="detail-input-group">
            <select id="detailModel" class="form-input form-select">
              <option value="claude-3-5-sonnet-20241022" ${(agentState.options?.model || '').includes('sonnet') ? 'selected' : ''}>Claude 3.5 Sonnet</option>
              <option value="claude-3-5-haiku-20241022" ${(agentState.options?.model || '').includes('haiku') ? 'selected' : ''}>Claude 3.5 Haiku</option>
              <option value="claude-3-opus-20240229" ${(agentState.options?.model || '').includes('opus') ? 'selected' : ''}>Claude 3 Opus</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>执行统计</h3>
      ${renderAgentStats(agentId)}
    </div>
  `;

  modal.classList.add('active');
}

function renderAgentStats(agentId) {
  const stats = state.stats[agentId] || {};

  if (Object.keys(stats).length === 0) {
    return '<p class="empty-hint">暂无统计数据</p>';
  }

  return `
    <div class="detail-row">
      <span class="detail-label">总执行次数</span>
      <span class="detail-value">${formatNumber(stats.totalExecutions || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">成功次数</span>
      <span class="detail-value">${formatNumber(stats.successfulExecutions || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">失败次数</span>
      <span class="detail-value">${formatNumber(stats.failedExecutions || 0)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">平均执行时间</span>
      <span class="detail-value">${stats.averageExecutionTime ? formatDuration(stats.averageExecutionTime) : '--'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">成功率</span>
      <span class="detail-value">${stats.successRate ? Math.round(stats.successRate * 100) + '%' : '--'}</span>
    </div>
  `;
}

function closeAgentDetailModal() {
  document.getElementById('agentDetailModal').classList.remove('active');
  state.currentAgent = null;
}

async function saveAgentDetail() {
  if (!state.currentAgent) return;

  const agentId = state.currentAgent;
  const enabled = document.getElementById('detailEnabled').checked;
  const priority = parseInt(document.getElementById('detailPriority').value);
  const timeout = parseInt(document.getElementById('detailTimeout').value);
  const model = document.getElementById('detailModel').value;

  try {
    const updates = { enabled, priority, timeout };
    if (model) {
      updates.options = { model };
    }

    await updateAgentConfig(agentId, updates);

    // Update state
    state.agents[agentId] = { ...state.agents[agentId], ...updates };

    showToast('配置已保存', 'success');
    closeAgentDetailModal();
    renderAgentsGrid();
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
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
  try {
    // Fetch agents configuration
    const data = await fetchAgents();
    state.agents = data.agents || {};

    // Fetch stats for each agent
    for (const agentId of Object.keys(AGENT_DEFINITIONS)) {
      try {
        const stats = await fetchAgentStats(agentId);
        state.stats[agentId] = stats;
      } catch {
        // Stats might not be available for all agents
      }
    }

    renderAgentsGrid();

    // System settings
    document.getElementById('defaultAgent').addEventListener('change', async (e) => {
      try {
        await updateSystemConfig({
          agents: { default: e.target.value }
        });
        showToast('默认 Agent 已更新', 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
      }
    });

    document.getElementById('smartRouting').addEventListener('change', async (e) => {
      try {
        await updateSystemConfig({
          agents: { smartRouting: e.target.checked }
        });
        showToast('智能路由设置已更新', 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
      }
    });

    document.getElementById('useCoordinator').addEventListener('change', async (e) => {
      try {
        await updateSystemConfig({
          agents: { useCoordinator: e.target.checked }
        });
        showToast('协作模式设置已更新', 'success');
      } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
      }
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      try {
        const data = await fetchAgents();
        state.agents = data;
        renderAgentsGrid();
        showToast('已刷新', 'success');
      } catch (error) {
        showToast('刷新失败: ' + error.message, 'error');
      }
    });

    // Modal event listeners
    document.getElementById('closeAgentDetailBtn').addEventListener('click', closeAgentDetailModal);
    document.getElementById('cancelAgentDetailBtn').addEventListener('click', closeAgentDetailModal);
    document.getElementById('saveAgentDetailBtn').addEventListener('click', saveAgentDetail);

    // Close modal on overlay click
    document.getElementById('agentDetailModal').addEventListener('click', (e) => {
      if (e.target.id === 'agentDetailModal') {
        closeAgentDetailModal();
      }
    });

    showToast('Agent 配置已加载', 'success');
  } catch (error) {
    showToast('加载失败: ' + error.message, 'error');
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
