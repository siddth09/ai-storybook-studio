// netlify/functions/generate-ai.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  try {
    const { prompt } = JSON.parse(req.body);

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json({ story: text });
  } catch (err) {
    console.error("generate-ai error:", err);
    return res.status(500).json({ error: err.message });
  }
}
