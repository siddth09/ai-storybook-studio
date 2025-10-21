import fetch from "node-fetch";

export const handler = async (event) => {
  try {
    const { prompt } = JSON.parse(event.body || "{}");
    if (!prompt) return { statusCode: 400, body: "No prompt provided" };

    const API_KEY = process.env.GOOGLE_API_KEY; // Store in Netlify Environment Variables

    const STORY_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
    const TTS_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;
    const IMAGE_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;

    // 1️⃣ Generate Story JSON
    const storyPayload = {
      contents: [
        {
          parts: [
            {
              text: `Create a short, 3-page children's story based on this idea: "${prompt}". Return JSON with title, pages[], each with text & image_prompt.`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const storyRes = await fetch(STORY_MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storyPayload)
    });

    const storyDataRaw = await storyRes.text();
    let storyData;
    try {
      storyData = JSON.parse(storyDataRaw);
    } catch {
      // Sometimes Google wraps JSON inside string
      storyData = JSON.parse(JSON.parse(storyDataRaw)?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    }

    if (!storyData.pages || storyData.pages.length === 0) {
      return { statusCode: 500, body: "Invalid story response from model" };
    }

    // 2️⃣ Generate images for each page
    for (const page of storyData.pages) {
      const imagePayload = { instances: [{ prompt: page.image_prompt }], parameters: { sampleCount: 1 } };
      const imgRes = await fetch(IMAGE_MODEL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imagePayload)
      });
      const imgResult = await imgRes.json();
      const base64Img = imgResult.predictions?.[0]?.bytesBase64Encoded;
      page.imageUrl = base64Img ? `data:image/png;base64,${base64Img}` : null;
    }

    // 3️⃣ Optionally: TTS URLs (skip actual PCM conversion for simplicity)
    // For production, you can add TTS generation similar to image

    return {
      statusCode: 200,
      body: JSON.stringify(storyData)
    };
  } catch (err) {
    console.error("generate-ai error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
