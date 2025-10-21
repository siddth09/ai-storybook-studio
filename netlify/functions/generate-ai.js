// netlify/functions/generate-ai.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const STORY_PAGE_COUNT_DEFAULT = 3;

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function askForStory(prompt, pageCount = STORY_PAGE_COUNT_DEFAULT) {
  const system = `You are a helpful children's storybook author. Produce a JSON object only:
{
  "title": "a short story title",
  "pages": [
    { "page_number": 1, "text": "story text", "imagePrompt": "illustration description" }
  ]
}`;

  const user = `Write a ${pageCount}-page children's story about: ${prompt}`;
  const model = client.getGenerativeModel({ model: "gemini-1.5-pro" });

  const res = await model.generateContent([system, user]);
  const raw = (res && res.response && typeof res.response.text === "function")
    ? await res.response.text()
    : (res?.response?.text && res.response.text()) || '';

  let jsonText = (raw || '').toString().trim();
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\n?/, "");
  if (jsonText.endsWith("```")) jsonText = jsonText.replace(/```$/, "").trim();

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse model output as JSON: " + jsonText.slice(0, 200));
  }
}

export const handler = async (event) => {
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, message: "generate-ai function deployed" })
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { prompt, pageCount } = JSON.parse(event.body || "{}");
    if (!prompt) return { statusCode: 400, body: JSON.stringify({ error: "Missing prompt" }) };

    const storyJson = await askForStory(prompt, pageCount || STORY_PAGE_COUNT_DEFAULT);

    const pages = (storyJson.pages || []).map(p => ({
      page_number: p.page_number,
      text: p.text,
      imagePrompt: p.imagePrompt,
      imageUrl: `https://placehold.co/600x400/EEF2FF/0B4C86?text=${encodeURIComponent(p.imagePrompt || p.text || '')}`,
      audioUrl: null
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story: { title: storyJson.title, pages } })
    };
  } catch (error) {
    console.error("generate-ai error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message })
    };
  }
};
