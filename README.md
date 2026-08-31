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

- **AI 研究助手（对话式技能调用）**
  - 由 DeepSeek 驱动，把 `skills/ux-kit` 技能"套壳"成一场对话
  - 流程：AI 先对照技能判断信息是否充分；仅在关键缺口时追问 → 归纳意图请你确认 → 产出 **.docx**
  - **两条分支**（由技能 Phase 0 的判定逻辑决定）：
    - 明确说了要问卷 / 访谈提纲 / 可用性评估方案 → 确认后**直接产出那份材料，没有研究方案这一步**
    - 诉求模糊或涉及多种材料 → 先产出研究方案，确认方案后再按阶段生成材料
  - 产出材料后可一键「去做分析」，带着研究背景跳到分析助手

- **AI 分析助手（新）**
  - 由 DeepSeek 驱动，调用 `skills/ux-analysis` 技能：数据回来之后的分析
  - **支持上传数据文件**：xlsx / csv / txt / md / docx / pdf，以及**图片**（眼动热区图等）
    - 国内问卷平台常见的 GBK/GB2312/GB18030 编码会自动识别并转码，不会乱码
    - 图片走 DeepSeek 的视觉模型（`DEEPSEEK_VISION_MODEL`），文本模型不接受图片输入
  - 带技能的自适应 AI chatbot：资料齐全直接分析，仅在关键缺口或高影响歧义时确认
  - 按研究主题（而不是按数据源）组织分析，多源三角验证并标注结论可信度
  - 产出 .docx 分析结论，含核心结论三段式、表格与图表（bar/line/pie/scatter/funnel/radar）

- **两个入口共用的对话能力**
  - **两种交互卡片**：
    - *意图澄清卡* —— 多选/单选选项（竖排，一行一个）+ 自定义补充 + 跳过兜底
    - *意图确认卡 / 提案卡* —— 在确需确认时归纳 AI 的理解或关键判断
    - *需求记忆卡* —— 从研究助手跳到分析助手时，可视化展示带入的精简需求上下文
  - **上下文按窗口隔离**：开新对话没有记忆；从历史记录回到旧对话，接着聊时带着完整上下文。
    两个入口的历史各自独立，互不可见
  - Claude Code 风格的**技能调用轨迹**：这一步调了哪个技能、处在哪个阶段、
    实际读了技能目录下的哪些 `templates/` 与 `references/` 文件
  - 产出正文流式输出；.docx 在浏览器端生成（全文微软雅黑、标题深蓝、表格带框线）
  - **可插拔研究技能（Skills）**：`skills/` 目录下按 [Anthropic Agent Skills](https://www.anthropic.com/news/agent-skills)
    约定存放技能，`services/skills/skillRegistry.ts` 在构建期自动加载。
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
DEEPSEEK_API_KEY=your_deepseek_key
# 可选，默认 https://api.deepseek.com
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
# 可选，上传图片时用；留空则用默认视觉模型
DEEPSEEK_VISION_MODEL=
```

> **全站只用 DeepSeek**，没有可切换的模型来源，`DEEPSEEK_API_KEY` 是唯一必填项。
> `DEEPSEEK_VISION_MODEL` 在多模态体验评测上传界面截图、分析助手上传图片时都会用到，
> 留空则用默认值；如果你账号里的视觉模型名不同，在这里换掉即可，不用改代码。

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
- DeepSeek（前端直连，全站唯一模型来源；截图走视觉模型，对话产出走流式）
- Recharts（图表）
- html-to-image + JSZip + file-saver（导出）
- docx（浏览器端生成 Word 文档）
- mammoth / pdfjs-dist / read-excel-file（读取上传的 docx / pdf / xlsx）
