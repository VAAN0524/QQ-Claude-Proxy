// 创建科技资讯PPT
const PptxGenJS = (await import('pptxgenjs')).default;
const pptx = new PptxGenJS();
const shapes = pptx.shapes;

// 设置演示文稿属性
pptx.title = '2026年2月科技资讯';
pptx.author = 'AI Assistant';

// 配色方案：科技蓝色主题
const colors = {
  primary: '1E2761',    // 深蓝
  secondary: '065A82',  // 青蓝
  accent: '00A896',     // 海绿
  dark: '21295C',       // 午夜蓝
  light: 'F5F5F5',      // 浅灰
  white: 'FFFFFF'       // 白色
};

// 定义幻灯片尺寸（16:9）
pptx.layout = 'LAYOUT_16x9';

// === 封面幻灯片 ===
const slide1 = pptx.addSlide();
slide1.background = { color: colors.primary };
slide1.addText('2026年2月', {
  x: 0.5, y: 2, w: 9, h: 0.8,
  fontSize: 28, color: colors.accent, bold: true
});
slide1.addText('AI科技资讯', {
  x: 0.5, y: 2.8, w: 9, h: 1.2,
  fontSize: 54, color: colors.white, bold: true,
  fontFace: 'Arial Black'
});
slide1.addText('GPT-5.3 vs Claude Opus 4.6', {
  x: 0.5, y: 4.2, w: 9, h: 0.6,
  fontSize: 24, color: colors.light
});
slide1.addText('Anthropic IPO冲刺 · 超级碗广告大战', {
  x: 0.5, y: 4.9, w: 9, h: 0.5,
  fontSize: 18, color: colors.accent
});

// === 目录幻灯片 ===
const slide2 = pptx.addSlide();
slide2.background = { color: colors.light };
slide2.addText('内容概览', {
  x: 0.5, y: 0.5, w: 9, h: 0.6,
  fontSize: 36, color: colors.primary, bold: true
});

const items = [
  '01 重磅模型发布',
  '02 重要服务变更',
  '03 资本市场动态',
  '04 超级碗广告对决',
  '05 技术评测报告',
  '06 行业趋势洞察'
];

items.forEach((item, i) => {
  slide2.addText(item, {
    x: 1, y: 1.3 + i * 0.5, w: 8, h: 0.4,
    fontSize: 18, color: colors.dark
  });
  // 添加序号圆圈
  slide2.addShape(shapes.ellipse, {
    x: 0.6, y: 1.32 + i * 0.5, w: 0.25, h: 0.25,
    fill: { color: colors.accent }
  });
  slide2.addText(String(i + 1), {
    x: 0.65, y: 1.3 + i * 0.5, w: 0.15, h: 0.25,
    fontSize: 14, color: colors.white, align: 'center'
  });
});

// === 幻灯片3: 重磅模型发布 ===
const slide3 = pptx.addSlide();
slide3.background = { color: colors.white };
slide3.addText('01 重磅模型发布', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.primary, bold: true
});

// 添加分割线
slide3.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

// 左侧内容
slide3.addText('2026年2月5日', {
  x: 0.5, y: 1.4, w: 4, h: 0.5,
  fontSize: 14, color: colors.accent, bold: true
});

slide3.addText('OpenAI 发布 GPT-5.3-Codex', {
  x: 0.5, y: 1.9, w: 4, h: 0.6,
  fontSize: 24, color: colors.dark, bold: true
});

slide3.addText('Anthropic 发布 Claude Opus 4.6', {
  x: 0.5, y: 2.6, w: 4, h: 0.6,
  fontSize: 24, color: colors.dark, bold: true
});

// 右侧亮点框
slide3.addShape(shapes.rect, {
  x: 5, y: 1.4, w: 4.5, h: 1.8,
  fill: { color: colors.secondary }
});

slide3.addText('震惊特性', {
  x: 5.3, y: 1.6, w: 4, h: 0.4,
  fontSize: 16, color: colors.white, bold: true
});

slide3.addText('AI模型已经能够有意义地参与改进自己', {
  x: 5.3, y: 2.1, w: 4, h: 0.8,
  fontSize: 18, color: colors.white
});

// 底部时间线
slide3.addShape(shapes.line, {
  x: 0.5, y: 4, w: 9, h: 0,
  line: { color: colors.light, width: 2, dashType: 'dash' }
});

slide3.addText('AI进化史的重要节点', {
  x: 0.5, y: 4.2, w: 9, h: 0.4,
  fontSize: 16, color: colors.dark, italic: true
});

// === 幻灯片4: 服务变更 ===
const slide4 = pptx.addSlide();
slide4.background = { color: colors.white };
slide4.addText('02 重要服务变更', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.primary, bold: true
});

slide4.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

// 警告框
slide4.addShape(shapes.rect, {
  x: 0.5, y: 1.5, w: 9, h: 2,
  fill: { color: 'FFE6E6' }
});

slide4.addShape(shapes.rect, {
  x: 0.5, y: 1.5, w: 0.15, h: 2,
  fill: { color: 'DC3545' }
});

slide4.addText('⚠️ 重要通知', {
  x: 0.8, y: 1.7, w: 8.5, h: 0.5,
  fontSize: 20, color: 'DC3545', bold: true
});

slide4.addText('OpenAI 将于 2026年2月16日正式终止 chatgpt-4o-latest 模型的API访问权限', {
  x: 0.8, y: 2.3, w: 8.5, h: 0.8,
  fontSize: 18, color: colors.dark
});

// 影响说明
slide4.addText('影响范围', {
  x: 0.5, y: 3.8, w: 9, h: 0.4,
  fontSize: 16, color: colors.primary, bold: true
});

slide4.addText('• 大量API客户和应用需要迁移\n• 建议提前规划迁移方案\n• 新模型 GPT-5.3 已上线', {
  x: 0.5, y: 4.2, w: 9, h: 1,
  fontSize: 16, color: colors.dark, bullet: true
});

// === 幻灯片5: 资本市场 ===
const slide5 = pptx.addSlide();
slide5.background = { color: colors.dark };
slide5.addText('03 资本市场动态', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.white, bold: true
});

slide5.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

// Anthropic IPO
slide5.addText('Anthropic 冲刺 IPO', {
  x: 0.5, y: 1.5, w: 4, h: 0.5,
  fontSize: 20, color: colors.accent, bold: true
});

slide5.addText('估值 2.6万亿美元', {
  x: 0.5, y: 2.1, w: 4, h: 0.6,
  fontSize: 32, color: colors.white, bold: true
});

slide5.addText('• 最早2026年登陆资本市场\n• 由OpenAI核心团队出走创办\n• 投资方：亚马逊、微软、英伟达', {
  x: 0.5, y: 2.8, w: 4, h: 1,
  fontSize: 14, color: colors.light
});

// 中国AI力量
slide5.addText('中国AI力量崛起', {
  x: 5, y: 1.5, w: 4.5, h: 0.5,
  fontSize: 20, color: colors.accent, bold: true
});

const chineseModels = [
  '智谱AI · 港交所',
  'Minimax · 港交所',
  '文心一言',
  '通义千问',
  '智谱GLM',
  'DeepSeek'
];

chineseModels.forEach((model, i) => {
  slide5.addText(model, {
    x: 5, y: 2.1 + i * 0.35, w: 4.5, h: 0.3,
    fontSize: 16, color: colors.white
  });
});

// === 幻灯片6: 超级碗广告 ===
const slide6 = pptx.addSlide();
slide6.background = { color: colors.white };
slide6.addText('04 超级碗广告对决', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.primary, bold: true
});

slide6.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

// Anthropic 广告
slide6.addShape(shapes.rect, {
  x: 0.5, y: 1.5, w: 4.2, h: 2.5,
  fill: { color: colors.primary }
});

slide6.addText('Anthropic', {
  x: 0.7, y: 1.7, w: 3.8, h: 0.4,
  fontSize: 18, color: colors.white, bold: true
});

slide6.addText('豪掷数千万美元', {
  x: 0.7, y: 2.2, w: 3.8, h: 0.4,
  fontSize: 14, color: colors.accent
});

slide6.addText('标语：', {
  x: 0.7, y: 2.7, w: 3.8, h: 0.3,
  fontSize: 12, color: colors.light
});

slide6.addText('"广告正在入侵AI，但Claude不会"', {
  x: 0.7, y: 3, w: 3.8, h: 0.7,
  fontSize: 16, color: colors.white, italic: true
});

// OpenAI 回应
slide6.addShape(shapes.rect, {
  x: 5, y: 1.5, w: 4.5, h: 2.5,
  fill: { color: '10A37F' }
});

slide6.addText('OpenAI', {
  x: 5.2, y: 1.7, w: 4, h: 0.4,
  fontSize: 18, color: colors.white, bold: true
});

slide6.addText('Sam Altman 立即反击', {
  x: 5.2, y: 2.2, w: 4, h: 0.4,
  fontSize: 14, color: colors.accent
});

slide6.addText('在社交平台公开回应\n批评 Anthropic "误导公众"和"伪善精英主义"', {
  x: 5.2, y: 2.7, w: 4, h: 1,
  fontSize: 14, color: colors.white
});

// === 幻灯片7: 评测报告 ===
const slide7 = pptx.addSlide();
slide7.background = { color: colors.light };
slide7.addText('05 技术评测报告', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.primary, bold: true
});

slide7.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

slide7.addText('GPT-5.2 vs Claude 4.5', {
  x: 0.5, y: 1.5, w: 9, h: 0.5,
  fontSize: 24, color: colors.dark, bold: true
});

const metrics = [
  { name: '模型架构创新', gpt: 85, claude: 88 },
  { name: '基准测试表现', gpt: 90, claude: 87 },
  { name: '应用场景覆盖', gpt: 88, claude: 92 },
  { name: '成本效益', gpt: 82, claude: 85 }
];

metrics.forEach((metric, i) => {
  const y = 2.2 + i * 0.5;

  // 名称
  slide7.addText(metric.name, {
    x: 0.5, y: y, w: 2.5, h: 0.4,
    fontSize: 14, color: colors.dark
  });

  // GPT 柱状图
  const gptWidth = metric.gpt / 100 * 2.5;
  slide7.addShape(shapes.rect, {
    x: 3, y: y + 0.1, w: gptWidth, h: 0.2,
    fill: { color: '10A37F' }
  });
  slide7.addText(`${metric.gpt}%`, {
    x: 3, y: y, w: 2.5, h: 0.4,
    fontSize: 12, color: colors.white
  });

  // Claude 柱状图
  const claudeWidth = metric.claude / 100 * 2.5;
  slide7.addShape(shapes.rect, {
    x: 6, y: y + 0.1, w: claudeWidth, h: 0.2,
    fill: { color: colors.accent }
  });
  slide7.addText(`${metric.claude}%`, {
    x: 6, y: y, w: 2.5, h: 0.4,
    fontSize: 12, color: colors.white
  });
});

// 图例
slide7.addText('GPT-5.2', {
  x: 3, y: 4.5, w: 2.5, h: 0.3,
  fontSize: 12, color: colors.dark
});
slide7.addText('Claude 4.5', {
  x: 6, y: 4.5, w: 2.5, h: 0.3,
  fontSize: 12, color: colors.dark
});

// === 幻灯片8: 行业趋势 ===
const slide8 = pptx.addSlide();
slide8.background = { color: colors.primary };
slide8.addText('06 行业趋势洞察', {
  x: 0.5, y: 0.4, w: 9, h: 0.6,
  fontSize: 32, color: colors.white, bold: true
});

slide8.addShape(shapes.line, {
  x: 0.5, y: 1.1, w: 3, h: 0,
  line: { color: colors.accent, width: 3 }
});

slide8.addText('"AI春运"大战', {
  x: 0.5, y: 1.5, w: 9, h: 0.5,
  fontSize: 24, color: colors.accent, bold: true
});

slide8.addText('2026年初被称为"AI春运"大战的开始', {
  x: 0.5, y: 2.1, w: 9, h: 0.4,
  fontSize: 18, color: colors.white
});

const insights = [
  'AI开始熟练地自我改进和进化',
  '模型竞争从参数规模转向应用场景',
  '企业级AI市场成为主战场',
  '中国AI力量快速崛起'
];

insights.forEach((insight, i) => {
  slide8.addShape(shapes.ellipse, {
    x: 0.7, y: 2.9 + i * 0.5, w: 0.2, h: 0.2,
    fill: { color: colors.accent }
  });
  slide8.addText(insight, {
    x: 1.1, y: 2.75 + i * 0.5, w: 8.5, h: 0.4,
    fontSize: 16, color: colors.light
  });
});

// === 结束幻灯片 ===
const slide9 = pptx.addSlide();
slide9.background = { color: colors.primary };
slide9.addText('感谢观看', {
  x: 0.5, y: 2.5, w: 9, h: 0.8,
  fontSize: 48, color: colors.white, bold: true,
  align: 'center'
});
slide9.addText('2026年2月 AI科技资讯', {
  x: 0.5, y: 3.5, w: 9, h: 0.5,
  fontSize: 20, color: colors.accent,
  align: 'center'
});

// 保存演示文稿
const outputPath = 'C:/Test/bot/workspace/科技资讯_2026年2月.pptx';
await pptx.writeFile({ fileName: outputPath });
console.log(`PPT已创建: ${outputPath}`);
