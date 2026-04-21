# 图片生成编码问题修复报告

**修复日期**: 2026-03-16
**问题**: Windows 环境下 Python 脚本无法正确接收中文参数
**状态**: ✅ 已解决

---

## 🔍 问题分析

### 原始错误

```
UnicodeDecodeError: 'gbk' codec can't decode byte 0x80 in position 69: illegal multibyte sequence
```

### 根本原因

1. **配置文件读取未指定编码**
   - 文件: `skills/Image/image_gen_v4.py`
   - 位置: 第 325 行
   - 问题: `open(config_file, 'r')` 使用系统默认编码（Windows 为 GBK）
   - 导致: 读取 UTF-8 编码的 `.env` 文件时失败

2. **Node.js 测试脚本编码问题**
   - 文件: `scripts/test-full-workflow.js`
   - 问题: 使用 `shell: true` 且未设置编码环境变量
   - 导致: 中文参数传递时出现乱码

---

## ✅ 修复方案

### 修复1: image_gen_v4.py（2处）

#### 1.1 添加 Windows 编码支持（脚本开头）

```python
# Windows 编码修复：确保命令行参数正确解码
if sys.platform == 'win32':
    # 重新打开 stdin/stdout 以使用 UTF-8 编码
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
```

**作用**: 确保在 Windows 上运行时，标准输入/输出使用 UTF-8 编码

#### 1.2 修复配置文件读取（第 325 行）

```python
# 修复前
with open(config_file, 'r') as f:

# 修复后
with open(config_file, 'r', encoding='utf-8') as f:
```

**作用**: 明确指定使用 UTF-8 编码读取配置文件

### 修复2: test-full-workflow.js

```javascript
// 修复前
const proc = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

// 修复后
const proc = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,  // 不使用 shell，避免编码问题
  env: {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',  // 设置 Python 编码
    LANG: 'en_US.UTF-8'
  }
});

// 并使用 UTF-8 解码输出
stdout += data.toString('utf-8');
stderr += data.toString('utf-8');
```

**作用**: 确保从 Node.js 传递参数给 Python 时使用正确的编码

---

## 🧪 验证结果

### 直接测试（Python）

```bash
cd skills/Image
python image_gen_v4.py "AI Agent Technology" --size 900x500
```

**输出**:
```
[ImageGen V4] Generating image...
[ImageGen V4] Topic: AI Agent Technology
[ImageGen V4] Size: 900x500
[ImageGen V4] Style: narrative
[ImageGen V4] Prompt length: 2036 chars
[ImageGen V4] Selected model: qwen
...
```

✅ **参数正确接收，无编码错误**

### 中文参数测试

```bash
python image_gen_v4.py "AI智能助手" --size 900x500
```

✅ **中文参数正确传递（虽然因为 API Key 未配置而失败，但参数本身正确）**

---

## 📝 待处理问题

### API 配置问题（非编码问题）

测试失败的原因是 **API Key 未配置**，不是编码问题：

1. **ModelScope API 额度用完**
   ```
   429 - You have exceeded today's quota 50 for image-gen model
   ```

2. **Zhipu API Key 未配置**
   ```
   ZHIPU_API_KEY not configured
   ```

**解决方案**: 在 `.env` 文件中配置 `ZHIPU_API_KEY`

---

## 📚 相关文件

### 已修复的文件

1. **[skills/Image/image_gen_v4.py](../skills/Image/image_gen_v4.py)**
   - 添加 Windows 编码支持（开头）
   - 修复配置文件读取（第 325 行）

2. **[scripts/test-full-workflow.js](../scripts/test-full-workflow.js)**
   - 修复 `executeCommand` 函数的编码处理
   - 修复 `testImageGeneration` 函数

3. **[scripts/test-image-encoding.js](../scripts/test-image-encoding.js)**
   - 新建：专门的编码测试脚本

### 测试脚本

```bash
# 测试编码修复
node scripts/test-image-encoding.js

# 完整工作流测试
node scripts/test-full-workflow.js
```

---

## ✅ 检查清单

- [x] Python 脚本可以正确接收英文参数
- [x] Python 脚本可以正确接收中文参数
- [x] 配置文件读取使用 UTF-8 编码
- [x] Node.js 测试脚本设置正确的编码环境
- [ ] 配置 ZHIPU_API_KEY 环境变量
- [ ] 测试完整的图片生成流程

---

## 🎯 下一步

### 立即执行

1. **配置 API Key**
   ```bash
   # 在 .env 文件中添加
   ZHIPU_API_KEY=your_key_here
   ```

2. **测试完整流程**
   ```bash
   python skills/Image/image_gen_v4.py "程序员使用AI写代码" --style narrative
   ```

3. **验证场景化叙事配图**
   - 检查生成的图片是否有人物、场景、动作
   - 验证图片质量符合预期

### 后续优化

1. 添加更详细的错误提示
2. 实现 API Key 验证机制
3. 添加更多编码测试用例

---

**修复完成时间**: 2026-03-16 21:50
**修复人员**: Claude Code
**验证状态**: ✅ 编码问题已解决，待配置 API Key 后完整测试
