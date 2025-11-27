
import { GoogleGenAI, Type } from "@google/genai";
import { Persona, UESReport, EvaluationModel, ApiConfig } from "../types";

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
    请严格基于 ETS 模型的以下 8 个核心维度进行评估：
    
    1. 功能流程 (Function Flow)
       - 功能完善性：流程闭环，满足需求，无冗余。
       - 功能有效性：入口显眼，易找到。
       - 功能逻辑性：流程可视、可追踪，符合逻辑。
       - 功能辅助性：关键步骤有提示，减少重复输入。
    
    2. 信息认知 (Information Cognition)
       - 信息完整性：内容真实准确详细。
       - 信息可读性：文案无歧义，易理解。
       - 信息协同性：跨渠道/页面信息保持一致。
    
    3. 交互设计 (Interaction Design)
       - 状态可见性：反馈即时，状态明显。
       - 布局合理性：导航清晰，方便定位。
       - 操作便捷性：提供快捷操作，减少步骤。
       - 操作安全性/一致性：防错机制，操作习惯统一。
    
    4. 系统性能 (System Performance)
       - 系统稳定性：不崩溃，兼容性好。
       - 系统响应性：运行流畅，交互灵敏。
    
    5. 信息安全 (Information Safety)
       - 隐私保护，交易安全保障。
       - 风险预警与补救措施。
    
    6. 视觉设计 (Visual Design)
       - 布局合理，无干扰。
       - 风格统一（图标/颜色）。
       - 视觉美观，亲切柔和。
    
    7. 智能化 (Intelligence)
       - 用户洞察与推荐。
       - 指令识别准确。
       - 情感化设计与连接。
    
    8. 运营服务 (Operation Service)
       - 内容更新及时。
       - 客服专业友好。
       - 价值感知与竞争力。
  `
};

const callOpenRouter = async (
  prompt: string,
  base64Image: string,
  apiKey: string,
  model: string
): Promise<UESReport> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  
  // Construct messages for OpenRouter (OpenAI compatible)
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt + "\n\nIMPORTANT: Return ONLY valid JSON."
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${cleanBase64}`
          }
        }
      ]
    }
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin, // Required by OpenRouter
        "X-Title": "UES Agent"
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
  base64Image: string,
  persona: Persona,
  model: EvaluationModel = EvaluationModel.UES,
  apiConfig: ApiConfig = { provider: 'google' }
): Promise<UESReport> => {
  const dimensionDescription = model === EvaluationModel.UES 
    ? "五个维度的评分：易用性, 一致性, 清晰度, 美观度, 效率"
    : "八个维度的评分：功能流程, 信息认知, 交互设计, 系统性能, 信息安全, 视觉设计, 智能化, 运营服务";

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

  const prompt = `
    你是一个世界级的体验评估专家智能体。
    你的任务是基于 **${model} 评估模型** 对上传的 UI 设计图进行严格审计。
    
    审计必须严格基于以下【用户画像】的视角进行：
    ${personaDescription}

    **评估标准：**
    ${MODEL_DEFINITIONS[model]}

    请提供严格的 JSON 输出，不要包含任何 Markdown 格式（如 \`\`\`json），直接返回 JSON 对象。**所有内容必须使用简体中文**：
    
    期望的 JSON 结构:
    {
      "overallScore": number (0-100),
      "dimensionScores": [
        { "dimension": "string", "score": number, "comment": "string" }
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
      base64Image, 
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
            comment: { type: Type.STRING },
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
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
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
          "X-Title": "UES Agent"
        },
        body: JSON.stringify({
          model: 'google/gemini-3-pro-image-preview',
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
  const modelName = 'gemini-3-pro-image-preview';
  const ai = getAIClient();

  try {
    const response = await ai.models.generateContent({
      model: modelName,
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
    throw new Error("No image generated by Gemini 3 Pro.");
  } catch (error) {
    console.error("Image Optimization Failed:", error);
    throw error;
  }
};
