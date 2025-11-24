import { GoogleGenAI, Type } from "@google/genai";
import { Persona, UESReport } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeDesign = async (
  base64Image: string,
  persona: Persona
): Promise<UESReport> => {
  
  // Define the strict schema for the output
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      overallScore: { type: Type.NUMBER, description: "UES 总分 (0-100)" },
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
        description: "五个维度的评分：易用性, 一致性, 清晰度, 美观度, 效率",
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
    你是一个世界级的 UES (用户体验系统) 智能体 (Agent)。
    你的任务是基于 UES 框架对上传的 UI 设计图进行审计。
    
    审计必须严格基于以下【用户画像】的视角进行：
    ${personaDescription}

    如果角色类型 (Role) 是 USER (用户)，请重点关注该特定用户群体的易用性、清晰度和效率。
    如果角色类型 (Role) 是 EXPERT (专家)，请重点关注一致性（设计规范）、启发式评估原则和最佳实践。

    请从以下 5 个维度评估设计：
    1. 易用性 (Usability)
    2. 一致性 (Consistency)
    3. 清晰度 (Clarity)
    4. 美观度 (Aesthetics)
    5. 效率 (Efficiency)

    请提供严格的 JSON 输出，**所有内容必须使用简体中文**：
    - 一个总体评分 (0-100)。
    - 5个维度的具体评分和简短评语。
    - 一份定性的执行摘要。
    - 一个专门的章节，描述该特定画像眼中的体验（例如：“作为一个新手用户，我感觉……”）。
    - 发现的具体 UI 问题列表 (严重程度分为: 严重/高/中/低)。
    - 3-5 条战略性的优化建议。
  `;

  try {
    // Strip base64 prefix if present
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

    return JSON.parse(response.text) as UESReport;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};