import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (action === 'analyzePhoto') {
      const { base64Data, mimeType } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: 'Analiza esta foto de un corredor o participante. Describe brevemente el entorno, la emoción y sugiere qué tipo de marco del Wanda Tupi Trail le quedaría bien (ej: selva, barro, llegada).' }
          ]
        }
      });
      return res.status(200).json({ text: response.text });
    }
    
    if (action === 'generateVideo') {
      const { prompt } = payload;
      const operation = await ai.models.generateVideos({
        model: 'veo-3.1-lite-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '1080p',
          aspectRatio: '9:16'
        }
      });
      return res.status(200).json({ operation }); 
    }

    if (action === 'generateFrame') {
      const { prompt, referenceImages, imageSize } = payload;
      const parts: any[] = referenceImages.map((img: any) => ({
        inlineData: { data: img.data, mimeType: img.mimeType }
      }));
      parts.push({ text: `A decorative frame for a trail running event called "Wanda Tupi Trail". The frame MUST have a transparent center area for a photo. Style: ${prompt}` });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize
          }
        }
      });
      
      let base64Image = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
      return res.status(200).json({ base64Image });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}
