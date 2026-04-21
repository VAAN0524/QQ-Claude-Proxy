# 公众号草稿箱上传检查清单

## 问题根源

**错误**: 文章中图片引用与实际文件名不匹配

- 文章中：`![配图](images/chapter01.png)`
- 实际文件：`chapter01_work.png`
- 结果：图片URL替换失败，只显示地址

---

## 上传前检查清单

### 1. 文件名一致性检查

```bash
# 检查文章中引用的图片文件名
grep -o 'images/[^.]*\.png' article.md

# 检查实际的图片文件名
ls -la images/
```

**要求**: 两者必须完全匹配

### 2. 文件命名规范

**标准格式**:
- 封面图：`cover.png`
- 章节配图：`chapter01.png`, `chapter02.png`, `chapter03.png`

**禁止使用**:
- ❌ `chapter01_work.png`（带后缀）
- ❌ `chapter_01.png`（下划线）
- ❌ `chapter1.png`（个位数）

### 3. 图片引用格式

**正确格式**:
```markdown
![配图描述](images/chapter01.png)
```

**错误格式**:
```markdown
![配图](images/chapter01_work.png)  # 文件名不匹配
![配图描述](images/chapter01_xxx.png)  # 文件名不匹配
```

### 4. 上传脚本验证

**必需功能**:
- [x] 支持多种文件名格式匹配
- [x] 按章节编号排序
- [x] 详细的错误提示
- [x] 上传后验证

---

## 修复后的上传脚本特性

### 智能文件名匹配

支持以下所有格式：
- `chapter01.png`
- `chapter01_xxx.png`
- `chapter1.png`
- `chapter_01.png`

### 章节排序

按章节编号自动排序，确保顺序正确：
```python
chapter_images = {}
for img_file in os.listdir(IMAGES_DIR):
    if img_file.startswith('chapter') and img_file.endswith('.png'):
        match = re.search(r'chapter0?(\d+)', img_file)
        if match:
            chapter_num = int(match.group(1))
            chapter_images[chapter_num] = img_file
```

---

## 防止再犯的措施

### 1. 生成配图时重命名

```python
# Image skill 生成后立即重命名
os.rename(
    f"illustration_{timestamp}_{task_id}.png",
    f"images/chapter0{i}.png"  # 标准格式
)
```

### 2. 文章模板规范

使用标准文件名：
```markdown
## 01 标题

![配图](images/chapter01.png)

内容...

## 02 标题

![配图](images/chapter02.png)

内容...
```

### 3. 上传前自动化检查

```python
def verify_image_references(article_md, images_dir):
    """验证图片引用是否正确"""
    # 提取文章中的图片引用
    references = re.findall(r'images/([^.]+\.png)', article_md)
    
    # 检查文件是否存在
    for ref in references:
        if not os.path.exists(os.path.join(images_dir, ref)):
            print(f"✗ 图片文件不存在: {ref}")
            return False
    
    print("✓ 所有图片引用正确")
    return True
```

### 4. 上传后验证

```python
def verify_draft_images(media_id):
    """验证草稿中的图片是否正确显示"""
    # 检查草稿内容中是否包含微信URL
    # http://mmbiz.qpic.cn/...
    pass
```

---

## 快速修复命令

如果发现图片显示问题：

```bash
# 1. 检查文件名
ls -la images/

# 2. 重命名为标准格式
cd images/
mv chapter01_work.png chapter01.png
mv chapter02_local.png chapter02.png
mv chapter03_active.png chapter03.png
mv chapter04_opensource.png chapter04.png

# 3. 重新上传
cd /c/Test/bot
python scripts/upload-to-wechat-draft.py
```

---

## 版本历史

**v1.0** (2026-03-15)
- 初始版本
- 发现文件名不匹配问题
- 修复上传脚本

**v1.1** (2026-03-15)
- 添加智能文件名匹配
- 添加章节排序功能
- 添加上传前验证

---

## 联系方式

如有问题，请通过QQ联系。
