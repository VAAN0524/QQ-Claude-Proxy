const tasks = require('./data/scheduler/tasks.json').tasks[0];
const recent = tasks.executionHistory.slice(-10);

console.log('最近10次任务执行情况:\n');
recent.forEach((h, i) => {
  const date = new Date(h.startTime);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const duration = Math.round(h.duration / 1000);
  const status = h.success ? '✅ SUCCESS' : '❌ FAIL';
  console.log(`${i + 1}. ${dateStr} - ${duration}s - ${status}`);
});
