import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { DataRow } from '../types';

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

export const generateDataWithAI = async (
  apiKey: string,
  ocrText: string,
  userPrompt: string,
  placeholderNames: string[]
): Promise<DataRow[]> => {
  if (!apiKey) throw new Error("API Key is required.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const systemPrompt = `Analyze the text and fulfill the request. Respond ONLY with a valid JSON array of objects. Do not include markdown. Each object must contain these keys: ${JSON.stringify(placeholderNames)}. CONTEXT: ${ocrText} REQUEST: ${userPrompt}`;
  const result = await model.generateContent(systemPrompt);
  const jsonText = result.response.text().replace(/^```json\s*|```$/g, '').trim();
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data)) throw new Error("AI did not return an array.");
  const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return data.map(row => ({ ...row, id: generateId() }));
};
