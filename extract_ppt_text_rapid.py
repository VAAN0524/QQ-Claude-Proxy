# -*- coding: utf-8 -*-
"""批量识别 PPT 图片中的文字 - 使用 RapidOCR"""

import os
import sys
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR

def setup_ocr():
    """初始化 OCR 引擎"""
    print("正在初始化 RapidOCR 引擎...")
    ocr = RapidOCR()
    return ocr

def recognize_image(ocr, image_path):
    """识别单张图片中的文字"""
    try:
        result, _ = ocr(str(image_path), return_confidence=True)

        if not result:
            return "无法识别文字"

        # 提取所有文本
        texts = [item[1] for item in result]

        return '\n'.join(texts) if texts else "无法识别文字"
    except Exception as e:
        return f"识别错误: {str(e)}"

def main():
    media_dir = Path("C:/Test/bot/pptx_temp/ppt/media")
    output_file = Path("C:/Test/bot/ppt_ocr_result.txt")

    if not media_dir.exists():
        print(f"错误: 媒体目录不存在: {media_dir}")
        return

    # 初始化 OCR
    ocr = setup_ocr()

    # 获取所有图片文件
    image_files = []
    for ext in ['*.png', '*.jpeg', '*.jpg', '*.gif']:
        image_files.extend(media_dir.glob(ext))
    image_files = sorted(image_files, key=lambda x: int(''.join(filter(str.isdigit, x.stem)) or 0))

    print(f"找到 {len(image_files)} 张图片，开始识别...")

    # 批量识别
    results = []
    for i, img_path in enumerate(image_files, 1):
        print(f"正在处理 [{i}/{len(image_files)}]: {img_path.name}")
        text = recognize_image(ocr, img_path)
        results.append(f"\n{'='*60}\n")
        results.append(f"图片 {i}: {img_path.name}\n")
        results.append(f"{'='*60}\n")
        results.append(text)
        results.append(f"\n{'-'*60}\n")

    # 保存结果
    output_content = ''.join(results)
    output_file.write_text(output_content, encoding='utf-8')

    print(f"\n识别完成！结果已保存到: {output_file}")
    print(f"共识别 {len(image_files)} 张图片")

    # 显示前几个结果预览
    if len(results) > 0:
        print("\n" + "="*60)
        print("前 5 张图片的识别结果预览:")
        print("="*60)
        preview = ''.join(results[:5])
        print(preview[:1000])  # 显示前1000个字符

if __name__ == "__main__":
    main()
