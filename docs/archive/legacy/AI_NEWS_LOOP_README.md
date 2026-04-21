# AI资讯自动化周期任务

## 任务概述

每2小时自动执行一次AI科技资讯采集、文章撰写、配图生成、公众号草稿箱上传和QQ推送的全流程。

## 配图规则（重要）

**总计：3张图片**
- 1张封面图（900×500px）
- 1-2张章节配图（1920×1080px）

**文章结构**：
- 2-3个章节
- 每个章节对应1张配图
- 总配图数 = 1封面 + 1-2章节 = 3张

## 完整任务流程

```
1. 搜索最新AI科技热点
   ↓
2. 选取最热门的一条
   ↓
3. 使用wechat-publisher撰写公众号文章（2-3章节，严格去AI味）
   ↓
4. 使用Image skill生成配图（1封面图 + 1-2章节配图 = 总计3张）
   ↓
5. 上传文章到公众号草稿箱
   ↓
6. 通过QQ Bot API的base64上传方式发送配图到QQ
   ↓
7. 等待2小时后执行下一轮
```

## 第一轮任务完成情况

**执行时间**: 2026-03-15 13:30-13:45

**热点主题**: OpenClaw开源AI智能体

**文章标题**: 2026年AI新物种：能真正干活的数字员工

**文章内容**: 4个章节，约1200字

**配图数量**: 5张（旧规则：1封面 + 4章节）

**公众号草稿箱**: ✅ 已成功上传
- Media ID: mzW1rBA46b2HNXcsaT3bySu5a8cIj1V5-G8Frd5DQicWqvo2j4eZgdz1Na7HMK6H
- 预览地址: https://mp.weixin.qq.com/

**QQ发送状态**: ✅ 已成功发送5张配图到您的QQ

**文件位置**: `C:\Test\bot\workspace\wechat_article_20260315_003\`

---

## 新配图规则（从第二轮开始生效）

**配图数量**: 总计3张
- 封面图：1张（900×500px）
- 章节配图：1-2张（1920×1080px）

**文章结构**：
- 标题
- 导语（50-100字）
- 第01章（配图1）
- 第02章（配图2，可选）
- 结语

**示例结构**：
```markdown
# 文章标题

导语内容...

## 01 核心观点

![配图](images/chapter01.png)

正文内容...

## 02 延伸分析（可选）

![配图](images/chapter02.png)

正文内容...

结语...
```

## 任务配置

**配置文件**: `data/tasks/ai_news_loop.json`

**版本**: 1.2.0

**执行间隔**: 每2小时（7200000毫秒）

**配图规则**:
```json
{
  "image_rules": {
    "total": 3,
    "cover": 1,
    "chapters": "1-2",
    "sizes": {
      "cover": "900x500",
      "chapter": "1920x1080"
    }
  }
}
```

**执行步骤**:

```json
{
  "actions": [
    {
      "step": 1,
      "type": "search",
      "tool": "zhipu-search",
      "description": "搜索最新AI科技热点资讯"
    },
    {
      "step": 2,
      "type": "select_hot",
      "description": "选取最热门的一条资讯"
    },
    {
      "step": 3,
      "type": "write_article",
      "tool": "wechat-publisher",
      "chapters": "2-3",
      "description": "撰写公众号文章（2-3章节，严格去AI味）"
    },
    {
      "step": 4,
      "type": "generate_images",
      "tool": "Image",
      "total_images": 3,
      "description": "生成配图（1封面图 + 1-2章节配图）"
    },
    {
      "step": 5,
      "type": "upload_to_wechat",
      "tool": "wechat_api",
      "description": "上传文章到公众号草稿箱"
    },
    {
      "step": 6,
      "type": "send_to_qq",
      "tool": "QQ Bot API",
      "description": "通过QQ Bot发送配图到用户QQ"
    }
  ]
}
```

## 核心脚本

### 1. 上传到公众号草稿箱

**脚本**: `scripts/upload-to-wechat-draft.py`

**功能**:
- 读取Markdown文章
- 上传所有图片到微信素材库
- 转换为微信HTML格式
- 创建公众号草稿
- 返回Media ID

**使用**:
```bash
cd /c/Test/bot
python scripts/upload-to-wechat-draft.py
```

### 2. QQ Bot发送配图

**脚本**: `scripts/send-wechat-images.js`

**功能**:
- 读取任务文件夹中的配图
- 使用base64方式上传到QQ
- 逐张发送到用户QQ

**使用**:
```bash
cd /c/Test/bot
node scripts/send-wechat-images.js
```

## 启动周期任务

### 方法1：手动执行单次任务

```bash
cd /c/Test/bot
bash scripts/ai-news-loop.sh
```

### 方法2：启动持续运行的周期任务

```bash
cd /c/Test/bot
npm start
```

### 方法3：作为Windows系统服务运行

```bash
cd /c/Test/bot
npm run watchdog:start
```

## 监控和管理

**Dashboard**: http://localhost:8080/tasks.html

**任务日志**: `logs/scheduler.log`

**QQ通知**: 每轮任务开始和完成时会发送通知

**暂停/恢复任务**:
```bash
# 暂停
curl -X POST http://localhost:18789/tasks/ai_news_loop/pause

# 恢复
curl -X POST http://localhost:18789/tasks/ai_news_loop/resume
```

## 自定义配置

### 修改执行间隔

编辑 `data/tasks/ai_news_loop.json`:
```json
{
  "schedule": {
    "interval": 3600000  // 改为1小时
  }
}
```

### 修改配图数量

```json
{
  "image_rules": {
    "total": 5,        // 改为5张
    "cover": 1,
    "chapters": "2-4"  // 改为2-4张章节配图
  }
}
```

### 修改文章长度

```json
{
  "actions": [
    {
      "type": "write_article",
      "length": "2000-3000",  // 改为更长文章
      "chapters": "4-5"         // 增加章节数
    }
  ]
}
```

### 修改搜索关键词

```json
{
  "actions": [
    {
      "type": "search",
      "query": "AI大模型 最新突破"  // 自定义关键词
    }
  ]
}
```

## 技术栈

- **搜索**: Zhipu AI Web Search API
- **写作**: wechat-publisher skill (去AI味规则)
- **配图**: Image skill V2.0 (ModelScope Qwen-Image-2512)
- **公众号**: 微信公众平台 API (草稿箱)
- **QQ发送**: QQ Bot API (base64上传)
- **调度**: 内置scheduler

## 故障排除

**问题1**: 搜索API失败
- 检查 `ZHIPU_API_KEY` 环境变量
- 确认API额度充足

**问题2**: 图片生成失败
- 检查 `MODELSCOPE_API_KEY` 环境变量
- 确认网络连接正常

**问题3**: 公众号上传失败
- 检查 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`
- 确认IP白名单配置正确

**问题4**: QQ发送失败
- 检查QQ Bot配置
- 确认用户OpenID正确

**问题5**: 任务不执行
- 检查 `enabled: true`
- 确认scheduler服务正在运行

## 任务输出示例

每轮任务会生成：
- 任务文件夹：`wechat_article_YYYYMMDD_HHMMSS/`
- 文章文件：`article.md`
- 配图文件夹：`images/`
  - `cover.png` (封面图，900×500)
  - `chapter01_*.png` (章节配图1，1920×1080)
  - `chapter02_*.png` (章节配图2，可选)
- 草稿结果：`draft_result.json`

## 版本历史

**v1.2.0** (2026-03-15)
- 修改配图规则：总计3张图片（1封面 + 1-2章节）
- 文章结构调整为2-3章节
- 更新任务配置和文档

**v1.1.0** (2026-03-15)
- 加入公众号草稿箱上传流程

**v1.0.0** (2026-03-15)
- 初始版本

## 联系方式

如有问题，请通过QQ联系。

---
创建时间: 2026-03-15
版本: 1.2.0
更新内容: 修改配图规则为总计3张图片
