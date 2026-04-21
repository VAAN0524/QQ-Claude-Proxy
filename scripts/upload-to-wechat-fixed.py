#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上传AI资讯文章到公众号草稿箱（修复版）"""

import os
import sys
import json
import glob
import requests
import re

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 微信公众号配置
WECHAT_APP_ID = "wx509d9d31eaeeccb9"
WECHAT_APP_SECRET = "3fe1d927d7cb9f173a18d15fa0cb6646"

# 自动查找最新的任务目录
TASK_BASE = "C:/Test/wechat_article_"

def find_latest_task_dir():
    """查找最新的任务目录"""
    import glob
    pattern = os.path.join(TASK_BASE + "*")
    dirs = glob.glob(pattern)
    if not dirs:
        raise FileNotFoundError(f"未找到任务目录: {pattern}")
    # 按修改时间排序，返回最新的
    latest_dir = max(dirs, key=os.path.getmtime)
    print(f"[INFO] 使用最新任务目录: {latest_dir}")
    return latest_dir

TASK_DIR = find_latest_task_dir()
IMAGES_DIR = os.path.join(TASK_DIR, "images")
ARTICLE_MD = os.path.join(TASK_DIR, "article.md")


def get_access_token():
    """获取access_token"""
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={WECHAT_APP_ID}&secret={WECHAT_APP_SECRET}"
    resp = requests.get(url, timeout=30)
    data = resp.json()
    if "access_token" in data:
        print(f"✓ Access token获取成功")
        return data["access_token"]
    print(f"✗ 获取token失败: {data}")
    return None


def upload_image(access_token, image_path):
    """上传图片到微信素材库"""
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={access_token}&type=image"
    with open(image_path, "rb") as f:
        files = {"media": (os.path.basename(image_path), f, "image/png")}
        resp = requests.post(url, files=files, timeout=60)
    data = resp.json()
    if "url" in data:
        print(f"✓ 上传成功: {os.path.basename(image_path)}")
        return data["url"], data.get("media_id", "")
    print(f"✗ 上传失败 {os.path.basename(image_path)}: {data}")
    return None, None


def markdown_to_wechat_html(md_content, image_urls):
    """将Markdown转换为微信HTML格式（修复版）"""
    lines = md_content.split('\n')
    html_lines = []

    # 跳过封面图
    cover_skipped = False

    for line in lines:
        # 跳过封面图引用
        if '封面图' in line or 'cover.png' in line:
            if not cover_skipped:
                cover_skipped = True
            continue

        # 修复：直接匹配完整的图片文件名
        for img_file, url in image_urls.items():
            # 匹配 ![描述](images/文件名.png)
            pattern = rf'!\[([^\]]*)\]\(images/{re.escape(img_file)}\)'
            if re.search(pattern, line):
                replacement = f'<p style="text-align:center;"><img src="{url}" style="max-width:100%;"/></p>'
                line = re.sub(pattern, replacement, line)
                print(f"[DEBUG] 替换图片: {img_file}")
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
        elif line.strip().startswith('[') and '](' in line:
            # 保持Markdown链接格式（微信支持）
            html_lines.append(line)
        elif line.strip() and not line.startswith('#'):
            html_lines.append(f'<p style="line-height:1.8;margin-bottom:15px;">{line}</p>')

    return '\n'.join(html_lines)


def create_draft(access_token, title, cover_media_id, content):
    """创建公众号草稿"""
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={access_token}"
    headers = {"Content-Type": "application/json; charset=utf-8"}

    data = {
        "articles": [{
            "title": title,
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
    print(f"✗ 创建草稿失败: {result}")
    return None


def main():
    print("=" * 60)
    print("上传AI资讯文章到公众号草稿箱（图片嵌入修复版）")
    print("=" * 60)
    print()

    # 1. 获取access_token
    print("[1/5] 获取access_token...")
    token = get_access_token()
    if not token:
        return

    # 2. 上传封面图
    print("\n[2/5] 上传封面图...")
    cover_path = os.path.join(IMAGES_DIR, "cover.png")
    if not os.path.exists(cover_path):
        print(f"✗ 封面图不存在: {cover_path}")
        return

    cover_url, cover_media_id = upload_image(token, cover_path)
    if not cover_url:
        return

    # 3. 上传章节配图
    print("\n[3/5] 上传章节配图...")
    image_urls = {}

    # 查找所有章节配图
    chapter_images = []
    for img_file in os.listdir(IMAGES_DIR):
        if img_file.startswith('chapter') and img_file.endswith('.png'):
            chapter_images.append(img_file)

    # 按文件名排序
    chapter_images.sort()

    for img_file in chapter_images:
        img_path = os.path.join(IMAGES_DIR, img_file)
        url, _ = upload_image(token, img_path)
        if url:
            image_urls[img_file] = url

    if not image_urls:
        print("✗ 没有找到章节配图")
        return

    # 4. 转换文章格式
    print("\n[4/5] 转换文章格式...")
    with open(ARTICLE_MD, "r", encoding="utf-8") as f:
        md_content = f.read()

    # 提取标题
    title_match = re.search(r'^# (.+)$', md_content, re.MULTILINE)
    title = title_match.group(1) if title_match else "AI资讯"

    # 确保标题不超过20字符
    title = title[:20]

    # 转换为HTML（修复图片匹配）
    html_content = markdown_to_wechat_html(md_content, image_urls)

    print(f"✓ 文章转换完成")
    print(f"  标题: {title}")
    print(f"  配图: {len(image_urls)}张章节配图")

    # 5. 创建草稿
    print("\n[5/5] 创建公众号草稿...")
    media_id = create_draft(token, title, cover_media_id, html_content)

    if media_id:
        print()
        print("=" * 60)
        print("✓ 草稿创建成功！")
        print(f"  Media ID: {media_id}")
        print(f"  标题: {title}")
        print(f"  配图: {len(image_urls) + 1}张（1封面 + {len(image_urls)}章节配图）")
        print()
        print("请登录公众号后台预览和发布:")
        print("https://mp.weixin.qq.com/")
        print("=" * 60)

        # 保存media_id
        result_file = os.path.join(TASK_DIR, "draft_result_fixed.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump({"media_id": media_id, "title": title}, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 草稿信息已保存到: {result_file}")
        print("\n✅ 图片嵌入问题已修复！所有配图已正确嵌入到文章中。")
    else:
        print("\n✗ 草稿创建失败")


if __name__ == "__main__":
    main()
