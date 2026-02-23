/**
 * System Configuration Page
 * Handles loading, editing, and saving system configuration
 */

// API base URL
const API_BASE = '/api';

// Application State
const state = {
  originalConfig: null,  // Original config for change detection
  currentConfig: null,   // Current edited config
  connected: false,
};

// Store original values for change detection
const originalValues = new Map();

/**
 * Utility Functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

async function fetchFullConfig() {
  const data = await apiRequest('/config/full');
  state.originalConfig = JSON.parse(JSON.stringify(data));  // Deep clone
  state.currentConfig = data;
  return data;
}

async function saveFullConfig(config) {
  await apiRequest('/config/full', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

async function restartService() {
  await apiRequest('/restart', { method: 'POST' });
}

/**
 * UI Functions
 */
function updateConnectionStatus(connected) {
  state.connected = connected;
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  if (connected) {
    statusDot.classList.add('connected');
    statusDot.classList.remove('error');
    statusText.textContent = '已连接';
  } else {
    statusDot.classList.remove('connected');
    statusDot.classList.add('error');
    statusText.textContent = '连接失败';
  }
}

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
    </svg>`,
  };
  return icons[type] || icons.info;
}

/**
 * Load config into form fields
 */
function loadConfigToForm(config) {
  // Gateway settings
  document.getElementById('gatewayHost').value = config.gateway?.host || '127.0.0.1';
  document.getElementById('gatewayPort').value = config.gateway?.port || 18789;

  // QQ Bot settings
  document.getElementById('qqbotEnabled').checked = config.channels?.qqbot?.enabled ?? true;
  document.getElementById('sandboxMode').checked = config.channels?.qqbot?.sandbox ?? true;
  document.getElementById('qqbotAppId').value = config.channels?.qqbot?.appId || '';
  document.getElementById('qqbotClientSecret').value = config.channels?.qqbot?.clientSecret || '';
  document.getElementById('qqbotToken').value = config.channels?.qqbot?.token || '';

  // Storage paths
  document.getElementById('downloadPath').value = config.storage?.downloadPath || './workspace';
  document.getElementById('uploadPath').value = config.storage?.uploadPath || './uploads';
  document.getElementById('schedulerResultDir').value = config.scheduler?.resultDir || './data/task-results';

  // Security settings
  document.getElementById('allowedUsers').value = config.agent?.allowedUsers?.join(', ') || '';

  // Scheduler settings
  document.getElementById('schedulerEnabled').checked = config.scheduler?.enabled ?? true;
  document.getElementById('schedulerMaxConcurrent').value = config.scheduler?.maxConcurrentTasks || 3;
  document.getElementById('schedulerTaskTimeout').value = Math.round((config.scheduler?.taskTimeout || 30 * 60 * 1000) / 60000);

  // Agent settings
  document.getElementById('defaultAgent').value = config.agents?.default || 'coordinator';
  document.getElementById('smartRouting').checked = config.agents?.smartRouting ?? true;
  document.getElementById('useCoordinator').checked = config.agents?.useCoordinator ?? true;

  // LLM Provider settings
  const llmConfig = config.llm || {};
  document.getElementById('llmProvider').value = llmConfig.provider || 'glm';
  document.getElementById('llmModel').value = llmConfig.model || 'glm-4.7';
  document.getElementById('llmMaxTokens').value = llmConfig.maxTokens || 8192;
  document.getElementById('llmBaseUrl').value = llmConfig.baseURL || '';

  // GLM specific config
  const glmConfig = llmConfig.glm || {};
  document.getElementById('glmApiKey').value = glmConfig.apiKey || llmConfig.apiKey || '';
  document.getElementById('glmUseJwt').checked = glmConfig.useJwt ?? true;
  document.getElementById('glmIsCodingPlan').checked = glmConfig.isCodingPlan ?? false;

  // Anthropic specific config
  const anthropicConfig = llmConfig.anthropic || {};
  document.getElementById('anthropicApiKey').value = anthropicConfig.apiKey || '';
  document.getElementById('anthropicModel').value = anthropicConfig.model || 'claude-3-5-sonnet-20241022';

  // OpenAI specific config
  const openaiConfig = llmConfig.openai || {};
  document.getElementById('openaiApiKey').value = openaiConfig.apiKey || '';
  document.getElementById('openaiBaseUrl').value = openaiConfig.baseURL || 'https://api.openai.com/v1';
  document.getElementById('openaiModel').value = openaiConfig.model || 'gpt-4';

  // Update provider config visibility
  updateProviderConfigVisibility();

  // Store original values for change detection
  storeOriginalValues();
}

/**
 * Store original form values for change detection
 */
function storeOriginalValues() {
  const inputs = document.querySelectorAll('#configForm input, #configForm select, #configForm textarea');
  inputs.forEach(input => {
    if (input.type === 'checkbox') {
      originalValues.set(input.id, input.checked);
    } else {
      originalValues.set(input.id, input.value);
    }
  });
}

/**
 * Get config from form fields
 */
function getConfigFromForm() {
  const allowedUsersText = document.getElementById('allowedUsers').value;
  const allowedUsers = allowedUsersText
    .split(',')
    .map(u => u.trim())
    .filter(u => u);

  return {
    gateway: {
      host: document.getElementById('gatewayHost').value,
      port: parseInt(document.getElementById('gatewayPort').value) || 18789,
    },
    channels: {
      qqbot: {
        enabled: document.getElementById('qqbotEnabled').checked,
        appId: document.getElementById('qqbotAppId').value,
        clientSecret: document.getElementById('qqbotClientSecret').value,
        token: document.getElementById('qqbotToken').value || undefined,
        sandbox: document.getElementById('sandboxMode').checked,
      },
    },
    agent: {
      allowedUsers,
    },
    storage: {
      downloadPath: document.getElementById('downloadPath').value,
      uploadPath: document.getElementById('uploadPath').value,
    },
    scheduler: {
      enabled: document.getElementById('schedulerEnabled').checked,
      resultDir: document.getElementById('schedulerResultDir').value,
      maxConcurrentTasks: parseInt(document.getElementById('schedulerMaxConcurrent').value) || 3,
      taskTimeout: (parseInt(document.getElementById('schedulerTaskTimeout').value) || 30) * 60 * 1000,
    },
    agents: {
      default: document.getElementById('defaultAgent').value,
      smartRouting: document.getElementById('smartRouting').checked,
      useCoordinator: document.getElementById('useCoordinator').checked,
    },
    llm: {
      provider: document.getElementById('llmProvider').value,
      model: document.getElementById('llmModel').value,
      maxTokens: parseInt(document.getElementById('llmMaxTokens').value) || 8192,
      baseURL: document.getElementById('llmBaseUrl').value || undefined,
      apiKey: document.getElementById('glmApiKey').value || undefined, // 默认使用 GLM API Key
      glm: {
        apiKey: document.getElementById('glmApiKey').value || undefined,
        useJwt: document.getElementById('glmUseJwt').checked,
        isCodingPlan: document.getElementById('glmIsCodingPlan').checked,
      },
      anthropic: {
        apiKey: document.getElementById('anthropicApiKey').value || undefined,
        model: document.getElementById('anthropicModel').value,
        maxTokens: parseInt(document.getElementById('llmMaxTokens').value) || 8192,
      },
      openai: {
        apiKey: document.getElementById('openaiApiKey').value || undefined,
        baseURL: document.getElementById('openaiBaseUrl').value || 'https://api.openai.com/v1',
        model: document.getElementById('openaiModel').value,
        maxTokens: parseInt(document.getElementById('llmMaxTokens').value) || 4096,
      },
    },
  };
}

/**
 * Check if config has changes
 */
function hasConfigChanges() {
  const currentConfig = getConfigFromForm();

  // Deep comparison of relevant fields
  const changes = [];

  // Check gateway
  if (currentConfig.gateway.host !== state.originalConfig.gateway?.host ||
      currentConfig.gateway.port !== state.originalConfig.gateway?.port) {
    changes.push('gateway');
  }

  // Check channels
  if (currentConfig.channels.qqbot.enabled !== state.originalConfig.channels?.qqbot?.enabled ||
      currentConfig.channels.qqbot.sandbox !== state.originalConfig.channels?.qqbot?.sandbox) {
    changes.push('channels');
  }

  // Check storage
  if (currentConfig.storage.downloadPath !== state.originalConfig.storage?.downloadPath ||
      currentConfig.storage.uploadPath !== state.originalConfig.storage?.uploadPath) {
    changes.push('storage');
  }

  // Check agent
  if (JSON.stringify(currentConfig.agent.allowedUsers) !==
      JSON.stringify(state.originalConfig.agent?.allowedUsers || [])) {
    changes.push('agent');
  }

  // Check scheduler
  if (currentConfig.scheduler.enabled !== state.originalConfig.scheduler?.enabled ||
      currentConfig.scheduler.maxConcurrentTasks !== state.originalConfig.scheduler?.maxConcurrentTasks ||
      currentConfig.scheduler.taskTimeout !== state.originalConfig.scheduler?.taskTimeout) {
    changes.push('scheduler');
  }

  // Check agents
  if (currentConfig.agents.default !== state.originalConfig.agents?.default ||
      currentConfig.agents.smartRouting !== state.originalConfig.agents?.smartRouting ||
      currentConfig.agents.useCoordinator !== state.originalConfig.agents?.useCoordinator) {
    changes.push('agents');
  }

  // Check LLM config
  const currentLlm = currentConfig.llm || {};
  const originalLlm = state.originalConfig.llm || {};

  if (currentLlm.provider !== originalLlm.provider ||
      currentLlm.model !== originalLlm.model ||
      currentLlm.maxTokens !== originalLlm.maxTokens ||
      currentLlm.baseURL !== originalLlm.baseURL) {
    changes.push('llm');
  }

  // Check GLM config
  const currentGlm = currentLlm.glm || {};
  const originalGlm = originalLlm.glm || {};
  if (currentGlm.apiKey !== originalGlm.apiKey ||
      currentGlm.useJwt !== originalGlm.useJwt ||
      currentGlm.isCodingPlan !== originalGlm.isCodingPlan) {
    changes.push('llm.glm');
  }

  // Check Anthropic config
  const currentAnthropic = currentLlm.anthropic || {};
  const originalAnthropic = originalLlm.anthropic || {};
  if (currentAnthropic.apiKey !== originalAnthropic.apiKey ||
      currentAnthropic.model !== originalAnthropic.model) {
    changes.push('llm.anthropic');
  }

  // Check OpenAI config
  const currentOpenai = currentLlm.openai || {};
  const originalOpenai = originalLlm.openai || {};
  if (currentOpenai.apiKey !== originalOpenai.apiKey ||
      currentOpenai.baseURL !== originalOpenai.baseURL ||
      currentOpenai.model !== originalOpenai.model) {
    changes.push('llm.openai');
  }

  return changes;
}

/**
 * Show/hide restart notice based on changes
 */
function updateRestartNotice() {
  const notice = document.getElementById('restartNotice');
  const changes = hasConfigChanges();

  if (changes.length > 0) {
    notice.style.display = 'flex';
  } else {
    notice.style.display = 'none';
  }
}

/**
 * Toggle secret visibility
 */
function toggleSecretVisibility(inputId) {
  const input = document.getElementById(inputId);
  const button = document.querySelector(`[data-target="${inputId}"]`);
  const eyeIcon = button.querySelector('.eye-icon');
  const eyeOffIcon = button.querySelector('.eye-off-icon');

  if (input.type === 'password') {
    input.type = 'text';
    eyeIcon.style.display = 'none';
    eyeOffIcon.style.display = 'block';
  } else {
    input.type = 'password';
    eyeIcon.style.display = 'block';
    eyeOffIcon.style.display = 'none';
  }
}

/**
 * Verify path (placeholder - actual verification needs backend support)
 */
async function verifyPath(inputId) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(`${inputId}-status`);
  const button = document.querySelector(`[data-path="${inputId}"]`);

  const path = input.value.trim();
  if (!path) {
    status.innerHTML = '';
    return;
  }

  // Show checking state
  button.classList.add('verifying');
  button.disabled = true;
  status.className = 'path-status checking';
  status.innerHTML = `
    <svg class="path-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    检查中...
  `;

  // Simulate path check (in real implementation, this would call an API)
  setTimeout(() => {
    button.classList.remove('verifying');
    button.disabled = false;

    // For now, just show a placeholder message
    // In production, this would verify the path exists and is writable
    status.className = 'path-status';
    status.innerHTML = `
      <svg class="path-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      路径验证功能需要后端支持
    `;
  }, 500);
}

/**
 * Save configuration
 */
async function saveConfig() {
  const saveBtn = document.getElementById('saveBtn');
  const config = getConfigFromForm();

  // Show saving state
  saveBtn.classList.add('saving');
  saveBtn.disabled = true;

  try {
    await saveFullConfig(config);
    state.originalConfig = JSON.parse(JSON.stringify(config));

    showToast('配置已保存', 'success');
    updateRestartNotice();

    // Check if restart is needed
    const changes = hasConfigChanges();
    if (changes.length > 0) {
      setTimeout(() => {
        if (confirm('配置已保存，部分更改需要重启服务才能生效。是否立即重启？')) {
          restartServiceNow();
        }
      }, 500);
    }
  } catch (error) {
    showToast('保存配置失败: ' + error.message, 'error');
  } finally {
    saveBtn.classList.remove('saving');
    saveBtn.disabled = false;
  }
}

/**
 * Restart service immediately
 */
async function restartServiceNow() {
  try {
    await restartService();
    showToast('服务正在重启...', 'info');

    // Redirect to dashboard after a delay
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
  } catch (error) {
    showToast('重启失败: ' + error.message, 'error');
  }
}

/**
 * Update provider config visibility based on selected provider
 */
function updateProviderConfigVisibility() {
  const provider = document.getElementById('llmProvider').value;
  const configs = {
    glm: document.getElementById('glmConfig'),
    anthropic: document.getElementById('anthropicConfig'),
    openai: document.getElementById('openaiConfig'),
  };

  // Hide all provider configs
  Object.values(configs).forEach(el => {
    if (el) el.style.display = 'none';
  });

  // Show selected provider config
  if (configs[provider]) {
    configs[provider].style.display = 'block';
  }
}

/**
 * Test LLM API connection
 */
async function testConnection() {
  const provider = document.getElementById('llmProvider').value;
  const testBtn = document.getElementById('testConnectionBtn');
  const resultDiv = document.getElementById('connectionTestResult');

  // Get API key based on provider
  let apiKey = '';
  switch (provider) {
    case 'glm':
      apiKey = document.getElementById('glmApiKey').value;
      break;
    case 'anthropic':
      apiKey = document.getElementById('anthropicApiKey').value;
      break;
    case 'openai':
      apiKey = document.getElementById('openaiApiKey').value;
      break;
  }

  if (!apiKey) {
    resultDiv.className = 'connection-test-result error';
    resultDiv.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      请先输入 API Key
    `;
    return;
  }

  // Show testing state
  testBtn.classList.add('testing');
  testBtn.disabled = true;
  resultDiv.className = 'connection-test-result testing';
  resultDiv.innerHTML = `
    <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    正在测试连接...
  `;

  try {
    const response = await apiRequest('/config/test-connection', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    });

    if (response.success) {
      resultDiv.className = 'connection-test-result success';
      resultDiv.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${response.message}
      `;
    } else {
      resultDiv.className = 'connection-test-result error';
      resultDiv.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        ${response.error || '连接测试失败'}
      `;
    }
  } catch (error) {
    resultDiv.className = 'connection-test-result error';
    resultDiv.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      测试失败: ${error.message}
    `;
  } finally {
    testBtn.classList.remove('testing');
    testBtn.disabled = false;
  }
}

/**
 * Initialize Application
 */
async function init() {
  try {
    // Load config
    const config = await fetchFullConfig();
    loadConfigToForm(config);
    updateConnectionStatus(true);

    // Event Listeners

    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveConfig);

    // Restart now button
    document.getElementById('restartNowBtn').addEventListener('click', restartServiceNow);

    // Secret visibility toggles
    document.querySelectorAll('.btn-toggle-secret').forEach(button => {
      button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        toggleSecretVisibility(targetId);
      });
    });

    // Path verification buttons
    document.querySelectorAll('.btn-verify-path').forEach(button => {
      button.addEventListener('click', () => {
        const pathId = button.dataset.path;
        verifyPath(pathId);
      });
    });

    // LLM Provider selection change
    const llmProviderSelect = document.getElementById('llmProvider');
    if (llmProviderSelect) {
      llmProviderSelect.addEventListener('change', updateProviderConfigVisibility);
    }

    // Test connection button
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', testConnection);
    }

    // Watch for changes to update restart notice
    const formInputs = document.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
      input.addEventListener('change', updateRestartNotice);
      input.addEventListener('input', updateRestartNotice);
    });

    showToast('配置已加载', 'success');
  } catch (error) {
    console.error('Failed to load config:', error);
    updateConnectionStatus(false);
    showToast('加载配置失败: ' + error.message, 'error');
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
