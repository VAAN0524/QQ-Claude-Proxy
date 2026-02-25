/**
 * Advanced Configuration Page
 * Handles Agent persona, context management, and memory system settings
 */

// API Configuration
const API_BASE = '';

// State management
const state = {
  connected: false,
  config: null,
  memoryStats: null
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  saveBtn: document.getElementById('saveBtn'),
  restartNotice: document.getElementById('restartNotice'),
  restartNowBtn: document.getElementById('restartNowBtn'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initConnectionStatus();
  loadConfig();
  initEventListeners();
  updateContextPreview();
  loadMemoryStats();
});

// Tab Navigation
function initTabs() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update tab buttons
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update tab panes
      elements.tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `${tabId}-tab`) {
          pane.classList.add('active');
        }
      });
    });
  });
}

// Connection Status
async function initConnectionStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (response.ok) {
      setConnectionStatus(true);
    } else {
      setConnectionStatus(false);
    }
  } catch (error) {
    setConnectionStatus(false);
  }
}

function setConnectionStatus(connected) {
  state.connected = connected;
  const dot = elements.connectionStatus.querySelector('.status-dot');
  const text = elements.connectionStatus.querySelector('.status-text');

  if (connected) {
    dot.style.background = '#10b981';
    text.textContent = '已连接';
  } else {
    dot.style.background = '#ef4444';
    text.textContent = '未连接';
  }
}

// Load Configuration
async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    if (response.ok) {
      const data = await response.json();
      state.config = data.config || data;
      populateForm(state.config);
    }
  } catch (error) {
    showToast('加载配置失败: ' + error.message, 'error');
  }
}

// Populate Form with Configuration
function populateForm(config) {
  // Persona Settings
  if (config.persona) {
    document.getElementById('personaEnabled').checked = config.persona.enabled || false;
    document.getElementById('personaType').value = config.persona.personaType || 'ah-bai';

    if (config.persona.customPersona) {
      document.getElementById('customRole').value = config.persona.customPersona.role || '';
      document.getElementById('customResponsibilities').value = config.persona.customPersona.responsibilities || '';
      document.getElementById('customTraits').value = config.persona.customPersona.traits || '';
      document.getElementById('customPrinciples').value = config.persona.customPersona.principles || '';
      document.getElementById('customSpeakingStyle').value = config.persona.customPersona.speakingStyle || '';
    }

    if (config.persona.dialogueStyle) {
      document.getElementById('toneStyle').value = config.persona.dialogueStyle.tone || 'neutral';
      document.getElementById('verbosityStyle').value = config.persona.dialogueStyle.verbosity || 'normal';
      document.getElementById('enableEmoji').checked = config.persona.dialogueStyle.enableEmoji !== false;
      document.getElementById('enableContinuity').checked = config.persona.dialogueStyle.enableContinuity !== false;
    }

    updatePersonaPreview();
  }

  // Context Settings
  if (config.context) {
    document.getElementById('maxContextSize').value = config.context.maxContextSize || 16000;
    document.getElementById('recentRatio').value = (config.context.recentRatio || 0.7) * 100;
    document.getElementById('recentRatioValue').textContent = Math.round((config.context.recentRatio || 0.7) * 100);
    document.getElementById('maxHistoryMessages').value = config.context.maxHistoryMessages || 100;
    document.getElementById('enableCompression').checked = config.context.enableCompression !== false;
    document.getElementById('compressionMaxTokens').value = config.context.compressionMaxTokens || 16000;
    document.getElementById('preserveCodeBlocks').checked = config.context.preserveCodeBlocks !== false;
    document.getElementById('preserveFilePaths').checked = config.context.preserveFilePaths !== false;

    // Real-time context
    if (config.context.realtime !== undefined) {
      document.getElementById('enableRealtimeContext').checked = config.context.realtime.enabled !== false;
      document.getElementById('enableDateInContext').checked = config.context.realtime.enableDate !== false;
      document.getElementById('enableTimeInContext').checked = config.context.realtime.enableTime !== false;
      document.getElementById('enableWeekdayInContext').checked = config.context.realtime.enableWeekday !== false;
    }
  }

  // Memory Settings
  if (config.memory) {
    document.getElementById('memoryEnabled').checked = config.memory.enabled !== false;
    document.getElementById('l0MaxTokens').value = config.memory.l0MaxTokens || 100;
    document.getElementById('l1MaxTokens').value = config.memory.l1MaxTokens || 2000;
    document.getElementById('l2Enabled').checked = config.memory.l2Enabled !== false;
    document.getElementById('retentionDays').value = config.memory.retentionDays || 30;
    document.getElementById('enableSemanticSearch').checked = config.memory.enableSemanticSearch || false;
    document.getElementById('enableAutoArchive').checked = config.memory.enableAutoArchive !== false;
  }
}

// Initialize Event Listeners
function initEventListeners() {
  // Save Button
  elements.saveBtn.addEventListener('click', saveConfig);

  // Restart Button
  elements.restartNowBtn.addEventListener('click', restartService);

  // Persona Type Change
  document.getElementById('personaType').addEventListener('change', (e) => {
    const customSection = document.getElementById('customPersonaSection');
    customSection.style.display = e.target.value === 'custom' ? 'block' : 'none';
    updatePersonaPreview();
  });

  // Custom Persona Fields
  const customFields = ['customRole', 'customResponsibilities', 'customTraits', 'customPrinciples', 'customSpeakingStyle'];
  customFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', debounce(updatePersonaPreview, 300));
    }
  });

  // Dialogue Style Fields
  document.getElementById('toneStyle').addEventListener('change', updatePersonaPreview);
  document.getElementById('verbosityStyle').addEventListener('change', updatePersonaPreview);

  // Recent Ratio Slider
  document.getElementById('recentRatio').addEventListener('input', (e) => {
    document.getElementById('recentRatioValue').textContent = e.target.value;
  });

  // Real-time Context Toggles
  const realtimeToggles = ['enableRealtimeContext', 'enableDateInContext', 'enableTimeInContext', 'enableWeekdayInContext'];
  realtimeToggles.forEach(toggleId => {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.addEventListener('change', updateContextPreview);
    }
  });

  // Refresh Memory Stats
  const refreshBtn = document.getElementById('refreshMemoryStats');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadMemoryStats);
  }
}

// Save Configuration
async function saveConfig() {
  const config = gatherFormData();

  try {
    elements.saveBtn.classList.add('saving');
    elements.saveBtn.disabled = true;

    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    if (response.ok) {
      const result = await response.json();
      showToast('配置已保存', 'success');

      if (result.needsRestart) {
        elements.restartNotice.style.display = 'flex';
      }
    } else {
      throw new Error('保存失败');
    }
  } catch (error) {
    showToast('保存配置失败: ' + error.message, 'error');
  } finally {
    elements.saveBtn.classList.remove('saving');
    elements.saveBtn.disabled = false;
  }
}

// Gather Form Data
function gatherFormData() {
  const config = state.config || {};

  // Persona Settings
  config.persona = {
    enabled: document.getElementById('personaEnabled').checked,
    personaType: document.getElementById('personaType').value,
    customPersona: {
      role: document.getElementById('customRole').value,
      responsibilities: document.getElementById('customResponsibilities').value,
      traits: document.getElementById('customTraits').value,
      principles: document.getElementById('customPrinciples').value,
      speakingStyle: document.getElementById('customSpeakingStyle').value
    },
    dialogueStyle: {
      tone: document.getElementById('toneStyle').value,
      verbosity: document.getElementById('verbosityStyle').value,
      enableEmoji: document.getElementById('enableEmoji').checked,
      enableContinuity: document.getElementById('enableContinuity').checked
    }
  };

  // Context Settings
  config.context = {
    maxContextSize: parseInt(document.getElementById('maxContextSize').value),
    recentRatio: parseInt(document.getElementById('recentRatio').value) / 100,
    maxHistoryMessages: parseInt(document.getElementById('maxHistoryMessages').value),
    enableCompression: document.getElementById('enableCompression').checked,
    compressionMaxTokens: parseInt(document.getElementById('compressionMaxTokens').value),
    preserveCodeBlocks: document.getElementById('preserveCodeBlocks').checked,
    preserveFilePaths: document.getElementById('preserveFilePaths').checked,
    realtime: {
      enabled: document.getElementById('enableRealtimeContext').checked,
      enableDate: document.getElementById('enableDateInContext').checked,
      enableTime: document.getElementById('enableTimeInContext').checked,
      enableWeekday: document.getElementById('enableWeekdayInContext').checked
    }
  };

  // Memory Settings
  config.memory = {
    enabled: document.getElementById('memoryEnabled').checked,
    l0MaxTokens: parseInt(document.getElementById('l0MaxTokens').value),
    l1MaxTokens: parseInt(document.getElementById('l1MaxTokens').value),
    l2Enabled: document.getElementById('l2Enabled').checked,
    retentionDays: parseInt(document.getElementById('retentionDays').value),
    enableSemanticSearch: document.getElementById('enableSemanticSearch').checked,
    enableAutoArchive: document.getElementById('enableAutoArchive').checked
  };

  return config;
}

// Update Persona Preview
function updatePersonaPreview() {
  const personaType = document.getElementById('personaType').value;
  const previewName = document.getElementById('previewName');
  const previewDesc = document.getElementById('previewDesc');
  const previewTraits = document.getElementById('previewTraits');

  const personas = {
    'ah-bai': {
      name: '阿白',
      desc: '友善亲切，像朋友一样自然交流',
      traits: '专业可靠 • 偶尔幽默 • 灵活应变'
    },
    'professional': {
      name: '专业助手',
      desc: '严谨专业，高效简洁',
      traits: '精准高效 • 逻辑清晰 • 结果导向'
    },
    'friendly': {
      name: '友好伙伴',
      desc: '热情活泼，轻松聊天',
      traits: '热情开朗 • 富有创意 • 轻松有趣'
    }
  };

  if (personaType === 'custom') {
    const role = document.getElementById('customRole').value || '自定义角色';
    const traits = document.getElementById('customTraits').value || '自定义特点';

    previewName.textContent = role.split(' ')[0] || '自定义';
    previewDesc.textContent = document.getElementById('customResponsibilities').value || '自定义人格';
    previewTraits.textContent = traits.split(/[，、]/).slice(0, 3).join(' • ') || '自定义特征';
  } else {
    const persona = personas[personaType];
    if (persona) {
      previewName.textContent = persona.name;
      previewDesc.textContent = persona.desc;
      previewTraits.textContent = persona.traits;
    }
  }
}

// Update Context Preview
function updateContextPreview() {
  const enableRealtime = document.getElementById('enableRealtimeContext').checked;
  const enableDate = document.getElementById('enableDateInContext').checked;
  const enableTime = document.getElementById('enableTimeInContext').checked;
  const enableWeekday = document.getElementById('enableWeekdayInContext').checked;

  const preview = document.getElementById('contextPreviewContent');

  if (!enableRealtime) {
    preview.textContent = '// 实时上下文已禁用';
    return;
  }

  const now = new Date();
  const lines = ['## 📍 当前实时上下文'];

  if (enableDate) {
    const date = now.toISOString().split('T')[0];
    lines.push(`- **当前日期**: ${date}`);
  }

  if (enableTime) {
    const time = now.toTimeString().split(' ')[0];
    lines.push(`- **当前时间**: ${time}`);
  }

  if (enableWeekday) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    lines.push(`- **星期**: 周${weekdays[now.getDay()]}`);
  }

  preview.textContent = lines.join('\n');
}

// Load Memory Statistics
async function loadMemoryStats() {
  try {
    const response = await fetch(`${API_BASE}/api/memory/stats`);
    if (response.ok) {
      const stats = await response.json();
      updateMemoryStatsDisplay(stats);
    }
  } catch (error) {
    console.error('Failed to load memory stats:', error);
  }
}

// Update Memory Stats Display
function updateMemoryStatsDisplay(stats) {
  if (document.getElementById('totalMemories')) {
    document.getElementById('totalMemories').textContent = stats.total || 0;
  }
  if (document.getElementById('l0Memories')) {
    document.getElementById('l0Memories').textContent = stats.l0 || 0;
  }
  if (document.getElementById('l1Memories')) {
    document.getElementById('l1Memories').textContent = stats.l1 || 0;
  }
  if (document.getElementById('l2Memories')) {
    document.getElementById('l2Memories').textContent = stats.l2 || 0;
  }
}

// Restart Service
async function restartService() {
  if (!confirm('确定要重启服务吗？')) return;

  try {
    elements.restartNowBtn.disabled = true;
    elements.restartNowBtn.textContent = '重启中...';

    const response = await fetch(`${API_BASE}/api/service/restart`, {
      method: 'POST'
    });

    if (response.ok) {
      showToast('服务重启中...', 'info');
      elements.restartNotice.style.display = 'none';

      // Poll for reconnection
      setTimeout(async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const healthResponse = await fetch(`${API_BASE}/api/health`);
            if (healthResponse.ok) {
              showToast('服务已重启', 'success');
              setConnectionStatus(true);
              break;
            }
          } catch {
            // Continue trying
          }
        }
      }, 1000);
    } else {
      throw new Error('重启失败');
    }
  } catch (error) {
    showToast('重启服务失败: ' + error.message, 'error');
  } finally {
    elements.restartNowBtn.disabled = false;
    elements.restartNowBtn.textContent = '立即重启';
  }
}

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Utility Functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
