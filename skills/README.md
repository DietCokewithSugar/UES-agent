# Skills 目录（用户研究技能）

本目录存放「AI 研究助手」使用的**用户研究技能**，遵循
[Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills) 约定：每个技能一个文件夹，
入口是带 YAML 前置元数据的 `SKILL.md`。

技能由 `services/skills/skillRegistry.ts` 在**构建期**通过 Vite `import.meta.glob` 自动打包、解析，
无需任何后端或运行时文件系统。

## 已安装技能

| 技能 | 角色 | 说明 |
|------|------|------|
| `ux-kit` | process | 一句话产出用户研究材料：输出模式识别 → 问题澄清 → 按模式产出（问卷 / 访谈提纲 / 可用性测试方案 / 研究方案） |

`ux-kit` 是一个「合一」技能——方法路由发生在技能**内部**（Phase 0 的产物词判定表），
不再由前端按方法分类去匹配不同技能。

## ux-kit 的流程与代码的对应关系

```
用户一句话
   ↓
Phase 0 输出模式识别                    ─┐
   ↓                                     ├─ services/uxkit/uxkitOrchestrator.ts
Phase 1 问题澄清（多轮多选，≤5 轮）      ─┘   runControlTurn()：非流式 + json_object
   ↓                                          注入 SKILL.md 正文 + references/question-templates.md
研究问题陈述 → 用户确认                        ↳ 界面上是 IntentCard（意图确认卡）
   ↓
Phase 2 按模式产出                       ── runGenerateTurn()：流式 + 纯 markdown
   ├─ 2A 问卷     → templates/questionnaire.md
   ├─ 2B 提纲     → templates/interview-guide.md
   ├─ 2C 可用性   → templates/usability-test.md
   └─ 2D 方案     → templates/research-plan.md → 确认 → 按阶段生成材料
   ↓
Markdown → services/markdown/parseMarkdown.ts → services/docx/blocksToDocx.ts → .docx
```

**用户明确指定了产出物时（"我要编一个 XX 问卷"）走 2A/2B/2C，没有研究方案这一步。**
这条不只靠提示词约束——`services/uxkit/normalize.ts` 会以 `mode` 为准强制对齐 `deliverables`。

## 参考文件的按需注入

`ux-kit/references/` 一共 15 个文件、约 7 万字，全量注入会撑爆上下文。
`services/uxkit/referencePicker.ts` 按「模板 → 基础参考 → 方法信号命中的参考 → 质量清单」
的优先级挑选，并有两道护栏：命中参考最多 4 个（对齐 SKILL.md 的「阶段数 ≤ 4」）、
总字符数不超过 45000。**实际注入了哪些文件会原样显示在界面的技能调用轨迹上。**

## 目录结构

```
skills/
  <skill-id>/                 # 文件夹名即技能 id
    SKILL.md                  # 必需：前置元数据 + 正文
    references/               # 可选：详细方法论、模型（打包进前端）
      *.md
    templates/                # 可选：产出物骨架（打包进前端）
      *.md
    scripts/                  # 可选：脚本（**不打包**，浏览器端跑不了）
    evals/                    # 可选：评测用例（**不打包**）
```

> `ux-kit/scripts/convert_to_docx.py` 不会进前端包，但它是 `services/markdown/parseMarkdown.ts`
> 与 `services/docx/blocksToDocx.ts` 的移植来源与权威规格——改动 docx 排版规则时以它为准。

## SKILL.md 前置元数据

```yaml
---
name: ux-kit                         # 技能展示名（缺省回退到文件夹名）
description: >                       # 是什么 / 何时用
  一句话自动产出用户研究所需材料……
role: process                        # 可选：process（自身驱动一整条流程）或 method（缺省）
methodCategories: []                 # 可选：服务的研究方法分类
keywords: []                         # 可选：模糊匹配关键词
---
```

## 新增一个技能

1. 在 `skills/` 下新建文件夹，写好 `SKILL.md`，按需补 `references/` / `templates/`。
2. 注册表会自动发现它，`getSkill('<id>')` 即可取用。

注意：注册表只负责**加载**技能，不负责编排。新技能要接入对话流程，
需要在 `services/uxkit/` 下写对应的编排逻辑（现有的编排层是为 ux-kit 的 Phase 0/1/2 定制的）。
