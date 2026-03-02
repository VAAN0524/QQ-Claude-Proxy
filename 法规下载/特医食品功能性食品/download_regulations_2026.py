#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
特医食品功能性食品法规下载脚本 (2026版)
用于从官方网站下载GMP、GSP、特医食品、保健食品等法规文件
"""

import os
import requests
import time
from pathlib import Path
from urllib.parse import urljoin
import re

# 配置
DOWNLOAD_DIR = Path("法规下载/特医食品功能性食品")
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

# 法规列表 - 优先下载的重要法规
REGULATIONS = [
    # 特医食品专项
    {
        "name": "特殊医学用途配方食品生产监督管理办法",
        "category": "特医食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },
    {
        "name": "特殊医学用途配方食品标签标识指南",
        "category": "特医食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },
    {
        "name": "特殊医学用途配方食品临床试验质量管理规范",
        "category": "特医食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },

    # 保健食品专项
    {
        "name": "保健食品生产许可审查细则",
        "category": "保健食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },
    {
        "name": "保健食品功能检验与评价技术规范",
        "category": "保健食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },
    {
        "name": "保健食品良好生产规范检查条款和评价方法",
        "category": "保健食品",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },

    # GMP附录系列
    {
        "name": "药品生产质量管理规范附录1：无菌药品",
        "category": "GMP标准",
        "url": "https://www.nmpa.gov.cn/",
        "priority": "high"
    },
    {
        "name": "药品生产质量管理规范附录10：确认与验证",
        "category": "GMP标准",
        "url": "https://www.nmpa.gov.cn/",
        "priority": "high"
    },
    {
        "name": "药品生产质量管理规范附录11：质量控制实验室",
        "category": "GMP标准",
        "url": "https://www.nmpa.gov.cn/",
        "priority": "high"
    },

    # GSP附录系列
    {
        "name": "药品经营质量管理规范附录：冷藏冷冻药品储存运输管理",
        "category": "GSP规范",
        "url": "https://www.nmpa.gov.cn/",
        "priority": "high"
    },
    {
        "name": "药品经营质量管理规范现场检查指导原则",
        "category": "GSP规范",
        "url": "https://www.nmpa.gov.cn/",
        "priority": "high"
    },

    # 检验检测
    {
        "name": "检验检测机构资质认定管理办法",
        "category": "检验检测",
        "url": "https://www.samr.gov.cn/",
        "priority": "high"
    },
    {
        "name": "RB/T 215-2017 检验检测机构资质认定能力评价 食品检验机构要求",
        "category": "检验检测",
        "url": "https://www.cnca.gov.cn/",
        "priority": "medium"
    },

    # 建筑标准
    {
        "name": "GB/T 13554-2020 高效空气过滤器",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "GB 50243-2016 通风与空调工程施工质量验收规范",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "GB 50019-2015 采暖通风与空气调节设计规范",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "GB 50303-2015 建筑电气工程施工质量验收规范",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "GB 50015-2019 建筑给水排水设计标准",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "GB 50016-2014 建筑设计防火规范（2018年版）",
        "category": "建筑标准",
        "url": "https://openstd.samr.gov.cn/",
        "priority": "medium"
    },

    # 食品相关产品
    {
        "name": "食品相关产品生产许可实施细则",
        "category": "生产许可",
        "url": "https://www.samr.gov.cn/",
        "priority": "medium"
    },
    {
        "name": "食品相关产品生产许可审查通则",
        "category": "生产许可",
        "url": "https://www.samr.gov.cn/",
        "priority": "medium"
    },
]

def sanitize_filename(name):
    """清理文件名，移除非法字符"""
    # 替换不能用作文件名的字符
    name = re.sub(r'[<>:"/\\|?*]', '-', name)
    # 移除首尾空格
    name = name.strip()
    return name

def create_category_dir(category):
    """创建分类目录"""
    dir_path = DOWNLOAD_DIR / category
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path

def create_summary_file(reg, content=None):
    """创建法规摘要文件"""
    filename = sanitize_filename(f"{reg['name']}.md")
    category_dir = create_category_dir(reg['category'])
    filepath = category_dir / filename

    if filepath.exists():
        print(f"  [已存在] {filename}")
        return None

    summary_content = f"""# {reg['name']}

**分类**: {reg['category']}
**优先级**: {reg['priority']}
**来源**: {reg['url']}
**创建日期**: 2026-02-28

---

## 获取说明

本文件为法规占位文件，需要从官方网站获取原文内容。

**官方来源**: {reg['url']}

**建议获取方式**:
1. 访问官方网站搜索法规名称
2. 下载PDF或Word格式的正式文件
3. 替换本摘要文件

---

## 法规概述

{f"**{reg['name']}**是{reg['category']}领域的重要法规文件，对特医食品和功能性食品的生产质量管理具有重要指导意义。"}

## 主要内容

（待获取原文后补充）

## 适用范围

（待获取原文后补充）

## 关键要求

（待获取原文后补充）

---

*注：此为占位文件，请从官方网站获取完整的法规原文*
"""

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(summary_content)

    print(f"  [创建] {filename}")
    return filepath

def main():
    """主函数"""
    print("=" * 60)
    print("特医食品功能性食品法规下载脚本 (2026版)")
    print("=" * 60)
    print()

    # 统计
    total = len(REGULATIONS)
    created = 0
    skipped = 0

    # 按优先级排序
    high_priority = [r for r in REGULATIONS if r['priority'] == 'high']
    medium_priority = [r for r in REGULATIONS if r['priority'] == 'medium']
    sorted_regs = high_priority + medium_priority

    print(f"准备处理 {total} 个法规文件...")
    print(f"  - 高优先级: {len(high_priority)} 个")
    print(f"  - 中优先级: {len(medium_priority)} 个")
    print()

    for i, reg in enumerate(sorted_regs, 1):
        print(f"[{i}/{total}] {reg['name']} ({reg['category']})")

        result = create_summary_file(reg)
        if result:
            created += 1
        else:
            skipped += 1

        # 避免请求过快
        time.sleep(0.1)

    print()
    print("=" * 60)
    print("处理完成!")
    print(f"  创建文件: {created} 个")
    print(f"  跳过文件: {skipped} 个")
    print(f"  法规目录: {DOWNLOAD_DIR.absolute()}")
    print("=" * 60)

    # 生成下载报告
    report_path = DOWNLOAD_DIR / "法规下载报告_2026-02-28.md"
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(f"""# 法规下载报告

**生成时间**: 2026-02-28
**状态**: 待从官方网站下载原文

## 处理统计

- 总计法规: {total} 个
- 创建占位文件: {created} 个
- 已存在文件: {skipped} 个

## 分类统计

""")

        # 按分类统计
        categories = {}
        for reg in REGULATIONS:
            cat = reg['category']
            if cat not in categories:
                categories[cat] = {'high': 0, 'medium': 0, 'total': 0}
            categories[cat][reg['priority']] += 1
            categories[cat]['total'] += 1

        for cat, stats in sorted(categories.items()):
            f.write(f"### {cat}\\n")
            f.write(f"- 高优先级: {stats['high']} 个\\n")
            f.write(f"- 中优先级: {stats['medium']} 个\\n")
            f.write(f"- 小计: {stats['total']} 个\\n\\n")

        f.write("""## 下一步操作

1. 访问相关官方网站
2. 搜索并下载法规原文
3. 替换占位文件

## 官方网站

- 国家标准全文公开系统: https://openstd.samr.gov.cn/
- 国家市场监督管理总局: https://www.samr.gov.cn/
- 国家药品监督管理局: https://www.nmpa.gov.cn/
- 国家卫生健康委员会: http://www.nhc.gov.cn/
- 中国合格评定国家认可委员会: https://www.cnas.org.cn/
- 国家认证认可监督管理委员会: https://www.cnca.gov.cn/
""")

    print(f"下载报告: {report_path}")

if __name__ == "__main__":
    main()
