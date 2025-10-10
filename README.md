# 📖 AI Storybook Studio

AI Storybook Studio is a single-page web application that generates personalized children's storybooks in real-time using Google's Generative AI APIs (Gemini, Imagen, and TTS).

It also features advanced input methods, including Speech-to-Text (STT) and client-side Optical Character Recognition (OCR) for image and PDF uploads using Tesseract.js and PDF.js.

[Try the App Here!](https://gemini.google.com/share/9b186e2b40cb)

---

## 🚀 Features

- **Story Generation**: Uses Gemini to create a structured, multi-page story with titles and text content.  
- **Real-time Illustrations**: Uses Imagen to generate a unique, high-quality illustration for each page based on the narrative text.  
- **Narration (TTS)**: Uses the Gemini TTS model to generate a playable audio track for each page, turning the story into an audiobook.  
- **Speech-to-Text (STT)**: Allows users to speak their story idea directly into the prompt box.  
- **Client-side OCR**: Allows users to upload an image (.jpg, .png) or a single-page .pdf and extract the text to use as the story prompt.

---

## ⚙️ Deployment Instructions (Netlify via GitHub)

Since this is a single HTML file, deployment is quick and easy.

### Step 1: Initialize Git and Create GitHub Repository

1. **Save the file**: Save the provided HTML content as `index.html`.  
2. **Initialize Git**: Open your terminal in the directory where you saved `index.html` and run:

```bash
git init
git add index.html
git commit -m "Initial commit of the AI Storybook App"
