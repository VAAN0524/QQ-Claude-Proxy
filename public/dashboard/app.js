/**
 * QQ-Claude-Proxy Dashboard Application
 * Handles real-time task updates and settings management
 */

// API base URL (relative since we're served from the same origin)
const API_BASE = '/api';

// Application State
const state = {
  connected: false,
  tasks: [],
  stats: null,
  config: null,
  refreshInterval: null,
  isRefreshing: false,  // 防止重复刷新
  pendingRefresh: false,  // 待处理的刷新
  consecutiveErrors: 0,  // 连续错误计数
  scheduledTasks: [],  // 定时任务列表
  scheduledTasksStats: null,  // 定时任务统计
  currentTaskTab: 'all',  // 当前显示的任务类型标签
  currentDetailTask: null,  // 当前查看详情的任务
};

/**
 * Utility Functions
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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

async function fetchStats() {
  const data = await apiRequest('/stats');
  state.stats = data;
  updateStatsUI(data);
  updateConnectionStatus(true);
  return data;
}

async function fetchTasks() {
  const data = await apiRequest('/tasks');
  state.tasks = data.tasks || [];
  updateTasksUI(state.tasks);
  return data.tasks;
}

async function fetchConfig() {
  const data = await apiRequest('/config');
  state.config = data;
  return data;
}

async function updateConfig(updates) {
  await apiRequest('/config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

async function clearCompletedTasks() {
  const data = await apiRequest('/tasks/clear', { method: 'POST' });
  if (data.success) {
    showToast('已清除完成的任务', 'success');
    await fetchTasks();
  }
  return data;
}

async function restartService() {
  await apiRequest('/restart', { method: 'POST' });
  showToast('服务正在重启...', 'info');
}

// ==================== 定时任务 API ====================

async function fetchScheduledTasks() {
  try {
    const data = await apiRequest('/scheduled-tasks');
    state.scheduledTasks = data.tasks || [];
    updateScheduledTasksUI(state.scheduledTasks);
    return data.tasks;
  } catch (error) {
    console.error('获取定时任务失败:', error);
    return [];
  }
}

async function fetchScheduledTasksStats() {
  try {
    const data = await apiRequest('/scheduled-tasks/stats');
    state.scheduledTasksStats = data.stats;
    updateScheduledTasksStatsUI(data.stats);
    return data.stats;
  } catch (error) {
    console.error('获取定时任务统计失败:', error);
    return null;
  }
}

async function createScheduledTask(params) {
  const data = await apiRequest('/scheduled-tasks', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (data.success) {
    showToast('任务创建成功', 'success');
    await fetchScheduledTasks();
    await fetchScheduledTasksStats();
  }
  return data;
}

async function deleteScheduledTask(taskId) {
  const data = await apiRequest('/scheduled-tasks/delete', {
    method: 'DELETE',
    body: JSON.stringify({ taskId }),
  });
  if (data.success) {
    showToast('任务已删除', 'success');
    await fetchScheduledTasks();
    await fetchScheduledTasksStats();
  }
  return data;
}

async function pauseScheduledTask(taskId) {
  const data = await apiRequest('/scheduled-tasks/pause', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
  if (data.success) {
    showToast('任务已暂停', 'success');
    await fetchScheduledTasks();
  }
  return data;
}

async function resumeScheduledTask(taskId) {
  const data = await apiRequest('/scheduled-tasks/resume', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
  if (data.success) {
    showToast('任务已恢复', 'success');
    await fetchScheduledTasks();
  }
  return data;
}

async function executeScheduledTask(taskId) {
  const data = await apiRequest('/scheduled-tasks/execute', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
  if (data.success) {
    showToast('任务已开始执行', 'success');
    await fetchScheduledTasks();
  }
  return data;
}

// ==================== 定时任务 UI 函数 ====================

function updateScheduledTasksUI(tasks) {
  const container = document.getElementById('scheduledTasksList');
  if (!container) return;

  // 根据当前标签过滤
  let filteredTasks = tasks;
  if (state.currentTaskTab !== 'all') {
    filteredTasks = tasks.filter(t => t.type === state.currentTaskTab);
  }

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" id="scheduledTasksEmptyState">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <p>暂无定时任务</p>
        <p class="empty-state-hint">点击"创建任务"添加新的定时任务</p>
      </div>
    `;
    return;
  }

  // 排序：启用的在前，然后按创建时间
  filteredTasks.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  container.innerHTML = filteredTasks.map(task => renderScheduledTaskItem(task)).join('');
}

function updateScheduledTasksStatsUI(stats) {
  if (!stats) return;
  document.getElementById('stTotalTasks').textContent = stats.totalTasks || 0;
  document.getElementById('stPeriodicTasks').textContent = stats.periodicTasks || 0;
  document.getElementById('stScheduledTasks').textContent = stats.scheduledTasks || 0;
}

function renderScheduledTaskItem(task) {
  const statusBadge = getScheduledTaskStatusBadge(task);
  const typeBadge = getScheduledTaskTypeBadge(task.type);
  const enabledClass = task.enabled ? '' : 'disabled';

  let nextExecution = '';
  if (task.enabled && task.nextExecutionTime) {
    const nextDate = new Date(task.nextExecutionTime);
    nextExecution = `<div class="st-next-execution">下次执行: ${formatDateTime(nextDate)}</div>`;
  }

  let lastResult = '';
  if (task.executionHistory && task.executionHistory.length > 0) {
    const last = task.executionHistory[task.executionHistory.length - 1];
    const resultIcon = last.success ? '✅' : '❌';
    lastResult = `<div class="st-last-result">${resultIcon} 上次: ${last.success ? '成功' : '失败'} (${formatDateTime(new Date(last.endTime))})</div>`;
  }

  return `
    <div class="scheduled-task-item ${enabledClass}" data-task-id="${task.id}">
      <div class="st-header">
        <div class="st-title-row">
          <span class="st-name">${escapeHtml(task.name)}</span>
          ${typeBadge}
          ${statusBadge}
        </div>
        <div class="st-actions">
          ${task.enabled && task.type === 'periodic' ? `
            <button class="btn-icon-small st-action-btn" data-action="pause" title="暂停">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            </button>
          ` : ''}
          ${!task.enabled && task.type === 'periodic' ? `
            <button class="btn-icon-small st-action-btn" data-action="resume" title="恢复">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          ` : ''}
          ${task.enabled ? `
            <button class="btn-icon-small st-action-btn" data-action="execute" title="立即执行">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          ` : ''}
          <button class="btn-icon-small st-action-btn" data-action="detail" title="详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          <button class="btn-icon-small st-action-btn st-action-delete" data-action="delete" title="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${task.description ? `<div class="st-description">${escapeHtml(task.description)}</div>` : ''}
      <div class="st-command">${escapeHtml(truncateText(task.command, 80))}</div>
      ${nextExecution}
      ${lastResult}
      <div class="st-meta">
        <span class="st-meta-item">执行: ${task.executionCount} 次</span>
        ${task.failureCount > 0 ? `<span class="st-meta-item st-meta-error">失败: ${task.failureCount} 次</span>` : ''}
      </div>
    </div>
  `;
}

function getScheduledTaskStatusBadge(task) {
  if (!task.enabled) {
    return '<span class="st-badge st-badge-disabled">已禁用</span>';
  }
  if (task.status === 'running') {
    return '<span class="st-badge st-badge-running">运行中</span>';
  }
  if (task.status === 'paused') {
    return '<span class="st-badge st-badge-paused">已暂停</span>';
  }
  if (task.status === 'failed') {
    return '<span class="st-badge st-badge-failed">失败</span>';
  }
  return '<span class="st-badge st-badge-pending">等待中</span>';
}

function getScheduledTaskTypeBadge(type) {
  if (type === 'periodic') {
    return '<span class="st-badge st-badge-periodic">周期</span>';
  }
  return '<span class="st-badge st-badge-scheduled">定时</span>';
}

function formatDateTime(date) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// ==================== 创建任务模态框 ====================

function openCreateTaskModal() {
  const modal = document.getElementById('createTaskModal');
  modal.classList.add('active');

  // 设置默认执行时间为明天同一时间
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setSeconds(0, 0);
  const isoString = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('scheduledTime').value = isoString;
}

function closeCreateTaskModal() {
  document.getElementById('createTaskModal').classList.remove('active');
  // 重置表单
  document.getElementById('taskName').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskCommand').value = '';
  document.getElementById('taskType').value = 'periodic';
  document.getElementById('periodicInterval').value = '60';
  document.getElementById('periodicRunImmediately').checked = false;
  document.getElementById('periodicMaxRuns').value = '';
  document.getElementById('periodicContinueOnError').checked = true;
  document.getElementById('taskNotifyQQ').checked = true;
  document.getElementById('taskNotifyTarget').value = '';
  document.getElementById('taskSaveResult').checked = true;
  toggleTaskConfig('periodic');
}

function toggleTaskConfig(type) {
  const periodicConfig = document.getElementById('periodicConfig');
  const scheduledConfig = document.getElementById('scheduledConfig');

  if (type === 'periodic') {
    periodicConfig.style.display = 'block';
    scheduledConfig.style.display = 'none';
  } else {
    periodicConfig.style.display = 'none';
    scheduledConfig.style.display = 'block';
  }
}

async function saveCreateTask() {
  const name = document.getElementById('taskName').value.trim();
  const description = document.getElementById('taskDescription').value.trim();
  const type = document.getElementById('taskType').value;
  const command = document.getElementById('taskCommand').value.trim();
  const notifyQQ = document.getElementById('taskNotifyQQ').checked;
  const notifyTarget = document.getElementById('taskNotifyTarget').value.trim();
  const saveResult = document.getElementById('taskSaveResult').checked;

  if (!name || !command) {
    showToast('请填写任务名称和命令', 'error');
    return;
  }

  const params = {
    name,
    description: description || undefined,
    type,
    command,
    notifyQQ,
    notifyTarget: notifyTarget || undefined,
    saveResult,
  };

  if (type === 'periodic') {
    const interval = parseInt(document.getElementById('periodicInterval').value);
    const intervalUnit = parseInt(document.getElementById('periodicIntervalUnit').value);
    const runImmediately = document.getElementById('periodicRunImmediately').checked;
    const maxRuns = document.getElementById('periodicMaxRuns').value ? parseInt(document.getElementById('periodicMaxRuns').value) : null;
    const continueOnError = document.getElementById('periodicContinueOnError').checked;

    params.periodicConfig = {
      interval: interval * intervalUnit / 60000, // 转换为分钟
      runImmediately,
      maxRuns,
      continueOnError,
    };
  } else {
    const scheduledTime = document.getElementById('scheduledTime').value;
    if (!scheduledTime) {
      showToast('请选择执行时间', 'error');
      return;
    }
    params.scheduledConfig = {
      scheduledTime: new Date(scheduledTime).getTime(),
    };
  }

  try {
    await createScheduledTask(params);
    closeCreateTaskModal();
  } catch (error) {
    showToast('创建任务失败: ' + error.message, 'error');
  }
}

// ==================== 任务详情模态框 ====================

function openTaskDetailModal(taskId) {
  const task = state.scheduledTasks.find(t => t.id === taskId);
  if (!task) return;

  state.currentDetailTask = task;
  const modal = document.getElementById('taskDetailModal');
  const body = document.getElementById('taskDetailBody');
  const footer = document.getElementById('taskDetailFooter');

  // 渲染详情
  body.innerHTML = renderTaskDetail(task);

  // 渲染操作按钮
  footer.innerHTML = renderTaskDetailActions(task);

  modal.classList.add('active');
}

function closeTaskDetailModal() {
  document.getElementById('taskDetailModal').classList.remove('active');
  state.currentDetailTask = null;
}

function renderTaskDetail(task) {
  let configHtml = '';
  if (task.type === 'periodic') {
    const interval = task.periodicConfig.interval;
    let intervalText = interval + ' 分钟';
    if (interval >= 60 && interval < 1440) {
      intervalText = (interval / 60) + ' 小时';
    } else if (interval >= 1440) {
      intervalText = (interval / 1440) + ' 天';
    }
    configHtml = `
      <div class="detail-row">
        <span class="detail-label">执行间隔</span>
        <span class="detail-value">每 ${intervalText}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">启动时执行</span>
        <span class="detail-value">${task.periodicConfig.runImmediately ? '是' : '否'}</span>
      </div>
      ${task.periodicConfig.maxRuns ? `
        <div class="detail-row">
          <span class="detail-label">最大执行次数</span>
          <span class="detail-value">${task.periodicConfig.maxRuns}</span>
        </div>
      ` : ''}
      <div class="detail-row">
        <span class="detail-label">失败后继续</span>
        <span class="detail-value">${task.periodicConfig.continueOnError ? '是' : '否'}</span>
      </div>
    `;
  } else {
    configHtml = `
      <div class="detail-row">
        <span class="detail-label">执行时间</span>
        <span class="detail-value">${formatDateTime(new Date(task.scheduledConfig.scheduledTime))}</span>
      </div>
    `;
  }

  let historyHtml = '';
  if (task.executionHistory && task.executionHistory.length > 0) {
    const recentHistory = task.executionHistory.slice(-10).reverse();
    historyHtml = `
      <div class="detail-section">
        <h3>执行历史</h3>
        <div class="execution-history">
          ${recentHistory.map(h => `
            <div class="history-item ${h.success ? 'success' : 'failed'}">
              <div class="history-header">
                <span class="history-status">${h.success ? '✅ 成功' : '❌ 失败'}</span>
                <span class="history-time">${formatDateTime(new Date(h.endTime))}</span>
              </div>
              ${h.error ? `<div class="history-error">${escapeHtml(h.error)}</div>` : ''}
              ${h.resultFilePath ? `<div class="history-file">结果: ${escapeHtml(h.resultFilePath)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    historyHtml = `
      <div class="detail-section">
        <h3>执行历史</h3>
        <p class="empty-hint">暂无执行记录</p>
      </div>
    `;
  }

  return `
    <div class="detail-section">
      <h3>基本信息</h3>
      <div class="detail-row">
        <span class="detail-label">任务名称</span>
        <span class="detail-value">${escapeHtml(task.name)}</span>
      </div>
      ${task.description ? `
        <div class="detail-row">
          <span class="detail-label">描述</span>
          <span class="detail-value">${escapeHtml(task.description)}</span>
        </div>
      ` : ''}
      <div class="detail-row">
        <span class="detail-label">任务类型</span>
        <span class="detail-value">${task.type === 'periodic' ? '周期任务' : '定时任务'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">状态</span>
        <span class="detail-value">${getScheduledTaskStatusBadge(task)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">启用</span>
        <span class="detail-value">${task.enabled ? '是' : '否'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">执行次数</span>
        <span class="detail-value">${task.executionCount} 次</span>
      </div>
      ${task.failureCount > 0 ? `
        <div class="detail-row">
          <span class="detail-label">失败次数</span>
          <span class="detail-value detail-error">${task.failureCount} 次</span>
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h3>任务配置</h3>
      ${configHtml}
      ${task.nextExecutionTime ? `
        <div class="detail-row">
          <span class="detail-label">下次执行</span>
          <span class="detail-value">${formatDateTime(new Date(task.nextExecutionTime))}</span>
        </div>
      ` : ''}
      ${task.lastExecutionTime ? `
        <div class="detail-row">
          <span class="detail-label">上次执行</span>
          <span class="detail-value">${formatDateTime(new Date(task.lastExecutionTime))}</span>
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h3>执行命令</h3>
      <pre class="detail-command">${escapeHtml(task.command)}</pre>
    </div>

    <div class="detail-section">
      <h3>通知设置</h3>
      <div class="detail-row">
        <span class="detail-label">QQ 通知</span>
        <span class="detail-value">${task.notifyQQ ? '启用' : '禁用'}</span>
      </div>
      ${task.notifyTarget ? `
        <div class="detail-row">
          <span class="detail-label">通知目标</span>
          <span class="detail-value">${escapeHtml(task.notifyTarget)}</span>
        </div>
      ` : ''}
      <div class="detail-row">
        <span class="detail-label">保存结果</span>
        <span class="detail-value">${task.saveResult ? '是' : '否'}</span>
      </div>
      ${task.resultDir ? `
        <div class="detail-row">
          <span class="detail-label">结果目录</span>
          <span class="detail-value">${escapeHtml(task.resultDir)}</span>
        </div>
      ` : ''}
    </div>

    ${historyHtml}
  `;
}

function renderTaskDetailActions(task) {
  let buttons = '';

  if (task.enabled && task.type === 'periodic' && task.status !== 'running') {
    buttons += '<button class="btn-secondary" id="detailPauseBtn">暂停任务</button>';
  }

  if (!task.enabled && task.type === 'periodic') {
    buttons += '<button class="btn-primary" id="detailResumeBtn">恢复任务</button>';
  }

  if (task.enabled && task.status !== 'running') {
    buttons += '<button class="btn-primary" id="detailExecuteBtn">立即执行</button>';
  }

  buttons += '<button class="btn-danger" id="detailDeleteBtn">删除任务</button>';

  return buttons;
}

/**
 * UI Update Functions
 */
function updateConnectionStatus(connected) {
  state.connected = connected;
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  if (connected) {
    statusDot.classList.add('connected');
    statusDot.classList.remove('error');
    statusText.textContent = '已连接';

    // 连接恢复时，重置刷新间隔为 5 秒
    resetRefreshInterval(5000);
  } else {
    statusDot.classList.remove('connected');
    statusDot.classList.add('error');
    statusText.textContent = '连接失败';

    // 连接失败时，使用指数退避（10秒，20秒，最多30秒）
    const backoffTime = Math.min(30000, 10000 * Math.pow(2, Math.min(2, state.consecutiveErrors - 3)));
    resetRefreshInterval(backoffTime);
  }
}

// 重置刷新间隔
function resetRefreshInterval(interval) {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
  }
  state.refreshInterval = setInterval(refreshData, interval);
}

function updateStatsUI(stats) {
  // Update stat cards
  document.getElementById('runningTasks').textContent = stats.runningTasks || 0;
  document.getElementById('completedTasks').textContent = stats.completedTasks || 0;
  document.getElementById('totalTasks').textContent = stats.totalTasks || 0;
  document.getElementById('uptime').textContent = formatUptime(stats.uptime || 0);

  // Update gateway info
  if (stats.gateway) {
    document.getElementById('gatewayAddress').textContent =
      `${stats.gateway.host}:${stats.gateway.port}`;
  }

  if (stats.qqbot) {
    document.getElementById('qqbotStatus').textContent =
      stats.qqbot.enabled ? '已启用' : '已禁用';
    document.getElementById('sandboxMode').textContent =
      stats.qqbot.sandbox ? '启用' : '禁用';
  }
}

function updateTasksUI(tasks) {
  const container = document.getElementById('tasksList');
  if (!container) return;  // 安全检查

  // Filter out completed tasks that are too old
  const recentTasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'error') {
      const age = Date.now() - t.completedAt;
      return age < 3600000; // Keep for 1 hour
    }
    return true;
  });

  if (recentTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" id="emptyState">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>暂无任务运行中</p>
      </div>
    `;
    return;
  }

  // Sort: running first, then by start time
  recentTasks.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (a.status !== 'running' && b.status === 'running') return 1;
    return b.startTime - a.startTime;
  });

  container.innerHTML = recentTasks.map(task => renderTaskItem(task)).join('');
}

function renderTaskItem(task) {
  const statusIcon = getStatusIcon(task.status);
  const statusBadge = getStatusBadge(task.status);
  const progressBar = getProgressBar(task);
  const elapsed = formatUptime(task.elapsed || Date.now() - task.startTime);
  const milestones = getMilestones(task);

  return `
    <div class="task-item" data-task-id="${task.id}">
      <div class="task-status ${task.status}">
        ${statusIcon}
      </div>
      <div class="task-content">
        <div class="task-header">
          <span class="task-id">#${task.id.substring(0, 8)}</span>
          ${statusBadge}
        </div>
        <div class="task-prompt" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</div>
        ${milestones}
        <div class="task-meta">
          <span class="task-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${elapsed}
          </span>
          ${task.groupId ? `
            <span class="task-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              群组
            </span>
          ` : ''}
        </div>
        ${progressBar}
      </div>
    </div>
  `;
}

function getStatusIcon(status) {
  const icons = {
    running: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>`,
    completed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>`,
  };
  return icons[status] || icons.running;
}

function getStatusBadge(status) {
  const badges = {
    running: '<span class="task-badge running">运行中</span>',
    completed: '<span class="task-badge completed">已完成</span>',
    error: '<span class="task-badge error">错误</span>',
  };
  return badges[status] || badges.running;
}

function getProgressBar(task) {
  if (task.status !== 'running') return '';

  // Simulate progress based on elapsed time (up to 5 minutes = 100%)
  const elapsed = Date.now() - task.startTime;
  const progress = Math.min(100, Math.floor((elapsed / 300000) * 100));

  return `
    <div class="task-progress">
      <div class="task-progress-bar" style="width: ${progress}%"></div>
    </div>
  `;
}

function getMilestones(task) {
  if (!task.milestones || task.milestones.length === 0) return '';

  const latestMilestones = task.milestones.slice(-5); // 只显示最近 5 个

  return `
    <div class="task-milestones">
      ${latestMilestones.map(m => `
        <div class="milestone-item ${m.type === 'error' ? 'error' : ''}">
          <span class="milestone-time">${formatTime(m.timestamp)}</span>
          <span class="milestone-text">${escapeHtml(m.message.substring(0, 80))}${m.message.length > 80 ? '...' : ''}</span>
        </div>
      `).join('')}
    </div>
  `;
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
    </svg>`,
  };
  return icons[type] || icons.info;
}

/**
 * Settings Modal
 */
function openSettingsModal() {
  const modal = document.getElementById('settingsModal');

  // Load current config
  if (state.config) {
    document.getElementById('gatewayPort').value = state.config.gateway?.port || 18789;
    document.getElementById('gatewayHost').value = state.config.gateway?.host || '127.0.0.1';
    document.getElementById('allowedUsers').value = state.config.agent?.allowedUsers?.join(', ') || '';
    document.getElementById('sandboxMode').checked = state.config.channels?.qqbot?.sandbox ?? true;
  }

  modal.classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
  const updates = {
    gateway: {
      port: parseInt(document.getElementById('gatewayPort').value) || 18789,
      host: document.getElementById('gatewayHost').value || '127.0.0.1',
    },
    agent: {
      allowedUsers: document.getElementById('allowedUsers').value
        .split(',')
        .map(u => u.trim())
        .filter(u => u),
    },
    channels: {
      qqbot: {
        sandbox: document.getElementById('sandboxMode').checked,
      },
    },
  };

  try {
    await updateConfig(updates);
    closeSettingsModal();
    await restartService();
  } catch (error) {
    showToast('保存配置失败: ' + error.message, 'error');
  }
}

/**
 * Refresh Function with debouncing and error recovery
 */
async function refreshData() {
  // 防止重复刷新
  if (state.isRefreshing) {
    state.pendingRefresh = true;
    return;
  }

  state.isRefreshing = true;
  state.pendingRefresh = false;

  try {
    await Promise.all([
      fetchStats(),
      fetchTasks(),
      fetchScheduledTasks(),
      fetchScheduledTasksStats(),
    ]);

    // 成功后重置错误计数
    state.consecutiveErrors = 0;
    updateConnectionStatus(true);
  } catch (error) {
    state.consecutiveErrors++;

    // 只有连续失败 3 次以上才显示错误（避免网络抖动导致频繁提示）
    if (state.consecutiveErrors >= 3) {
      updateConnectionStatus(false);
      showToast('刷新数据失败', 'error');
    }

    console.error('[Dashboard] Refresh error:', error);
  } finally {
    state.isRefreshing = false;

    // 如果有待处理的刷新请求，立即执行
    if (state.pendingRefresh) {
      requestAnimationFrame(() => refreshData());
    }
  }
}

/**
 * Initialize Application
 */
function init() {
  // Event Listeners
  document.getElementById('refreshBtn').addEventListener('click', refreshData);
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('clearCompletedBtn').addEventListener('click', async () => {
    try {
      await clearCompletedTasks();
    } catch (error) {
      showToast('清除失败: ' + error.message, 'error');
    }
  });

  // Restart button handler
  document.getElementById('restartBtn').addEventListener('click', async () => {
    if (confirm('确定要重启服务吗？')) {
      try {
        await restartService();
        // Show reconnecting message
        updateConnectionStatus(false);
        document.querySelector('.status-text').textContent = '服务重启中...';
      } catch (error) {
        showToast('重启失败: ' + error.message, 'error');
      }
    }
  });

  // Close modal on overlay click
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') {
      closeSettingsModal();
    }
  });

  // ==================== 定时任务事件监听器 ====================

  // 创建任务按钮
  document.getElementById('createTaskBtn').addEventListener('click', openCreateTaskModal);

  // 创建任务模态框
  document.getElementById('closeCreateTaskBtn').addEventListener('click', closeCreateTaskModal);
  document.getElementById('cancelCreateTaskBtn').addEventListener('click', closeCreateTaskModal);
  document.getElementById('saveCreateTaskBtn').addEventListener('click', saveCreateTask);

  // 任务类型切换
  document.getElementById('taskType').addEventListener('change', (e) => {
    toggleTaskConfig(e.target.value);
  });

  // 任务详情模态框
  document.getElementById('closeTaskDetailBtn').addEventListener('click', closeTaskDetailModal);

  // 任务标签页切换
  document.querySelectorAll('.task-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.currentTaskTab = e.target.dataset.tab;
      updateScheduledTasksUI(state.scheduledTasks);
    });
  });

  // 任务列表操作按钮（事件委托）
  document.getElementById('scheduledTasksList').addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.st-action-btn');
    if (!actionBtn) return;

    const taskItem = actionBtn.closest('.scheduled-task-item');
    const taskId = taskItem?.dataset.taskId;
    if (!taskId) return;

    const action = actionBtn.dataset.action;

    try {
      switch (action) {
        case 'pause':
          if (confirm('确定要暂停此任务吗？')) {
            await pauseScheduledTask(taskId);
          }
          break;
        case 'resume':
          await resumeScheduledTask(taskId);
          break;
        case 'execute':
          if (confirm('确定要立即执行此任务吗？')) {
            await executeScheduledTask(taskId);
          }
          break;
        case 'detail':
          openTaskDetailModal(taskId);
          break;
        case 'delete':
          if (confirm('确定要删除此任务吗？此操作不可撤销！')) {
            await deleteScheduledTask(taskId);
          }
          break;
      }
    } catch (error) {
      showToast('操作失败: ' + error.message, 'error');
    }
  });

  // 任务详情模态框操作按钮（事件委托）
  document.getElementById('taskDetailFooter').addEventListener('click', async (e) => {
    if (!state.currentDetailTask) return;

    const taskId = state.currentDetailTask.id;

    if (e.target.id === 'detailPauseBtn') {
      try {
        await pauseScheduledTask(taskId);
        closeTaskDetailModal();
      } catch (error) {
        showToast('暂停失败: ' + error.message, 'error');
      }
    } else if (e.target.id === 'detailResumeBtn') {
      try {
        await resumeScheduledTask(taskId);
        closeTaskDetailModal();
      } catch (error) {
        showToast('恢复失败: ' + error.message, 'error');
      }
    } else if (e.target.id === 'detailExecuteBtn') {
      try {
        await executeScheduledTask(taskId);
        closeTaskDetailModal();
      } catch (error) {
        showToast('执行失败: ' + error.message, 'error');
      }
    } else if (e.target.id === 'detailDeleteBtn') {
      if (confirm('确定要删除此任务吗？此操作不可撤销！')) {
        try {
          await deleteScheduledTask(taskId);
          closeTaskDetailModal();
        } catch (error) {
          showToast('删除失败: ' + error.message, 'error');
        }
      }
    }
  });

  // Close modals on overlay click
  document.getElementById('createTaskModal').addEventListener('click', (e) => {
    if (e.target.id === 'createTaskModal') {
      closeCreateTaskModal();
    }
  });

  document.getElementById('taskDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'taskDetailModal') {
      closeTaskDetailModal();
    }
  });

  // Initial data load
  refreshData();

  // Auto-refresh every 5 seconds (reduced from 3s to reduce server load)
  state.refreshInterval = setInterval(refreshData, 5000);

  // Load config for settings modal
  fetchConfig().catch(() => {
    // Config might not be available, that's ok
  });

  showToast('Dashboard 已连接', 'success');
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
  }
});

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
