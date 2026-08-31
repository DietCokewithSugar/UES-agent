# Skills 目录（用户研究技能）

本目录存放两个对话式入口使用的**用户研究技能**，遵循
[Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills) 约定：每个技能一个文件夹，
入口是带 YAML 前置元数据的 `SKILL.md`。

技能由 `services/skills/skillRegistry.ts` 在**构建期**通过 Vite `import.meta.glob` 自动打包、解析，
无需任何后端或运行时文件系统。

## 已安装技能

| 技能 | 角色 | 入口 | 说明 |
|------|------|------|------|
| `ux-kit` | process | AI 研究助手 | 一句话产出用户研究材料：输出模式识别 → 问题澄清 → 按模式产出（问卷 / 访谈提纲 / 可用性评估方案 / 研究方案） |
| `ux-analysis` | process | AI 分析助手 | 数据回来之后的分析：自适应流程 + 两道固定确认门禁（分析执行方案 → 分析摘要），多源三角验证 → Word 分析结论 |

两者是一条研究链路的上下游：ux-kit 设计研究材料，ux-analysis 分析回收的数据。
研究助手产出材料后会给一个「去做分析」入口，把研究背景带进分析助手的新会话
（对应 ux-analysis SKILL.md 的「研究材料已由 ux-kit 带入时，节点 1/2 自动填充」）。

两个技能都是「合一」技能——方法路由发生在技能**内部**，不由前端按方法分类去匹配。

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

## ux-analysis 的流程与代码的对应关系

```
用户诉求 + 上传数据
   ↓
Step 1 研究背景录入 / 研究类型确认   ─┐
Step 2 数据上传与识别                ├─ services/agents/uxAnalysisAgent.ts
Step 3 分析执行方案 ★门禁①           │   runControlTurn()：非流式 + json_object
Step 4 分析执行 + 主题聚类           │   注入 SKILL.md + research_types.md + frameworks.md
Step 5 分析摘要审查 ★门禁②          ─┘   其余节点条件性触发，不为凑流程弹卡
   ↓
Step 6 分析结论生成 ── runGenerateTurn()：流式 + analysis.json
   ↓
analysis.json → services/analysis/parseAnalysisJson.ts → services/docx/blocksToDocx.ts（analysis 主题）
图表 → services/analysis/chartRenderer.ts（canvas 画 6 种图 → PNG → 嵌入 docx）
```

**流程写在 SKILL.md 里，不写在 TS 里**：控制轮把技能正文 + 当前对话 + 数据清单交给模型，
让它判断走到哪一步；代码只提供动作词汇表（ask / propose / request_files / generate / done）。
技能改了流程，`uxAnalysisAgent.ts` 不用动。

**例外是两道固定门禁**：★ 那两步不能只靠提示词——`uxAnalysisAgent.ts` 里有确定性门禁，
`analysis_plan` 与 `insight_review` 两张卡都被用户确认之前，`generate` 一律拦下并要求模型补上对应的卡。
门禁读的是 `Proposal.purpose`（不是标题），所以新增一道门禁要同时改：SKILL.md、`types.ts` 的 purpose 取值、
`normalizeAction.ts` 的识别、`uxAnalysisAgent.ts` 的门禁与提示词、以及 `SkillChat.tsx` 里收集
`confirmedProposalPurposes` 的那段。

## 参考文件的按需注入

两个技能的 references 加起来都是几万字，全量注入会撑爆上下文，所以都按需挑选：

- **ux-kit**：`services/uxkit/referencePicker.ts` 按「模板 → 基础参考 → 方法信号命中的参考 → 质量清单」
  排序，命中参考最多 4 个（对齐 SKILL.md 的「阶段数 ≤ 4」）、总字符数不超过 45000。
- **ux-analysis**：控制轮只注入 `research_types.md` + `frameworks.md`（够做 Step 1/3 的判定）；
  产出轮按实际数据类型注入对应的分析引擎（questionnaire / interview / analytics /
  usability / eyetracking / user_voice）+ `synthesis.md` + `analysis_template.md`，同样有 45000 字符预算。

**两处实际注入了哪些文件，都会原样显示在界面的技能调用轨迹上。**

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

> `scripts/` 下的 Python 不会进前端包，但它们是排版规则的权威规格，改 docx 样式时以它们为准：
> - `ux-kit/scripts/convert_to_docx.py` → `services/markdown/parseMarkdown.ts` + `blocksToDocx.ts`（uxkit 主题）
> - `ux-analysis/scripts/analysis_builder.py` → `services/analysis/parseAnalysisJson.ts` +
>   `chartRenderer.ts` + `blocksToDocx.ts`（analysis 主题）；同目录的 `analysis_example.docx` 是排版比对基准。

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

> `role: process` 是**站点侧**加的一行：上游技能包（ux-kit 1.4.1 的 zip）里没有它，
> 但注册表靠它区分流程技能与方法技能。从上游重新同步 `skills/ux-kit/` 时记得把这行补回去。

## 新增一个技能

1. 在 `skills/` 下新建文件夹，写好 `SKILL.md`，按需补 `references/` / `templates/`。
2. 注册表会自动发现它，`getSkill('<id>')` 即可取用。

注意：注册表只负责**加载**技能，不负责编排。新技能要接入对话流程，还需要在
`services/agents/` 下加一个 `AgentDefinition`（参考 `uxAnalysisAgent.ts`）并注册进
`registry.ts`——聊天外壳 `components/SkillChat.tsx` 是通用的，不用改。
