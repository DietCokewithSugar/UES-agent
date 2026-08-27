# 无 Python 环境：HTML+SVG 分析结论模板

> 本文件为用户研究分析结论技能的参考模块，在环境**无法运行 Python 生成 .docx**时（失败处理 P3）读取使用。
> 输出一个自包含、零依赖的 `.html` 文件，浏览器可直接打开，Word 可直接打开另存为 .docx，或打印为 PDF。

## 适用时机

- 运行环境无 Python（`python --version` / `py --version` 均失败）
- 或 Python 缺依赖且无法安装（无网络/无权限）

## 核心原则

- **单文件**：HTML + 内联 CSS + 内联 SVG，全部写在一个 `.html` 里，不引用外部资源（否则离线打不开）
- **编码**：文件保存为 UTF-8，`<meta charset="utf-8">`
- **图表用 SVG 手绘**：无需 matplotlib 等任何图表库，用 `<svg>` 标签 + `<rect>/<line>/<circle>/<path>/<text>` 手工画
- **结构**：沿用 `references/analysis_template.md` 的半结构化骨架（研究概述 / 核心结论 / 行动建议，可选对比矩阵、图表等模块，无附录）
- **排版规范**：与 `references/analysis_template.md` 的"排版格式规范"一致——正文段落 `text-indent: 2em` 段首空两格；核心结论三段式（一句话结论加粗 / 关键数据逐条 `<li>` 无悬挂缩进 / 结论可信度与原因解读合并一段、前者在前）；行动建议用 `<ul>` 逐条展示不用表格

## SVG 图表速查（零依赖）

### 柱状图（bar）
```html
<svg width="420" height="240">
  <!-- 坐标轴 -->
  <line x1="60" y1="20" x2="60" y2="200" stroke="#999"/>
  <line x1="60" y1="200" x2="410" y2="200" stroke="#999"/>
  <!-- 柱子：y = 200 - 值×比例 -->
  <rect x="80"  y="120" width="50" height="80"  fill="#1F4E79"/>
  <rect x="160" y="60"  width="50" height="140" fill="#1F4E79"/>
  <rect x="240" y="100" width="50" height="100" fill="#1F4E79"/>
  <text x="95"  y="215" font-size="12">注册</text>
  <text x="175" y="215" font-size="12">登录</text>
  <text x="255" y="215" font-size="12">转账</text>
</svg>
```

### 折线图（line）
```html
<svg width="420" height="200">
  <polyline points="60,160 150,120 240,90 330,50" fill="none" stroke="#1F4E79" stroke-width="2"/>
  <circle cx="60" cy="160" r="4" fill="#1F4E79"/><circle cx="150" cy="120" r="4" fill="#1F4E79"/>
  <circle cx="240" cy="90" r="4" fill="#1F4E79"/><circle cx="330" cy="50" r="4" fill="#1F4E79"/>
  <text x="55" y="175" font-size="12">D1</text><text x="145" y="135" font-size="12">D7</text>
  <text x="235" y="105" font-size="12">D14</text><text x="325" y="65" font-size="12">D30</text>
</svg>
```

### 饼图（pie）
用 `<path>` 画扇形：`M cx,cy L x1,y1 A r,r 0 largeArc,1 x2,y2 Z`
```html
<svg width="240" height="200">
  <path d="M120,100 L120,20 A80,80 0 0 1 190,46 Z" fill="#1F4E79"/>
  <path d="M120,100 L190,46 A80,80 0 0 1 120,180 Z" fill="#C0504D"/>
</svg>
```

### 雷达图（radar）
用 `<polygon>` 画网格与数据多边形：
```html
<svg width="280" height="240">
  <polygon points="140,20 240,110 190,210 90,210 40,110" fill="none" stroke="#ccc"/>
  <polygon points="140,60 205,112 175,170 105,170 75,112" fill="#1F4E79" fill-opacity="0.25" stroke="#1F4E79"/>
  <text x="132" y="14" font-size="11">功能流程</text>
  <!-- 其余维度标签按角度布置 -->
</svg>
```

### 漏斗图（funnel）
用多个水平梯形（`<polygon>`）或宽度递减的矩形叠放：
```html
<svg width="360" height="180">
  <polygon points="20,10 340,10 300,50 60,50" fill="#1F4E79"/>
  <polygon points="60,55 300,55 260,95 100,95" fill="#2E75B6"/>
  <polygon points="100,100 260,100 220,140 140,140" fill="#9DC3E6"/>
</svg>
```

### 优先级矩阵（scatter）
用圆点 + 两条均值十字虚线：
```html
<svg width="360" height="240">
  <line x1="20" y1="120" x2="340" y2="120" stroke="#999" stroke-dasharray="4,4"/>
  <line x1="180" y1="20" x2="180" y2="220" stroke="#999" stroke-dasharray="4,4"/>
  <circle cx="220" cy="60"  r="7" fill="#C0504D"/><text x="230" y="64" font-size="11">优化身份验证</text>
  <circle cx="90"  cy="180" r="7" fill="#9DC3E6"/><text x="100" y="184" font-size="11">调整配色</text>
</svg>
```

## HTML 分析结论骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>XX产品用户体验研究分析结论</title>
<style>
  body { font-family: "Microsoft YaHei", sans-serif; margin: 40px; color: #333; }
  h1 { color: #1F4E79; text-align: center; }
  h2 { color: #1F4E79; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  p { text-indent: 2em; margin: 6px 0; }        /* 正文段首空两格 */
  p.center { text-indent: 0; text-align: center; }
  ul { margin: 6px 0; }
  ul li { margin: 3px 0; }
  table { border-collapse: collapse; margin: 12px auto; }
  th, td { border: 1px solid #999; padding: 6px 10px; }
  th { background: #eef2f7; }
  .quote { color: #666; border-left: 3px solid #1F4E79; padding-left: 10px; text-indent: 0; }
</style>
</head>
<body>
  <h1>XX产品用户体验研究分析结论</h1>
  <p class="center">生成日期：2026-08-17 ｜ 方案A：客群主轴式</p>
  <!-- 副标题只含生成日期 + 方案类型；样本量/数据源/方法一律写入正文"研究概述" -->

  <h2>一、研究概述</h2>
  <h3>1.1 研究背景与目标</h3>
  <p>为持续提升……（样本与数据源在此描述：问卷 N=156、访谈 N=12、埋点 2026-01~02）</p>

  <h2>二、核心结论</h2>
  <h3>2.1 注册流程门槛较高</h3>
  <p><strong>注册流程是当前满意度最低、流失最高的关键环节，建议优先优化。</strong>（一句话结论：加粗，单独一段）</p>
  <ul style="list-style: disc; padding-left: 1.2em;">
    <li>该功能满意度均值 2.8/5（问卷 N=156）</li>
    <li>注册至首次转账转化率仅 52%（埋点）</li>
    <li>"注册要填的信息太多"（受访者 P03）</li>
  </ul>
  <p>结论可信度：高（多源收敛）；本研究认为高流失主要源于信息采集门槛。（结论可信度在前、原因解读在后，合并一段）</p>

  <h2>三、行动建议</h2>
  <ul>
    <li>【高优先级】精简注册表单字段至必填 3 项，预期提升注册完成率约 15%</li>
    <li>【待验证】推送"一键登录"入口，可用 A/B 测试验证</li>
  </ul>
</body>
</html>
```

## 交付说明（告知用户三种用法）

在交付时明确告诉用户：
1. **直接看**：双击用浏览器打开
2. **转 Word**：用 Word 打开该 HTML，另存为 .docx
3. **转 PDF**：浏览器打开后 Ctrl+P 打印为 PDF

## 与 P4（Markdown）的区别

- P3 HTML：排版和图表都成型，视觉接近正式分析结论，推荐优先
- P4 Markdown：纯文本最简，适合快速浏览或直接粘贴进文档/协作工具

## 生成方式

模型无需任何脚本，直接用文件写入能力产出该 HTML 即可（不依赖运行时）。
