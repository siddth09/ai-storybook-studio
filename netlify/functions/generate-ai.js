// netlify/functions/generate-ai.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const STORY_PAGE_COUNT_DEFAULT = 3;

// create client with API key from environment
const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Ask Gemini to return a strict JSON structure:
 * { title: "...", pages: [ { page_number: 1, text: "...", imagePrompt: "..." }, ... ] }
 */
async function askForStory(prompt, pageCount = STORY_PAGE_COUNT_DEFAULT) {
  const system = `You are a helpful children's storybook author. Produce a JSON object only, with no explanatory text, no markdown, and no extra fields. The JSON schema:

{
  "title": "a short story title",
  "pages": [
    {
      "page_number": 1,
      "text": "2-3 sentences of story text for this page",
      "imagePrompt": "a highly descriptive illustration prompt suitable for a 3D/illustration model"
    },
    ...
  ]
}

Produce exactly ${pageCount} pages.`;

  const user = `Write a ${pageCount}-page children's story based on: ${prompt}`;

  // Use Gemini model
  const model = client.getGenerativeModel({ model: "gemini-1.5-pro" });

  // We send system + user as input (array)
  const res = await model.generateContent([system, user]);

  // get textual response
  const raw = (res?.response?.text && res.response.text()) || '';

  // sanitize potential code fences
  let jsonText = raw.trim();
  if (jsonText.startsWith("```")) {
    // remove leading fence + optional language
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "");
  }
  if (jsonText.endsWith("```")) jsonText = jsonText.replace(/```$/, "").trim();

  // Try to parse JSON
  try {
    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch (err) {
    // If parsing fails, attempt to extract JSON substring
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        throw new Error("AI returned invalid JSON.");
      }
    }
    throw new Error("Unable to parse story JSON from model output.");
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt || (body.prompt === 0 ? "0" : null);
    const pageCount = parseInt(body.pageCount || STORY_PAGE_COUNT_DEFAULT, 10);

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'prompt' in request body" }) };
    }

    // Generate story JSON (title + pages with text + imagePrompt)
    const storyJson = await askForStory(prompt, pageCount);

    // Add safe placeholder imageUrl for each page (client will use browser TTS)
    const pages = (storyJson.pages || []).map(p => ({
      page_number: p.page_number,
      text: p.text,
      imagePrompt: p.imagePrompt || p.image_prompt || '',
      // placeholder image — client will replace with real image generation later
      imageUrl: `https://placehold.co/600x400/EEF2FF/0B4C86?text=${encodeURIComponent((p.imagePrompt || p.text || '').slice(0, 60))}`,
      audioUrl: null
    }));

    const responsePayload = {
      title: storyJson.title || "AI Storybook",
      pages
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story: responsePayload })
    };

  } catch (error) {
    console.error("generate-ai error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Server error" })
    };
  }
};
