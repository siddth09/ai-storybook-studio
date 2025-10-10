import { GoogleGenAI } from '@google/genai';
import { Buffer } from 'buffer';

// Initialize the GoogleGenAI client
// Netlify automatically sets process.env.GEMINI_API_KEY from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const STORY_PAGE_COUNT = 3;

// Helper to convert base64 PCM to WAV format
function pcmToWav(pcm16, sampleRate, numberOfChannels = 1) {
    const buffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + pcm16.length * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (1 for PCM) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, numberOfChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numberOfChannels * 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, pcm16.length * 2, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(offset, pcm16[i], true);
        offset += 2;
    }

    return Buffer.from(buffer);
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * 1. Generates the full story structure and image prompts using Gemini.
 * @param {string} prompt - The user's story idea.
 * @returns {object} - The structured story data.
 */
async function generateStoryStructure(prompt) {
    const systemInstruction = `You are a creative children's storybook author. Write a cohesive, three-page story based on the user's prompt. Each page must have a text block and a detailed image prompt suitable for a 3D digital illustration model (like Imagen 3.0). Do not include the title in the page objects, but as a separate field.

    IMPORTANT: The response MUST be a single JSON object. DO NOT include any text, notes, or markdown formatting outside the JSON block.`;

    const userQuery = `Write a ${STORY_PAGE_COUNT}-page story about: ${prompt}`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: userQuery }] }],
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "title": { "type": "STRING", "description": "A fun, short title for the story." },
                    "pages": {
                        "type": "ARRAY",
                        "description": `An array containing exactly ${STORY_PAGE_COUNT} story pages.`,
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "page_number": { "type": "INTEGER" },
                                "text": { "type": "STRING", "description": "The story text for this page (2-3 sentences)." },
                                "image_prompt": { "type": "STRING", "description": "A detailed, descriptive prompt for an Imagen 3.0 model to create a colorful, whimsical, 3D illustration for this page's text." }
                            },
                            "required": ["page_number", "text", "image_prompt"]
                        }
                    }
                },
                "required": ["title", "pages"]
            }
        },
    };

    console.log("Gemini API Request Payload:", JSON.stringify(payload, null, 2)); // DEBUG LOG 2

    const response = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-05-20", payload });
    
    let jsonText = response.candidates[0].content.parts[0].text.trim();

    // FIX: The model sometimes wraps the JSON in markdown fences (```json...```). We must remove them.
    if (jsonText.startsWith('```json')) {
        // Remove '```json' and everything up to the first newline
        jsonText = jsonText.substring(jsonText.indexOf('\n') + 1).trim(); 
    }
    if (jsonText.endsWith('```')) {
        // Remove trailing '```'
        jsonText = jsonText.substring(0, jsonText.lastIndexOf('```')).trim(); 
    }

    return JSON.parse(jsonText);
}

/**
 * 2. Generates an illustration (base64) from the image prompt using Imagen.
 */
async function generateIllustration(imagePrompt) {
    const payload = {
        instances: [{ prompt: imagePrompt }],
        parameters: { "sampleCount": 1 }
    };

    const response = await ai.models.generateImages({ model: "imagen-3.0-generate-002", payload });
    const base64Data = response.predictions[0].bytesBase64Encoded;
    return `data:image/png;base64,${base64Data}`;
}

/**
 * 3. Generates the narration (WAV blob base64) from the story text using TTS.
 */
async function generateNarration(text) {
    const payload = {
        contents: [{ parts: [{ text: text }] }],
        config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Puck" } // Upbeat voice
                }
            }
        }
    };

    const response = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-tts", payload });
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!part) {
        throw new Error("TTS response missing audio data.");
    }

    const audioData = part.inlineData.data;
    const mimeType = part.inlineData.mimeType;

    // The API returns raw signed PCM 16 bit audio data. We need to convert it to WAV.
    const sampleRateMatch = mimeType.match(/rate=(\d+)/);
    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;

    const pcmDataBuffer = Buffer.from(audioData, 'base64');
    // Ensure we handle the buffer correctly for Int16Array
    const pcm16 = new Int16Array(pcmDataBuffer.buffer, pcmDataBuffer.byteOffset, pcmDataBuffer.length / 2);
    const wavBuffer = pcmToWav(pcm16, sampleRate);

    // Return the WAV data as a base64 string
    return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
}


// --- Main Handler ---

async function generateFullStory(prompt) {
    console.log("Starting Full Story Generation...");

    // 1. Generate story structure
    const storyStructure = await generateStoryStructure(prompt);

    // 2. Process pages in parallel
    const pagePromises = storyStructure.pages.map(async (page) => {
        // 2a. Generate Illustration
        const imageUrl = await generateIllustration(page.image_prompt);

        // 2b. Generate Narration
        const audioUrl = await generateNarration(page.text);

        return {
            ...page,
            imageUrl: imageUrl,
            audioUrl: audioUrl
        };
    });

    storyStructure.pages = await Promise.all(pagePromises);

    console.log("Full Story Generation Complete.");
    return storyStructure;
}


export async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {}; // Safer parsing
        const prompt = body.prompt || ''; // Default to empty string if not found

        console.log("Received prompt from client:", prompt); // DEBUG LOG 1

        // FIX: Ensure prompt is a non-empty string before passing it to the API
        if (typeof prompt !== 'string' || prompt.trim().length === 0) {
            return { statusCode: 400, body: 'Missing or empty story prompt.' };
        }

        const storyData = await generateFullStory(prompt);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storyData)
        };
    } catch (error) {
        console.error("Full Story Generation Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Story generation failed: ${error.message}` })
        };
    }
}
