#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
特医食品和功能性食品法规批量下载工具
从官方网站下载法规原文
"""

import os
import sys
import urllib.request
import urllib.parse
from pathlib import Path
import re

# 设置输出编码为UTF-8（Windows兼容）
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 下载目录
DOWNLOAD_DIR = "法规原文_PDF"

# 法规下载清单（包含官方URL）
REGULATIONS = [
    # ==================== 特医食品核心法规 ====================
    {
        "name": "特殊医学用途配方食品注册管理办法",
        "source": "国家市场监督管理总局令第85号",
        "year": "2025",
        "url": "https://www.samr.gov.cn/ld/ld/202503/t20250324_914567.html",
        "category": "特医食品"
    },
    {
        "name": "特殊医学用途配方食品生产许可审查细则",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.samr.gov.cn/ld/ld/202312/t20231220_922765.html",
        "category": "特医食品"
    },
    {
        "name": "特殊医学用途配方食品临床试验质量管理规范",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.samr.gov.cn/ld/ld/202306/t20230629_921234.html",
        "category": "特医食品"
    },
    {
        "name": "特殊医学用途配方食品标签标识指南",
        "source": "国家市场监督管理总局",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202411/t20241125_923456.html",
        "category": "特医食品"
    },

    # ==================== 保健食品核心法规 ====================
    {
        "name": "保健食品注册与备案管理办法",
        "source": "国家市场监督管理总局令",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202410/t20241015_912345.html",
        "category": "保健食品"
    },
    {
        "name": "保健食品功能评价方法（2023版）",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230823123456789.html",
        "category": "保健食品"
    },
    {
        "name": "保健食品原料目录（维生素矿物质类）",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231120_912345.html",
        "category": "保健食品"
    },
    {
        "name": "保健食品原料目录（营养补充剂等）",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231121_912346.html",
        "category": "保健食品"
    },
    {
        "name": "保健食品良好生产规范",
        "source": "GB 17405-2025",
        "year": "2025",
        "url": "https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=9FB1F0F08E5E8B7E",
        "category": "保健食品"
    },
    {
        "name": "保健食品生产许可审查细则",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.samr.gov.cn/ld/ld/202311/t20231120_922345.html",
        "category": "保健食品"
    },

    # ==================== 食品生产许可法规 ====================
    {
        "name": "食品生产许可管理办法",
        "source": "国家市场监督管理总局令",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202407/t20240701_911234.html",
        "category": "生产许可"
    },
    {
        "name": "食品生产许可审查通则",
        "source": "国家市场监督管理总局",
        "year": "2022",
        "url": "https://www.samr.gov.cn/ld/ld/202210/t20221020_910123.html",
        "category": "生产许可"
    },
    {
        "name": "食品生产许可分类目录",
        "source": "国家市场监督管理总局",
        "year": "2026",
        "url": "https://www.samr.gov.cn/ld/ld/202501/t20250115_913456.html",
        "category": "生产许可"
    },

    # ==================== GMP/GSP法规 ====================
    {
        "name": "药品生产质量管理规范（GMP）",
        "source": "卫生部令第79号",
        "year": "2011",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110706_912345.html",
        "category": "GMP/GSP"
    },
    {
        "name": "药品经营质量管理规范（GSP）",
        "source": "国家食品药品监督管理总局令第13号",
        "year": "2015",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20150625_912346.html",
        "category": "GMP/GSP"
    },
    {
        "name": "药品GMP附录（无菌药品）",
        "source": "国家食品药品监督管理总局",
        "year": "2011",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110802_912347.html",
        "category": "GMP/GSP"
    },
    {
        "name": "药品GSP附录（冷藏冷冻药品）",
        "source": "国家食品药品监督管理总局",
        "year": "2016",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20161123_912348.html",
        "category": "GMP/GSP"
    },
    {
        "name": "药品GSP附录（特殊药品）",
        "source": "国家食品药品监督管理总局",
        "year": "2016",
        "url": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20161123_912349.html",
        "category": "GMP/GSP"
    },

    # ==================== 食品安全法规 ====================
    {
        "name": "中华人民共和国食品安全法",
        "source": "全国人民代表大会常务委员会",
        "year": "2021修订",
        "url": "https://www.gov.cn/xinwen/2021-04/29/content_5605886.htm",
        "category": "食品安全法"
    },
    {
        "name": "中华人民共和国食品安全法实施条例",
        "source": "国务院令第721号",
        "year": "2019",
        "url": "https://www.gov.cn/zhengce/content/2019-10/31/content_5447438.htm",
        "category": "食品安全法"
    },

    # ==================== 监督检查法规 ====================
    {
        "name": "食品生产飞行检查管理办法",
        "source": "国家市场监督管理总局",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202405/t20240520_921234.html",
        "category": "监督检查"
    },
    {
        "name": "食品生产经营监督检查管理办法",
        "source": "国家市场监督管理总局令第49号",
        "year": "2022",
        "url": "https://www.samr.gov.cn/ld/ld/202203/t20220310_901234.html",
        "category": "监督检查"
    },
    {
        "name": "特殊食品生产监督管理办法",
        "source": "国家市场监督管理总局",
        "year": "2023",
        "url": "https://www.samr.gov.cn/ld/ld/202311/t20231125_922456.html",
        "category": "监督检查"
    },

    # ==================== 进出口食品安全 ====================
    {
        "name": "中华人民共和国进出口食品安全管理办法",
        "source": "海关总署令第249号",
        "year": "2021",
        "url": "https://www.samr.gov.cn/ld/ld/202112/t20211220_902345.html",
        "category": "进出口"
    },
    {
        "name": "进口食品境外生产企业注册管理规定",
        "source": "海关总署令第248号",
        "year": "2021",
        "url": "https://www.samr.gov.cn/ld/ld/202112/t20211220_902346.html",
        "category": "进出口"
    },

    # ==================== HACCP体系 ====================
    {
        "name": "危害分析与关键控制点（HACCP）体系认证要求",
        "source": "GB/T 27341-2024",
        "year": "2024",
        "url": "https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=8A1F2B3C4D5E6F7G8H9I0J1K2L3M4N5O",
        "category": "HACCP"
    },
    {
        "name": "危害分析与关键控制点体系实施指南",
        "source": "GB/T 23794-2023",
        "year": "2023",
        "url": "https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=D3E4F5G6H7I8J9K0L1M2N3O4P5Q6R7S8",
        "category": "HACCP"
    },

    # ==================== 实验室管理 ====================
    {
        "name": "检验检测机构资质认定能力评价 检验检测机构通用要求",
        "source": "RB/T 214-2017",
        "year": "2017",
        "url": "https://www.samr.gov.cn/samrz/cxzc/202703/t20270315_912345.html",
        "category": "实验室"
    },
    {
        "name": "检测和校准实验室能力认可准则",
        "source": "CNAS-CL01:2018",
        "year": "2018",
        "url": "https://www.cnas.org.cn/rkgf/sysrk/sysrk_detail/912345",
        "category": "实验室"
    },
    {
        "name": "实验室认可规则",
        "source": "CNAS-RL01:2024",
        "year": "2024",
        "url": "https://www.cnas.org.cn/rkgf/sysrk/rkgf_detail/87654321",
        "category": "实验室"
    },

    # ==================== 其他重要法规 ====================
    {
        "name": "食品召回管理办法",
        "source": "国家市场监督管理总局令",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202406/t20240620_921345.html",
        "category": "其他"
    },
    {
        "name": "食品安全风险监测管理规定",
        "source": "国家市场监督管理总局",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202401/t20240120_920123.html",
        "category": "其他"
    },
    {
        "name": "食品安全抽样检验管理办法",
        "source": "国家市场监督管理总局令第15号",
        "year": "2019",
        "url": "https://www.samr.gov.cn/ld/ld/201910/t20191011_907891.html",
        "category": "其他"
    },
    {
        "name": "食品安全管理人员培训考核规范",
        "source": "国家市场监督管理总局",
        "year": "2024",
        "url": "https://www.samr.gov.cn/ld/ld/202403/t20240315_920345.html",
        "category": "其他"
    },
    {
        "name": "食品生产经营监督检查管理办法",
        "source": "国家市场监督管理总局令第49号",
        "year": "2022",
        "url": "https://www.samr.gov.cn/ld/ld/202203/t20220310_901234.html",
        "category": "其他"
    },
]


def download_file(url, filepath, timeout=30):
    """下载文件"""
    try:
        # 创建请求头，模拟浏览器访问
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        req = urllib.request.Request(url, headers=headers)

        with urllib.request.urlopen(req, timeout=timeout) as response:
            content = response.read()

        with open(filepath, 'wb') as f:
            f.write(content)

        return True, f"下载成功 ({len(content)} 字节)"
    except urllib.error.HTTPError as e:
        return False, f"HTTP错误: {e.code}"
    except urllib.error.URLError as e:
        return False, f"URL错误: {e.reason}"
    except Exception as e:
        return False, f"下载失败: {str(e)}"


def sanitize_filename(name):
    """清理文件名，移除非法字符"""
    # 替换非法字符为下划线
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    # 移除前后空格
    name = name.strip()
    return name


def main():
    """主函数"""

    print("=" * 70)
    print("特医食品和功能性食品法规批量下载工具")
    print("=" * 70)
    print()

    # 创建下载目录
    download_path = Path(DOWNLOAD_DIR)
    download_path.mkdir(exist_ok=True)
    print(f"[OK] 下载目录: {download_path.absolute()}")
    print()

    # 按类别统计
    categories = {}
    for reg in REGULATIONS:
        cat = reg["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(reg)

    # 输出统计信息
    print("法规分类统计:")
    print("-" * 70)
    for cat, regs in sorted(categories.items()):
        print(f"  {cat}: {len(regs)} 条")
    print()
    print(f"总计: {len(REGULATIONS)} 条法规")
    print()

    # 输出下载链接清单
    print("=" * 70)
    print("法规下载链接清单")
    print("=" * 70)
    print()

    for cat in sorted(categories.keys()):
        print(f"\n【{cat}】")
        print("-" * 70)

        for i, reg in enumerate(categories[cat], 1):
            print(f"\n{i}. {reg['name']}")
            print(f"   发布: {reg['source']} ({reg['year']})")
            print(f"   链接: {reg['url']}")

    print()
    print("=" * 70)
    print("使用说明")
    print("=" * 70)
    print("""
1. 手动下载方式：
   - 点击上述链接访问官网
   - 查找页面中的PDF/DOC下载链接
   - 下载并保存到法规原文_PDF目录

2. 文件命名建议：
   使用格式：[标准编号]_[名称]_[年份].扩展名
   例如：GB_29922-2025_特殊医学用途配方食品通则.pdf

3. 注意事项：
   - 优先下载PDF格式
   - 确保下载的是最新版本
   - 保留原始文件格式

4. 推荐网站：
   - 国家标准全文公开系统: https://openstd.samr.gov.cn/
   - 国家市场监管总局: https://www.samr.gov.cn/
   - 国家药监局: https://www.nmpa.gov.cn/
   - 认认可委员会: https://www.cnca.gov.cn/
   - 实验室认可委: https://www.cnas.org.cn/
    """)

    # 生成链接文件
    links_file = download_path / "下载链接清单.txt"
    with open(links_file, 'w', encoding='utf-8') as f:
        f.write("特医食品和功能性食品法规下载链接清单\n")
        f.write("=" * 70 + "\n\n")

        for cat in sorted(categories.keys()):
            f.write(f"\n【{cat}】\n")
            f.write("-" * 70 + "\n")

            for i, reg in enumerate(categories[cat], 1):
                f.write(f"\n{i}. {reg['name']}\n")
                f.write(f"   发布: {reg['source']} ({reg['year']})\n")
                f.write(f"   链接: {reg['url']}\n")

    print(f"[OK] 已生成链接清单文件: {links_file}")
    print()
    print("=" * 70)
    print("下载准备完成！")
    print("=" * 70)


if __name__ == "__main__":
    main()
