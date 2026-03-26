import { ChecklistItemDefinition } from '../types';

export const DESIGN_QUALITY_CHECKLIST_ITEMS: ChecklistItemDefinition[] = [
  {
    id: '1.1',
    category: '一、需求分析——满足需求解痛点',
    checkpoint: '1.1 业务目标',
    item: '是否考虑需求来源、业务预期、产品限制',
    description: '识别需求来源动因、业务预期目标与现实约束/差异化优势。',
    scope: '交互/视觉'
  },
  {
    id: '1.2',
    category: '一、需求分析——满足需求解痛点',
    checkpoint: '1.2 用户需求',
    item: '是否考虑目标用户使用场景、核心痛点、用户诉求',
    description: '覆盖使用环境、关键痛点与用户希望实现的价值。',
    scope: '交互/视觉'
  },
  {
    id: '1.3',
    category: '一、需求分析——满足需求解痛点',
    checkpoint: '1.3 设计目标',
    item: '是否综合用户、业务、监管、竞品信息制定目标',
    description: '基于用户洞察、业务目标、监管要求和竞品分析形成设计目标。',
    scope: '交互/视觉'
  },
  {
    id: '2.1',
    category: '二、信息架构——信息清晰导航便',
    checkpoint: '2.1 信息架构',
    item: '是否清晰，核心功能易找，高频任务路径最短',
    description: '信息层级清楚，关键任务链路短且无多余跳转。',
    scope: '交互'
  },
  {
    id: '2.2',
    category: '二、信息架构——信息清晰导航便',
    checkpoint: '2.2 导航',
    item: '导航是否扁平且易扩展',
    description: '主导航建议 5-7 项、层级不超过 3 层；移动端底部导航 3-5 项，并可扩展。',
    scope: '交互'
  },
  {
    id: '2.3',
    category: '二、信息架构——信息清晰导航便',
    checkpoint: '2.3 入口',
    item: '入口是否清晰可见并顺畅进入主流程',
    description: '覆盖主动入口及关联入口（首页二级、搜索等）是否易发现。',
    scope: '交互'
  },
  {
    id: '3.1',
    category: '三、任务流程——流程丝滑无预感',
    checkpoint: '3.1 正向流程',
    item: '流程是否闭环且高效，操作有即时反馈',
    description: '步骤必要且精简，成功页结果清晰并提供后续指引。',
    scope: '交互'
  },
  {
    id: '3.2',
    category: '三、任务流程——流程丝滑无预感',
    checkpoint: '3.2 逆向流程',
    item: '是否考虑返回、取消、撤销、中断',
    description: '支持安全退出/修正，关键数据有保护（如二次确认）。',
    scope: '交互'
  },
  {
    id: '3.3',
    category: '三、任务流程——流程丝滑无预感',
    checkpoint: '3.3 异常流程',
    item: '是否覆盖异常并提前告知风险',
    description: '覆盖信息错误、系统故障、身份失败、网络异常等场景。',
    scope: '交互'
  },
  {
    id: '3.4',
    category: '三、任务流程——流程丝滑无预感',
    checkpoint: '3.4 多状态',
    item: '是否考虑登录前后、权限差异、用户类型差异',
    description: '不同身份与状态下流程应一致可控且逻辑完整。',
    scope: '交互'
  },
  {
    id: '4.1',
    category: '四、界面布局——摆放有序重点显',
    checkpoint: '4.1 元素布放',
    item: '是否简洁清晰、重点突出、引导有序',
    description: '信息优先级、疏密节奏、动线引导和分组关联是否合理。',
    scope: '交互/视觉'
  },
  {
    id: '4.2',
    category: '四、界面布局——摆放有序重点显',
    checkpoint: '4.2 首屏屏效',
    item: '核心任务入口/数据是否首屏可见',
    description: '首页等强视觉页面中，核心信息无需滚动即可识别。',
    scope: '交互/视觉'
  },
  {
    id: '4.3',
    category: '四、界面布局——摆放有序重点显',
    checkpoint: '4.3 可访问性',
    item: '是否符合适老化设计要求',
    description: '关注字号（≥18dpt）、对比度、行距段距等可访问性规则。',
    scope: '交互/视觉'
  },
  {
    id: '4.4',
    category: '四、界面布局——摆放有序重点显',
    checkpoint: '4.4 适配',
    item: '是否适配不同尺寸与形态设备',
    description: '考虑窄屏、宽屏、折叠屏等机型方案与布局稳定性。',
    scope: '交互/视觉'
  },
  {
    id: '5.1',
    category: '五、控件状态——控件直观操作简',
    checkpoint: '5.1 控件选择',
    item: '控件是否最易用且符合用户预期',
    description: '优先选择完成任务成本最低、学习负担最小的控件。',
    scope: '交互'
  },
  {
    id: '5.2',
    category: '五、控件状态——控件直观操作简',
    checkpoint: '5.2 默认值',
    item: '默认值是否安全、常用、合理且易识别',
    description: '默认值应帮助用户提效，避免误操作风险。',
    scope: '交互'
  },
  {
    id: '5.3',
    category: '五、控件状态——控件直观操作简',
    checkpoint: '5.3 极值',
    item: '是否覆盖输入最大/最小值及特殊值处理',
    description: '超范围即时提示，文本溢出、设备极值、多版本展示规则清晰。',
    scope: '交互/视觉'
  },
  {
    id: '5.4',
    category: '五、控件状态——控件直观操作简',
    checkpoint: '5.4 空状态',
    item: '空页面是否友好并提供明确行为指引',
    description: '空状态需解释当前状态并引导下一步动作。',
    scope: '交互/视觉'
  },
  {
    id: '5.5',
    category: '五、控件状态——控件直观操作简',
    checkpoint: '5.5 加载',
    item: '是否使用合理加载方式并提供状态反馈',
    description: '根据场景使用进度条/骨架屏/局部加载，并体现进行中、成功、失败状态。',
    scope: '交互/视觉'
  },
  {
    id: '6.1',
    category: '六、输入反馈——输入高效反馈快',
    checkpoint: '6.1 输入方式',
    item: '是否遵循“非必要不输入，必要时最快输入”',
    description: '优先自动填充、智能获取、选择/扫描等快捷输入能力。',
    scope: '交互'
  },
  {
    id: '6.2',
    category: '六、输入反馈——输入高效反馈快',
    checkpoint: '6.2 输入/隐藏',
    item: '键盘类型、弹出遮挡、特殊字段处理是否合理',
    description: '根据输入内容切换键盘，避免遮挡输入域，敏感字段符合安全要求。',
    scope: '交互'
  },
  {
    id: '6.3',
    category: '六、输入反馈——输入高效反馈快',
    checkpoint: '6.3 级联/联动',
    item: '输入内容间级联规则与提示机制是否清晰',
    description: '前端校验、随行提示、Toast 提示等反馈方式匹配场景。',
    scope: '交互'
  },
  {
    id: '7.1',
    category: '七、品牌风格——调性匹配认知易',
    checkpoint: '7.1 调性贴切',
    item: '是否符合产品特性并具备品牌一致性',
    description: '设计表达与产品行业属性、品牌调性（可信赖）一致。',
    scope: '视觉'
  },
  {
    id: '7.2',
    category: '七、品牌风格——调性匹配认知易',
    checkpoint: '7.2 风格一致',
    item: '是否采用统一设计语言（形、质、色、字、构、动）',
    description: '确保设计要素有规律、有秩序，形成一致体验。',
    scope: '视觉'
  },
  {
    id: '7.3',
    category: '七、品牌风格——调性匹配认知易',
    checkpoint: '7.3 符合趋势',
    item: '是否符合当下设计趋势和客户审美偏好',
    description: '在业务语境下合理采用极简、扁平、3D 等风格方向。',
    scope: '视觉'
  },
  {
    id: '7.4',
    category: '七、品牌风格——调性匹配认知易',
    checkpoint: '7.4 表达准确',
    item: '图形与颜色是否美观且符合认知常识',
    description: '视觉表达应有助于理解并提升界面品质。',
    scope: '视觉'
  },
  {
    id: '8.1',
    category: '八、设计交付——上下衔接覆尽职',
    checkpoint: '8.1 素材清晰',
    item: '素材分辨率是否满足开发与交付清晰度',
    description: '原始素材尺寸需不小于最大切图尺寸要求（如 3x）。',
    scope: '视觉'
  },
  {
    id: '8.2',
    category: '八、设计交付——上下衔接覆尽职',
    checkpoint: '8.2 合法合规',
    item: '素材是否规避涉敏、版权、法律及道德风险',
    description: '字体/Logo/地图/敏感元素等需在授权与合规范围内使用。',
    scope: '视觉'
  },
  {
    id: '8.3',
    category: '八、设计交付——上下衔接覆尽职',
    checkpoint: '8.3 特殊标注',
    item: '特殊效果是否有完整设计说明与物料',
    description: '状态变化、动态效果需补充开发实现说明。',
    scope: '视觉'
  },
  {
    id: '8.4',
    category: '八、设计交付——上下衔接覆尽职',
    checkpoint: '8.4 切图规范',
    item: '切图格式、尺寸、命名是否规范',
    description: '文件类型、像素尺寸与命名应便于前端识别与调用。',
    scope: '视觉'
  },
  {
    id: '8.5',
    category: '八、设计交付——上下衔接覆尽职',
    checkpoint: '8.5 设计规范',
    item: '是否提供必要规范文档以保障上线效果',
    description: '形成可复用、可执行的交付规范文档支持运营落地。',
    scope: '视觉'
  },
  {
    id: '9.1',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.1 多媒体设计',
    item: '是否存在动效/音效/3D/VR 等设计机会',
    description: '识别可提升吸引力或引导效率的多媒体触点。',
    scope: '交互/视觉'
  },
  {
    id: '9.2',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.2 优于同业',
    item: '是否形成优于竞品的设计方案',
    description: '体现“人无我有、人有我优”的差异化体验价值。',
    scope: '交互/视觉'
  },
  {
    id: '9.3',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.3 规范创新',
    item: '是否形成可沉淀的新组件或新范式',
    description: '突破既有规范并获得业务与规范体系认可。',
    scope: '交互/视觉'
  },
  {
    id: '9.4',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.4 统筹设计',
    item: '是否统筹前后台与多终端联动体验',
    description: '梳理系统交互关系，识别并消除跨端体验堵点。',
    scope: '交互/视觉'
  },
  {
    id: '9.5',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.5 AI&智能体',
    item: '是否具备接入智能服务的设计机会',
    description: '识别智能体工作流并补齐关键设计资产。',
    scope: '交互'
  },
  {
    id: '9.6',
    category: '九、设计创新——创新智能体验好',
    checkpoint: '9.6 语言构建',
    item: '是否对设计语言提出建设性补充',
    description: '可形成系统级补充或子系统独立设计语言。',
    scope: '视觉'
  },
  {
    id: '10.1',
    category: '十、最后思考——规范一致质量高',
    checkpoint: '10.1 一致性',
    item: '是否与应用内同类功能和操作保持一致',
    description: '流程、控件、文案命名与交互方式在横向场景中统一。',
    scope: '交互/视觉'
  },
  {
    id: '10.2',
    category: '十、最后思考——规范一致质量高',
    checkpoint: '10.2 工具支持/检测',
    item: '是否通过工具检测后再提交',
    description: '检查组件规范、画布规范、对比度与技术兜底配置等。',
    scope: '交互/视觉'
  }
];
