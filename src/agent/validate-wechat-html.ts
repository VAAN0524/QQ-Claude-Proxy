/**
 * 微信公众号HTML验证工具
 * 确保生成的HTML符合 wechat-publisher skill 的硬性要求
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证HTML是否符合微信公众号skill要求
 */
export function validateWeChatHTML(html: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 检查H2标题格式（必须符合skill要求）
  const h2Pattern = /<h2[^>]*style="([^"]*)"[^>]*>(.*?)<\/h2>/gi;
  let h2Match: RegExpExecArray | null;
  while ((h2Match = h2Pattern.exec(html)) !== null) {
    const style = h2Match[1];
    const content = h2Match[2];

    // skill要求的样式
    const requiredStyles = [
      'font-size:18px',
      'border-left:4px solid #3498db',
      'padding-left:10px'
    ];

    // 检查是否包含必需样式
    for (const required of requiredStyles) {
      if (!style.includes(required)) {
        errors.push(`H2标题缺少必需样式: ${required}`);
      }
    }

    // 检查是否包含禁止的样式
    const forbiddenStyles = [
      'background:', 'gradient', 'border-radius:', 'box-shadow:',
      'text-align:center', 'color:#ffffff'
    ];

    for (const forbidden of forbiddenStyles) {
      if (style.toLowerCase().includes(forbidden.toLowerCase())) {
        errors.push(`H2标题包含禁止样式: ${forbidden}`);
      }
    }
  }

  // 2. 检查段落格式
  const pPattern = /<p[^>]*style="([^"]*)"[^>]*>(.*?)<\/p>/gis;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pPattern.exec(html)) !== null) {
    const style = pMatch[1];

    // skill要求的段落样式
    if (!style.includes('text-indent:2em')) {
      warnings.push('段落缺少首行缩进样式: text-indent:2em');
    }

    if (!style.includes('line-height:1.8') && !style.includes('line-height:1.9')) {
      warnings.push('段落建议使用行高: line-height:1.8 或 1.9');
    }
  }

  // 3. 检查图片格式
  const imgPattern = /<img[^>]*style="([^"]*)"[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    const style = imgMatch[1];

    // 检查禁止的图片样式
    const forbiddenImgStyles = [
      'border-radius:', 'box-shadow:'
    ];

    for (const forbidden of forbiddenImgStyles) {
      if (style.toLowerCase().includes(forbidden.toLowerCase())) {
        errors.push(`图片包含禁止样式: ${forbidden}`);
      }
    }

    // 检查必需的图片样式
    if (!style.includes('max-width:100%')) {
      errors.push('图片缺少必需样式: max-width:100%');
    }

    if (!style.includes('display:block')) {
      warnings.push('图片建议使用样式: display:block');
    }
  }

  // 4. 检查禁止的格式
  const forbiddenPatterns = [
    { pattern: /border-radius:\s*\d+px;/, desc: '圆角样式' },
    { pattern: /box-shadow:\s*[^;]+;/, desc: '阴影样式' },
    { pattern: /background:\s*linear-gradient\(/, desc: '渐变背景' },
    { pattern: /text-align:\s*center;/, desc: '居中对齐（H2标题中）' }
  ];

  for (const { pattern, desc } of forbiddenPatterns) {
    if (pattern.test(html)) {
      errors.push(`包含禁止格式: ${desc}`);
    }
  }

  // 5. 检查必需的格式
  const requiredPatterns = [
    { pattern: /text-indent:\s*2em;/, desc: '首行缩进' },
    { pattern: /border-left:\s*4px\s*solid\s*#3498db;/, desc: '蓝色左边框' },
    { pattern: /font-size:\s*18px;/, desc: 'H2字体大小' }
  ];

  for (const { pattern, desc } of requiredPatterns) {
    if (!pattern.test(html)) {
      warnings.push(`缺少必需格式: ${desc}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 修复HTML使其符合skill要求
 */
export function fixWeChatHTML(html: string): string {
  let fixed = html;

  // 1. 修复H2标题样式
  fixed = fixed.replace(
    /<h2[^>]*style="[^"]*"[^>]*>(.*?)<\/h2>/gi,
    (match, content) => {
      return `<h2 style="font-size:18px;border-left:4px solid #3498db;padding-left:10px;margin:20px 0;">${content}</h2>`;
    }
  );

  // 2. 修复段落样式（移除多余样式，保留必需的）
  fixed = fixed.replace(
    /<p[^>]*style="[^"]*"[^>]*>/gi,
    '<p style="font-size:16px;line-height:1.9;color:#333333;text-indent:2em;margin:12px 0;">'
  );

  // 3. 修复图片样式（移除圆角和阴影）
  fixed = fixed.replace(
    /<img[^>]*style="[^"]*"[^>]*>/gi,
    (match) => {
      // 保留src属性
      const srcMatch = match.match(/src="([^"]*)"/);
      const src = srcMatch ? srcMatch[1] : '';

      return `<img src="${src}" style="display:block;max-width:100%;margin:20px auto;"/>`;
    }
  );

  return fixed;
}

/**
 * 生成符合skill要求的标准HTML模板
 */
export function generateStandardWeChatHTML(content: string, imageUrls: string[]): string {
  const lines = content.split('\n');
  let html = '<section class="article">\n';
  html += '<style>\n';
  html += 'p { font-size: 16px; line-height: 1.9; color: #333333; text-indent: 2em; margin: 12px 0; }\n';
  html += 'h2 { font-size: 18px; border-left: 4px solid #3498db; padding-left: 10px; margin: 20px 0; }\n';
  html += 'img { display: block; max-width: 100%; margin: 20px auto; }\n';
  html += '</style>\n\n';

  let imageIndex = 0;
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      html += '\n';
      continue;
    }

    // 标题
    if (trimmed.startsWith('# ')) {
      html += `<h1 style="text-align:center;font-size:22px;margin:20px 0;">${trimmed.substring(2)}</h1>\n\n`;
    } else if (trimmed.startsWith('## ')) {
      html += `<h2 style="font-size:18px;border-left:4px solid #3498db;padding-left:10px;margin:20px 0;">${trimmed.substring(3)}</h2>\n\n`;
    }
    // 图片占位符
    else if (trimmed.match(/^!\[.*\]\(images\/.*\)$/)) {
      if (imageIndex < imageUrls.length) {
        html += `<p style="text-align:center;"><img src="${imageUrls[imageIndex]}" style="display:block;max-width:100%;margin:20px auto;"/></p>\n\n`;
        imageIndex++;
      }
    }
    // 普通段落
    else {
      html += `<p>${trimmed}</p>\n\n`;
    }
  }

  html += '</section>';
  return html;
}
