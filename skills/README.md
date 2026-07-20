# Skills 目录（用户研究技能）

本目录存放 "AI 体验伙伴"（AI Experience Companion）功能使用的**用户研究技能**，遵循
[Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills) 约定：每个技能一个文件夹，
入口是带 YAML 前置元数据的 `SKILL.md`。技能内容来源：
[github.com/Evelyn32/skills](https://github.com/Evelyn32/skills)。

技能由 `services/skills/skillRegistry.ts` 在**构建期**通过 Vite `import.meta.glob` 自动打包、解析，
无需任何后端或运行时文件系统。

## 技能的两类角色（前置元数据 `role`，缺省 `method`）

- **`role: method` 研究方法技能** —— 服务某种具体研究方法（问卷、访谈…）。
  仅在流程「执行指南」按所选方法路由命中（`findSkillForMethod`），
  完整正文 + references 注入提示词（`buildSkillKnowledge`）。
- **`role: process` 流程技能** —— 服务体验伙伴的某个流程阶段本身（问题澄清、方案设计方法论）。
  不参与方法路由，由 `deepseekService` 通过 `getSkill(id)` 显式注入对应阶段。

## 阶段隔离（核心约定）

**一个阶段只注入一个技能，技能之间互不注入、互不引用**：

- 注入正文时自动剥离技能文档中的「与上下游技能协作」章节（`skillRegistry.ts` 的
  `stripCollaborationSections`，仅影响注入内容，`skills/` 源文件保持原样）。
- 各阶段提示词均带隔离声明：技能文档中点名的其他技能只是流程分工说明，
  其方法、术语、标签（如 CBA、ORID）不得进入本阶段输出。
- 执行指南阶段按方法类型分叉提示词：访谈类才有铺垫/追问设计与探询指南；
  问卷类只有板块与选项，禁止访谈概念。
- 方法名称标签（CBA、JTBD、旅程回溯、卡片分类任务等）只存在于注入给模型的方法论中，
  用于组织题目顺序与措辞，**不会出现在输出结果与界面上**。

## 体验伙伴流水线与技能的对应关系

```
阶段2 研究问题  ← problem-clarifier（process）
                  五维度缺口驱动的多轮多选澄清，产出"研究问题陈述"
阶段3 研究方案  ← research-plan-generator（process，两段式注入）
                  第一段注入 SKILL.md 正文做层级式方法匹配（采集方式→嵌入技术→合并阶段）；
                  第二段按命中方法注入对应 references 细化样本量/配额/研究内容概览
阶段4 执行指南  ← findSkillForMethod（仅 role=method，本阶段唯一注入方法技能的地方）
                  ├─ interview → interview-guide-generator（模块化编题 + 探询指南，输出不带方法标签）
                  └─ survey    → questionnaire-generator（问卷骨架 + Kano/ETS 模型 + 选项设计）
                  其余方法类别（如 desk_research、独立卡片分类的 other）暂无方法技能，
                  回退到通用执行指南提示词
```

组合方案中每个子方法各自解析一个技能；技能内部对自身 `references/` 的引用即"相互调用"（仅限技能自身目录内）。

## 目录结构

```
skills/
  <skill-id>/                 # 文件夹名即技能 id
    SKILL.md                  # 必需：前置元数据 + 正文
    references/               # 可选：详细方法论、模型、模板
      *.md
    scripts/                  # 可选：脚本（浏览器端不执行，仅作为知识/产物参考）
    evals/                    # 可选：评测用例
```

## SKILL.md 前置元数据

```yaml
---
name: questionnaire-generator        # 技能展示名（缺省回退到文件夹名）
description: >                        # 是什么 / 何时用，进入"技能目录"供方案阶段选型
  自动生成完整、专业、科学的调查问卷……
role: method                         # 可选：method（缺省）或 process
methodCategories:                    # 可选（method 技能）：服务的研究方法分类，用于精确路由
  - survey                           #   取值与 deepseekService 的 ResearchMethodCategory 对齐
keywords:                            # 可选（method 技能）：方法名模糊匹配关键词
  - 问卷
  - 调查
  - questionnaire
---
```

方法路由规则（仅 `role=method` 技能参与）：

- 命中 `methodCategories` → 精确匹配（推荐为新技能填写）。
- 否则在"方法名 + 分类"文本里模糊匹配 `keywords` / `name` / 文件夹 id。

## 新增一个研究方法技能

1. 在 `skills/` 下新建文件夹，例如 `usability-test-guide/`。
2. 写 `SKILL.md`，填好 `name` / `description`，并按需补 `methodCategories` / `keywords` /
   `references/`。
3. 完成。无需改动任何代码——注册表会自动发现，方案阶段的目录与执行指南阶段的设计都会带上它。

## 已安装技能

| 技能 | 角色 | 服务阶段 | 说明 |
|------|------|---------|------|
| `problem-clarifier` | process | 阶段2 研究问题 | 把模糊诉求澄清为"研究问题陈述"（对象+人群+意图），五维度多轮多选 |
| `research-plan-generator` | process | 阶段3 研究方案 | 层级式方法匹配 + 研究内容概览 + 样本量/配额设计，11 个方法参考文件 |
| `interview-guide-generator` | method（interview） | 阶段4 执行指南 | 访谈提纲：模块组织方法（CBA/JTBD/旅程回溯/卡片分类）+ 禁忌题目 + 探询指南 |
| `questionnaire-generator` | method（survey） | 阶段4 执行指南 | 问卷编制：设计模式识别 + Kano / ETS-U / ETS-E 模型 + 题项规范 |
