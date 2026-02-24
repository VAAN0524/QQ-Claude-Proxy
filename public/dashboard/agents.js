/**
 * Agent Configuration Page Application
 * Handles Agent configuration management with Tool Layer support
 */

// API base URL
const API_BASE = '/api';

// Agent definitions - 新架构
const AGENT_DEFINITIONS = {
  // 主要协调器 (新架构)
  'simple-coordinator': {
    id: 'simple-coordinator',
    name: 'Simple Coordinator',
    description: '单 Agent + 工具层模式，技能驱动的智能助手。支持动态技能加载和工具层调用。',
    icon: 'coordinator',
    capabilities: ['General', 'Complex', 'Tools', 'Skills'],
    defaultPriority: 10,
    defaultTimeout: 60000,
    defaultEnabled: true,
    color: '#9b59b6',
    category: 'core',
    isNew: true
  },

  // Legacy Agents (标记为废弃)
  code: {
    id: 'code',
    name: 'Code Agent',
    description: '代码编写、分析和重构专家 [已废弃 - 功能已集成到工具层]',
    icon: 'code',
    capabilities: ['Code', 'Analyze', 'File'],
    defaultPriority: 10,
    defaultTimeout: 60000,
    defaultEnabled: false,
    color: '#007acc',
    category: 'legacy',
    deprecated: true
  },
  browser: {
    id: 'browser',
    name: 'Browser Agent',
    description: '网页自动化操作专家 [已废弃 - 功能已集成到工具层]',
    icon: 'browser',
    capabilities: ['Web', 'File'],
    defaultPriority: 8,
    defaultTimeout: 120000,
    defaultEnabled: false,
    color: '#4ec9b0',
    category: 'legacy',
    deprecated: true
  },
  shell: {
    id: 'shell',
    name: 'Shell Agent',
    description: '命令执行专家 [已废弃 - 功能已集成到工具层]',
    icon: 'shell',
    capabilities: ['Shell', 'File'],
    defaultPriority: 7,
    defaultTimeout: 30000,
    defaultEnabled: false,
    color: '#f14c4c',
    category: 'legacy',
    deprecated: true
  },
  websearch: {
    id: 'websearch',
    name: 'Web Search Agent',
    description: '网络搜索专家 [已废弃 - 功能已集成到工具层]',
    icon: 'search',
    capabilities: ['General', 'Complex'],
    defaultPriority: 9,
    defaultTimeout: 60000,
    defaultEnabled: false,
    color: '#75beff',
    category: 'legacy',
    deprecated: true
  },
  data: {
    id: 'data',
    name: 'Data Analysis Agent',
    description: '数据分析专家 [已废弃 - 功能已集成到工具层]',
    icon: 'data',
    capabilities: ['Analyze', 'File'],
    defaultPriority: 6,
    defaultTimeout: 30000,
    defaultEnabled: false,
    color: '#dcdcaa',
    category: 'legacy',
    deprecated: true
  },
  vision: {
    id: 'vision',
    name: 'Vision Agent',
    description: '图像分析专家 [已废弃 - 功能已集成到工具层]',
    icon: 'vision',
    capabilities: ['Analyze', 'General'],
    defaultPriority: 5,
    defaultTimeout: 60000,
    defaultEnabled: false,
    color: '#c586c0',
    category: 'legacy',
    deprecated: true
  },
  claude: {
    id: 'claude',
    name: 'Claude Agent',
    description: '通用 Claude Agent',
    icon: 'claude',
    capabilities: ['General', 'Complex'],
    defaultPriority: 5,
    defaultTimeout: 300000,
    defaultEnabled: false,
    color: '#ce9178',
    category: 'legacy',
    deprecated: true
  }
};

// 工具层定义
const TOOL_DEFINITIONS = {
  'smart_search': {
    id: 'smart_search',
    name: '智能搜索',
    description: '自动选择 DuckDuckGo 或 Tavily 进行网络搜索',
    category: 'search',
    icon: 'search'
  },
  'duckduckgo_search': {
    id: 'duckduckgo_search',
    name: 'DuckDuckGo 搜索',
    description: '使用 DuckDuckGo 进行网络搜索',
    category: 'search',
    icon: 'search'
  },
  'tavily_search': {
    id: 'tavily_search',
    name: 'Tavily 搜索',
    description: '使用 Tavily API 进行深度搜索',
    category: 'search',
    icon: 'search',
    requiresApiKey: true
  },
  'fetch_web': {
    id: 'fetch_web',
    name: '网页内容提取',
    description: '获取并提取网页内容',
    category: 'web',
    icon: 'browser'
  },
  'execute_command': {
    id: 'execute_command',
    name: '命令执行',
    description: '执行系统命令（带安全检查）',
    category: 'shell',
    icon: 'shell'
  }
};

// 运行模式定义
const MODE_DEFINITIONS = {
  'cli': {
    id: 'cli',
    name: 'CLI 模式',
    description: '使用 Claude Code CLI 处理复杂任务',
    icon: 'terminal',
    features: ['完整 Claude Code 功能', 'IDE 集成', '代码审查', '高级调试']
  },
  'simple': {
    id: 'simple',
    name: 'Simple 模式',
    description: '单 Agent + 工具层模式，快速响应',
    icon: 'coordinator',
    features: ['技能驱动', '工具层调用', '轻量快速', '统一管理']
  }
};

// Application State
const state = {
  config: null,
  agents: {},
  tools: {},
  stats: {},
  currentMode: 'simple', // cli or simple
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

async function fetchTools() {
  try {
    const data = await apiRequest('/tools');
    return data.tools || {};
  } catch (error) {
    console.log('Tools API not available, using default definitions');
    return TOOL_DEFINITIONS;
  }
}

async function fetchMode() {
  try {
    const data = await apiRequest('/mode');
    return data.mode || 'simple';
  } catch (error) {
    return 'simple'; // 默认模式
  }
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

async function updateMode(mode) {
  try {
    const data = await apiRequest('/mode', {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    });
    return data;
  } catch (error) {
    throw new Error('模式切换失败: ' + error.message);
  }
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

  // 按 category 分组
  const coreAgents = Object.values(AGENT_DEFINITIONS).filter(a => a.category === 'core');
  const legacyAgents = Object.values(AGENT_DEFINITIONS).filter(a => a.category === 'legacy');

  container.innerHTML = `
    <!-- Core Agents Section -->
    ${coreAgents.length > 0 ? `
      <div class="agents-section">
        <h3 class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          核心 Agent
        </h3>
        <div class="agents-grid-inner">
          ${coreAgents.map(agentDef => renderAgentCard(agentDef)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Legacy Agents Section -->
    ${legacyAgents.length > 0 ? `
      <div class="agents-section">
        <h3 class="section-title legacy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Legacy Agents <span class="legacy-badge">已废弃</span>
        </h3>
        <div class="agents-grid-inner">
          ${legacyAgents.map(agentDef => renderAgentCard(agentDef)).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // Attach event listeners
  attachAgentCardListeners();
}

function renderAgentCard(agentDef) {
  const agentState = state.agents[agentDef.id] || {};
  const stats = state.stats[agentDef.id] || {};

  const enabled = agentState.enabled !== undefined ? agentState.enabled : agentDef.defaultEnabled;
  const priority = agentState.priority !== undefined ? agentState.priority : agentDef.defaultPriority;
  const timeout = agentState.timeout !== undefined ? agentState.timeout : agentDef.defaultTimeout;

  return `
    <div class="agent-card ${!enabled ? 'disabled' : ''} ${agentDef.deprecated ? 'deprecated' : ''} ${agentDef.isNew ? 'new' : ''}" data-agent-id="${agentDef.id}">
      ${agentDef.deprecated ? '<div class="deprecated-ribbon">已废弃</div>' : ''}
      ${agentDef.isNew ? '<div class="new-ribbon">新</div>' : ''}

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
                 ${enabled ? 'checked' : ''} ${agentDef.deprecated ? 'disabled' : ''}>
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
                 min="1" max="100" value="${priority}"
                 ${agentDef.deprecated ? 'disabled' : ''}>
        </div>

        <div class="agent-config-field">
          <div class="agent-config-label">
            <span>超时时间</span>
            <span class="agent-config-value">${formatDuration(timeout)}</span>
          </div>
          <input type="range" class="range-slider timeout-slider"
                 data-agent-id="${agentDef.id}"
                 min="10000" max="600000" step="10000"
                 value="${timeout}"
                 ${agentDef.deprecated ? 'disabled' : ''}>
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
}

function getAgentIcon(iconType) {
  const icons = {
    coordinator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
    </svg>`,
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
    </svg>`,
    terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>`
  };
  return icons[iconType] || icons.claude;
}

/**
 * Mode Switching UI
 */
function renderModeSwitcher() {
  const container = document.querySelector('.system-settings .settings-body');
  if (!container) return;

  const modeSwitcherHTML = `
    <div class="setting-row">
      <div class="setting-info">
        <label class="setting-label">运行模式</label>
        <span class="setting-description">选择系统运行模式</span>
      </div>
      <div class="mode-switcher">
        ${Object.values(MODE_DEFINITIONS).map(mode => `
          <label class="mode-option ${state.currentMode === mode.id ? 'active' : ''}">
            <input type="radio" name="mode" value="${mode.id}" ${state.currentMode === mode.id ? 'checked' : ''}>
            <div class="mode-card">
              <div class="mode-icon">${getAgentIcon(mode.icon)}</div>
              <div class="mode-info">
                <div class="mode-name">${escapeHtml(mode.name)}</div>
                <div class="mode-desc">${escapeHtml(mode.description)}</div>
                <div class="mode-features">
                  ${mode.features.map(f => `<span class="mode-feature">${f}</span>`).join('')}
                </div>
              </div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  // 在系统设置区域的开头插入模式切换器
  container.insertAdjacentHTML('afterbegin', modeSwitcherHTML);

  // Attach mode switcher listeners
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const newMode = e.target.value;
      if (newMode !== state.currentMode) {
        try {
          await updateMode(newMode);
          state.currentMode = newMode;
          showToast(`已切换到 ${MODE_DEFINITIONS[newMode].name}`, 'success');
          setTimeout(() => location.reload(), 1000);
        } catch (error) {
          showToast(error.message, 'error');
          e.target.checked = false;
        }
      }
    });
  });
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
        if (!state.agents[agentId]) {
          state.agents[agentId] = {};
        }
        state.agents[agentId].enabled = enabled;

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
    if (slider.disabled) return;

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
    if (slider.disabled) return;

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
      ${agentDef.deprecated ? `
        <div class="detail-row warning">
          <span class="detail-label">⚠️ 状态</span>
          <span class="detail-value">此 Agent 已废弃，功能已集成到 Simple Coordinator 的工具层</span>
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h3>配置选项</h3>
      <div class="detail-actions">
        <div class="detail-action-group">
          <label>启用状态</label>
          <div class="detail-input-group">
            <label class="switch">
              <input type="checkbox" id="detailEnabled"
                     ${agentState.enabled ? 'checked' : ''} ${agentDef.deprecated ? 'disabled' : ''}>
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
                   min="1" max="100" value="${agentState.priority || agentDef.defaultPriority}"
                   ${agentDef.deprecated ? 'disabled' : ''}>
          </div>
        </div>
        <div class="detail-action-group">
          <label>超时时间 (毫秒)</label>
          <div class="detail-input-group">
            <input type="number" id="detailTimeout" class="form-input"
                   min="5000" max="600000" step="1000"
                   value="${agentState.timeout || agentDef.defaultTimeout}"
                   ${agentDef.deprecated ? 'disabled' : ''}>
            <span class="detail-input-unit">ms</span>
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

  try {
    const updates = { enabled, priority, timeout };
    await updateAgentConfig(agentId, updates);

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
    // Fetch current mode
    state.currentMode = await fetchMode();

    // Fetch agents configuration
    const data = await fetchAgents();
    state.agents = data.agents || {};

    // Fetch tools
    state.tools = await fetchTools();

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
    renderModeSwitcher();

    // Remove old system settings (now replaced by mode switcher)
    const oldSettings = document.querySelectorAll('.setting-row');
    oldSettings.forEach(row => {
      const label = row.querySelector('.setting-label');
      if (label && (label.textContent.includes('默认 Agent') ||
                   label.textContent.includes('智能路由') ||
                   label.textContent.includes('协作模式'))) {
        row.remove();
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
