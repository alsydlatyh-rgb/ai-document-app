import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { DataRow } from '../types';

// This helper function remains the same
const fileToGenerativePart = async (file: File): Promise<Part> => {
  const base64EncodedData = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
};

// This function for auto-detection remains the same
export const detectPlaceholdersWithAI = async (apiKey: string, templateFile: File): Promise<any[]> => {
  if (!apiKey) throw new Error("API Key is required.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  const prompt = `Analyze this document template. Identify all fields where a user would input data (e.g., dotted lines, empty spaces next to labels). Respond ONLY with a valid JSON array of objects. Each object must have this structure: { "name": "snake_case_name", "x": 0.15, "y": 0.22, "width": 0.50, "height": 0.05 }. Coordinates must be percentages of the image dimensions.`;
  const imagePart = await fileToGenerativePart(templateFile);
  const result = await model.generateContent([prompt, imagePart]);
  const jsonText = result.response.text().replace(/^```json\s*|```$/g, '').trim();
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data)) throw new Error("AI did not return an array of placeholders.");
  return data;
};

// UPDATED: This function now accepts the JSON example
export const generateDataWithAI = async (
  apiKey: string,
  knowledgeBase: string,
  userPrompt: string,
  jsonExample: string // New parameter
): Promise<DataRow[]> => {
  if (!apiKey) throw new Error("API Key is required.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // NEW: Construct the prompt with the user's example
  const systemPrompt = `
You are a data extraction expert. Your task is to analyze the KNOWLEDGE BASE and extract information based on the USER REQUEST.

You MUST follow the exact format and style of the provided JSON EXAMPLE.

---
JSON EXAMPLE (This is the format you must replicate):
${jsonExample}
---
KNOWLEDGE BASE (Source text to extract from):
${knowledgeBase}
---
USER REQUEST:
${userPrompt}
---

Now, generate a valid JSON array containing objects for all matching entries found in the KNOWLEDGE BASE. Respond ONLY with the JSON array and nothing else.
  `;

  const result = await model.generateContent(systemPrompt);
  const jsonText = result.response.text().replace(/^```json\s*|```$/g, '').trim();
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data)) throw new Error("AI did not return an array.");
  const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return data.map(row => ({ ...row, id: generateId() }));
};
