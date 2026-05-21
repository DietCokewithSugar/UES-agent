import { Persona, UserRole } from '../types';

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'p-elder',
    name: '银发新手用户',
    role: UserRole.USER,
    description: '科技素养较低，关注简单、安全、可见反馈。',
    attributes: {
      类别: '基础角色',
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
    description: '追求高效率、低阻力，偏好快捷路径。',
    attributes: {
      类别: '基础角色',
      年龄: '22-35',
      科技熟练度: '高',
      领域知识: '中高',
      核心目标: '快速完成任务',
      使用环境: '移动办公',
      挫折容忍度: '中',
      设备习惯: '移动优先、快速滑动'
    }
  },
  {
    id: 'p-young-general',
    name: '年轻用户',
    role: UserRole.USER,
    description: '处于年轻年龄段，熟悉移动互联网，对效率、个性化和即时反馈敏感。',
    attributes: {
      类别: '基础属性（人口学）',
      核心划分依据: '年龄',
      年龄: '18-35',
      科技熟练度: '中高',
      核心目标: '快速理解并完成核心任务'
    }
  },
  {
    id: 'p-senior-general',
    name: '长辈用户',
    role: UserRole.USER,
    description: '年龄偏长，可能更依赖明确引导、稳定反馈、较高可读性和容错设计。',
    attributes: {
      类别: '基础属性（人口学）',
      核心划分依据: '年龄',
      年龄: '55+',
      科技熟练度: '中低',
      核心目标: '安全、清晰地完成任务'
    }
  },
  {
    id: 'p-campus-student',
    name: '校园学生用户',
    role: UserRole.USER,
    description: '处于校园学习阶段，消费能力有限，偏好轻量、优惠、社交化和低门槛体验。',
    attributes: {
      类别: '基础属性（人口学）',
      核心划分依据: '人生阶段',
      人生阶段: '校园学生',
      核心目标: '以较低成本完成学习、消费或账户任务'
    }
  },
  {
    id: 'p-county-user',
    name: '县域用户',
    role: UserRole.USER,
    description: '来自县域或下沉市场，关注本地化服务、可信度、操作门槛与线下协同。',
    attributes: {
      类别: '基础属性（人口学）',
      核心划分依据: '城市线',
      城市线: '县域/下沉市场',
      核心目标: '获得易理解、可信赖且贴近本地场景的服务'
    }
  },
  {
    id: 'p-payroll-user',
    name: '代发用户',
    role: UserRole.USER,
    description: '因工资代发或单位绑定而使用账户，关注到账通知、账户权益和资金流向可见性。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户属性',
      账户属性: '代发工资/单位绑定',
      核心目标: '快速确认到账、管理资金和理解账户权益'
    }
  },
  {
    id: 'p-parent-user',
    name: '宝爸宝妈用户',
    role: UserRole.USER,
    description: '需要兼顾家庭成员与育儿相关支出，关注家庭资产管理、缴费提醒和安全保障。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户属性',
      账户属性: '家庭/亲子场景',
      核心目标: '高效处理家庭消费、缴费与资金安排'
    }
  },
  {
    id: 'p-brand-new-user',
    name: '纯新用户',
    role: UserRole.USER,
    description: '首次接触产品或账户体系，对入口、术语、流程和安全提示缺少既有认知。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户生命周期',
      账户属性: '新开户/首次使用',
      核心目标: '在低学习成本下完成首次关键任务'
    }
  },
  {
    id: 'p-new-citizen-user',
    name: '新市民用户',
    role: UserRole.USER,
    description: '在新城市工作或生活，关注身份认证、缴费、社保、信贷等城市服务衔接。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户属性',
      账户属性: '新市民/城市迁移',
      核心目标: '完成城市生活相关金融与公共服务任务'
    }
  },
  {
    id: 'p-wealth-user',
    name: '财富用户',
    role: UserRole.USER,
    description: '具备一定资产配置需求，关注资产总览、收益风险解释、产品比较和服务专业性。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户属性',
      账户属性: '财富管理',
      核心目标: '清晰掌握资产变化并获得可信配置建议'
    }
  },
  {
    id: 'p-social-security-user',
    name: '社保用户',
    role: UserRole.USER,
    description: '围绕社保查询、缴费、待遇领取或凭证办理使用产品，关注政策说明与流程确定性。',
    attributes: {
      类别: '账户资产',
      核心划分依据: '账户属性',
      账户属性: '社保服务',
      核心目标: '准确完成社保相关查询、缴费或办理'
    }
  },
  {
    id: 'p-investment-novice',
    name: '新手小白',
    role: UserRole.USER,
    description: '投资经验有限，容易受术语和风险说明影响，需要清晰解释、风险提示和决策辅助。',
    attributes: {
      类别: '投资理财',
      核心划分依据: '投资经验',
      投资经验: '新手',
      风险偏好: '低到中',
      核心目标: '理解产品差异和风险后再做决策'
    }
  },
  {
    id: 'p-investment-expert-user',
    name: '投资专家',
    role: UserRole.USER,
    description: '具备丰富投资经验，关注信息密度、指标完整性、交易效率和专业工具可得性。',
    attributes: {
      类别: '投资理财',
      核心划分依据: '投资经验',
      投资经验: '专家',
      风险偏好: '中高',
      核心目标: '高效获取关键指标并完成专业判断'
    }
  },
  {
    id: 'p-conservative-investor',
    name: '稳健型投资者',
    role: UserRole.USER,
    description: '风险偏好较低，关注本金安全、收益稳定性、风险等级和赎回规则。',
    attributes: {
      类别: '投资理财',
      核心划分依据: '风险偏好',
      风险偏好: '稳健',
      核心目标: '在风险可控前提下选择合适产品'
    }
  },
  {
    id: 'p-aggressive-investor',
    name: '激进型投资者',
    role: UserRole.USER,
    description: '风险承受能力较高，关注收益机会、波动信息、交易效率和组合扩展能力。',
    attributes: {
      类别: '投资理财',
      核心划分依据: '风险偏好',
      风险偏好: '激进',
      核心目标: '快速捕捉机会并管理高波动资产'
    }
  },
  {
    id: 'p-mortgage-user',
    name: '房贷用户',
    role: UserRole.USER,
    description: '围绕房贷申请、审批、还款或利率调整使用产品，关注进度透明、金额准确和提醒可靠。',
    attributes: {
      类别: '信贷',
      核心划分依据: '贷款类型',
      贷款类型: '房贷',
      核心目标: '清晰掌握房贷进度、还款计划和关键风险'
    }
  },
  {
    id: 'p-expert',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    description: '从规范、可用性和一致性审查整体体验。',
    attributes: {
      类别: '体验专家',
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
    description: '关注业务闭环、转化路径、异常流程覆盖。',
    attributes: {
      类别: '业务专家',
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
