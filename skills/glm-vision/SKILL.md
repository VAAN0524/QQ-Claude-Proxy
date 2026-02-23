---
name: glm_vision
description: GLM 视觉理解技能。使用此技能当需要分析图片、截图、OCR 文字提取、理解技术图表或诊断错误截图时。使用智谱 AI GLM-4V 的视觉理解能力。
---

# GLM 视觉理解技能

## 概述

此技能使用智谱 AI GLM-4V 模型的视觉理解能力，支持图片分析、OCR、图表理解等功能。

## 使用场景

- **图片分析** - 描述图片内容、识别对象
- **OCR 提取** - 从图片中提取文字
- **错误诊断** - 分析错误截图，提供解决方案
- **图表理解** - 理解技术架构图、流程图
- **UI 分析** - 分析界面设计、布局
- **代码截图** - 提取代码截图中的代码

## 配置

GLM-4V 使用与 GLM-4.7 相同的 API Key：

```bash
# 在 .env 文件中
GLM_API_KEY=your_api_key_here
# 或
ZHIPU_API_KEY=your_api_key_here
```

## API 端点

```
https://open.bigmodel.cn/api/paas/v4/chat/completions
```

## 模型

- **GLM-4V** - 视觉理解模型
- 支持图片 URL 和 Base64 编码
- 最大图片大小：10MB

## 请求格式

```json
{
  "model": "glm-4v",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        },
        {
          "type": "text",
          "text": "描述这张图片"
        }
      ]
    }
  ]
}
```

## 能力详解

### 1. 通用图片分析

描述图片内容、识别对象和场景。

**使用方式：**
```
调用 run_vision_agent 工具
task: "描述这张图片的内容"
```

### 2. OCR 文字提取

从图片中提取文字，支持：
- 代码截图
- 终端输出
- 文档扫描
- 手写文字

**使用方式：**
```
调用 run_vision_agent 工具
task: "提取图片中的所有文字"
```

### 3. 错误诊断

分析错误截图，提供：
- 错误类型识别
- 错误位置定位
- 解决方案建议

**使用方式：**
```
调用 run_vision_agent 工具
task: "分析这个错误截图，找出问题并提供解决方案"
```

### 4. 技术图表理解

理解各种技术图表：
- 架构图
- 流程图
- UML 图
- ER 图
- 时序图

**使用方式：**
```
调用 run_vision_agent 工具
task: "分析这个技术架构图，解释各个组件之间的关系"
```

### 5. 数据可视化分析

分析图表和数据可视化：
- 柱状图
- 折线图
- 饼图
- 仪表板

**使用方式：**
```
调用 run_vision_agent 工具
task: "分析这个图表，提取关键数据和趋势"
```

## 工具参数

### run_vision_agent

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `task` | string | 是 | 具体的视觉任务描述 |
| `image` | string | 是 | 图片路径或 URL |

## 处理流程

```
接收图片 → Base64 编码 → 调用 GLM-4V API
                ↓
        解析响应结果
                ↓
        返回分析结果
```

## 代码实现

### 图片编码

```typescript
import { promises as fs } from 'fs';

async function imageToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return buffer.toString('base64');
}

async function createImageUrl(filePath: string): Promise<string> {
  const base64 = await imageToBase64(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return `data:${mimeType};base64,${base64}`;
}
```

### API 调用

```typescript
async function callGLMVision(imageUrl: string, prompt: string): Promise<string> {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4v',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt }
        ]
      }],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
```

## 最佳实践

### 1. 明确的提示词

提供清晰的任务描述：
- ✅ "提取图片中的所有代码"
- ✅ "分析这个错误，找出原因和解决方案"
- ❌ "看看这张图"

### 2. 合理的图片大小

- 压缩大图片（>5MB）
- 使用合适的分辨率
- 保持重要内容清晰

### 3. 多角度分析

对于复杂图片，可以多次分析：
- 第一次：整体描述
- 第二次：细节分析
- 第三次：特定问题

## 常见任务模板

### 代码截图分析

```
任务: "提取图片中的代码，并分析其功能"
输出格式:
```language
代码内容
```
功能说明: ...
```

### 错误截图分析

```
任务: "分析这个错误截图，提供：
1. 错误类型
2. 错误位置
3. 可能原因
4. 解决方案"
```

### 架构图分析

```
任务: "分析这个架构图，提供：
1. 主要组件
2. 组件之间的关系
3. 数据流向
4. 设计模式"
```

## 支持的图片格式

- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)

## 限制

- 单张图片最大 10MB
- 支持单张图片（不支持多图同时分析）
- API 调用有速率限制

## 故障排查

**问题：图片无法识别**
- 检查图片格式是否支持
- 验证 Base64 编码是否正确
- 确认 API Key 有效

**问题：结果不准确**
- 提供更详细的提示词
- 确保图片质量足够高
- 尝试裁剪图片到关键区域

**问题：API 调用失败**
- 检查网络连接
- 验证 API 端点 URL
- 确认账户额度充足
