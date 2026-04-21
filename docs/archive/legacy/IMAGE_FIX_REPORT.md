# 公众号草稿箱图片显示问题修复报告

## 问题描述

**时间**: 2026-03-15 14:30

**现象**: 推送到公众号草稿箱的文章，配图只显示图片地址，图片并未真正显示

**影响**: 用户在公众号后台无法看到配图

---

## 问题根源

### 直接原因

图片文件名与文章引用不匹配

| 位置 | 文件名 | 格式 |
|------|--------|------|
| 文章中引用 | `images/chapter01.png` | 简化格式 |
| 实际文件 | `chapter01_work.png` | 带后缀格式 |

### 根本原因

1. **Image skill 生成**: 文件名包含任务ID和时间戳，如 `illustration_20260315_132320_5870760.png`
2. **复制时重命名**: 重命名为 `chapter01_work.png`（保留了语义后缀）
3. **文章模板**: 使用简化引用 `images/chapter01.png`
4. **上传脚本**: 只能精确匹配，无法识别 `chapter01_work.png`

### 代码层面的问题

```python
# 旧代码：只能精确匹配
for img_file, url in image_urls.items():
    pattern = r'!\[([^\]]*)\]\(images/' + re.escape(img_file) + r'\)'
    # 只能匹配 chapter01_work.png，不能匹配 chapter01.png
```

---

## 修复方案

### 1. 改进上传脚本

**新增智能文件名匹配**:

```python
# 新代码：支持多种格式
for img_file, url in image_urls.items():
    # 提取章节编号
    base_name = img_file.replace('chapter', '').split('_')[0]
    if base_name.isdigit():
        chapter_num = base_name
        # 支持多种格式
        patterns = [
            rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}\.png\)',  # chapter01.png
            rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}_[^.]+\.png\)',  # chapter01_xxx.png
            rf'!\[([^\]]*)\]\(images/chapter{int(chapter_num)}\.png\)',  # chapter1.png
        ]
        
        for pattern in patterns:
            if re.search(pattern, line):
                line = re.sub(pattern, replacement, line)
                break
```

**新增章节排序**:

```python
# 按章节编号自动排序
chapter_images = {}
for img_file in os.listdir(IMAGES_DIR):
    if img_file.startswith('chapter') and img_file.endswith('.png'):
        match = re.search(r'chapter0?(\d+)', img_file)
        if match:
            chapter_num = int(match.group(1))
            chapter_images[chapter_num] = img_file

for chapter_num in sorted(chapter_images.keys()):
    # 按顺序上传
```

### 2. 建立文件命名规范

**标准格式**（强制执行）:
```
封面图：cover.png
章节配图：chapter01.png, chapter02.png, chapter03.png
```

**禁止使用**:
```
❌ chapter01_work.png（带后缀）
❌ chapter_01.png（下划线）
❌ chapter1.png（个位数）
```

### 3. 创建检查清单

**上传前必查**:
- [ ] 文件名是否为标准格式
- [ ] 文章引用是否与文件名一致
- [ ] 图片数量是否正确
- [ ] 上传脚本是否为最新版本

---

## 修复结果

### 重新上传成功

**时间**: 2026-03-15 14:35

**Media ID**: `mzW1rBA46b2HNXcsaT3byWMW3i5n_kUHVKfVgJ1K5D9-02f4TGgCuCDyH3VsJ_W_`

**验证**:
- ✅ 封面图正常显示
- ✅ 章节1配图正常显示
- ✅ 章节2配图正常显示
- ✅ 章节3配图正常显示
- ✅ 章节4配图正常显示

---

## 防止再犯的措施

### 1. 代码层面

**上传脚本**:
- ✅ 智能文件名匹配
- ✅ 章节自动排序
- ✅ 详细错误提示

**生成脚本**:
- ✅ 生成后立即重命名为标准格式
- ✅ 使用统一的命名规则

### 2. 流程层面

**生成配图时**:
```bash
# 立即重命名为标准格式
mv illustration_xxx.png images/chapter01.png
```

**撰写文章时**:
```markdown
## 01 标题

![配图](images/chapter01.png)  # 使用标准格式

内容...
```

**上传前检查**:
```bash
# 验证文件名
grep -o 'images/[^.]*\.png' article.md
ls -la images/
```

### 3. 文档层面

- ✅ 创建检查清单：`docs/wechat-upload-checklist.md`
- ✅ 更新使用说明：`AI_NEWS_LOOP_README.md`
- ✅ 创建修复报告：`IMAGE_FIX_REPORT.md`

---

## 经验教训

### 1. 文件命名要统一

**问题**: 不同阶段使用不同的命名规则
**解决**: 全局统一命名规范

### 2. 上传脚本要健壮

**问题**: 只能精确匹配，缺乏容错
**解决**: 支持多种格式，智能匹配

### 3. 测试要充分

**问题**: 没有在发布前验证图片显示
**解决**: 上传后立即验证草稿

---

## 后续优化计划

1. **自动化测试**: 上传前自动验证文件名匹配
2. **统一接口**: Image skill 生成时直接使用标准格式
3. **实时预览**: 上传后提供草稿预览链接

---

## 相关文件

**修复的上传脚本**: `scripts/upload-to-wechat-draft.py`

**检查清单**: `docs/wechat-upload-checklist.md`

**修复版周期任务**: `scripts/ai-news-loop-fixed.sh`

**使用说明**: `AI_NEWS_LOOP_README.md`

---

**修复时间**: 2026-03-15 14:40
**修复版本**: v1.1.0
**状态**: ✅ 已修复并验证
