# 文件发送测试文档

本目录包含用于测试 QQ Bot 文件发送功能的各种格式测试文档。

## 📁 测试文件列表

| 文件名 | 格式 | 大小 | 说明 |
|--------|------|------|------|
| test.txt | 纯文本 | ~300B | 基础文本文件测试 |
| test.md | Markdown | ~800B | Markdown 格式测试 |
| test.json | JSON | ~400B | JSON 数据测试 |
| test.csv | CSV | ~300B | 表格数据测试 |
| test.xml | XML | ~600B | XML 数据测试 |
| test.yaml | YAML | ~400B | YAML 配置测试 |
| test.log | 日志 | ~500B | 日志文件测试 |
| test_large.txt | 纯文本 | ~3.5KB | 大文件分段测试 |

## 🧪 测试命令

### 基础测试（小文件）

```
把 test.txt 发给我
把 test.md 发给我
把 test.json 发给我
把 test.csv 发给我
把 test.xml 发给我
把 test.yaml 发给我
把 test.log 发给我
```

### 大文件测试（分段发送）

```
把 test_large.txt 发给我
```

## 📊 预期行为

### QQ Bot API 正常工作时
- 文件作为附件直接发送

### QQ Bot API 上传失败时（当前情况）
- 文本文件：发送文件内容作为文本消息
- 小文件：一次性发送
- 大文件：自动分段发送

## 📝 测试清单

- [ ] test.txt - 应该收到完整内容
- [ ] test.md - 应该收到格式化的 Markdown
- [ ] test.json - 应该收到格式化的 JSON
- [ ] test.csv - 应该收到表格数据
- [ ] test.xml - 应该收到格式化的 XML
- [ ] test.yaml - 应该收到格式化的 YAML
- [ ] test.log - 应该收到日志内容
- [ ] test_large.txt - 应该收到分段内容（2-3段）

## 🔍 验证点

1. **内容完整性** - 收到的内容与原文件一致
2. **格式保留** - 保留原文件的格式（换行、缩进等）
3. **分段正确** - 大文件分段发送时，段号正确
4. **特殊字符** - 中文、英文、数字、符号都能正确显示

---
创建日期：2026-02-24
用途：QQ-Claude-Proxy 文件发送功能测试
