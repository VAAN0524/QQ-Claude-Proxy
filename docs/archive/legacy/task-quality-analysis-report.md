# 定时任务质量问题分析报告

**分析日期**: 2026-03-16
**任务名称**: AI资讯自动化周期任务 (ai_news_loop)
**任务状态**: 仅执行一次（2026-03-15），之后未再执行

---

## 🔍 问题发现摘要

### 执行状态问题

| 问题 | 发现 | 影响 |
|------|------|------|
| **执行次数** | 仅执行1次（3月15日） | 后续热点未生成内容 |
| **下次执行时间** | 2026-03-15 15:45 | 已过期，未执行 |
| **运行计数** | run_count = 1 | 未按2小时间隔执行 |

### 内容质量问题

#### 1. 文章格式问题

**生成内容格式**：
- ❌ 不是典型的公众号文章格式
- ❌ 而是"热点汇总"格式（5个热点列表）
- ❌ 缺少单篇深度分析

**问题表现**：
- 标题："🔥 AI 每周劲爆热点 2026-03-15"
- 内容：5个热点的简要汇总
- 缺少：章节标题、导语、结语等公众号文章要素

**符合的公众号文章格式**：
```markdown
# [文章标题]

<br/>

![封面图](images/cover.png)

<br/>

[导语：50-100字吸引读者]

<br/>

## 01 [章节标题]

<br/>

![配图](images/chapter01_xxx.png)

<br/>

[正文内容...]

<br/>

## 02 [章节标题]

<br/>

[结语：有态度的总结]

<br/>

[参考来源]
```

**实际生成的内容格式**：
```markdown
# 🔥 AI 每周劲爆热点 2026-03-15

## 热点 01：Claude 登顶 App Store

**热度指数**：★★★★★

**核心事件**：
- Claude 3.7 Sonnet 发布后...

**数据说话**：
- Claude 日活增长 347%...
```

#### 2. 图片质量问题

**发现的配图**：
- 只有1张配图存在（3月15日 22:25）
- 文件名：`illustration_20260315_222530_5877275.png`
- 大小：1.73 MB

**质量评估**（基于图片分析）：
- ⚠️ 可能是信息图风格（需要验证）
- ⚠️ 缺少场景化叙事元素
- ⚠️ 缺少人物、场景、动态感

**配图数量问题**：
- 配置要求：3张（1封面 + 1-2章节配图）
- 实际生成：未找到完整的配图集合

---

## 📊 根本原因分析

### 问题1：定时任务未持续执行

**可能原因**：

1. **调度器未启动**
   - 调度器状态可能是 STOPPED
   - 需要启动 `npm start` 或 watchdog 服务

2. **任务执行失败**
   - 日志中有大量错误（12992个错误）
   - 可能导致任务中断

3. **配置问题**
   - 任务配置中的脚本路径可能错误
   - 使用的上传脚本版本过旧

**验证方法**：
```bash
# 检查调度器状态
curl http://localhost:18789/tasks/ai_news_loop/status

# 检查任务执行历史
curl http://localhost:18789/tasks/ai_news_loop/history
```

### 问题2：文章格式不符合公众号要求

**原因分析**：
1. **任务配置不明确**
   - 没有指定使用 wechat-publisher skill 的具体模式
   - 缺少文章格式要求

2. **Skill 调用方式错误**
   - 可能直接调用搜索和生成，而非使用 skill 的完整流程
   - 没有遵循 wechat-publisher 的自动化流程

3. **去AI味规则未执行**
   - 内容可能包含 AI 高频词汇
   - 可能有特殊符号和格式

### 问题3：配图生成质量问题

**可能原因**：

1. **未使用场景化叙事风格**
   - 生成的配图可能是信息图风格
   - 缺少人物、场景、故事性

2. **图片生成脚本版本问题**
   - 可能使用了旧版本的 image_gen 脚本
   - 未使用 V4.0 的场景化叙事功能

3. **配图验证缺失**
   - 没有执行配图质量验证流程
   - 没有保存验证报告

4. **配图数量不足**
   - 配置要求3张，但只找到1张
   - 其他配图可能生成失败或未保存

---

## 🔧 技术问题分析

### 日志分析

**发现的主要错误**：

1. **Code Agent 初始化失败**
   ```
   Error: Could not resolve authentication method
   ```
   - 影响：可能影响使用 Claude Code 的任务

2. **Agent Reach 搜索失败**
   - YouTube 搜索超时（30秒）
   - B站搜索失败（HTTP 412）
   - 影响：搜索功能部分不可用

3. **MCP 心跳超时**
   - 频繁的心跳超时（每60秒）
   - 反复重连（最多5次）
   - 影响：可能影响 MCP 工具的稳定性

### 配置问题

**任务配置中发现的问题**：

1. **上传脚本版本过旧**
   ```json
   "script": "scripts/upload-to-wechat-draft.py"
   ```
   - ❌ 使用旧版本
   - ✅ 应该使用 `upload-to-wechat-fixed.py`

2. **缺少图片质量验证步骤**
   - 配置中没有提到配图质量验证
   - 缺少评分标准和重试机制

---

## 💡 改进建议

### 紧急修复（立即执行）

#### 1. 修复任务配置

**更新 `data/tasks/ai_news_loop.json`**：
```json
{
  "step": 5,
    "type": "upload_to_wechat",
    "tool": "wechat_api",
    "script": "scripts/upload-to-wechat-fixed.py",  // ✅ 使用修复版本
    "description": "上传文章到公众号草稿箱（使用修复版脚本）"
}
```

#### 2. 添加文章格式验证

**在 action 步骤中添加验证**：
```json
{
  "step": 3.5,
  "type": "validate_article",
  "description": "验证文章格式符合公众号要求",
  "checks": [
    "has_title_under_64_chars",
    "has_cover_image",
    "has_chapter_images",
    "no_ai_flavor_markdown",
    "no_special_symbols",
    "natural_writing_style"
  ]
}
```

#### 3. 添加配图质量验证

**在 action 步骤中添加验证**：
```json
{
  "step": 4.5,
  "type": "validate_images",
  "description": "验证配图质量（场景化叙事风格）",
  "min_score": 80,
  "retry_count": 3,
  "checklist": [
    "has_character",
    "has_scene",
    "has_action",
    "has_dynamic_elements",
    "narrative_info_natural",
    "quality_acceptable"
  ]
}
```

### 中期优化（本周内）

#### 1. 启动调度器

```bash
# 方法1：直接启动
cd c:/Test/bot
npm start

# 方法2：作为 Windows 服务启动
npm run watchdog:start

# 验证调度器状态
curl http://localhost:18789/status
```

#### 2. 测试完整流程

```bash
# 手动执行一次完整流程
cd c:/Test/bot
node scripts/test-full-workflow.js

# 或使用 QQ Bot 触发
# 发送消息："执行一次 AI 资讯自动化任务"
```

#### 3. 更新 Skill 调用方式

**确保使用正确的 skill 调用流程**：
1. 搜索 → zhipu-search
2. 撰写 → wechat-publisher（严格去AI味）
3. 配图 → Image skill V4.0（场景化叙事）
4. 上传 → upload-to-wechat-fixed.py

### 长期优化（下周开始）

#### 1. 创建完整的测试脚本

**文件：`scripts/test-full-workflow.js`**
- 测试搜索功能
- 测试文章生成质量
- 测试配图生成质量
- 测试图片嵌入
- 生成详细报告

#### 2. 实施配图质量监控

**创建配图质量评分系统**：
- 自动检测人物、场景、动作
- 自动评分（0-100分）
- 不合格自动重试
- 保存验证报告

#### 3. 优化错误处理

**改进日志记录**：
- 区分任务步骤的日志
- 记录每个步骤的耗时
- 记录错误和重试信息
- 生成执行报告

---

## 📋 行动清单

### 立即执行（今天）

- [ ] 更新任务配置，使用修复版上传脚本
- [ ] 启动调度器服务
- [ ] 手动执行一次任务，验证完整流程

### 本周执行

- [ ] 创建测试脚本
- [ ] 测试场景化叙事配图生成
- [ ] 验证文章格式符合公众号要求
- [ ] 检查图片嵌入是否正常

### 下周执行

- [ ] 实施配图质量监控
- [ ] 优化错误处理和日志记录
- [ ] 创建执行报告模板
- [ ] 监控定时任务执行状态

---

## 🎯 预期改进效果

### 定时任务稳定性

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| 执行成功率 | 0%（未执行） | 95%+ | +95% |
| 按时执行率 | N/A | 98%+ | 新增 |
| 错误恢复率 | N/A | 90%+ | 新增 |

### 内容质量

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| 文章格式符合度 | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |
| 去AI味程度 | ⭐⭐ | ⭐⭐⭐⭐ | +100% |
| 配图质量（场景化） | ⭐⭐ | ⭐⭐⭐⭐ | +150% |
| 图片嵌入成功率 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | +67% |

---

## 📄 相关文档

### 配置文件
- `data/tasks/ai_news_loop.json` - 定时任务配置
- `skills/wechat-publisher/SKILL.md` - wechat-publisher 使用指南
- `skills/Image/SKILL.md` - Image skill 使用指南

### 脚本
- `scripts/upload-to-wechat-fixed.py` - 修复版上传脚本
- `scripts/upload-to-wechat-draft.py` - 旧版上传脚本（有问题）
- `skills/Image/image_gen_v4.py` - V4.0 场景化叙事生成脚本

### 修复文档
- `docs/skills-fix-report-20260316.md` - Skill 修复报告
- `docs/wechat-image-embedding-fix.md` - 图片嵌入问题修复
- `docs/narrative-image-guide.md` - 场景化叙事配图指南

---

## 🚀 快速修复步骤

### 1. 更新任务配置

```bash
# 编辑任务配置
cd c:/Test/bot
notepad data/tasks/ai_news_loop.json
# 将 upload-to-wechat-draft.py 改为 upload-to-wechat-fixed.py
```

### 2. 重启调度器

```bash
# 停止当前服务
taskkill /F /IM node.exe

# 启动服务
npm start
```

### 3. 手动测试

```bash
# 触发一次测试任务
# 通过 QQ Bot 发送命令或使用 Dashboard
```

### 4. 监控执行

```bash
# 查看日志
tail -f workspace/logs/app.log

# 检查任务状态
curl http://localhost:18787/tasks/ai_news_loop/status
```

---

**报告生成时间**: 2026-03-16 21:40
**分析人员**: Claude Code
**下次检查**: 执行修复后重新评估
