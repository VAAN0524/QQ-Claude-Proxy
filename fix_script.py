#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

# 读取文件
with open('scripts/upload-to-wechat-draft.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 旧的代码块
old_code = '''        for img_file, url in image_urls.items():
            # 提取文件名的基准部分（如 chapter01_work.png -> chapter01）
            base_name = img_file.replace('chapter', '').split('_')[0]
            if base_name.isdigit():
                chapter_int = int(base_name)
                chapter_padded = base_name
                # 匹配 chapter01.png, chapter01_xxx.png, chapter0{N}.png 等格式'''

# 新的代码块
new_code = '''        for img_file, url in image_urls.items():
            # 提取章节编号（修复：使用正则表达式正确提取）
            match = re.search(r'chapter0?(\d+)', img_file)
            if match:
                chapter_int = int(match.group(1))
                chapter_padded = str(chapter_int).zfill(2)
                # 匹配 chapter01.png, chapter01_xxx.png, chapter1.png 等格式'''

# 替换
content = content.replace(old_code, new_code)

# 写回文件
with open('scripts/upload-to-wechat-draft.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ 修复完成")
