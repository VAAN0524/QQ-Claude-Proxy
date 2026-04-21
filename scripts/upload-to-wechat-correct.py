#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""严格按照wechat-publisher skill要求上传到草稿箱"""

import os
import sys
import json
import glob
import requests
import re

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

WECHAT_APP_ID = "wx509d9d31eaeeccb9"
WECHAT_APP_SECRET = "3fe1d927d7cb9f173a18d15fa0cb6646"

TASK_DIR = "C:/Test/wechat_article_20260315_003"
IMAGES_DIR = os.path.join(TASK_DIR, "images")
ARTICLE_MD = os.path.join(TASK_DIR, "article.md")

def get_access_token():
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={WECHAT_APP_ID}&secret={WECHAT_APP_SECRET}"
    resp = requests.get(url, timeout=30)
    data = resp.json()
    if "access_token" in data:
        print(f"[OK] Access token obtained")
        return data["access_token"]
    print(f"[FAIL] {data}")
    return None

def upload_image(access_token, image_path):
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={access_token}&type=image"
    with open(image_path, "rb") as f:
        files = {"media": (os.path.basename(image_path), f, "image/png")}
        resp = requests.post(url, files=files, timeout=60)
    data = resp.json()
    if "url" in data:
        print(f"[OK] {os.path.basename(image_path)} uploaded -> {data['url'][:50]}...")
        return data["url"], data.get("media_id", "")
    print(f"[FAIL] {os.path.basename(image_path)}: {data}")
    return None, None

def md_to_wechat_html(md_content, image_urls):
    """严格按照skill要求转换：使用正则表达式匹配所有格式"""
    lines = md_content.split('\n')
    html_lines = []
    cover_skipped = False
    
    for line in lines:
        # 跳过封面图
        if '封面图' in line or 'cover.png' in line:
            if not cover_skipped:
                cover_skipped = True
            continue
        
        # 关键修复：使用正则表达式匹配所有图片引用格式
        for img_file, url in image_urls.items():
            # 提取章节编号
            base_name = img_file.replace('chapter', '').replace('.png', '')
            if '_' in base_name:
                base_name = base_name.split('_')[0]
            
            if base_name.isdigit():
                chapter_num = base_name.zfill(2)  # 1 -> 01, 2 -> 02
                # 匹配所有可能的格式
                patterns = [
                    rf'!\[([^\]]*)\]\(images/chapter{chapter_num}\.png\)',  # chapter01.png
                    rf'!\[([^\]]*)\]\(images/chapter{chapter_num}_[^.]+\.png\)',  # chapter01_xxx.png
                    rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}\.png\)',  # chapter01.png
                    rf'!\[([^\]]*)\]\(images/chapter0{chapter_num}_[^.]+\.png\)',  # chapter01_xxx.png
                ]
                
                replacement = f'<p style="text-align:center;"><img src="{url}" style="max-width:100%;"/></p>'
                
                for pattern in patterns:
                    if re.search(pattern, line):
                        line = re.sub(pattern, replacement, line)
                        print(f"[DEBUG] Matched pattern for chapter {chapter_num}: {img_file}")
                        break
        
        # 转换标题
        if line.startswith('# '):
            title = line[2:].strip()
            html_lines.append(f'<h1 style="text-align:center;font-size:22px;font-weight:bold;">{title}</h1>')
        elif line.startswith('## '):
            title = line[3:].strip()
            html_lines.append(f'<h2 style="font-size:18px;border-left:4px solid #3498db;padding-left:10px;margin-top:30px;margin-bottom:15px;">{title}</h2>')
        elif line.strip() == '<br/>' or line.strip() == '<br />':
            html_lines.append('<br/>')
        elif line.strip() and not line.startswith('#'):
            html_lines.append(f'<p style="line-height:1.8;margin-bottom:15px;">{line}</p>')
    
    return '\n'.join(html_lines)

def create_draft(access_token, title, cover_media_id, content):
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={access_token}"
    headers = {"Content-Type": "application/json; charset=utf-8"}
    
    data = {
        "articles": [{
            "title": title[:20],  # 不超过20字符
            "thumb_media_id": cover_media_id,
            "author": "",
            "digest": "",
            "content": content,
            "content_source_url": "",
            "need_open_comment": 0,
            "only_fans_can_comment": 0
        }]
    }
    
    resp = requests.post(
        url, 
        data=json.dumps(data, ensure_ascii=False).encode("utf-8"), 
        headers=headers, 
        timeout=30
    )
    result = resp.json()
    
    if "media_id" in result:
        return result["media_id"]
    print(f"[FAIL] {result}")
    return None

def main():
    print("=" * 60)
    print("严格按照wechat-publisher skill要求上传")
    print("=" * 60)
    
    # Step 1: 获取access_token
    print("\n[Step 1/5] 获取access_token...")
    token = get_access_token()
    if not token:
        return
    
    # Step 2: 上传封面图
    print("\n[Step 2/5] 上传封面图...")
    cover_path = os.path.join(IMAGES_DIR, "cover.png")
    cover_url, cover_media_id = upload_image(token, cover_path)
    if not cover_url:
        return
    
    # Step 3: 上传章节配图
    print("\n[Step 3/5] 上传章节配图...")
    image_urls = {}
    
    # 查找所有章节配图并按章节编号排序
    chapter_images = {}
    for img_file in os.listdir(IMAGES_DIR):
        if img_file.startswith('chapter') and img_file.endswith('.png'):
            match = re.search(r'chapter0?(\d+)', img_file)
            if match:
                chapter_num = int(match.group(1))
                chapter_images[chapter_num] = img_file
    
    for chapter_num in sorted(chapter_images.keys()):
        img_file = chapter_images[chapter_num]
        img_path = os.path.join(IMAGES_DIR, img_file)
        url, _ = upload_image(token, img_path)
        if url:
            image_urls[img_file] = url
    
    # Step 4: 转换文章格式
    print("\n[Step 4/5] 转换文章格式...")
    with open(ARTICLE_MD, "r", encoding="utf-8") as f:
        md_content = f.read()
    
    title_match = re.search(r'^# (.+)$', md_content, re.MULTILINE)
    title = title_match.group(1) if title_match else "AI资讯"
    title = title[:20]
    
    html_content = md_to_wechat_html(md_content, image_urls)
    print(f"[OK] Title: {title}")
    print(f"[OK] Images: {len(image_urls)} chapter images")
    
    # Step 5: 创建草稿
    print("\n[Step 5/5] 创建公众号草稿...")
    media_id = create_draft(token, title, cover_media_id, html_content)
    
    if media_id:
        print("\n" + "=" * 60)
        print("✓ 草稿创建成功！")
        print(f"  Media ID: {media_id}")
        print(f"  Title: {title}")
        print(f"  Images: {len(image_urls) + 1} total")
        print("\n预览地址: https://mp.weixin.qq.com/")
        print("=" * 60)
        
        result_file = os.path.join(TASK_DIR, "draft_result_final.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump({"media_id": media_id, "title": title}, f, ensure_ascii=False, indent=2)
    else:
        print("\n✗ 草稿创建失败")

if __name__ == "__main__":
    main()
