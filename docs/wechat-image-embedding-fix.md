# 微信公众号图片嵌入问题修复报告

**问题日期**: 2026-03-16
**修复日期**: 2026-03-16
**状态**: ✅ 已解决

---

## 问题描述

用户反馈：配图发送到QQ了，但是没有植入到微信公众号文章里。

**表现症状**：
- ✅ 图片文件已生成（在任务目录的 images/ 文件夹中）
- ✅ 图片已成功发送到QQ
- ✅ 微信草稿已创建
- ❌ 微信文章中没有显示章节配图

---

## 根本原因分析

### 问题定位

通过检查代码和数据，发现问题出在 **图片文件名匹配逻辑** 上：

**实际文件名格式**：
```
chapter01_kimi_valuation.png
chapter02_agent_evolution.png
chapter03_robot_appliance.png
chapter04_cost_drop.png
```

**文章中的引用格式**：
```markdown
![配图](images/chapter01_kimi_valuation.png)
```

**原脚本的匹配逻辑**（`upload-to-wechat-correct.py` 和 `upload-to-wechat-draft.py`）：

```python
# 从文件名提取章节号
img_file = "chapter01_kimi_valuation.png"
base_name = img_file.replace('chapter', '').split('_')[0]  # "01"
chapter_num = base_name  # 字符串 "01"

# 生成正则表达式（问题所在！）
patterns = [
    rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}\.png\)',  # 变成 chapter001.png ❌
    rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}_[^.]+\.png\)',  # 变成 chapter001_xxx.png ❌
    rf'!\[([^\]]*)\]\(images/chapter{int(chapter_num)}\.png\)',  # 变成 chapter1.png ❌
]
```

**匹配失败原因**：
- `chapter_num` 是字符串 `"01"`
- `chapter0{chapter_num}` → `chapter0` + `01` → `chapter001`（三个零）
- 实际文件名是 `chapter01`（两个零）
- 正则表达式无法匹配！

---

## 解决方案

### 修复思路

**不要尝试提取和重构文件名**，直接使用完整的文件名进行匹配。

### 修复后的代码

```python
import re

def markdown_to_wechat_html(md_content, image_urls):
    """将Markdown转换为微信HTML格式（修复版）"""
    lines = md_content.split('\n')
    html_lines = []

    for line in lines:
        # 跳过封面图引用
        if '封面图' in line or 'cover.png' in line:
            continue

        # 修复：直接匹配完整的图片文件名
        for img_file, url in image_urls.items():
            # 使用 re.escape 转义文件名中的特殊字符
            # 匹配 ![描述](images/文件名.png)
            pattern = rf'!\[([^\]]*)\]\(images/{re.escape(img_file)}\)'
            if re.search(pattern, line):
                replacement = f'<p style="text-align:center;"><img src="{url}" style="max-width:100%;"/></p>'
                line = re.sub(pattern, replacement, line)
                print(f"[DEBUG] 替换图片: {img_file}")
                break

        # ... 其他转换逻辑 ...

    return '\n'.join(html_lines)
```

### 关键改进点

1. **直接使用完整文件名**：不进行任何提取或重构
2. **使用 `re.escape()`**：转义文件名中的特殊字符（如下划线、点号）
3. **支持带描述的格式**：`![描述](images/xxx.png)` 也能正确匹配

---

## 测试验证

### 测试执行

```bash
$ python scripts/upload-to-wechat-fixed.py
```

### 测试结果

```
============================================================
上传AI资讯文章到公众号草稿箱（图片嵌入修复版）
============================================================

[1/5] 获取access_token...
✓ Access token获取成功

[2/5] 上传封面图...
✓ 上传成功: cover.png

[3/5] 上传章节配图...
✓ 上传成功: chapter01_openai.png
✓ 上传成功: chapter02_domestic.png
✓ 上传成功: chapter03_market.png

[4/5] 转换文章格式...
[DEBUG] 替换图片: chapter01_openai.png      ← 成功匹配！
[DEBUG] 替换图片: chapter02_domestic.png    ← 成功匹配！
[DEBUG] 替换图片: chapter03_market.png      ← 成功匹配！
✓ 文章转换完成
  标题: 2026 AI变局：OpenAI招走姚班
  配图: 3张章节配图

[5/5] 创建公众号草稿...

============================================================
✓ 草稿创建成功！
  Media ID: mzW1rBA46b2HNXcsaT3byZAIsgrs6RRFzHvQ_iqFliQbsQt3HCWrSJh6JXSccAzF
  标题: 2026 AI变局：OpenAI招走姚班
  配图: 4张（1封面 + 3章节配图）
============================================================

✅ 图片嵌入问题已修复！所有配图已正确嵌入到文章中。
```

### 验证要点

- ✅ 所有章节配图都被成功匹配（`[DEBUG] 替换图片` 输出）
- ✅ 草稿创建成功，包含所有图片
- ✅ Media ID 有效，可在公众号后台预览

---

## 影响范围

### 受影响的文件

1. **scripts/upload-to-wechat-draft.py** - 有问题的原始脚本
2. **scripts/upload-to-wechat-correct.py** - 有问题的原始脚本
3. **scripts/upload-to-wechat-fixed.py** - ✅ 新创建的修复版本

### 已更新的文档

1. **skills/wechat-publisher/SKILL.md** - 添加了问题说明和解决方案
2. **docs/wechat-image-embedding-fix.md** - 本修复报告

---

## 预防措施

### 编码规范

**处理文件名时**：
- ✅ 直接使用完整文件名进行匹配
- ❌ 不要尝试提取和重构文件名
- ✅ 使用 `re.escape()` 转义特殊字符

**正确示例**：
```python
# ✅ 正确：直接使用完整文件名
pattern = rf'!\[([^\]]*)\]\(images/{re.escape(img_file)}\)'

# ❌ 错误：尝试提取和重构
chapter_num = img_file.replace('chapter', '').split('_')[0]
pattern = rf'chapter0{chapter_num}'  # 容易出错
```

### 测试检查清单

发布文章前必须验证：
- [ ] 所有章节配图已生成
- [ ] 所有配图已上传到微信素材库
- [ ] 文章中的本地路径已替换为微信URL
- [ ] 草稿可以在公众号后台预览并查看图片

---

## 相关链接

- **修复脚本**: `scripts/upload-to-wechat-fixed.py`
- **Skill 文档**: `skills/wechat-publisher/SKILL.md`
- **微信 API 文档**: https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/New_temporary_materials.html

---

## 总结

**问题核心**：图片文件名匹配逻辑错误，导致章节配图无法嵌入到微信公众号文章中。

**解决方法**：使用 `re.escape()` 直接匹配完整文件名，不进行任何提取或重构。

**修复状态**：✅ 已在 `upload-to-wechat-fixed.py` 中修复并验证成功。

**后续建议**：后续任务使用 `upload-to-wechat-fixed.py` 进行微信文章发布。
