#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
import os
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

TASK_DIR = 'C:/Test/wechat_article_20260316_122343'
IMAGES_DIR = os.path.join(TASK_DIR, "images")
ARTICLE_MD = os.path.join(TASK_DIR, "article.md")

# 读取文章内容
with open(ARTICLE_MD, "r", encoding="utf-8") as f:
    md_content = f.read()

print("=== 文章内容 ===")
print(md_content)
print()

# 列出所有图片文件
print("=== 图片文件 ===")
for img_file in os.listdir(IMAGES_DIR):
    if img_file.endswith('.png'):
        print(f"  - {img_file}")
print()

# 模拟图片URL
image_urls = {}
for img_file in os.listdir(IMAGES_DIR):
    if img_file.startswith('chapter') and img_file.endswith('.png'):
        image_urls[img_file] = f"http://fake.url/{img_file}"

print(f"=== image_urls 字典 ===")
for k, v in image_urls.items():
    print(f"  {k}: {v}")
print()

# 测试转换逻辑
print("=== 测试转换逻辑 ===")
lines = md_content.split('\n')
html_lines = []

for line in lines:
    if 'images/chapter' in line:
        print(f"\n处理行: {repr(line)}")
        
        matched = False
        for img_file, url in image_urls.items():
            print(f"\n  尝试文件: {img_file}")
            
            # 提取章节编号
            base_name = img_file.replace('chapter', '').split('_')[0]
            print(f"  base_name: {repr(base_name)}")
            
            if base_name.isdigit():
                chapter_int = int(base_name)
                chapter_padded = base_name
                
                print(f"  chapter_int: {chapter_int}")
                print(f"  chapter_padded: {repr(chapter_padded)}")
                
                patterns = [
                    rf'!\[([^\]]*)\]\(images/chapter{chapter_padded}\.png\)',
                    rf'!\[([^\]]*)\]\(images/chapter{chapter_padded}_[^.]+\.png\)',
                    rf'!\[([^\]]*)\]\(images/chapter{chapter_int}\.png\)',
                ]
                
                for i, pattern in enumerate(patterns):
                    print(f"  模式{i+1}: {repr(pattern)}")
                    if re.search(pattern, line):
                        replacement = f'<p style="text-align:center;"><img src="{url}" style="max-width:100%;"/></p>'
                        line = re.sub(pattern, replacement, line)
                        print(f"  ✓ 匹配成功！")
                        print(f"  替换后: {repr(line)}")
                        matched = True
                        break
                    else:
                        print(f"  ✗ 未匹配")
            
            if matched:
                break
        
        if not matched:
            print(f"  ✗✗✗ 所有模式都未匹配！")
            print(f"  原始行保持: {repr(line)}")
    
    html_lines.append(line)

print("\n=== 转换后的HTML ===")
print('\n'.join(html_lines))
