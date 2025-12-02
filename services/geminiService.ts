
import { GoogleGenAI, Type } from "@google/genai";
import { Persona, UESReport, EvaluationModel, ApiConfig, ProcessStep } from "../types";

// Note: API Key must be obtained from process.env.API_KEY or via window.aistudio for high-end models
const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Definitions for the evaluation models
const MODEL_DEFINITIONS = {
  [EvaluationModel.UES]: `
    请从以下 5 个 UES 维度评估设计：
    1. 易用性 (Usability) - 易学性、易记性、效率。
    2. 一致性 (Consistency) - 视觉、交互、文案的一致性。
    3. 清晰度 (Clarity) - 信息层级、可读性。
    4. 美观度 (Aesthetics) - 视觉吸引力、极简主义。
    5. 效率 (Efficiency) - 任务完成速度、快捷操作。
  `,
  [EvaluationModel.ETS]: `
    请严格基于 ETS 模型的以下 8 个核心维度及其细分指标进行评估。
    对于每个维度，请在打分的同时，在 comment 字段中提供简要的定性描述，指出符合或不符合以下细则的地方。

    1. 功能流程 (Function Flow)
    核心：业务闭环与容错机制
    1.1 功能完善性：断点续连（意外退出恢复）、逆向流程（易进易出，如解绑/赎回闭环）。
    1.2 功能有效性：高频入口层级（1-2次点击）、搜索触达（支持模糊匹配）。
    1.3 功能逻辑性：长流程的进度反馈（进度条）。
    1.4 功能辅助性：历史复用（如转账人推荐）、OCR识别（减少录入）。

    2. 信息认知 (Information Cognition)
    核心：降低金融/专业门槛（说人话）
    2.1 信息完整性：关键决策要素披露（风险等级、费率等在首屏）。
    2.2 信息可读性：术语翻译（通俗解释）、排版层级（单位处理，如“万”）。
    2.3 信息协同性：全渠道信息同步（避免信息孤岛）。

    3. 交互设计 (Interaction Design)
    核心：操作负荷与防错
    3.1 状态可见性：骨架屏加载、按钮状态明确（不可用原因）。
    3.2 布局合理性：热区范围（移动端>44x44pt）。
    3.3 操作便捷性：剪贴板读取与自动弹窗。
    3.4 操作安全性：不可逆操作的二次确认。
    3.5 操作一致性：手势统一。

    4. 系统性能 (System Performance)
    核心：技术感知的显性化
    4.1 系统稳定性：弱网适配（缓存与提示）。
    4.2 系统响应性：首屏时间（1-2s）、列表无感加载（懒加载）。

    5. 信息安全 (Information Safety)
    核心：安全感与便利性的平衡
    5.1 信息安全性：敏感信息脱敏（小眼睛）、截屏反馈。
    5.3 风险预警性：风险交易阻断与预警。

    6. 视觉设计 (Visual Design)
    核心：品牌传达与无障碍
    6.1 视觉布局：留白呼吸感（斑马纹/行间距）。
    6.3 视觉美观：品牌基因体现（专业严谨）、适老化设计（字号、对比度）。

    7. 智能化 (Intelligence)
    核心：从“指令执行”到“主动关怀”
    7.1 用户洞察：场景预判（还款提醒、境外服务）。
    7.3 情感连接：微文案情感化、节日关怀。

    8. 运营服务 (Operation Service)
    核心：价值提供与服务闭环
    8.1 内容运营：资讯相关度（千人千面）。
    8.2 服务专业性：人机无缝切换（保留记录）。
    8.3 价格合理性：优惠显性化（感知“占便宜”）。
  `
};

const callOpenRouter = async (
  prompt: string,
  input: string | ProcessStep[],
  apiKey: string,
  model: string
): Promise<UESReport> => {
  
  const messagesContent: any[] = [
    {
      type: "text",
      text: prompt + "\n\nIMPORTANT: Return ONLY valid JSON."
    }
  ];

  if (Array.isArray(input)) {
    // Handle Business Flow
    input.forEach((step, index) => {
      const cleanBase64 = step.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
      messagesContent.push({
        type: "text",
        text: `Step ${index + 1}: ${step.description || "User views this screen"}`
      });
      messagesContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${cleanBase64}`
        }
      });
    });
  } else {
    // Handle Single Image
    const cleanBase64 = input.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    messagesContent.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${cleanBase64}`
      }
    });
  }

  const messages = [
    {
      role: "user",
      content: messagesContent
    }
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin, // Required by OpenRouter
        "X-Title": "ETS Agent"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        // Enable reasoning if using pro-preview models as requested
        reasoning: { enabled: true },
        // Try to enforce JSON mode if supported by the provider/model
        response_format: { type: "json_object" } 
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenRouter API Error: ${err.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const messageContent = result.choices[0]?.message?.content;
    
    if (!messageContent) {
      throw new Error("No content received from OpenRouter.");
    }

    // Clean up potential markdown code blocks
    const jsonStr = messageContent.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(jsonStr) as UESReport;

  } catch (error) {
    console.error("OpenRouter Call Failed:", error);
    throw error;
  }
};

export const analyzeDesign = async (
  input: string | ProcessStep[],
  persona: Persona,
  model: EvaluationModel = EvaluationModel.UES,
  apiConfig: ApiConfig = { provider: 'google' }
): Promise<UESReport> => {
  const dimensionDescription = model === EvaluationModel.UES 
    ? "五个维度的评分：易用性, 一致性, 清晰度, 美观度, 效率"
    : "八个维度的评分。注意：对于 ETS 模型，必须在 comment 字段中详细描述该维度下符合或违反细则的具体情况（如是否支持断点续连、是否有脱敏处理等）。维度包含：功能流程, 信息认知, 交互设计, 系统性能, 信息安全, 视觉设计, 智能化, 运营服务";

  const personaDescription = `
    角色类型: ${persona.role}
    姓名: ${persona.name}
    年龄: ${persona.attributes.age}
    科技熟练度: ${persona.attributes.techSavviness}
    领域知识: ${persona.attributes.domainKnowledge}
    目标: ${persona.attributes.goals}
    环境: ${persona.attributes.environment}
    挫折容忍度: ${persona.attributes.frustrationTolerance}
    设备习惯: ${persona.attributes.deviceHabits}
  `;

  const isFlow = Array.isArray(input);

  const contextPrompt = isFlow 
    ? `这是一次针对【完整业务流程】的评估。你将看到一系列按顺序排列的截图，每张截图都附带了用户的操作说明（例如“点击转账按钮”）。
       请重点关注：
       1. 流程连贯性：步骤之间的跳转是否符合逻辑？
       2. 反馈及时性：用户操作后系统是否有明确反馈？
       3. 闭环体验：流程是否完整，是否有中断或死胡同？
    ` 
    : `这是一次针对【单个界面】的评估。`;

  const prompt = `
    你是一个世界级的体验评估专家智能体。
    你的任务是基于 **${model} 评估模型** 对上传的 UI 设计进行严格审计。
    
    ${contextPrompt}

    审计必须严格基于以下【用户画像】的视角进行：
    ${personaDescription}

    **评估标准：**
    ${MODEL_DEFINITIONS[model]}

    请提供严格的 JSON 输出，不要包含任何 Markdown 格式（如 \`\`\`json），直接返回 JSON 对象。**所有内容必须使用简体中文**：
    
    期望的 JSON 结构:
    {
      "overallScore": number (0-100),
      "dimensionScores": [
        { "dimension": "string", "score": number, "comment": "string (请在此处提供基于细则的简略定性描述)" }
      ],
      "executiveSummary": "string",
      "personaPerspective": "string",
      "issues": [
        { "severity": "严重" | "高" | "中" | "低", "location": "string", "description": "string", "recommendation": "string" }
      ],
      "optimizationSuggestions": ["string"]
    }
  `;

  // --- BRANCH: OpenRouter ---
  if (apiConfig.provider === 'openrouter') {
    if (!apiConfig.openRouterKey) {
      throw new Error("OpenRouter API Key is missing. Please configure it in Settings.");
    }
    const report = await callOpenRouter(
      prompt, 
      input, 
      apiConfig.openRouterKey, 
      apiConfig.openRouterModel || "google/gemini-3-pro-preview"
    );
    report.modelType = model;
    return report;
  }

  // --- BRANCH: Google GenAI (Default) ---
  const ai = getAIClient();

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      overallScore: { type: Type.NUMBER, description: "总分 (0-100)" },
      dimensionScores: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            dimension: { type: Type.STRING },
            score: { type: Type.NUMBER },
            comment: { type: Type.STRING, description: "基于细分指标的简略定性描述" },
          },
          required: ["dimension", "score", "comment"],
        },
        description: dimensionDescription,
      },
      executiveSummary: { type: Type.STRING, description: "体验的定性总结报告" },
      personaPerspective: { type: Type.STRING, description: "基于特定角色属性的具体分析视角" },
      issues: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            severity: { type: Type.STRING, enum: ["严重", "高", "中", "低"] },
            location: { type: Type.STRING },
            description: { type: Type.STRING },
            recommendation: { type: Type.STRING },
          },
          required: ["severity", "location", "description", "recommendation"],
        },
      },
      optimizationSuggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "战略性的高层优化建议",
      },
    },
    required: [
      "overallScore",
      "dimensionScores",
      "executiveSummary",
      "personaPerspective",
      "issues",
      "optimizationSuggestions",
    ],
  };

  try {
    let contentParts: any[] = [];

    // Push Prompt First or mixed? Gemini typically likes System Prompt -> User Content.
    // We will put the instruction in text, then the images/texts.
    
    contentParts.push({ text: prompt });

    if (Array.isArray(input)) {
        // Interleave steps
        input.forEach((step, idx) => {
            const cleanBase64 = step.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
            
            contentParts.push({
                text: `\n--- 步骤 ${idx + 1} ---\n用户操作说明: ${step.description || "无说明"}\n界面截图:`
            });
            contentParts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: cleanBase64
                }
            });
        });
    } else {
        const cleanBase64 = input.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
        contentParts.push({
            inlineData: {
                mimeType: "image/png",
                data: cleanBase64
            }
        });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: contentParts
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (!response.text) {
      throw new Error("No response from Gemini.");
    }

    const report = JSON.parse(response.text) as UESReport;
    report.modelType = model;
    return report;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const generateOptimizedDesign = async (
  originalImageBase64: string,
  persona: Persona,
  report: UESReport,
  apiConfig: ApiConfig = { provider: 'google' }
): Promise<string> => {
  const cleanBase64 = originalImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

  // Use selected image model or default
  const imageModel = apiConfig.imageModel || 'gemini-3-pro-image-preview';

  // Construct a focused prompt based on the specific issues found in the report
  const criticalIssues = report.issues
    .filter(i => ['严重', '高'].includes(i.severity))
    .map(i => `- 位置: ${i.location}, 问题: ${i.description}, 建议: ${i.recommendation}`)
    .join('\n');

  const strategicSuggestions = report.optimizationSuggestions
    .map(s => `- ${s}`)
    .join('\n');

  const prompt = `
    你是一位世界级的 UI/UX 设计师。请基于原始界面截图，为用户【${persona.name}】重新设计并优化这个界面。

    本次优化的核心目的是**修复审计报告中发现的具体问题**。

    用户画像信息：
    - 年龄: ${persona.attributes.age}
    - 视觉/科技能力: ${persona.attributes.techSavviness}
    - 核心目标: ${persona.attributes.goals}

    请重点解决以下【严重/高优先级问题】：
    ${criticalIssues || "暂无严重问题，请关注整体体验提升。"}

    请参考以下【优化建议】：
    ${strategicSuggestions}

    设计要求：
    1. **针对性修复**：如果报告指出按钮太小，请放大；如果对比度低，请增加对比度；如果布局混乱，请整理布局。
    2. **保持一致性**：保持原产品的核心品牌色和功能逻辑，不要把 App 变成完全不同的东西，而是它的"完美修复版"。
    3. **输出质量**：高保真、现代化、干净、专业。

    请直接输出优化后的 UI 设计图。
  `;

  // --- BRANCH: OpenRouter Image Generation ---
  if (apiConfig.provider === 'openrouter') {
    if (!apiConfig.openRouterKey) {
      throw new Error("OpenRouter API Key is missing for image generation.");
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiConfig.openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "ETS Agent"
        },
        body: JSON.stringify({
          model: imageModel, // Use selected model
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${cleanBase64}`
                  }
                }
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

      if (result.choices && result.choices.length > 0) {
        const message = result.choices[0].message;
        // Check for images in the specific structure provided
        if (message.images && message.images.length > 0) {
          return message.images[0].image_url.url;
        }
      }
      
      throw new Error("No image generated by OpenRouter.");

    } catch (error) {
      console.error("OpenRouter Image Optimization Failed:", error);
      throw error;
    }
  }

  // --- BRANCH: Google GenAI (Default) ---
  const ai = getAIClient();

  try {
    const response = await ai.models.generateContent({
      model: imageModel, // Use selected model (must be a valid Google model, e.g. gemini-3-pro-image-preview)
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1", // Default to square for stability
            imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error(`No image generated by ${imageModel}.`);
  } catch (error) {
    console.error("Image Optimization Failed:", error);
    throw error;
  }
};