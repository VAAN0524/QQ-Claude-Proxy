/**
 * 日志查看器
 *
 * 功能：
 * 1. 实时日志流（SSE）
 * 2. 历史日志查询
 * 3. 日志级别筛选
 * 4. 关键词搜索
 * 5. 导出日志
 */

class LogViewer {
  constructor() {
    this.logViewer = document.getElementById('logViewer');
    this.displayMode = 'stream'; // stream | history
    this.logLevel = 'info';
    this.isPaused = false;
    this.autoScroll = true;
    this.eventSource = null;
    this.logs = [];
    this.filter = '';

    // 统计
    this.stats = {
      total: 0,
      error: 0,
      warn: 0,
    };

    this.init();
  }

  init() {
    // 绑定事件
    document.getElementById('displayMode').addEventListener('change', (e) => {
      this.displayMode = e.target.value;
      this.onDisplayModeChange();
    });

    document.getElementById('logLevel').addEventListener('change', (e) => {
      this.logLevel = e.target.value;
      this.renderLogs();
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
      this.togglePause();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refresh();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      this.clearLogs();
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
      this.search();
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.search();
      }
    });

    // 导出功能
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.showExportModal();
    });

    document.getElementById('closeExportModal').addEventListener('click', () => {
      this.hideExportModal();
    });

    document.getElementById('cancelExport').addEventListener('click', () => {
      this.hideExportModal();
    });

    document.getElementById('confirmExport').addEventListener('click', () => {
      this.exportLogs();
    });

    // 检测滚动位置
    this.logViewer.addEventListener('scroll', () => {
      this.onScroll();
    });

    // 初始化连接状态
    this.updateConnectionStatus();

    // 自动选择显示模式
    this.onDisplayModeChange();
  }

  /**
   * 显示模式切换
   */
  onDisplayModeChange() {
    const historyControls = document.getElementById('historyControls');

    if (this.displayMode === 'stream') {
      historyControls.style.display = 'none';
      this.startStream();
    } else {
      historyControls.style.display = 'flex';
      this.stopStream();
      this.loadHistoryLogs();
    }
  }

  /**
   * 启动实时日志流
   */
  startStream() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.logViewer.innerHTML = '<div class="log-loader"><div class="log-spinner"></div><p>连接日志流...</p></div>';

    // 创建 SSE 连接
    this.eventSource = new EventSource('/api/logs/stream');

    this.eventSource.addEventListener('open', () => {
      this.logViewer.innerHTML = '';
      this.updateConnectionStatus('connected');
      showToast('日志流已连接', 'success');
    });

    this.eventSource.addEventListener('message', (event) => {
      if (this.isPaused) return;

      const log = JSON.parse(event.data);
      this.addLog(log);
    });

    this.eventSource.addEventListener('error', () => {
      this.updateConnectionStatus('disconnected');
      showToast('日志流连接断开，正在重连...', 'error');
    });
  }

  /**
   * 停止实时日志流
   */
  stopStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.updateConnectionStatus('disconnected');
  }

  /**
   * 加载历史日志
   */
  async loadHistoryLogs() {
    this.logViewer.innerHTML = '<div class="log-loader"><div class="log-spinner"></div><p>加载历史日志...</p></div>';

    try {
      const timeRange = document.getElementById('timeRange').value;
      const response = await fetch(`/api/logs/history?range=${timeRange}&level=${this.logLevel}`);
      const data = await response.json();

      if (data.logs && data.logs.length > 0) {
        this.logs = data.logs;
        this.renderLogs();
        this.updateStats();
        showToast(`已加载 ${data.logs.length} 条日志`, 'success');
      } else {
        this.logViewer.innerHTML = '<div class="log-placeholder"><div class="placeholder-icon">📋</div><p>所选时间范围内无日志</p></div>';
      }
    } catch (error) {
      this.logViewer.innerHTML = `<div class="log-placeholder"><div class="placeholder-icon">⚠️</div><p>加载失败: ${error.message}</p></div>`;
      showToast('加载历史日志失败', 'error');
    }
  }

  /**
   * 添加日志行
   */
  addLog(log) {
    // 过滤级别
    if (this.logLevel !== 'all' && log.level !== this.logLevel) {
      return;
    }

    // 过滤搜索关键词
    if (this.filter && !log.message.toLowerCase().includes(this.filter.toLowerCase())) {
      return;
    }

    // 限制日志数量（最多保留 1000 条）
    if (this.logs.length >= 1000) {
      this.logs.shift();
    }

    this.logs.push(log);
    this.stats.total++;

    if (log.level === 'error') this.stats.error++;
    if (log.level === 'warn') this.stats.warn++;

    this.renderSingleLog(log);
    this.updateStats();

    // 自动滚动到底部
    if (this.autoScroll) {
      this.logViewer.scrollTop = this.logViewer.scrollHeight;
    }
  }

  /**
   * 渲染单条日志
   */
  renderSingleLog(log) {
    const line = document.createElement('div');
    line.className = `log-line log-line--${log.level}`;
    line.dataset.level = log.level;
    line.dataset.timestamp = log.timestamp;

    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const levelClass = log.level.toLowerCase();

    line.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-level log-level--${levelClass}">${log.level.toUpperCase()}</span>
      <span class="log-context">${log.context || '-'}</span>
      <span class="log-message">${this.escapeHtml(log.message)}</span>
    `;

    this.logViewer.appendChild(line);
  }

  /**
   * 渲染所有日志
   */
  renderLogs() {
    this.logViewer.innerHTML = '';

    let count = 0;
    for (const log of this.logs) {
      if (this.logLevel !== 'all' && log.level !== this.logLevel) {
        continue;
      }
      if (this.filter && !log.message.toLowerCase().includes(this.filter.toLowerCase())) {
        continue;
      }
      this.renderSingleLog(log);
      count++;
    }

    if (count === 0) {
      this.logViewer.innerHTML = '<div class="log-placeholder"><div class="placeholder-icon">📋</div><p>没有符合条件的日志</p></div>';
    }

    this.updateStats();
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    let total = 0;
    let errors = 0;
    let warns = 0;

    for (const log of this.logs) {
      if (this.logLevel !== 'all' && log.level !== this.logLevel) {
        continue;
      }
      total++;
      if (log.level === 'error') errors++;
      if (log.level === 'warn') warns++;
    }

    document.getElementById('totalLines').textContent = total;
    document.getElementById('errorCount').textContent = errors;
    document.getElementById('warnCount').textContent = warns;
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('pauseBtn');

    if (this.isPaused) {
      btn.textContent = '▶️ 继续';
      btn.classList.add('btn-warning');
    } else {
      btn.textContent = '⏸ 暂停';
      btn.classList.remove('btn-warning');
    }
  }

  /**
   * 刷新日志
   */
  refresh() {
    if (this.displayMode === 'stream') {
      // 重启流
      this.startStream();
    } else {
      // 重新加载历史日志
      this.loadHistoryLogs();
    }
    showToast('日志已刷新', 'success');
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
    this.stats = { total: 0, error: 0, warn: 0 };
    this.logViewer.innerHTML = '<div class="log-placeholder"><div class="placeholder-icon">📋</div><p>日志已清空</p></div>';
    this.updateStats();
    showToast('日志已清空', 'success');
  }

  /**
   * 搜索日志
   */
  search() {
    const input = document.getElementById('searchInput');
    this.filter = input.value.trim();

    if (this.filter) {
      this.renderLogs();
      showToast(`找到匹配的日志`, 'info');
    }
  }

  /**
   * 滚动处理
   */
  onScroll() {
    const { scrollTop, scrollHeight, clientHeight } = this.logViewer;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;

    if (isAtBottom) {
      this.autoScroll = true;
      this.hideAutoScrollIndicator();
    } else {
      this.autoScroll = false;
      this.showAutoScrollIndicator();
    }
  }

  /**
   * 显示自动滚动指示器
   */
  showAutoScrollIndicator() {
    let indicator = this.logViewer.querySelector('.autoscroll-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'autoscroll-indicator';
      indicator.textContent = '↓ 自动滚动已暂停';
      indicator.addEventListener('click', () => {
        this.logViewer.scrollTop = this.logViewer.scrollHeight;
      });
      this.logViewer.appendChild(indicator);
    }
    indicator.classList.add('visible');
  }

  /**
   * 隐藏自动滚动指示器
   */
  hideAutoScrollIndicator() {
    const indicator = this.logViewer.querySelector('.autoscroll-indicator');
    if (indicator) {
      indicator.classList.remove('visible');
    }
  }

  /**
   * 更新连接状态
   */
  updateConnectionStatus(status = 'connecting') {
    const statusBadge = document.getElementById('connectionStatus');
    const dot = statusBadge.querySelector('.status-dot');
    const text = statusBadge.querySelector('.status-text');

    dot.className = 'status-dot';
    if (status === 'connected') {
      dot.classList.add('connected');
      text.textContent = '已连接';
    } else if (status === 'disconnected') {
      dot.classList.add('disconnected');
      text.textContent = '未连接';
    } else {
      text.textContent = '连接中...';
    }
  }

  /**
   * 显示导出对话框
   */
  showExportModal() {
    document.getElementById('exportModal').classList.add('active');
  }

  /**
   * 隐藏导出对话框
   */
  hideExportModal() {
    document.getElementById('exportModal').classList.remove('active');
  }

  /**
   * 导出日志
   */
  async exportLogs() {
    const format = document.getElementById('exportFormat').value;
    const range = document.getElementById('exportRange').value;

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';

    if (format === 'txt') {
      content = this.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
        return `[${time}] [${log.level.toUpperCase()}] ${log.message}`;
      }).join('\n');
      filename = `logs-${Date.now()}.txt`;
      mimeType = 'text/plain';
    } else if (format === 'json') {
      content = JSON.stringify(this.logs, null, 2);
      filename = `logs-${Date.now()}.json`;
      mimeType = 'application/json';
    } else if (format === 'csv') {
      content = 'timestamp,level,context,message\n' + this.logs.map(log => {
        const time = new Date(log.timestamp).toISOString();
        return `"${time}","${log.level}","${log.context || ''}","${log.message.replace(/"/g, '""')}"`;
      }).join('\n');
      filename = `logs-${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    // 创建下载链接
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    this.hideExportModal();
    showToast('日志已导出', 'success');
  }

  /**
   * 转义 HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Toast 通知
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const logViewer = new LogViewer();

  // 定期更新连接状态
  setInterval(() => {
    if (logViewer.eventSource && logViewer.eventSource.readyState === EventSource.OPEN) {
      logViewer.updateConnectionStatus('connected');
    }
  }, 5000);
});
