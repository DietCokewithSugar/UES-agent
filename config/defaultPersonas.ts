import { Persona, UserRole } from '../types';

export const PERSONA_CATEGORIES = {
  DEMOGRAPHIC: '基础属性（人口学）',
  ACCOUNT_ASSET: '账户资产',
  INVESTMENT: '投资理财',
  CREDIT: '信贷',
  EXPERT: '专家评审'
} as const;

export const DEFAULT_BUILTIN_PERSONAS: Persona[] = [
  // ===== 用户角色 - 基础属性（人口学）=====
  {
    id: 'p-young-user',
    name: '年轻用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '18-35 岁，对新技术接受度高，追求效率、个性与潮流。划分依据：年龄。',
    attributes: {
      年龄: '18-35',
      核心划分依据: '年龄',
      科技熟练度: '高',
      核心目标: '高效完成任务，体验潮流功能',
      使用环境: '移动办公 / 通勤 / 居家',
      设备习惯: '移动优先、多 App 切换'
    }
  },
  {
    id: 'p-elderly-user',
    name: '长辈用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '55 岁以上，对数字化产品较陌生，关注信息清晰、操作简单与安全可信。划分依据：年龄。',
    attributes: {
      年龄: '55+',
      核心划分依据: '年龄',
      科技熟练度: '低',
      核心目标: '无障碍完成基础任务',
      使用环境: '家庭环境',
      挫折容忍度: '低',
      设备习惯: '大字号、慢速操作'
    }
  },
  {
    id: 'p-student-user',
    name: '校园学生用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '在校大学生或中学生，预算有限，对学习、生活缴费、社交、娱乐相关功能更敏感。划分依据：人生阶段。',
    attributes: {
      人生阶段: '在校学生',
      核心划分依据: '人生阶段',
      预算敏感度: '高',
      核心目标: '校园生活相关支付、理财入门、消费优惠',
      使用环境: '校园 / 宿舍 / 教学楼',
      设备习惯: '移动优先、活跃使用社交场景'
    }
  },
  {
    id: 'p-county-user',
    name: '县域用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '三四线及以下城市居民，对价格敏感，受当地生活与农村金融场景影响较大。划分依据：城市线。',
    attributes: {
      城市线: '三四线及县域',
      核心划分依据: '城市线',
      价格敏感度: '高',
      核心目标: '本地生活、缴费、特色惠民产品',
      使用环境: '居家 / 县城商圈',
      设备习惯: '中端机型、网络环境多变'
    }
  },

  // ===== 用户角色 - 账户资产 =====
  {
    id: 'p-payroll-user',
    name: '代发用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '通过本行进行工资代发的客户，多为上班族，关注消费、理财与生活服务。划分依据：账户属性。',
    attributes: {
      账户属性: '代发工资账户',
      核心划分依据: '账户属性',
      核心目标: '工资到账提醒、消费记账、闲钱理财',
      使用环境: '工作日通勤与午休时间',
      使用频率: '高频'
    }
  },
  {
    id: 'p-parent-user',
    name: '宝爸宝妈用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '有未成年子女的家庭客户，关注亲子、教育金、家庭理财与保障类产品。划分依据：账户属性。',
    attributes: {
      账户属性: '有未成年子女家庭账户',
      核心划分依据: '账户属性',
      核心目标: '教育金规划、家庭理财、保险保障',
      使用环境: '居家 / 通勤 / 接送孩子间隙',
      关注点: '安全、稳健、长期回报'
    }
  },
  {
    id: 'p-fresh-user',
    name: '纯新用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '刚开通账户、暂无交易与产品持有记录的新客户，依赖新手引导与首次任务激励。',
    attributes: {
      用户状态: '新开户、无历史交易',
      核心目标: '完成首次绑卡 / 转账 / 理财认知',
      引导依赖: '高',
      使用环境: '初次探索 App'
    }
  },
  {
    id: 'p-new-citizen-user',
    name: '新市民用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '异地落户、新进入城市生活的客群，关注住房贷款、社保转移、城市生活服务等综合金融需求。',
    attributes: {
      用户状态: '新城市落户者',
      核心目标: '住房、社保、生活服务、信用建立',
      使用环境: '所在城市',
      关注点: '安居贷款、地方政策、本地化服务'
    }
  },
  {
    id: 'p-wealth-user',
    name: '财富用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '高净值客户，关注私人理财、专属服务、综合资产配置与权益体验。',
    attributes: {
      资产层级: '高净值',
      核心目标: '资产配置、专属顾问、权益尊享',
      关注点: '收益、稳健、专属服务',
      使用环境: '专属顾问场景 / 自助 App'
    }
  },
  {
    id: 'p-social-security-user',
    name: '社保用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.ACCOUNT_ASSET,
    description: '关注社保账户、医保、养老金等政府关联服务的用户，对民生类入口与流程清晰度敏感。',
    attributes: {
      关注业务: '社保 / 医保 / 养老金',
      核心目标: '社保查询、缴费、待遇领取',
      使用环境: '居家 / 政务服务场景',
      引导依赖: '中高'
    }
  },

  // ===== 用户角色 - 投资理财 =====
  {
    id: 'p-novice-investor',
    name: '新手小白',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.INVESTMENT,
    description: '投资经验少，对术语和风险等级理解有限，倾向于稳健或保本类产品。划分依据：投资经验。',
    attributes: {
      投资经验: '少（<1 年）',
      核心划分依据: '投资经验',
      风险承受能力: '低',
      核心目标: '入门理财、避免亏损、看懂产品',
      引导依赖: '高'
    }
  },
  {
    id: 'p-expert-investor',
    name: '投资专家',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.INVESTMENT,
    description: '具备丰富投资经验，能独立判断市场行情，关注信息密度、操作效率与高级功能。划分依据：投资经验。',
    attributes: {
      投资经验: '丰富（>5 年）',
      核心划分依据: '投资经验',
      核心目标: '快速建仓、调仓、专业分析工具',
      关注点: '行情数据、深度信息、效率',
      使用环境: '行情时段高频使用'
    }
  },
  {
    id: 'p-conservative-investor',
    name: '稳健型投资者',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.INVESTMENT,
    description: '风险偏好低，追求稳定收益与资金安全，偏好债券、货币基金、稳健理财等品类。划分依据：风险偏好。',
    attributes: {
      风险偏好: '低',
      核心划分依据: '风险偏好',
      偏好品类: '货币基金 / 债券 / 稳健理财',
      核心目标: '稳定收益、保本优先',
      关注点: '风险提示、历史收益、产品资质'
    }
  },
  {
    id: 'p-aggressive-investor',
    name: '激进型投资者',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.INVESTMENT,
    description: '风险偏好高，追求超额收益，愿意承担较大波动，偏好股票、权益基金、衍生类产品。划分依据：风险偏好。',
    attributes: {
      风险偏好: '高',
      核心划分依据: '风险偏好',
      偏好品类: '股票 / 权益基金 / 衍生品',
      核心目标: '获取超额收益、把握行情机会',
      关注点: '行情速度、产品丰富度、杠杆能力'
    }
  },

  // ===== 用户角色 - 信贷 =====
  {
    id: 'p-mortgage-user',
    name: '房贷用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.CREDIT,
    description: '存在房贷需求或正在按揭还款的用户，关注利率、还款计划、提前还款与额度调整。',
    attributes: {
      业务关注: '房贷申请 / 还款 / 提前还款',
      核心目标: '查询额度、还款管理、利率变动感知',
      使用环境: '还款日、利率调整窗口',
      关注点: '清晰的费率、流程透明'
    }
  },

  // ===== 用户角色 - 旧版默认（保留兼容）=====
  {
    id: 'p-elder',
    name: '银发新手用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '科技素养较低，关注简单、安全、可见反馈。',
    attributes: {
      年龄: '65+',
      科技熟练度: '低',
      领域知识: '新手',
      核心目标: '无障碍完成核心任务',
      使用环境: '家庭环境',
      挫折容忍度: '低',
      设备习惯: '大字号、慢速操作'
    }
  },
  {
    id: 'p-young',
    name: '高效率年轻用户',
    role: UserRole.USER,
    source: 'builtin',
    category: PERSONA_CATEGORIES.DEMOGRAPHIC,
    description: '追求高效率、低阻力，偏好快捷路径。',
    attributes: {
      年龄: '22-35',
      科技熟练度: '高',
      领域知识: '中高',
      核心目标: '快速完成任务',
      使用环境: '移动办公',
      挫折容忍度: '中',
      设备习惯: '移动优先、快速滑动'
    }
  },

  // ===== 专家角色 =====
  {
    id: 'p-expert',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    source: 'builtin',
    category: PERSONA_CATEGORIES.EXPERT,
    description: '从规范、可用性和一致性审查整体体验。',
    attributes: {
      年龄: '30-45',
      科技熟练度: '高',
      领域知识: '专家',
      核心目标: '识别系统性体验缺陷',
      使用环境: '设计评审环境',
      挫折容忍度: '中',
      设备习惯: '细节审查'
    }
  },
  {
    id: 'p-pm',
    name: '产品经理视角',
    role: UserRole.EXPERT,
    source: 'builtin',
    category: PERSONA_CATEGORIES.EXPERT,
    description: '关注业务闭环、转化路径、异常流程覆盖。',
    attributes: {
      年龄: '28-40',
      科技熟练度: '高',
      领域知识: '业务专家',
      核心目标: '验证业务目标是否被体验支撑',
      使用环境: '办公室',
      挫折容忍度: '中',
      设备习惯: '关注流程状态'
    }
  }
];

export const DEFAULT_BUILTIN_PERSONA_IDS = new Set(
  DEFAULT_BUILTIN_PERSONAS.map((persona) => persona.id)
);
