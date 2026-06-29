# Skills 目录（研究方法技能）

本目录存放 "AI 体验伙伴"（AI Experience Companion）功能使用的**研究方法技能**，遵循
[Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills) 约定：每个技能一个文件夹，
入口是带 YAML 前置元数据的 `SKILL.md`。

技能由 `services/skills/skillRegistry.ts` 在**构建期**通过 Vite `import.meta.glob` 自动打包、解析，
无需任何后端或运行时文件系统。

## 体验伙伴如何调用技能

体验伙伴的三大流程与技能的对应关系：

1. **收集用户信息**（收集需求）— 不涉及技能。
2. **选择合适的研究方法**（研究方案）— 用所有技能的 `name` + `description` 拼成"技能目录"，
   告诉 AI 当前装了哪些研究方法、分别**何时使用**（`buildSkillCatalog`）。
3. **设计具体研究方法**（执行指南）— 根据已选方法解析出对应技能
   （`findSkillForMethod`），把该技能完整的 `SKILL.md` 正文 + `references/` 注入提示词，
   驱动**详细设计**（`buildSkillKnowledge`）。组合方案中每个子方法各自解析一个技能，
   技能内部对 `references/` 的引用即"相互调用"。

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
description: >                        # 是什么 / 何时用，进入"技能目录"供流程二选型
  自动生成完整、专业、科学的调查问卷……
methodCategories:                    # 可选：该技能服务的研究方法分类，用于精确路由
  - survey                           #   取值与 deepseekService 的 ResearchMethodCategory 对齐
keywords:                            # 可选：方法名模糊匹配关键词
  - 问卷
  - 调查
  - questionnaire
---
```

`methodCategories` 与 `keywords` 都是可选的：

- 命中 `methodCategories` → 精确匹配（推荐为新技能填写）。
- 否则在"方法名 + 分类"文本里模糊匹配 `keywords` / `name` / 文件夹 id。

## 新增一个研究方法技能

1. 在 `skills/` 下新建文件夹，例如 `user-interview/`。
2. 写 `SKILL.md`，填好 `name` / `description`，并按需补 `methodCategories` / `keywords` /
   `references/`。
3. 完成。无需改动任何代码——注册表会自动发现，流程二的目录与流程三的设计都会带上它。

## 已安装技能

- `questionnaire-generator` — 问卷调查（survey）。来源：
  [github.com/Evelyn32/skills](https://github.com/Evelyn32/skills)。
