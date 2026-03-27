import { GoogleGenAI, Type } from '@google/genai';
import { getFrameworkById } from '../config/frameworkPresets';
import {
  ABComparisonReport,
  ApiConfig,
  ChecklistResult,
  EvaluationFramework,
  EvaluationModel,
  EvaluationScenario,
  FrameworkReport,
  Persona,
  PersonaRecommendation,
  ProcessStep,
  UserRole
} from '../types';

const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const getOpenRouterApiKey = (): string => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OpenRouter API Key 未配置。请在 .env.local 文件中添加 OPENROUTER_API_KEY。');
  }
  return key;
};

const DEFAULT_SCENARIO: EvaluationScenario = {
  industry: '',
  productType: '',
  businessGoal: '',
  targetUsers: '',
  keyTasks: '',
  painPoints: '',
  successCriteria: '',
  constraints: '',
  source: 'manual'
};

const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.NUMBER },
    executiveSummary: { type: Type.STRING },
    personaPerspective: { type: Type.STRING },
    scenarioSummary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    evidenceNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    dimensionScores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dimension: { type: Type.STRING },
          score: { type: Type.NUMBER },
          comment: { type: Type.STRING }
        },
        required: ['dimension', 'score', 'comment']
      }
    },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          severity: { type: Type.STRING },
          location: { type: Type.STRING },
          description: { type: Type.STRING },
          recommendation: { type: Type.STRING }
        },
        required: ['severity', 'location', 'description', 'recommendation']
      }
    },
    optimizationSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    dynamicSections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          type: { type: Type.STRING },
          contentText: { type: Type.STRING },
          contentList: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['id', 'title', 'type']
      }
    },
    checklistResults: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemId: { type: Type.STRING },
          status: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ['itemId', 'status', 'reason']
      }
    }
  },
  required: ['overallScore', 'dimensionScores', 'executiveSummary', 'personaPerspective', 'issues', 'optimizationSuggestions']
};

const SCENARIO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    industry: { type: Type.STRING },
    productType: { type: Type.STRING },
    businessGoal: { type: Type.STRING },
    targetUsers: { type: Type.STRING },
    keyTasks: { type: Type.STRING },
    painPoints: { type: Type.STRING },
    successCriteria: { type: Type.STRING },
    constraints: { type: Type.STRING }
  },
  required: ['industry', 'productType', 'businessGoal', 'targetUsers', 'keyTasks', 'painPoints', 'successCriteria', 'constraints']
};

const PERSONA_RECOMMENDATIONS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          existingPersonaId: { type: Type.STRING },
          matchScore: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          personaDraft: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              description: { type: Type.STRING },
              attributes: {
                type: Type.OBJECT,
                properties: {
                  age: { type: Type.STRING },
                  techSavviness: { type: Type.STRING },
                  domainKnowledge: { type: Type.STRING },
                  goals: { type: Type.STRING },
                  environment: { type: Type.STRING },
                  frustrationTolerance: { type: Type.STRING },
                  deviceHabits: { type: Type.STRING }
                },
                required: ['age', 'techSavviness', 'domainKnowledge', 'goals', 'environment', 'frustrationTolerance', 'deviceHabits']
              }
            },
            required: ['name', 'role', 'description', 'attributes']
          }
        },
        required: ['matchScore', 'reasoning']
      }
    }
  },
  required: ['recommendations']
};

const PERSONA_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          matchScore: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          personaDraft: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              description: { type: Type.STRING },
              attributes: {
                type: Type.OBJECT
              }
            },
            required: ['name', 'role', 'description', 'attributes']
          }
        },
        required: ['matchScore', 'reasoning', 'personaDraft']
      }
    }
  },
  required: ['recommendations']
};

const clampScore = (score: number, min = 0, max = 100) => Math.min(max, Math.max(min, score));
const hasLatinCharacters = (text: string) => /[A-Za-z]/.test(text);

const buildInputContextPrompt = (input: string | ProcessStep[]): string => {
  if (Array.isArray(input)) {
    return `这是流程型输入（多张截图 + 步骤描述）。请重点评估跨步骤连贯性、任务闭环和关键节点反馈。`;
  }

  if (typeof input === 'string' && input.startsWith('data:video')) {
    return `这是视频录屏输入。请重点评估交互反馈时效、过渡自然度、任务完成连贯性。`;
  }

  return `这是单界面截图输入。请重点评估该页面的信息架构、交互可理解性和视觉层级。`;
};

const toScenarioPrompt = (scenario?: EvaluationScenario): string => {
  if (!scenario) {
    return '未提供结构化业务场景信息，请基于输入素材与常见业务目标进行合理推断。';
  }

  return `
业务场景信息（必须纳入审计判断）：
- 行业：${scenario.industry || '未提供'}
- 产品类型：${scenario.productType || '未提供'}
- 评测目标：${scenario.businessGoal || '未提供'}
- 目标用户：${scenario.targetUsers || '未提供'}
- 关键任务：${scenario.keyTasks || '未提供'}
- 用户痛点：${scenario.painPoints || '未提供'}
- 成功标准：${scenario.successCriteria || '未提供'}
- 约束条件：${scenario.constraints || '未提供'}
`;
};

const toPersonaPrompt = (persona: Persona): string => {
  const attributeLines = Object.entries(persona.attributes || {})
    .map(([key, value]) => [key.trim(), (value || '').trim()] as const)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return `
角色画像：
- 角色类型: ${persona.role}
- 姓名: ${persona.name}
- 描述: ${persona.description}
${attributeLines || '- 暂无补充角色维度'}
`;
};

const toFrameworkPrompt = (framework: EvaluationFramework): string => {
  const dimensions = framework.dimensions
    .map((dimension, index) => `${index + 1}. ${dimension.name}：${dimension.definition}`)
    .join('\n');
  const sectionPrompt = (framework.reportSections || [])
    .map((section) => `- ${section.id} | ${section.title} | ${section.type} | ${section.description || '无'}`)
    .join('\n');

  return `
评测体系：${framework.name} (${framework.id})
体系说明：${framework.description}
评分范围：${framework.scoreRange.min}-${framework.scoreRange.max}
核心维度：
${dimensions}

方法学补充：
${framework.promptGuidelines}

请同时输出以下动态报告模块（若无法给出内容请返回空列表）：
${sectionPrompt || '- 暂无预设动态模块'}
`;
};

const toChecklistPrompt = (framework: EvaluationFramework): string => {
  if (!framework.checklistItems?.length) return '';

  return `
设计质量自查表（必须逐条输出结果）：
${framework.checklistItems
  .map(
    (item) =>
      `- itemId:${item.id} | 分类:${item.category} | 检查点:${item.checkpoint} | 检查项:${item.item} | 说明:${item.description} | 适用范围:${item.scope}`
  )
  .join('\n')}

请在 checklistResults 中逐条输出：
- itemId：对应上面的 itemId（必须一一对应，不得遗漏）
- status：pass 或 fail
- reason：一句简体中文原因（不超过 40 字）
`;
};

const buildReportPrompt = (framework: EvaluationFramework, persona: Persona, input: string | ProcessStep[], scenario?: EvaluationScenario): string => `
你是一个世界级 AI 用户体验评测架构师。你需要按指定评测体系输出结构化评测报告。

${buildInputContextPrompt(input)}
${toScenarioPrompt(scenario)}
${toPersonaPrompt(persona)}
${toFrameworkPrompt(framework)}
${toChecklistPrompt(framework)}

问题严重级别必须使用：一级问题、二级问题、三级问题。
如遇到无法直接观测的数据（如真实留存率、真实转化率），必须在 evidenceNotes 中标注“AI 代理估计”与证据限制。
所有文本字段必须使用简体中文输出，除品牌名/产品名等不可翻译专有名词外不得使用英文句子。

仅输出 JSON（不要 markdown 代码块），结构如下：
{
  "overallScore": number,
  "dimensionScores": [{"dimension":"", "score": number, "comment": ""}],
  "executiveSummary": "",
  "personaPerspective": "",
  "scenarioSummary": "",
  "confidence": number,
  "evidenceNotes": [""],
  "issues": [{"severity":"一级问题|二级问题|三级问题", "location":"", "description":"", "recommendation":""}],
  "optimizationSuggestions": [""],
  "dynamicSections": [
    {"id":"", "title":"", "type":"text|list|tags", "contentText":"", "contentList":[""]}
  ],
  "checklistResults": [
    {"itemId":"", "status":"pass|fail", "reason":""}
  ]
}
`;

const buildScenarioInferencePrompt = (hint?: string): string => `
你是资深体验研究员，请根据输入素材提炼业务场景。
如果信息不足，请给出合理假设并保持保守。
${hint ? `额外提示：${hint}` : ''}
输出要求：所有字段必须使用简体中文，不得输出英文句子（品牌名/产品名可保留原文）。

仅输出 JSON：
{
  "industry": "",
  "productType": "",
  "businessGoal": "",
  "targetUsers": "",
  "keyTasks": "",
  "painPoints": "",
  "successCriteria": "",
  "constraints": ""
}
`;

const buildScenarioLocalizationPrompt = (rawScenario: Partial<EvaluationScenario>): string => `
你是专业本地化编辑，请将以下场景 JSON 的所有文本统一改写为简体中文。
要求：
1) 保留原始语义，不得新增无关信息；
2) 品牌名/产品名等专有名词可保留原文；
3) 返回字段必须完整，且仅输出 JSON。

输入 JSON：
${JSON.stringify(rawScenario, null, 2)}
`;

const buildPersonaRecommendationPrompt = (
  framework: EvaluationFramework,
  scenario: EvaluationScenario,
  existingPersonas: Persona[],
  mode: 'balanced' | 'new_only' = 'balanced'
): string => `
你是体验评测项目的用户研究专家，请推荐最适合当前评测任务的角色画像。
目标：${mode === 'new_only' ? '生成全新角色草案（不复用已有角色）' : '从现有角色中优先推荐，也可补充新角色草案'}。最多返回 4 条。
所有文本字段必须使用简体中文输出。

场景：
${toScenarioPrompt(scenario)}

评测体系：
${framework.name} - ${framework.description}

现有角色列表（可引用 existingPersonaId）：
${existingPersonas
  .map((persona) => `- id:${persona.id}, name:${persona.name}, role:${persona.role}, desc:${persona.description}`)
  .join('\n')}

输出要求：
- recommendations 每一项必须包含 matchScore(0-100) 与 reasoning。
- ${mode === 'new_only' ? '必须返回 2-4 条新角色草案，每条都填写 personaDraft，且不要填写 existingPersonaId。' : '如果推荐现有角色，填写 existingPersonaId；如果建议新角色，填写 personaDraft（完整字段）。'}

仅输出 JSON：
{
  "recommendations": [
    {
      "existingPersonaId": "",
      "matchScore": 0,
      "reasoning": "",
      "personaDraft": {
        "name": "",
        "role": "USER|EXPERT",
        "description": "",
        "attributes": {
          "age": "",
          "techSavviness": "",
          "domainKnowledge": "",
          "goals": "",
          "environment": "",
          "frustrationTolerance": "",
          "deviceHabits": ""
        }
      }
    }
  ]
}
`;

const buildPersonaExtractionPrompt = (): string => `
你是资深用户研究员，请从提供的文档内容中提取“评测角色画像”。
要求：
1) 可以提取多个角色（0-8 个）；
2) 每个角色必须包含：name、role、description、attributes；
3) role 只能是 USER 或 EXPERT；
4) attributes 是灵活维度键值对，尽量提取与行为、目标、能力、场景有关的信息；
5) 所有文本必须使用简体中文；
6) 若文档中没有足够信息，返回空数组 recommendations。

仅输出 JSON：
{
  "recommendations": [
    {
      "matchScore": 85,
      "reasoning": "提取来源说明",
      "personaDraft": {
        "name": "角色名称",
        "role": "USER|EXPERT",
        "description": "角色描述",
        "attributes": {
          "维度A": "值A",
          "维度B": "值B"
        }
      }
    }
  ]
}
`;

const normalizeDimensionComparisons = (
  reportA: FrameworkReport,
  reportB: FrameworkReport
) => {
  const mapA = new Map(reportA.dimensionScores.map((item) => [item.dimension, item]));
  const mapB = new Map(reportB.dimensionScores.map((item) => [item.dimension, item]));
  const dimensions = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));

  return dimensions.map((dimension) => {
    const scoreA = mapA.get(dimension)?.score ?? 0;
    const scoreB = mapB.get(dimension)?.score ?? 0;
    const diff = scoreA - scoreB;
    const winner: ABComparisonReport['winner'] = diff > 0 ? 'A' : diff < 0 ? 'B' : 'TIE';
    const insight =
      winner === 'TIE'
        ? `${dimension}维度表现接近，两方案差异不明显。`
        : winner === 'A'
        ? `${dimension}维度 A 方案更优，优势约 ${Math.abs(diff)} 分。`
        : `${dimension}维度 B 方案更优，优势约 ${Math.abs(diff)} 分。`;

    return {
      dimension,
      scoreA,
      scoreB,
      diff,
      winner,
      insight
    };
  });
};

const normalizePersonaDraft = (
  rawDraft: any,
  index: number
): Omit<Persona, 'id'> => {
  const attributes =
    rawDraft?.attributes && typeof rawDraft.attributes === 'object' && !Array.isArray(rawDraft.attributes)
      ? Object.entries(rawDraft.attributes as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            const normalizedKey = key.trim();
            if (!normalizedKey) return acc;
            acc[normalizedKey] = typeof value === 'string' ? value : value == null ? '' : String(value);
            return acc;
          },
          {}
        )
      : {};

  return {
    name:
      typeof rawDraft?.name === 'string' && rawDraft.name.trim()
        ? rawDraft.name.trim()
        : `AI 角色 ${index + 1}`,
    description:
      typeof rawDraft?.description === 'string' && rawDraft.description.trim()
        ? rawDraft.description.trim()
        : 'AI 提取角色',
    role: rawDraft?.role === UserRole.EXPERT ? UserRole.EXPERT : UserRole.USER,
    attributes
  };
};

const callOpenRouterPromptJson = async <T>(prompt: string, model: string): Promise<T> => {
  const apiKey = getOpenRouterApiKey();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'ETS Agent'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: `${prompt}\n\nIMPORTANT: Return ONLY valid JSON.` }] }],
      reasoning: { enabled: true },
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenRouter API Error: ${err.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const messageContent = result.choices?.[0]?.message?.content;
  if (!messageContent) throw new Error('No content received from OpenRouter.');
  return parseJsonText<T>(messageContent);
};

const callGeminiPromptJson = async <T>(
  prompt: string,
  schema: Record<string, unknown>,
  model = 'gemini-2.5-flash'
): Promise<T> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  });

  if (!response.text) throw new Error('No response from Gemini.');
  return parseJsonText<T>(response.text);
};

const appendInputToOpenRouterMessage = (messagesContent: any[], input: string | ProcessStep[]) => {
  if (Array.isArray(input)) {
    input.forEach((step, index) => {
      const cleanBase64 = step.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
      messagesContent.push({ type: 'text', text: `Step ${index + 1}: ${step.description || '无描述'}` });
      messagesContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${cleanBase64}` } });
    });
    return;
  }

  if (input.startsWith('data:video')) {
    messagesContent.push({ type: 'video_url', videoUrl: { url: input } });
    return;
  }

  const cleanBase64 = input.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
  messagesContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${cleanBase64}` } });
};

const parseJsonText = <T>(content: string): T => {
  const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(jsonStr) as T;
};

const callOpenRouterJson = async <T>(
  prompt: string,
  input: string | ProcessStep[],
  model: string
): Promise<T> => {
  const apiKey = getOpenRouterApiKey();
  const messagesContent: any[] = [{ type: 'text', text: `${prompt}\n\nIMPORTANT: Return ONLY valid JSON.` }];
  appendInputToOpenRouterMessage(messagesContent, input);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'ETS Agent'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: messagesContent }],
      reasoning: { enabled: true },
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenRouter API Error: ${err.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const messageContent = result.choices?.[0]?.message?.content;
  if (!messageContent) throw new Error('No content received from OpenRouter.');
  return parseJsonText<T>(messageContent);
};

const callGeminiJson = async <T>(
  prompt: string,
  input: string | ProcessStep[],
  schema: Record<string, unknown>,
  model = 'gemini-2.5-flash'
): Promise<T> => {
  const ai = getAIClient();
  const parts: any[] = [{ text: prompt }];

  if (Array.isArray(input)) {
    input.forEach((step, idx) => {
      const cleanBase64 = step.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
      parts.push({ text: `\n--- 步骤 ${idx + 1} ---\n用户操作: ${step.description || '无描述'}\n` });
      parts.push({ inlineData: { mimeType: 'image/png', data: cleanBase64 } });
    });
  } else if (input.startsWith('data:video')) {
    const mimeType = input.substring(5, input.indexOf(';'));
    const cleanBase64 = input.substring(input.indexOf(',') + 1);
    parts.push({ inlineData: { mimeType, data: cleanBase64 } });
  } else {
    const cleanBase64 = input.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    parts.push({ inlineData: { mimeType: 'image/png', data: cleanBase64 } });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  });

  if (!response.text) throw new Error('No response from Gemini.');
  return parseJsonText<T>(response.text);
};

const ensureFramework = (frameworkOrModel: EvaluationFramework | EvaluationModel): EvaluationFramework => {
  if (typeof frameworkOrModel !== 'string') return frameworkOrModel;

  const modelToId: Record<EvaluationModel, string> = {
    [EvaluationModel.ETS]: 'ets',
    [EvaluationModel.HEART]: 'heart',
    [EvaluationModel.SUS_LITE]: 'sus-lite',
    [EvaluationModel.UEQ_LITE]: 'ueq-lite',
    [EvaluationModel.CUSTOM]: 'ets'
  };

  return getFrameworkById(modelToId[frameworkOrModel]) || (getFrameworkById('ets') as EvaluationFramework);
};

const normalizeReport = (raw: Partial<FrameworkReport>, framework: EvaluationFramework): FrameworkReport => {
  const dimensionMap = new Map((raw.dimensionScores || []).map((item) => [item.dimension.trim(), item]));
  const min = framework.scoreRange.min;
  const max = framework.scoreRange.max;

  const dimensionScores = framework.dimensions.map((dimension) => {
    const matched = dimensionMap.get(dimension.name);
    return {
      dimension: dimension.name,
      score: clampScore(Number(matched?.score ?? 0), min, max),
      comment: matched?.comment || '暂无分析说明'
    };
  });

  const overallScore =
    typeof raw.overallScore === 'number'
      ? clampScore(raw.overallScore, min, max)
      : Math.round(dimensionScores.reduce((sum, item) => sum + item.score, 0) / Math.max(dimensionScores.length, 1));

  const dynamicSections = (raw.dynamicSections || [])
    .map((section) => {
      if (!section?.id || !section.title) return null;
      const content = Array.isArray((section as any).contentList)
        ? (section as any).contentList
        : ((section as any).contentText || '');
      return {
        id: section.id,
        title: section.title,
        type: section.type === 'list' || section.type === 'tags' ? section.type : 'text',
        content
      };
    })
    .filter(Boolean) as FrameworkReport['dynamicSections'];

  const checklistMap = new Map((raw.checklistResults || []).map((item) => [item.itemId, item]));
  const checklistResults: ChecklistResult[] = (framework.checklistItems || []).map((item) => {
    const matched = checklistMap.get(item.id);
    const rawStatus = matched?.status;
    const status = rawStatus === 'pass' ? 'pass' : rawStatus === 'fail' ? 'fail' : 'pass';
    return {
      itemId: item.id,
      status,
      reason: matched?.reason?.trim() || '暂无说明',
      category: item.category,
      checkpoint: item.checkpoint,
      item: item.item,
      description: item.description,
      scope: item.scope
    };
  });

  return {
    frameworkId: framework.id,
    frameworkName: framework.name,
    modelType: framework.modelType,
    overallScore,
    dimensionScores,
    executiveSummary: raw.executiveSummary || '暂无执行摘要',
    personaPerspective: raw.personaPerspective || '暂无角色视角分析',
    issues: (raw.issues || []).map((issue) => ({
      severity: issue.severity || '二级问题',
      location: issue.location || '未标注位置',
      description: issue.description || '未提供问题描述',
      recommendation: issue.recommendation || '建议补充优化建议'
    })),
    optimizationSuggestions: raw.optimizationSuggestions || [],
    scenarioSummary: raw.scenarioSummary || '',
    evidenceNotes: raw.evidenceNotes || [],
    confidence: typeof raw.confidence === 'number' ? clampScore(raw.confidence) : 75,
    dynamicSections,
    checklistResults
  };
};

export const analyzeDesign = async (
  input: string | ProcessStep[],
  persona: Persona,
  frameworkOrModel: EvaluationFramework | EvaluationModel = EvaluationModel.ETS,
  apiConfig: ApiConfig = { provider: 'google' },
  scenario: EvaluationScenario = DEFAULT_SCENARIO
): Promise<FrameworkReport> => {
  const framework = ensureFramework(frameworkOrModel);
  const prompt = buildReportPrompt(framework, persona, input, scenario);

  const rawReport =
    apiConfig.provider === 'openrouter'
      ? await callOpenRouterJson<Partial<FrameworkReport>>(
          prompt,
          input,
          apiConfig.openRouterModel || 'google/gemini-2.5-flash'
        )
      : await callGeminiJson<Partial<FrameworkReport>>(prompt, input, REPORT_SCHEMA);

  return normalizeReport(rawReport, framework);
};

export const inferScenarioFromInput = async (
  input: string | ProcessStep[],
  apiConfig: ApiConfig = { provider: 'google' },
  hint?: string
): Promise<EvaluationScenario> => {
  const prompt = buildScenarioInferencePrompt(hint);

  const raw =
    apiConfig.provider === 'openrouter'
      ? await callOpenRouterJson<Partial<EvaluationScenario>>(
          prompt,
          input,
          apiConfig.openRouterModel || 'google/gemini-2.5-flash'
        )
      : await callGeminiJson<Partial<EvaluationScenario>>(prompt, input, SCENARIO_SCHEMA);

  const normalized = {
    industry: raw.industry || '',
    productType: raw.productType || '',
    businessGoal: raw.businessGoal || '',
    targetUsers: raw.targetUsers || '',
    keyTasks: raw.keyTasks || '',
    painPoints: raw.painPoints || '',
    successCriteria: raw.successCriteria || '',
    constraints: raw.constraints || ''
  };

  const requiresLocalization = Object.values(normalized).some((value) => hasLatinCharacters(value || ''));
  const localized =
    requiresLocalization
      ? apiConfig.provider === 'openrouter'
        ? await callOpenRouterPromptJson<Partial<EvaluationScenario>>(
            buildScenarioLocalizationPrompt(normalized),
            apiConfig.openRouterModel || 'google/gemini-2.5-flash'
          )
        : await callGeminiPromptJson<Partial<EvaluationScenario>>(
            buildScenarioLocalizationPrompt(normalized),
            SCENARIO_SCHEMA
          )
      : normalized;

  return {
    industry: localized.industry || normalized.industry,
    productType: localized.productType || normalized.productType,
    businessGoal: localized.businessGoal || normalized.businessGoal,
    targetUsers: localized.targetUsers || normalized.targetUsers,
    keyTasks: localized.keyTasks || normalized.keyTasks,
    painPoints: localized.painPoints || normalized.painPoints,
    successCriteria: localized.successCriteria || normalized.successCriteria,
    constraints: localized.constraints || normalized.constraints,
    source: 'ai_inferred'
  };
};

export const recommendPersonas = async ({
  input,
  framework,
  scenario,
  existingPersonas,
  mode = 'balanced',
  apiConfig = { provider: 'google' }
}: {
  input: string | ProcessStep[];
  framework: EvaluationFramework;
  scenario: EvaluationScenario;
  existingPersonas: Persona[];
  mode?: 'balanced' | 'new_only';
  apiConfig?: ApiConfig;
}): Promise<PersonaRecommendation[]> => {
  const prompt = buildPersonaRecommendationPrompt(framework, scenario, existingPersonas, mode);

  const raw =
    apiConfig.provider === 'openrouter'
      ? await callOpenRouterJson<{ recommendations?: any[] }>(
          prompt,
          input,
          apiConfig.openRouterModel || 'google/gemini-2.5-flash'
        )
      : await callGeminiJson<{ recommendations?: any[] }>(prompt, input, PERSONA_RECOMMENDATIONS_SCHEMA);

  return (raw.recommendations || [])
    .slice(0, 4)
    .map((recommendation, index) => {
      const normalizedExistingId =
        mode === 'new_only'
          ? undefined
          : typeof recommendation.existingPersonaId === 'string'
          ? recommendation.existingPersonaId
          : undefined;

      const normalizedDraft = recommendation.personaDraft
        ? {
            ...recommendation.personaDraft,
            name: recommendation.personaDraft.name || `AI 角色 ${index + 1}`,
            role:
              recommendation.personaDraft.role === 'EXPERT'
                ? UserRole.EXPERT
                : recommendation.personaDraft.role === 'USER'
                ? UserRole.USER
                : UserRole.USER
          }
        : undefined;

      return {
        id: `rec-${Date.now()}-${index}`,
        existingPersonaId: normalizedExistingId,
        personaDraft: normalizedDraft,
        matchScore: clampScore(Number(recommendation.matchScore || 0)),
        reasoning: recommendation.reasoning || '模型未提供推荐理由'
      };
    })
    .filter((recommendation) => (mode === 'new_only' ? Boolean(recommendation.personaDraft) : true));
};

export const extractPersonasFromText = async (
  text: string,
  apiConfig: ApiConfig = { provider: 'google' }
): Promise<PersonaRecommendation[]> => {
  if (!text.trim()) return [];
  const prompt = `${buildPersonaExtractionPrompt()}\n\n文档内容如下：\n${text.slice(0, 20000)}`;

  const raw =
    apiConfig.provider === 'openrouter'
      ? await callOpenRouterPromptJson<{ recommendations?: any[] }>(
          prompt,
          apiConfig.openRouterModel || 'google/gemini-2.5-flash'
        )
      : await callGeminiPromptJson<{ recommendations?: any[] }>(
          prompt,
          PERSONA_EXTRACTION_SCHEMA
        );

  return (raw.recommendations || [])
    .slice(0, 8)
    .map((recommendation, index) => {
      const normalizedDraft = recommendation.personaDraft
        ? {
            ...recommendation.personaDraft,
            name: recommendation.personaDraft.name || `文档角色 ${index + 1}`,
            role:
              recommendation.personaDraft.role === 'EXPERT'
                ? UserRole.EXPERT
                : recommendation.personaDraft.role === 'USER'
                ? UserRole.USER
                : UserRole.USER,
            description: recommendation.personaDraft.description || '基于文档自动提取的角色',
            attributes:
              recommendation.personaDraft.attributes &&
              typeof recommendation.personaDraft.attributes === 'object'
                ? recommendation.personaDraft.attributes
                : {}
          }
        : undefined;

      return {
        id: `extract-rec-${Date.now()}-${index}`,
        personaDraft: normalizedDraft,
        matchScore: clampScore(Number(recommendation.matchScore || 80)),
        reasoning: recommendation.reasoning || '基于上传文档自动提取'
      };
    })
    .filter((recommendation) => Boolean(recommendation.personaDraft));
};

export const compareABReports = ({
  reportA,
  reportB,
  personaId,
  frameworkId,
  frameworkName,
  comparabilityNote
}: {
  reportA: FrameworkReport;
  reportB: FrameworkReport;
  personaId: string;
  frameworkId: string;
  frameworkName: string;
  comparabilityNote?: string;
}): ABComparisonReport => {
  const dimensionComparisons = normalizeDimensionComparisons(reportA, reportB);
  const winner: ABComparisonReport['winner'] =
    reportA.overallScore > reportB.overallScore
      ? 'A'
      : reportA.overallScore < reportB.overallScore
      ? 'B'
      : 'TIE';

  const summary =
    winner === 'TIE'
      ? `A/B 两方案综合评分接近（A:${reportA.overallScore}，B:${reportB.overallScore}），建议结合业务目标继续验证。`
      : winner === 'A'
      ? `A 方案综合表现更优（A:${reportA.overallScore}，B:${reportB.overallScore}），建议优先采用 A。`
      : `B 方案综合表现更优（A:${reportA.overallScore}，B:${reportB.overallScore}），建议优先采用 B。`;

  const betterReport = winner === 'A' ? reportA : winner === 'B' ? reportB : null;
  const betterOptionAnswer =
    winner === 'TIE'
      ? '两方案综合结果接近，建议以关键业务指标（转化率、任务完成时长、投诉率）进行线上验证后再决策。'
      : `更优方案（${winner}）潜在效果：${betterReport?.executiveSummary || '整体体验更稳定，预计可提升任务完成率与用户满意度。'} ${
          betterReport?.personaPerspective || ''
        }`.trim();

  return {
    personaId,
    frameworkId,
    frameworkName,
    winner,
    overallScoreA: reportA.overallScore,
    overallScoreB: reportB.overallScore,
    comparabilityNote,
    summary,
    betterOptionAnswer,
    dimensionComparisons,
    reportA,
    reportB
  };
};

export const generateOptimizedDesign = async (
  originalImageBase64: string,
  persona: Persona,
  report: FrameworkReport,
  apiConfig: ApiConfig = { provider: 'google' }
): Promise<string> => {
  const cleanBase64 = originalImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
  const imageModel = apiConfig.imageModel || 'google/gemini-3-pro-preview';

  const criticalIssues = report.issues
    .filter((issue) => ['一级问题', '二级问题', '严重', '高'].includes(issue.severity))
    .map((issue) => `- [${issue.severity}] ${issue.location}: ${issue.description} -> ${issue.recommendation}`)
    .join('\n');
  const suggestions = report.optimizationSuggestions.map((suggestion) => `- ${suggestion}`).join('\n');

  const prompt = `
你是一位世界级 UI/UX 设计师，请基于原始界面产出优化版设计图。
评测体系：${report.frameworkName}
角色：${persona.name}

高优先问题：
${criticalIssues || '- 暂无严重问题，关注整体体验升级'}

优化建议：
${suggestions || '- 暂无建议'}

要求：
1) 保持核心业务信息与品牌语义，不要改成无关产品；
2) 重点修复可读性、交互反馈、层级与可操作性；
3) 输出高保真、可落地风格方案。
`;

  if (apiConfig.provider === 'openrouter') {
    const openRouterKey = getOpenRouterApiKey();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'ETS Agent'
      },
      body: JSON.stringify({
        model: imageModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanBase64}` } }
            ]
          }
        ],
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenRouter Image Gen Error: ${err.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const imageUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) throw new Error('No image generated by OpenRouter.');
    return imageUrl;
  }

  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: imageModel,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
        { text: prompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '1K'
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }

  throw new Error(`No image generated by ${imageModel}.`);
};