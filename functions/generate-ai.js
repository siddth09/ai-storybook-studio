import { GoogleGenAI } from '@google/genai';

// Initialize GoogleGenAI using the environment variable set in Netlify
// The key must be named GEMINI_API_KEY in Netlify's settings.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the core function logic
const handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // Ensure API Key is set
    if (!process.env.GEMINI_API_KEY) {
         return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Serverless function misconfigured: GEMINI_API_KEY is missing.' }),
        };
    }

    try {
        const { prompt, pageCount } = JSON.parse(event.body);

        if (!prompt || !pageCount) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing prompt or pageCount in request body.' }),
            };
        }

        const finalStoryData = await generateFullStory(prompt, pageCount);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalStoryData),
        };

    } catch (error) {
        console.error('Full Story Generation Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to generate story components: ${error.message}` }),
        };
    }
};

/**
 * Executes the three-step process: Story, Image, and TTS generation.
 * @param {string} prompt - The user's story idea.
 * @param {number} pageCount - The number of pages to generate.
 * @returns {Promise<object>} The final story object with all URLs/data.
 */
async function generateFullStory(prompt, pageCount) {
    // 1. Generate Story Structure (Text, Image Prompts, Titles)
    const storyJson = await generateStoryStructure(prompt, pageCount);

    const totalPages = storyJson.pages.length;

    // 2. Loop through pages to generate assets
    for (let i = 0; i < totalPages; i++) {
        const page = storyJson.pages[i];

        // 2a. Generate Image (Imagen)
        const imagePrompt = page.image_prompt;
        page.imageUrl = await generateIllustration(imagePrompt);

        // 2b. Generate TTS (Gemini TTS)
        page.audioData = await generateNarration(page.text);
    }

    return storyJson;
}


async function generateStoryStructure(prompt, pageCount) {
    const storyPayload = {
        contents: [{ parts: [{ text: `Create a short, ${pageCount}-page children's story based on this idea: "${prompt}". The output MUST be a JSON object conforming to the following schema. The image_prompt should be highly descriptive and suitable for an illustration model.` }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "title": { "type": "STRING", "description": "A catchy title for the story." },
                    "pages": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "page_number": { "type": "INTEGER" },
                                "text": { "type": "STRING", "description": "The story text for this page (2-3 sentences max)." },
                                "image_prompt": { "type": "STRING", "description": "A descriptive prompt for an image generator to illustrate this page." }
                            }
                        }
                    }
                }
            }
        },
        model: "gemini-2.5-flash-preview-05-20"
    };

    const response = await ai.models.generateContent(storyPayload);
    const jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
        throw new Error("Gemini returned no valid JSON content for the story structure.");
    }

    return JSON.parse(jsonText);
}


async function generateIllustration(imagePrompt) {
    try {
        const payload = { 
            instances: [{ prompt: imagePrompt }], 
            parameters: { "sampleCount": 1 } 
        };
        
        // Use the predict endpoint for Imagen-3.0
        const response = await ai.request({
            model: "imagen-3.0-generate-002",
            path: "predict",
            httpMethod: "POST",
            body: payload
        });

        const base64Img = response.predictions?.[0]?.bytesBase64Encoded;
        
        if (base64Img) {
            return `data:image/png;base64,${base64Img}`;
        }
        return null;
    } catch(e) {
        console.error("Imagen generation failed:", e);
        return null; // Return null so the page still loads
    }
}

async function generateNarration(text) {
    try {
        const ttsPayload = {
            contents: [{ parts: [{ text: `Say in a friendly, cheerful voice: ${text}` }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Puck" } // Cheerful voice
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        
        const response = await ai.models.generateContent(ttsPayload);

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const base64Audio = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType; 

        if (base64Audio && mimeType) {
            // Return raw base64 data and mime type for client-side WAV conversion
            return { data: base64Audio, mimeType: mimeType };
        }
        return { data: 'TTS_FAILED', mimeType: '' }; 

    } catch(e) {
        console.error("TTS generation failed:", e);
        return { data: 'TTS_FAILED', mimeType: '' }; 
    }
}

export { handler };
