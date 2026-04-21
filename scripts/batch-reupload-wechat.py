#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量重新上传公众号文章到草稿箱（修复图片嵌入）"""

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
        return data["url"], data.get("media_id", "")
    print(f"✗ 上传失败 {os.path.basename(image_path)}: {data}")
    return None, None


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
            pattern = rf'!\[([^\]]*)\]\(images/{re.escape(img_file)}\)'
            if re.search(pattern, line):
                replacement = f'<p style="text-align:center;"><img src="{url}" style="max-width:100%;"/></p>'
                line = re.sub(pattern, replacement, line)
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


def upload_article(task_dir, access_token):
    """上传单篇文章"""
    print(f"\n{'='*60}")
    print(f"处理目录: {task_dir}")
    print('='*60)

    images_dir = os.path.join(task_dir, "images")
    article_md = os.path.join(task_dir, "article.md")

    # 检查必要文件
    if not os.path.exists(article_md):
        print("✗ 文章文件不存在")
        return None

    cover_path = os.path.join(images_dir, "cover.png")
    if not os.path.exists(cover_path):
        print("✗ 封面图不存在")
        return None

    # 读取文章标题
    with open(article_md, "r", encoding="utf-8") as f:
        md_content = f.read()

    title_match = re.search(r'^# (.+)$', md_content, re.MULTILINE)
    title = title_match.group(1) if title_match else "AI资讯"
    title = title[:20]

    # 上传封面图
    print(f"[1/3] 上传封面图...")
    cover_url, cover_media_id = upload_image(access_token, cover_path)
    if not cover_url:
        return None

    # 上传章节配图
    print(f"[2/3] 上传章节配图...")
    image_urls = {}

    if os.path.exists(images_dir):
        chapter_images = []
        for img_file in os.listdir(images_dir):
            if img_file.startswith('chapter') and img_file.endswith('.png'):
                chapter_images.append(img_file)

        chapter_images.sort()

        for img_file in chapter_images:
            img_path = os.path.join(images_dir, img_file)
            url, _ = upload_image(access_token, img_path)
            if url:
                image_urls[img_file] = url

    # 转换文章格式
    print(f"[3/3] 转换文章格式...")
    html_content = markdown_to_wechat_html(md_content, image_urls)

    # 创建草稿
    media_id = create_draft(access_token, title, cover_media_id, html_content)

    if media_id:
        print(f"\n✅ {title}")
        print(f"   Media ID: {media_id}")
        print(f"   配图: {len(image_urls) + 1}张（1封面 + {len(image_urls)}章节配图）")

        # 保存结果
        result_file = os.path.join(task_dir, "draft_result_fixed.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump({"media_id": media_id, "title": title}, f, ensure_ascii=False, indent=2)
    else:
        print(f"\n✗ {title} 上传失败")

    return media_id


def main():
    # 需要重新上传的目录（按时间倒序）
    task_dirs = [
        "C:/Test/wechat_article_20260316_143006_001",
        "C:/Test/wechat_article_20260316_055703_001",
        "C:/Test/wechat_article_20260316_045006_001",
        "C:/Test/wechat_article_20260316_034740_001",
        "C:/Test/wechat_article_20260316_014614",
        "C:/Test/wechat_article_20260316_012943_001",
    ]

    print("="*60)
    print("批量重新上传公众号文章（修复图片嵌入）")
    print("="*60)
    print(f"\n总共需要上传 {len(task_dirs)} 篇文章\n")

    # 获取 access_token（只获取一次）
    token = get_access_token()
    if not token:
        return

    # 批量上传
    results = []
    for i, task_dir in enumerate(task_dirs, 1):
        print(f"\n[{i}/{len(task_dirs)}] 处理中...")
        media_id = upload_article(task_dir, token)
        if media_id:
            results.append({
                "dir": os.path.basename(task_dir),
                "media_id": media_id
            })

    # 输出汇总
    print("\n" + "="*60)
    print("批量上传完成")
    print("="*60)
    print(f"\n成功: {len(results)}/{len(task_dirs)} 篇\n")

    for r in results:
        print(f"✓ {r['dir']}")
        print(f"  Media ID: {r['media_id']}")

    print("\n请登录公众号后台预览和发布:")
    print("https://mp.weixin.qq.com/")


if __name__ == "__main__":
    main()
