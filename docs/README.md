# QQ-Claude-Proxy 文档中心

欢迎来到 QQ-Claude-Proxy 项目文档中心。这里汇集了所有项目相关的文档、指南和参考资料。

## 📚 文档导航

### 🚀 快速开始

- **[项目主 README](../README.md)** - 项目概述、快速开始和基本配置
- **[开发指南 (CLAUDE.md)](../CLAUDE.md)** - 核心架构、开发命令和代码规范

### 📖 用户指南

- **[测试指南](guides/testing.md)** - 测试策略、测试命令和覆盖率报告
- **[配置说明](../README.md#配置)** - 环境变量、配置文件和部署选项

### 🔌 API 文档

- **[Gateway 协议](../CLAUDE.md#gateway-消息协议)** - WebSocket 消息协议和路由器
- **[Dashboard API](../CLAUDE.md#dashboard-功能)** - HTTP API 端点和监控界面

### 💻 开发文档

- **[项目架构](../CLAUDE.md#核心架构)** - 系统架构和组件说明
- **[开发命令](../CLAUDE.md#开发命令)** - 构建、测试、运行命令
- **[代码结构](../CLAUDE.md#代码结构导航)** - 源码目录结构说明

### 📋 变更日志

- **[v2.1.0](../PROJECT_OVERVIEW.md#v170-→-v210-对比)** - 最新版本特性
- **[v2.0.0 发布说明](changelog/v2.0.0.md)** - v2.0.0 版本发布详情
- **[v1.7.0 → v2.0.0 迁移指南](changelog/migration-v1.7.0-to-v2.0.0.md)** - 版本升级迁移指南

### 📝 实施计划

- **[纯 CLI 模式实施计划](plans/2026-04-21-pure-cli-mode-implementation.md)** - v2.0.0 重构实施详情
- **[重构设计文档](plans/2026-04-21-pure-cli-mode-refactor-design.md)** - v2.0.0 架构设计文档

## 🏗️ 文档结构

```
docs/
├── README.md                    # 文档导航中心（本文件）
├── guides/                      # 用户指南
│   └── testing.md              # 测试指南
├── api/                         # API 文档（预留）
├── development/                 # 开发文档（预留）
├── changelog/                   # 变更日志
│   ├── v2.0.0.md               # v2.0.0 发布说明
│   └── migration-v1.7.0-to-v2.0.0.md  # 迁移指南
└── plans/                       # 实施计划
    ├── 2026-04-21-pure-cli-mode-implementation.md
    └── 2026-04-21-pure-cli-mode-refactor-design.md
```

## 🔍 快速查找

### 按主题查找

**配置和部署**
- [配置说明](../README.md#配置)
- [环境变量](../CLAUDE.md#环境变量)
- [端口说明](../CLAUDE.md#端口说明)

**开发和调试**
- [开发命令](../CLAUDE.md#开发命令)
- [调试与故障排除](../CLAUDE.md#调试与故障排除)
- [测试指南](guides/testing.md)

**架构和设计**
- [核心架构](../CLAUDE.md#核心架构)
- [Gateway 消息协议](../CLAUDE.md#gateway-消息协议)
- [重构设计文档](plans/2026-04-21-pure-cli-mode-refactor-design.md)

### 按角色查找

**新用户**
1. 阅读 [项目主 README](../README.md)
2. 配置环境变量
3. 运行 `npm run dev` 启动开发模式

**开发者**
1. 阅读 [开发指南 (CLAUDE.md)](../CLAUDE.md)
2. 了解 [项目架构](../CLAUDE.md#核心架构)
3. 查看 [测试指南](guides/testing.md)

**贡献者**
1. 熟悉 [开发命令](../CLAUDE.md#开发命令)
2. 遵循 [代码规范](../CLAUDE.md#重要约定)
3. 参考 [实施计划](plans/)

## 📊 版本信息

- **当前版本**: 2.1.0
- **最新发布**: [v2.0.0 发布说明](changelog/v2.0.0.md)
- **迁移指南**: [v1.7.0 → v2.0.0](changelog/migration-v1.7.0-to-v2.0.0.md)

## 🤝 贡献文档

欢迎改进文档！请确保：
1. 使用清晰的 Markdown 格式
2. 保持与现有文档风格一致
3. 更新相关的导航链接

---

**最后更新**: 2026-04-22
**维护者**: QQ-Claude-Proxy Team
