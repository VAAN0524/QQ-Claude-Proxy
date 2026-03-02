#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
特医食品和功能性食品相关法规文件批量下载脚本
根据待下载清单获取缺失的法规文件
"""

import os
import requests
import time
from urllib.parse import quote

# 基础目录
BASE_DIR = r"C:\Test\bot\法规下载\特医食品功能性食品"

# 已下载的文件列表（避免重复下载）
DOWNLOADED_FILES = [
    "GB29922-2025特殊医学用途配方食品通则",
    "GB29923-2023特殊医学用途配方食品良好生产规范",
    "GB25596-2025特殊医学用途婴儿配方食品通则",
    "GB14881-2025食品生产通用卫生规范",
    "GB17405-2025保健食品良好生产规范",
    "GB16740-2014保健食品",
    "GB4789系列-食品微生物检验标准完整版2026",
    "BRCGS-食品安全标准中文版2026",
    "FSSC22000-食品安全体系认证标准中文版2026",
    "CNAS-CL01-G001-2018检测和校准实验室能力认可准则",
    "CNAS-RL01-2024实验室认可规则",
]

# 待下载的法规清单
PENDING_DOWNLOADS = [
    # 一、GSP 相关规范
    {
        "name": "药品经营质量管理规范",
        "category": "GSP规范",
        "year": "2024",
        "source": "NMPA",
        "keywords": ["GSP", "药品经营", "质量管理"]
    },
    {
        "name": "药品经营质量管理规范附录",
        "category": "GSP规范",
        "year": "2024",
        "source": "NMPA",
        "keywords": ["GSP", "附录", "药品经营"]
    },

    # 二、GMP 相关标准
    {
        "name": "药品生产质量管理规范",
        "category": "GMP标准",
        "year": "2024",
        "source": "NMPA",
        "keywords": ["GMP", "药品生产", "质量管理"]
    },
    {
        "name": "药品生产质量管理规范附录",
        "category": "GMP标准",
        "year": "2024",
        "source": "NMPA",
        "keywords": ["GMP", "附录", "药品生产"]
    },

    # 三、厂房车间设计规范
    {
        "name": "GB50073-2023 洁净厂房设计规范",
        "category": "厂房设计",
        "year": "2023",
        "source": "GB",
        "keywords": ["GB50073", "洁净厂房", "设计规范"]
    },
    {
        "name": "GB50591-2023 洁净室施工及验收规范",
        "category": "厂房设计",
        "year": "2023",
        "source": "GB",
        "keywords": ["GB50591", "洁净室", "施工验收"]
    },
    {
        "name": "GB50691-2023 食品工业洁净用房建筑技术规范",
        "category": "厂房设计",
        "year": "2023",
        "source": "GB",
        "keywords": ["GB50691", "食品工业", "洁净用房"]
    },

    # 四、质量管理体系标准
    {
        "name": "GBT19001-2024 质量管理体系要求",
        "category": "质量体系",
        "year": "2024",
        "source": "GB",
        "keywords": ["GB/T19001", "ISO9001", "质量管理体系"]
    },
    {
        "name": "GBT22000-2024 食品安全管理体系",
        "category": "质量体系",
        "year": "2024",
        "source": "GB",
        "keywords": ["GB/T22000", "ISO22000", "食品安全"]
    },
    {
        "name": "ISO22002-1-2024 食品安全前提方案",
        "category": "质量体系",
        "year": "2024",
        "source": "ISO",
        "keywords": ["ISO22002", "前提方案", "食品生产"]
    },

    # 五、生产许可和注册管理
    {
        "name": "特殊医学用途配方食品生产许可审查细则",
        "category": "生产许可",
        "year": "2024",
        "source": "SAMR",
        "keywords": ["特医食品", "生产许可", "审查细则"]
    },
    {
        "name": "食品生产许可管理办法",
        "category": "生产许可",
        "year": "2020",
        "source": "SAMR",
        "keywords": ["食品生产", "许可管理"]
    },
    {
        "name": "特殊医学用途配方食品注册管理办法",
        "category": "注册管理",
        "year": "2023",
        "source": "SAMR",
        "keywords": ["特医食品", "注册管理"]
    },
    {
        "name": "保健食品注册与备案管理办法",
        "category": "注册管理",
        "year": "2024",
        "source": "SAMR",
        "keywords": ["保健食品", "注册备案"]
    },

    # 六、检验检测相关
    {
        "name": "食品经营许可和备案管理办法",
        "category": "经营许可",
        "year": "2024",
        "source": "SAMR",
        "keywords": ["食品经营", "许可备案"]
    },
    {
        "name": "GB31621-2023 食品经营过程卫生规范",
        "category": "经营规范",
        "year": "2023",
        "source": "GB",
        "keywords": ["GB31621", "食品经营", "卫生规范"]
    },
    {
        "name": "GB31605-2020 食品冷链物流卫生规范",
        "category": "物流规范",
        "year": "2020",
        "source": "GB",
        "keywords": ["GB31605", "冷链物流", "卫生规范"]
    },
]


def create_category_dirs():
    """创建分类目录"""
    categories = set(item['category'] for item in PENDING_DOWNLOADS)
    for category in categories:
        dir_path = os.path.join(BASE_DIR, category)
        os.makedirs(dir_path, exist_ok=True)
        print(f"确保目录存在: {dir_path}")


def is_already_downloaded(name):
    """检查文件是否已下载"""
    for downloaded in DOWNLOADED_FILES:
        if downloaded in name or name in downloaded:
            return True
    return False


def search_nmpa_standard(name, keywords):
    """从 NMPA 网站搜索标准"""
    print(f"\n搜索 NMPA: {name}")
    # NMPA 搜索URL
    search_url = f"https://www.nmpa.gov.cn/search"
    return None


def search_gb_standard(code, name):
    """从国家标准全文公开系统获取标准"""
    print(f"\n搜索国家标准: {code} {name}")

    # 国家标准查询URL
    query_url = f"https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno="

    # 先搜索获取 hcno
    search_code = code.replace("GB/", "GB").replace("GBT", "GB/T").replace(" ", "")

    # 构建搜索URL
    search_params = quote(f"key={search_code}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        # 尝试直接访问可能的标准页面
        # 对于GB标准，尝试一些常见的hcno格式
        common_hcnos = [
            "9BC5FDDD0D59486D8796B5C4D8E8F6A0",  # 示例hcno
        ]

        for hcno in common_hcnos:
            test_url = f"{query_url}{hcno}"
            print(f"  尝试: {test_url}")
            time.sleep(1)

    except Exception as e:
        print(f"  搜索失败: {e}")

    return None


def download_standard_file(item):
    """下载单个标准文件"""
    name = item['name']
    category = item['category']

    if is_already_downloaded(name):
        print(f"跳过已下载: {name}")
        return True

    print(f"\n处理: {name}")
    print(f"  分类: {category}")
    print(f"  年份: {item['year']}")
    print(f"  来源: {item['source']}")

    # 根据来源选择下载方式
    if item['source'] == 'GB':
        result = search_gb_standard(name.split()[0], name)
    elif item['source'] == 'NMPA':
        result = search_nmpa_standard(name, item['keywords'])
    else:
        print(f"  暂不支持 {item['source']} 来源")
        return False

    return result is not None


def main():
    """主函数"""
    print("=" * 60)
    print("特医食品和功能性食品法规批量下载")
    print("=" * 60)

    # 创建分类目录
    create_category_dirs()

    # 统计信息
    total = len(PENDING_DOWNLOADS)
    downloaded = 0
    skipped = 0
    failed = 0

    # 逐个下载
    for i, item in enumerate(PENDING_DOWNLOADS, 1):
        print(f"\n[{i}/{total}] ", end="")

        if is_already_downloaded(item['name']):
            skipped += 1
            continue

        try:
            success = download_standard_file(item)
            if success:
                downloaded += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  错误: {e}")
            failed += 1

        # 避免请求过快
        time.sleep(2)

    # 打印统计
    print("\n" + "=" * 60)
    print("下载完成统计:")
    print(f"  总计: {total}")
    print(f"  成功: {downloaded}")
    print(f"  跳过: {skipped}")
    print(f"  失败: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
