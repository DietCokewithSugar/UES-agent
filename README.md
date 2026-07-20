# AI 用户体验评测框架（Pluggable UX Evaluation Framework）

本项目已从单一 ETS 评估页面升级为可扩展的 **AI 用户体验评测框架**。  
核心目标：让不同业务场景、不同评测体系、不同角色画像都能在同一套工作流中灵活组合。

## 核心能力

- **业务场景建模**
  - 支持手动填写：行业、产品类型、评测目标、关键任务、痛点、成功标准、约束。
  - 支持 AI 从上传素材（截图/流程/视频）提炼场景并回填。

- **可插拔评测体系**
  - 内置：`ETS` / `HEART` / `SUS-Lite` / `UEQ-Lite`
  - 支持导入自定义评测体系 JSON（运行时校验）
  - 不同评测体系可配置不同维度与可视化方式

- **角色体系**
  - 保留预设角色 + 自定义角色（新建/导入）
  - 新增 AI 推荐角色（可推荐已有角色或新角色草案）

- **报告与导出**
  - 多角色并行分析，支持单角色报告 + 综合报告
  - 支持当前报告 PNG 导出与批量 ZIP 导出
  - 可选生成“AI 优化效果图”（视频模式下禁用）

- **AI 体验伙伴（新）**
  - 由 DeepSeek 驱动，引导非专业人员完成一次完整的用户研究设计
  - 四步对话流程：收集需求 → 澄清并转化研究问题 → 推荐研究方案 → 生成执行指南
  - 每个阶段当 AI 理解存在歧义时，会给出 2-6 个可多选的方向选项 + 自定义补充 / 跳过校准，降低偏差；
    研究问题阶段按 problem-clarifier 技能的五维度（方向/动机/人群/范围/约束）多轮澄清收敛
  - 自动生成访谈/调研提纲（含模块组织方法标注与探询指南）、用户配额、筛选标准、执行注意事项与 CSV 记录模板
  - 完成线下调研后可继续上传访谈记录（.txt/.md/.csv/.docx/.pdf），由 AI 输出结构化研究报告
  - **可插拔研究技能（Skills）**：`skills/` 目录下按 [Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills)
    约定存放技能（每个技能一个文件夹 + `SKILL.md`），来源均为 [github.com/Evelyn32/skills](https://github.com/Evelyn32/skills)。
    技能分两类角色：**流程技能**（`problem-clarifier` 驱动研究问题澄清、`research-plan-generator` 驱动研究方案设计，
    由对应阶段显式注入）与**方法技能**（`interview-guide-generator` 访谈提纲、`questionnaire-generator` 问卷编制，
    进入方法目录并在执行指南阶段按所选方法自动路由注入）。`services/skills/skillRegistry.ts`
    在构建期自动加载全部技能；新增研究方法只需往 `skills/` 放一个技能文件夹，无需改代码。
    详见 [`skills/README.md`](./skills/README.md)。

---

## 本地运行

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

在项目根目录创建/编辑 `.env.local`：

```bash
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
DEEPSEEK_API_KEY=your_deepseek_key
# 可选，默认 https://api.deepseek.com
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
```

> 仅使用 Google Provider 时，`OPENROUTER_API_KEY` 可留空。
> `DEEPSEEK_API_KEY` 仅用于"AI 体验伙伴"功能，未配置时其他评测功能不受影响。

### 3) 启动开发环境

```bash
npm run dev
```

默认地址：`http://localhost:3000`

> 应用默认先进入落地页，点击「开始评测」进入评测配置流程。

### 4) 生产构建

```bash
npm run build
```

---

## 自定义评测体系 JSON 说明

你可点击页面内“下载体系模板”，也可参考以下结构：

```json
{
  "name": "行业自定义评测体系",
  "description": "按业务场景定义的灵活评测体系",
  "scoreRange": { "min": 0, "max": 100 },
  "visualization": { "primaryChart": "radar" },
  "dimensions": [
    {
      "name": "业务目标达成",
      "definition": "关键业务目标是否能够被清晰、稳定、高效地达成",
      "weight": 0.35
    }
  ],
  "reportSections": [
    { "title": "业务风险摘要", "type": "list" }
  ],
  "promptGuidelines": "请严格基于上述维度给出评分、问题定位和改进建议。"
}
```

### 字段约束（关键）

- `name`: 必填
- `dimensions`: 必填且非空，每项至少要有 `name`
- `scoreRange.max` 必须大于 `scoreRange.min`
- `visualization.primaryChart` 支持：`radar | bar | mixed | cards`

---

## 技术栈

- React 19 + TypeScript + Vite
- Google Gemini / OpenRouter（前端直连）
- Recharts（图表）
- html-to-image + JSZip + file-saver（导出）
