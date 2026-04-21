# QQ-Claude-Proxy v2.0.0 代码清理指南

## 快速清理命令

### Step 1: 确认当前状态
```bash
# 查看代码规模
find src -name "*.ts" -exec wc -l {} + | tail -1

# 查看依赖大小
du -sh node_modules
```

### Step 2: 创建清理分支
```bash
git checkout -b cleanup/redundancy-removal
```

### Step 3: 删除未使用的 Agents 组件 (最安全，影响最大)
```bash
# 删除整个 agents 目录 (保留 base/Agent.ts 的类型定义)
rm -rf src/agents/memory/
rm -rf src/agents/learning/
rm -rf src/agents/tools/
rm src/agents/AgentLoader.ts
rm src/agents/ResourceMonitor.ts
rm src/agents/ToolCallTracker.ts
rm src/agents/PersonaPromptBuilder.ts
rm src/agents/ZaiMcpClient.ts
```

### Step 4: 清理未使用的依赖
```bash
npm uninstall @modelcontextprotocol/sdk pptxgenjs form-data @types/form-data
```

### Step 5: 归档过时文档
```bash
mkdir -p docs/archive

# 根目录过时文档
mv AI_NEWS_LOOP_README.md docs/archive/
mv IMAGE_FIX_REPORT.md docs/archive/
mv "PPT文字识别总结报告.md" docs/archive/
mv LAUNCHER.md docs/archive/
mv SHELL_AGENT_SETUP.md docs/archive/
mv TAVILY_SEARCH_SETUP.md docs/archive/
mv TEST_REPORT.md docs/archive/
mv UPGRADE.md docs/archive/

# docs 目录过时文档
mv docs/autonomous-agent-*.md docs/archive/ 2>/dev/null
mv docs/ai-news-loop-*.md docs/archive/ 2>/dev/null
mv docs/intelligent-system-*.md docs/archive/ 2>/dev/null
```

### Step 6: 删除过时的测试
```bash
# 智能系统测试 (功能已删除)
rm -rf tests/agents/intelligent/

# 审查其他测试 (手动确认后删除)
# rm tests/tool-call-tracker.test.ts
```

### Step 7: 验证构建
```bash
# 重新构建
npm run build

# 运行测试
npm test

# 检查类型
npm run typecheck
```

### Step 8: 提交更改
```bash
git add .
git commit -m "refactor: 删除冗余代码和依赖

- 删除未使用的 agents/ 组件 (~4,500 行)
- 移除未使用的 npm 依赖 (@modelcontextprotocol, pptxgenjs, form-data)
- 归档过时文档到 docs/archive/
- 删除废弃功能的测试

参考: docs/REDUNDANCY_ANALYSIS.md"
```

## 预期结果

- **代码行数**: 22,777 → ~16,500 (-27%)
- **文件数量**: 73 → ~50 (-31%)
- **依赖大小**: 减少 ~3.2 MB
- **目录结构**: 更简洁清晰

## 回滚方案

如果出现问题:
```bash
git checkout main
git branch -D cleanup/redundancy-removal
```

## 后续优化

### 第二阶段清理 (可选)
1. 将 `src/agents/base/Agent.ts` 的类型移到 `src/agent/types.ts`
2. 删除整个 `src/agents/` 目录
3. 清理未使用的环境变量

### 自动化死代码检测
```bash
# 安装工具
npm install -D ts-prune depcheck

# 检测未使用的导出
npx ts-prune

# 检测未使用的依赖
npx depcheck
```

## 验证清单

- [ ] 创建备份分支
- [ ] 删除 agents 组件
- [ ] 删除未使用依赖
- [ ] 归档过时文档
- [ ] 删除过时测试
- [ ] 运行 `npm run build` 成功
- [ ] 运行 `npm test` 通过
- [ ] 手动测试应用功能
- [ ] 提交更改
- [ ] 更新 README.md

## 注意事项

1. **备份优先**: 在执行清理前确保代码已提交
2. **分阶段执行**: 先执行最安全的 Phase 1
3. **测试验证**: 每个阶段后都要验证功能
4. **文档更新**: 清理后更新相关文档

## 常见问题

### Q: 删除这些组件会影响功能吗？
A: 不会。所有删除都基于实际代码扫描，确认无使用。

### Q: 如果未来需要这些功能怎么办？
A: Git 历史保留完整记录，可以随时恢复。

### Q: 清理后性能会提升吗？
A: 会。减少依赖和代码量会提升构建速度和运行效率。

### Q: 需要更新哪些文档？
A: 主要更新 README.md、CLAUDE.md 和 package.json 描述。

## 相关文档

- [详细分析报告](docs/REDUNDANCY_ANALYSIS.md)
- [重构历史](CHANGELOG.md)
- [项目文档](CLAUDE.md)
