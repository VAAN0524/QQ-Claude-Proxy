# Migration Guide: v1.7.0 → v2.0.0

**Version:** 2.0.0
**Release Date:** 2026-04-21
**Migration Type:** Major simplification

## 📋 Overview

### What Changed?

QQ-Claude-Proxy has been **simplified from a dual-mode architecture to pure CLI mode**:

- **Before (v1.7.0):** Dual-mode system with CLI mode and Simple mode (10+ specialized agents, 29 skills)
- **After (v2.0.0):** Pure CLI mode - direct integration with Claude Code CLI

**Result:** 60-70% code reduction, simplified architecture, easier maintenance.

### Why the Change?

The dual-mode system added complexity without proportional benefit:

- **Two execution paths** made debugging difficult
- **Agent routing logic** was error-prone
- **Skills system** (29 skills) was underutilized
- **Mode switching** confused users
- **60-70% of code** was rarely used features

**Simplification benefits:**
- ✅ Single code path = easier debugging
- ✅ Fewer dependencies = faster installation
- ✅ Direct Claude CLI integration = latest features
- ✅ Simpler documentation = easier onboarding

### Breaking Changes

⚠️ **The following features have been removed:**

- SimpleCoordinatorAgent and Simple mode
- Multi-agent system (10+ specialized agents)
- Skills system (29 skills)
- Mode switching commands (`/mode`, `/模式`)
- Agent management dashboard
- Skills management dashboard
- Intelligent command validation
- Hierarchical memory system (L0/L1/L2)
- Autonomous agent system

✅ **The following features still work:**

- QQ Bot integration (unchanged)
- Claude Code CLI invocation (unchanged)
- Dashboard (simplified, still accessible)
- Task scheduler (unchanged)
- Configuration management (unchanged)
- Log viewing (unchanged)

---

## 🗑️ Removed Features

### Core Architecture

| Component | Description | Impact |
|-----------|-------------|--------|
| **SimpleCoordinatorAgent** | Central coordinator for Simple mode | REMOVED |
| **AgentDispatcher** | Router for 10+ specialized agents | REMOVED |
| **SkillLoader** | Dynamic skill loading system | REMOVED |
| **ModeManager** | Mode switching (CLI/Simple) | REMOVED |

### Specialized Agents (Removed)

All 10+ specialized agents have been removed:

- CodeAgent, BrowserAgent, ShellAgent, ClaudeAgent
- SearchAgent, WebAgent, ImageAgent, VideoAgent
- MemoryAgent, AutonomousAgent
- Agent teams and expert advisors

### Skills System (Removed)

The entire skills system has been removed:

- **29 skills** deleted (code-share, docker-compose, git-essentials, etc.)
- **Skill installation** via URL no longer works
- **Skill management** commands removed
- **`.skill-index.json`** no longer used

### Intelligent Systems (Removed)

| Feature | Description | Impact |
|---------|-------------|--------|
| **Intelligent Command Validation** | Semantic matching and conflict detection | REMOVED |
| **Hierarchical Memory** | L0/L1/L2 memory layers | REMOVED |
| **Autonomous Agent** | Self-learning agent system | REMOVED |
| **Context Analyzer** | Intent recognition and context parsing | REMOVED |

### Dashboard Features (Removed)

| Page | Feature | Status |
|------|---------|--------|
| **Agents** | Agent management and status | REMOVED |
| **Skills** | Skill installation/management | REMOVED |

### Commands (Removed)

```
# Mode switching (REMOVED)
/mode cli
/mode simple
/模式 cli
/模式 简单

# Agent management (REMOVED)
/agents list
/agents status

# Skills management (REMOVED)
/skills list
/skills install <url>
/skills uninstall <name>
/skills enable <name>
/skills disable <name>
```

---

## ✅ Preserved Features

### Core Functionality

✅ **QQ Bot Integration** (unchanged)
- All QQ message types still work
- User/Group message handling unchanged
- Gateway protocol unchanged (WebSocket, port 18789)

✅ **Claude Code CLI Integration** (unchanged)
- Direct invocation of Claude CLI
- All Claude Code features available
- Latest Claude models supported

✅ **Dashboard** (simplified)
- **Monitor** (index.html): Real-time task progress ✅
- **Tasks** (tasks.html): Task scheduler management ✅
- **Config** (config.html): System configuration ✅
- **Logs** (logs.html): Log viewing ✅
- **Agents** (agents.html): ❌ REMOVED
- **Skills** (skills.html): ❌ REMOVED

✅ **Task Scheduler** (unchanged)
- Periodic tasks still work
- Scheduled tasks still work
- Storage format unchanged (`data/tasks.json`)

✅ **Configuration Management** (unchanged)
- `config.json` still works
- Environment variables still work
- `.env` file still supported

✅ **Logging** (unchanged)
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Development logs: `dev.log`

---

## 🔄 Migration Steps

### For Users

#### ✅ Good News: No Action Required!

If you're a regular user sending QQ messages to Claude:

**Nothing changes for you.**

- Your messages still go to Claude CLI
- Claude's responses still work the same
- The dashboard still works (simplified)
- Task scheduling still works

**What you might notice:**
- Some commands no longer work (see "Command Changes" below)
- Dashboard has fewer pages (Agents/Skills removed)
- System might be slightly faster (less overhead)

#### Optional: Update Configuration

If you had mode preferences configured:

```bash
# Remove obsolete configuration files (optional)
rm -f data/mode.json
rm -f config/intelligent.json
```

### For Developers

#### 1. Update Imports

If you were importing removed components:

```typescript
// ❌ REMOVED - Don't use these imports
import { SimpleCoordinatorAgent } from './agents/SimpleCoordinatorAgent.js';
import { AgentDispatcher } from './agents/AgentDispatcher.js';
import { SkillLoader } from './agents/SkillLoader.js';
import { ModeManager } from './managers/ModeManager.js';

// ✅ CORRECT - Use the main gateway
import { QQGateway } from './channels/qqbot/gateway.js';
import { ClaudeCodeInvoker } from './agent/claude-code.js';
```

#### 2. Remove Agent-Specific Code

If you had code that relied on specific agents:

```typescript
// ❌ REMOVED - Agent dispatching
const agent = dispatcher.selectAgent('code');
const response = await agent.process(message);

// ✅ CORRECT - Direct Claude CLI invocation
const response = await claudeInvoker.execute(message);
```

#### 3. Update Dashboard API Calls

If you were using removed dashboard APIs:

```typescript
// ❌ REMOVED - Agent management
fetch('/api/agents')
fetch('/api/agents/:id/status')

// ❌ REMOVED - Skills management
fetch('/api/skills')
fetch('/api/skills/install')

// ✅ CORRECT - Use available APIs
fetch('/api/tasks')      // Task management
fetch('/api/config')     // Configuration
fetch('/api/logs')       // Logs
```

#### 4. Remove Skill Dependencies

If you were developing or using skills:

```bash
# Remove skill-related code
rm -rf skills/
rm -f .skill-index.json

# Update imports that reference skills
# Remove any skill installation scripts
```

### Configuration Changes

#### Remove Obsolete Files

```bash
# Optional: Remove configuration files for removed features
rm -f data/mode.json              # Mode storage (no longer needed)
rm -f config/intelligent.json     # Intelligent validation config (removed)
```

#### Keep Working Files

```bash
# ✅ KEEP - These still work
config.json                      # Main configuration
.env                            # Environment variables
data/tasks.json                 # Task scheduler data
data/sessions/*.json            # User sessions
```

#### Environment Variables (Unchanged)

No changes needed to environment variables:

```bash
# ✅ Still required
QQ_BOT_APP_ID=your_app_id
QQ_BOT_SECRET=your_secret

# ✅ Still optional
ANTHROPIC_API_KEY=your_key      # For Claude API
TAVILY_API_KEY=your_key         # For search (if used)
HTTP_PROXY=http://proxy:port    # For network proxy
```

---

## 📝 Command Changes

### Removed Commands

| Command | Used For | Status |
|---------|----------|--------|
| `/mode cli` | Switch to CLI mode | ❌ REMOVED |
| `/mode simple` | Switch to Simple mode | ❌ REMOVED |
| `/模式 cli` | Switch to CLI mode (Chinese) | ❌ REMOVED |
| `/模式 简单` | Switch to Simple mode (Chinese) | ❌ REMOVED |
| `/agents list` | List all agents | ❌ REMOVED |
| `/agents status` | Check agent status | ❌ REMOVED |
| `/skills list` | List installed skills | ❌ REMOVED |
| `/skills install <url>` | Install a skill | ❌ REMOVED |
| `/skills uninstall <name>` | Uninstall a skill | ❌ REMOVED |
| `/skills enable <name>` | Enable a skill | ❌ REMOVED |
| `/skills disable <name>` | Disable a skill | ❌ REMOVED |

### Still Working

| Command | Function | Status |
|---------|----------|--------|
| **Regular messages** | Go directly to Claude CLI | ✅ WORKS |
| `/help` | Show help (if implemented) | ✅ WORKS |
| Dashboard commands | Via HTTP API | ✅ WORKS |

### Example: Before vs After

#### Before (v1.7.0)

```bash
# User could switch modes
/mode simple

# Then use agent-specific features
/agents list
/skills list

# Send regular message
Hello Claude, help me with Python

# Switch back to CLI mode
/mode cli
```

#### After (v2.0.0)

```bash
# Everything goes directly to Claude CLI
Hello Claude, help me with Python

# That's it! No mode switching needed.
```

---

## 🔄 Rollback Plan

If you encounter issues with v2.0.0, you can easily roll back to v1.7.0.

### Backup First

```bash
# Create a backup of your current state
cp -r . bot-backup-v200/
cp -r data/ bot-backup-v200/data
cp -r logs/ bot-backup-v200/logs
cp .env bot-backup-v200/.env  # If you have one
```

### Rollback Steps

```bash
# 1. Stop the current version
npm run watchdog:stop  # If running as service
# Or kill the process manually

# 2. Checkout v1.7.0
git checkout v1.7.0

# 3. Restore dependencies (if needed)
rm -rf node_modules/
npm install

# 4. Restore configuration (if modified)
cp bot-backup-v200/.env .

# 5. Start v1.7.0
npm run dev:win        # Windows
# or
npm run dev            # Unix/Mac

# 6. Verify functionality
# Check dashboard: http://localhost:8080
# Send test message via QQ
```

### Rollback Verification

```bash
# Check that you're on v1.7.0
git log -1 --oneline
# Should show: 41af844 feat: LLM 智能意图识别 + README 重构

# Check that mode switching works
# Send via QQ: /mode simple
# Should respond with mode change confirmation

# Check that agents are available
# Send via QQ: /agents list
# Should show list of agents
```

### Report Issues

If you need to roll back, please report the issue:

1. Document what broke
2. Share error logs from `logs/error.log`
3. Create an issue on GitHub with:
   - Version: v2.0.0
   - OS: Windows/Linux/Mac
   - Node version: `node --version`
   - Steps to reproduce
   - Expected vs actual behavior

---

## ❓ FAQ

### General Questions

**Q: Will my messages still work?**
A: Yes! All regular QQ messages work exactly the same. They go directly to Claude CLI now, which is simpler and faster.

**Q: Do I need to change anything?**
A: No action required for basic usage. Just keep using the system as before.

**Q: Why was this change made?**
A: The dual-mode system was too complex (60-70% of the code was rarely used). Simplifying to pure CLI mode makes the system easier to maintain and debug.

**Q: Is v2.0.0 better or worse than v1.7.0?**
A: It's simpler and more focused. If you didn't use specialized agents or skills, you won't notice any difference except things might be slightly faster.

### Feature-Specific Questions

**Q: What happened to Simple mode?**
A: Simple mode has been removed. All messages now go directly to Claude CLI (what was previously "CLI mode").

**Q: Can I still use skills?**
A: No, the skills system has been removed. If you need specific functionality, it should be integrated into Claude Code CLI directly or used as a separate tool.

**Q: What happened to intelligent command validation?**
A: Removed. If you were relying on this, you'll need to implement validation in your own layer or be more explicit in your commands.

**Q: Can I still manage agents via the dashboard?**
A: No, the Agents and Skills dashboard pages have been removed. The remaining pages (Monitor, Tasks, Config, Logs) still work.

**Q: What happened to the hierarchical memory system?**
A: Removed. Claude Code CLI has its own context management, which is now used directly.

### Developer Questions

**Q: I was developing a custom skill. What should I do?**
A: Skills are no longer supported. Consider:
1. Contributing to Claude Code CLI directly
2. Creating a separate tool/CLI
3. Implementing the functionality as a standalone service

**Q: How do I get agent-specific behavior now?**
A: Use Claude Code CLI's built-in capabilities or invoke specialized tools directly. The multi-agent system is no longer available.

**Q: Can I still extend the system?**
A: Yes, but extension points are now different:
- **Before:** Create agents, create skills
- **Now:** Extend Claude Code CLI, add middleware, create separate tools

### Technical Questions

**Q: What about the code reduction?**
A: The codebase was reduced by 60-70% by removing the Simple mode infrastructure (agents, skills, intelligent systems, etc.).

**Q: Is the WebSocket protocol still the same?**
A: Yes, the Gateway protocol (port 18789) is unchanged. QQ Bot integration works exactly as before.

**Q: What about my scheduled tasks?**
A: Task scheduler is unchanged. Your tasks in `data/tasks.json` will continue to work.

**Q: Do I need to update my configuration?**
A: Only optionally remove `data/mode.json` and `config/intelligent.json` if they exist. Everything else works as before.

### Migration Questions

**Q: How long will v1.7.0 be supported?**
A: There's no formal LTS plan, but you can roll back to v1.7.0 anytime using git.

**Q: Will there be a v2.1.0 with more features?**
A: Future releases will focus on stability and core functionality improvements, not re-adding the removed complexity.

**Q: Can I migrate my custom agents to v2.0.0?**
A: No, the agent system has been completely removed. Consider integrating your functionality directly with Claude Code CLI or as a separate service.

---

## 📊 Summary

| Aspect | v1.7.0 | v2.0.0 |
|--------|-------|-------|
| **Architecture** | Dual-mode (CLI + Simple) | Pure CLI |
| **Code Size** | Large (10k+ lines) | Small (3-4k lines) |
| **Agents** | 10+ specialized agents | None (direct CLI) |
| **Skills** | 29 skills | None |
| **Modes** | CLI / Simple | CLI only |
| **Complexity** | High | Low |
| **Maintenance** | Complex | Simple |
| **User Action Required** | - | None ✅ |

---

## 🎯 Quick Reference

### For Users

- ✅ **Keep doing what you're doing** - messages work the same
- ❌ **Don't use removed commands** - `/mode`, `/agents`, `/skills`
- ✅ **Dashboard still works** - but has fewer pages

### For Developers

- ✅ **Update imports** - remove references to removed components
- ✅ **Remove agent-specific code** - use direct CLI invocation
- ✅ **Update dashboard calls** - use available APIs only
- ✅ **Remove skill dependencies** - skills system is gone

### For Everyone

- 📖 **Read this guide** - understand what changed
- 💾 **Backup before upgrade** - safe rollback if needed
- 🐛 **Report issues** - help improve v2.0.0

---

## 📞 Support

If you need help with the migration:

1. **Check this guide** - most questions are answered here
2. **Review the logs** - `logs/error.log` for errors
3. **Roll back to v1.7.0** - if you encounter critical issues
4. **Report bugs** - create an issue on GitHub with details

---

**Last Updated:** 2026-04-21
**Document Version:** 1.0
**For Version:** QQ-Claude-Proxy v2.0.0
