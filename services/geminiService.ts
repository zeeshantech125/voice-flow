import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VoiceName, SupportedLanguage, ScriptModel, ChatMessage, PodcastLine } from "../types";

let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!aiClient) {
    // Initialize only when needed to prevent top-level environment access issues
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiClient;
};

/**
 * Generates speech from text using Gemini 2.5 Flash TTS.
 */
export const generateSpeech = async (text: string, voice: VoiceName): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO" as any],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      console.error("Gemini TTS Response missing audio:", JSON.stringify(response, null, 2));
      if (response.promptFeedback?.blockReason) {
         throw new Error(`Speech generation blocked: ${response.promptFeedback.blockReason}`);
      }
      throw new Error("No audio data returned from the model. Please try again.");
    }

    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};

/**
 * Generates a realistic food description text using a standard text model.
 * This is for the "Chef Mode" feature (Random).
 */
export const generateFoodDescription = async (): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Write a short, sensory-rich, mouth-watering description of a complex gourmet dish. Focus on textures, temperatures, and specific flavors. Keep it under 50 words.",
    });
    
    return response.text || "A delicious meal awaits.";
  } catch (error) {
    console.error("Error generating food text:", error);
    return "The chef is busy right now. Please try again later.";
  }
}

/**
 * Generates a description for a specific dish.
 */
export const generateDishDescription = async (dishName: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Write a short, sensory-rich, mouth-watering description of ${dishName}. Focus on textures, temperatures, and specific flavors. Keep it under 40 words.`,
    });
    
    return response.text || `The ${dishName} is prepared to perfection.`;
  } catch (error) {
    console.error("Error generating dish text:", error);
    return `We are currently out of ${dishName}.`;
  }
}

/**
 * Expands a short concept into a full voiceover script in the target language.
 */
export const expandScript = async (
  shortConcept: string, 
  language: SupportedLanguage, 
  model: ScriptModel
): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: `You are a professional scriptwriter for high-end commercials and narration. 
      
      Task: Expand the following short concept/draft into a compelling, professional voiceover script.
      Target Language: ${language} (The output MUST be in ${language}).
      Style: Engaging, vivid, and rhythmic. Designed to be spoken aloud by a voice actor.
      Length: Approximately 100-150 words.
      
      Input Concept: "${shortConcept}"
      
      Output only the script text in ${language}, no markdown formatting, no translations, no intro/outro.`,
    });
    
    return response.text || shortConcept;
  } catch (error) {
    console.error("Error expanding script:", error);
    throw error;
  }
}

/**
 * Generates a text response for the chat interface.
 */
export const generateChatResponse = async (history: ChatMessage[], message: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are a witty, helpful, and concise AI assistant named Flow. Your responses should be conversational and brief (under 50 words) to keep the voice conversation flowing naturally.",
      }
    });

    const result = await chat.sendMessage({ message });
    return result.text || "I'm listening.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    throw error;
  }
}

/**
 * Generates a podcast script based on a topic.
 */
export const generatePodcastScript = async (topic: string): Promise<PodcastLine[]> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Write a short podcast script about: "${topic}".
      Speakers: Host and Guest.
      Length: 4-6 lines total.
      Format: JSON array of objects with keys "speaker" and "text".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: { type: Type.STRING, enum: ["Host", "Guest"] },
              text: { type: Type.STRING },
            },
            required: ["speaker", "text"],
          },
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as PodcastLine[];
    }
    return [];
  } catch (error) {
    console.error("Error generating podcast script:", error);
    throw error;
  }
}