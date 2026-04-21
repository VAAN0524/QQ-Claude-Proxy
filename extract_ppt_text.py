# -*- coding: utf-8 -*-
"""批量识别 PPT 图片中的文字"""

import os
import sys
from pathlib import Path
from paddleocr import PaddleOCR

def setup_ocr():
    """初始化 OCR 引擎"""
    print("正在初始化 OCR 引擎...")
    ocr = PaddleOCR(
        use_textline_orientation=True,
        lang='ch'
    )
    return ocr

def recognize_image(ocr, image_path):
    """识别单张图片中的文字"""
    try:
        result = ocr.ocr(str(image_path), cls=True)

        if not result or not result[0]:
            return "无法识别文字"

        # 提取所有文本
        texts = []
        for line in result[0]:
            if line and len(line) > 1:
                text = line[1][0]  # 获取识别的文本
                confidence = line[1][1]  # 获取置信度
                if confidence > 0.5:  # 只保留置信度大于 50% 的文本
                    texts.append(text)

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
    image_files = sorted(media_dir.glob("image*.{png,jpeg,jpg}"), key=lambda x: x.stem)

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

if __name__ == "__main__":
    main()
