#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 NMPA 和 SAMR 网站下载法规文件
"""

import os
import re
import requests
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
import time

BASE_DIR = r"C:\Test\bot\法规下载\特医食品功能性食品"

# 法规下载列表
REGULATIONS = [
    {
        "name": "药品经营质量管理规范",
        "category": "GSP规范",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/20160707150001304.html",
        "filename": "药品经营质量管理规范-2016.html"
    },
    {
        "name": "药品生产质量管理规范",
        "category": "GMP标准",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/flxzhfg/20110304140200937.html",
        "filename": "药品生产质量管理规范-2010.html"
    },
    {
        "name": "食品生产许可管理办法",
        "category": "生产许可",
        "url": "https://www.samr.gov.cn/xxgk/fgwj/gzwj/202009/t20200930_322384.html",
        "filename": "食品生产许可管理办法-2020.html"
    },
    {
        "name": "食品生产许可审查通则",
        "category": "生产许可",
        "url": "https://www.samr.gov.cn/xxgk/fgwj/gzwj/202103/t20210325_327136.html",
        "filename": "食品生产许可审查通则-2021.html"
    },
    {
        "name": "特殊医学用途配方食品注册管理办法",
        "category": "注册管理",
        "url": "https://www.samr.gov.cn/xxgk/fgwj/gzwj/202312/t20231205_343674.html",
        "filename": "特殊医学用途配方食品注册管理办法-2023.html"
    },
    {
        "name": "保健食品注册与备案管理办法",
        "category": "注册管理",
        "url": "https://www.samr.gov.cn/xxgk/fgwj/gzwj/202406/t20240628_486291.html",
        "filename": "保健食品注册与备案管理办法-2024.html"
    },
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
}


class PDFLinkParser(HTMLParser):
    """解析HTML中的PDF链接"""

    def __init__(self):
        super().__init__()
        self.pdf_links = []
        self.in_attachment = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        href = attrs_dict.get('href', '')
        if href.lower().endswith('.pdf'):
            self.pdf_links.append(href)
        # 检查class或其他属性是否包含附件相关标识
        class_attr = attrs_dict.get('class', '')
        if 'attachment' in class_attr.lower() or 'download' in class_attr.lower():
            self.in_attachment = True

    def handle_endtag(self, tag):
        self.in_attachment = False


def download_file(url, output_path, name):
    """下载单个文件"""
    print(f"\n{'='*60}")
    print(f"下载: {name}")
    print(f"URL: {url}")
    print(f"输出: {output_path}")

    try:
        response = requests.get(url, headers=HEADERS, timeout=60, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\r进度: {percent:.1f}% ({downloaded}/{total_size} bytes)", end='')

        file_size = os.path.getsize(output_path)
        print(f"\n✓ 下载成功! 文件大小: {file_size} bytes")
        return True

    except Exception as e:
        print(f"\n✗ 下载失败: {e}")
        return False


def find_pdf_links(html_content, base_url):
    """从HTML内容中查找PDF链接"""
    parser = PDFLinkParser()
    parser.feed(html_content)

    pdf_links = []
    for link in parser.pdf_links:
        # 转换为绝对链接
        absolute_url = urljoin(base_url, link)
        pdf_links.append(absolute_url)

    # 使用正则表达式查找更多PDF链接
    pdf_pattern = re.compile(r'href=["\']([^"\']*\.pdf)["\']', re.IGNORECASE)
    pdf_links.extend(pdf_pattern.findall(html_content))

    return list(set(pdf_links))  # 去重


def download_regulation_with_attachments(reg):
    """下载法规及其附件"""
    category = reg['category']
    url = reg['url']
    filename = reg['filename']
    name = reg['name']

    # 创建分类目录
    category_dir = os.path.join(BASE_DIR, category)
    os.makedirs(category_dir, exist_ok=True)

    # 下载主页面
    output_path = os.path.join(category_dir, filename)
    success = download_file(url, output_path, name)

    if success:
        # 尝试查找PDF附件
        print(f"\n检查PDF附件...")
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.encoding = 'utf-8'
            html_content = response.text

            pdf_links = find_pdf_links(html_content, url)

            if pdf_links:
                print(f"找到 {len(pdf_links)} 个PDF链接")
                for i, pdf_url in enumerate(pdf_links, 1):
                    print(f"  [{i}] {pdf_url}")

                    # 提取PDF文件名
                    parsed_url = urlparse(pdf_url)
                    pdf_filename = os.path.basename(parsed_url.path)
                    if not pdf_filename or pdf_filename == '':
                        pdf_filename = f"{name}-附件{i}.pdf"

                    pdf_output = os.path.join(category_dir, pdf_filename)
                    print(f"\n下载PDF附件: {pdf_filename}")
                    download_file(pdf_url, pdf_output, f"{name}-附件{i}")
                    time.sleep(2)  # 避免请求过快
            else:
                print("未找到PDF附件")
        except Exception as e:
            print(f"查找PDF附件时出错: {e}")

    time.sleep(2)  # 避免请求过快
    return success


def main():
    """主函数"""
    print("="*60)
    print("从 NMPA 和 SAMR 网站下载法规文件")
    print("="*60)

    total = len(REGULATIONS)
    success_count = 0
    failed_count = 0

    for i, reg in enumerate(REGULATIONS, 1):
        print(f"\n\n[{i}/{total}] ", end="")

        try:
            success = download_regulation_with_attachments(reg)
            if success:
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"处理失败: {e}")
            failed_count += 1

    print("\n" + "="*60)
    print("下载统计")
    print("="*60)
    print(f"总计: {total}")
    print(f"成功: {success_count}")
    print(f"失败: {failed_count}")
    print("="*60)


if __name__ == "__main__":
    main()
