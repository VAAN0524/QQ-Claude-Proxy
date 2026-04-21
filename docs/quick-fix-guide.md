# 定时任务快速修复指南

**修复日期**: 2026-03-16
**目标**: 让 AI 资讯自动化周期任务正常运行

---

## ✅ 已完成的修复

### 1. 任务配置更新

**文件**: [data/tasks/ai_news_loop.json](../data/tasks/ai_news_loop.json)

**修改**:
```diff
- "script": "scripts/upload-to-wechat-draft.py"
+ "script": "scripts/upload-to-wechat-fixed.py"
```

**影响**: 解决图片嵌入问题，章节配图可以正常显示在微信文章中

---

## ⚠️  测试发现的问题

### 问题1: zhipu-search Skill 未安装

**错误**: `zhipu-search` 脚本不存在

**影响**: 搜索功能无法使用

**解决方案**:

1. **检查 zhipu-search skill 是否已安装**:
   ```bash
   # 查看 skills 目录
   dir skills\zhipu-search
   ```

2. **如果未安装，使用 zhipu-search user skill**:
   - 通过 QQ Bot 发送命令：`/zhipu-search AI最新热点`
   - 或在项目中使用：用户级别的 zhipu-search skill（位于 `~/.claude/skills/`）

### 问题2: 图片生成编码问题（Windows）

**错误**: 中文参数传递错误（`Agent 技术突破` → `Agent ������`）

**影响**: Image V4.0 脚本无法正确接收中文主题

**解决方案**:

1. **方法1: 使用英文主题（临时）**
   ```bash
   python skills/Image/image_gen_v4.py "AI Agent Breakthrough"
   ```

2. **方法2: 修复 Python 脚本编码**
   ```python
   # 在 skills/Image/image_gen_v4.py 开头添加：
   import sys
   import io
   sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
   ```

3. **方法3: 使用环境变量设置编码**
   ```bash
   # Windows CMD
   chcp 65001
   set PYTHONIOENCODING=utf-8

   # PowerShell
   $env:PYTHONIOENCODING='utf-8'
   ```

### 问题3: Gateway 状态异常

**错误**: Gateway 响应异常

**影响**: 定时任务调度器可能未启动

**解决方案**:

```bash
# 1. 检查 Gateway 是否运行
curl http://localhost:18789/status

# 2. 如果未运行，启动服务
npm start

# 3. 或者作为 Windows 服务启动
npm run watchdog:start

# 4. 验证调度器状态
curl http://localhost:18789/tasks/ai_news_loop/status
```

### 问题4: 现有文章缺少配图

**警告**: `ai_news_final_report.md` 缺少封面图和章节配图引用

**影响**: 微信文章可能缺少图片

**解决方案**:

1. **检查 workspace/images/ 目录**:
   ```bash
   dir workspace\images
   ```

2. **手动生成配图**:
   ```bash
   # 生成封面图
   python skills/Image/image_gen_v4.py "AI Technology Cover" --size 900x500

   # 生成章节配图
   python skills/Image/image_gen_v4.py "AI Agent in Office" --size 1920x1080
   ```

3. **在文章中添加配图引用**:
   ```markdown
   ![封面图](images/cover.png)

   ## 01 章节1标题

   ![章节配图](images/chapter01_programmer_ai_coding.png)
   ```

---

## 🚀 快速启动步骤

### 步骤1: 启动 Gateway 和调度器

```bash
# Windows CMD / PowerShell
cd c:\Test\bot
npm start
```

### 步骤2: 验证服务状态

```bash
# 检查 Gateway（新终端）
curl http://localhost:18789/status

# 检查 Dashboard（浏览器）
start http://localhost:8080/tasks.html
```

### 步骤3: 手动触发一次任务

**方法1: 通过 QQ Bot**
```
发送消息: "执行一次 AI 资讯自动化任务"
```

**方法2: 通过 Dashboard**
1. 访问 http://localhost:8080/tasks.html
2. 找到 `ai_news_loop` 任务
3. 点击"立即执行"按钮

### 步骤4: 监控执行进度

```bash
# 实时查看日志（新终端）
cd c:\Test\bot
tail -f workspace\logs\app.log

# 或使用 PowerShell
Get-Content workspace\logs\app.log -Wait
```

---

## 📊 预期结果

### 成功的标志

- ✅ 搜索到 5-10 条 AI 热点资讯
- ✅ 生成 1000-1500 字的公众号文章
- ✅ 生成 3 张配图（1 封面 + 2 章节）
- ✅ 文章上传到公众号草稿箱
- ✅ 配图通过 QQ Bot 发送

### 质量指标

| 指标 | 目标 | 验证方法 |
|------|------|----------|
| 文章格式 | 符合公众号要求 | 标题 < 64字节，有章节结构 |
| 去AI味 | 自然写作风格 | 避免"综上所述"等AI词汇 |
| 配图风格 | 场景化叙事 | 有人物、场景、动作、动态感 |
| 图片嵌入 | 正常显示 | 章节配图在微信中可见 |

---

## 🔄 定期维护

### 每周检查

```bash
# 1. 查看任务执行历史
curl http://localhost:18789/tasks/ai_news_loop/history

# 2. 检查最近的日志
tail -100 workspace\logs\app.log

# 3. 验证生成的文章质量
# 查看 workspace/ai_news_final_report.md
```

### 每月优化

1. **更新搜索关键词**（根据热点变化）
2. **调整文章风格**（根据反馈）
3. **优化配图质量**（收集好的样本）
4. **检查 API 额度**（Zhipu、ModelScope）

---

## 🆘 故障排除

### 任务未执行

**检查**:
```bash
# 1. 调度器是否启动
curl http://localhost:18789/status

# 2. 任务是否启用
curl http://localhost:18789/tasks/ai_news_loop/status

# 3. 下次执行时间
curl http://localhost:18789/tasks/ai_news_loop
```

**解决**:
- 如果调度器未启动 → `npm start`
- 如果任务被禁用 → 通过 Dashboard 启用
- 如果时间过期 → 手动触发一次

### 搜索失败

**检查**:
```bash
# 检查 ZHIPU_API_KEY
echo %ZHIPU_API_KEY%
```

**解决**:
- 如果未设置 → 在 `.env` 文件中添加 `ZHIPU_API_KEY=your_key`
- 如果额度用尽 → 充值账户或使用其他搜索方式

### 配图生成失败

**检查**:
```bash
# 测试 Image V4.0
python skills/Image/image_gen_v4.py "Test" --size 900x500
```

**解决**:
- 如果 API 未配置 → 设置 `ZHIPU_API_KEY`
- 如果编码错误 → 使用英文主题或修复编码
- 如果额度不足 → 使用 Fallback 机制（自动切换）

### 图片嵌入失败

**检查**:
- 确认使用 `upload-to-wechat-fixed.py`
- 检查图片文件是否存在
- 检查图片文件名格式

**解决**:
- 如果脚本版本错误 → 更新任务配置（已完成✅）
- 如果图片不存在 → 重新生成配图
- 如果文件名错误 → 使用标准命名（cover.png, chapter01_*.png）

---

## 📚 相关文档

- [完整测试报告](../workspace/workflow-test-report-1773668336629.md)
- [Skill 修复报告](../docs/skills-fix-report-20260316.md)
- [质量分析报告](../docs/task-quality-analysis-report.md)
- [场景化叙事配图指南](../docs/narrative-image-guide.md)
- [图片嵌入修复说明](../docs/wechat-image-embedding-fix.md)

---

## ✅ 下一步检查清单

- [ ] 启动 Gateway 和调度器（`npm start`）
- [ ] 验证 zhipu-search skill 可用（或使用用户级别 skill）
- [ ] 修复图片生成编码问题（或使用英文主题）
- [ ] 手动执行一次完整任务
- [ ] 检查生成的文章和配图质量
- [ ] 验证图片嵌入正常
- [ ] 确认微信草稿箱收到文章
- [ ] 设置定期监控（每周检查）

---

**最后更新**: 2026-03-16 21:40
**状态**: 🟡 部分修复完成，待启动测试
**下一步**: 执行"快速启动步骤"并验证结果
