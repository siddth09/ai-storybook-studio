// netlify/functions/generate-ai.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { prompt } = body;

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt is required" }),
      };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ story: text }),
    };
  } catch (err) {
    console.error("generate-ai error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
