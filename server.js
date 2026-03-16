import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, ThinkingLevel, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// AI client — Vertex AI with ADC (automatic on Cloud Run via service account IAM)
function getAIClient() {
  const project = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_LOCATION || 'us-central1';
  console.log(`[AI] getAIClient project=${project} location=${location}`);
  if (!project) {
    throw new Error('No GCP project found. Set VERTEX_PROJECT env var on Cloud Run.');
  }
  return new GoogleGenAI({ vertexai: true, project, location });
}

// Debug endpoint
app.get('/api/debug', (req, res) => {
  res.json({
    VERTEX_PROJECT: process.env.VERTEX_PROJECT,
    VERTEX_LOCATION: process.env.VERTEX_LOCATION,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  });
});

// REST: image analysis (askInstructor)
app.post('/api/analyze', async (req, res) => {
  const { prompt, targetImageData, canvasImageData } = req.body;
  if (!targetImageData || !canvasImageData) {
    return res.status(400).json({ error: 'Missing image data' });
  }
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: targetImageData } },
          { inlineData: { mimeType: 'image/png', data: canvasImageData } },
        ],
      }],
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    res.json({ text: response.text });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// WebSocket proxy: browser <-> server <-> Gemini Live (Vertex IAM)
// Browser sends JSON messages, server holds the real Gemini session
//
// Browser -> Server messages:
//   { type: 'start', systemInstruction, targetImageData }
//   { type: 'audio', data }   <- base64 PCM 16kHz
//   { type: 'image', data }   <- base64 PNG (canvas frame)
//   { type: 'text',  data }   <- text input to session
//   { type: 'tool_response', functionResponses }
//   { type: 'stop' }
//
// Server -> Browser messages:
//   { type: 'audio',         data }   <- base64 PCM to play
//   { type: 'transcription', text }
//   { type: 'tool_call',     calls }
//   { type: 'interrupted' }
//   { type: 'error',         message }
//   { type: 'closed' }

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws/live' });

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', (browserWs) => {
  console.log('Browser connected to Live proxy');
  let geminiSession = null;

  browserWs.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'start': {
        try {
          const ai = getAIClient();
          const getCurrentStateTool = {
            name: 'get_current_state',
            description: 'Get current brush settings and color mixer state.',
            parameters: { type: 'OBJECT', properties: {} },
          };
          geminiSession = await ai.live.connect({
            model: 'gemini-live-2.5-flash-native-audio',
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: msg.systemInstruction,
              tools: [{ functionDeclarations: [getCurrentStateTool] }],
              outputAudioTranscription: {},
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            },
            callbacks: {
              onopen: () => console.log('Gemini Live session opened'),
              onclose: () => safeSend(browserWs, { type: 'closed' }),
              onerror: (e) => {
                console.error('Gemini Live error:', e);
                safeSend(browserWs, { type: 'error', message: String(e) });
              },
              onmessage: (message) => {
                if (message.serverContent?.interrupted) {
                  safeSend(browserWs, { type: 'interrupted' });
                }
                message.serverContent?.modelTurn?.parts?.forEach(part => {
                  if (part.inlineData?.data) {
                    safeSend(browserWs, { type: 'audio', data: part.inlineData.data });
                  }
                });
                const transcription = message.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
                if (transcription) {
                  safeSend(browserWs, { type: 'transcription', text: transcription });
                }
                const toolCalls = message.serverContent?.modelTurn?.parts?.filter(p => p.functionCall);
                if (toolCalls?.length > 0) {
                  safeSend(browserWs, {
                    type: 'tool_call',
                    calls: toolCalls.map(tc => ({ name: tc.functionCall.name, id: tc.functionCall.id })),
                  });
                }
              },
            },
          });

          if (msg.targetImageData) {
            geminiSession.sendRealtimeInput({ media: { data: msg.targetImageData, mimeType: 'image/png' } });
          }
        } catch (err) {
          console.error('Failed to start Gemini session:', err);
          safeSend(browserWs, { type: 'error', message: err.message });
        }
        break;
      }
      case 'audio':
        geminiSession?.sendRealtimeInput({ media: { data: msg.data, mimeType: 'audio/pcm;rate=16000' } });
        break;
      case 'image':
        geminiSession?.sendRealtimeInput({ media: { data: msg.data, mimeType: 'image/png' } });
        break;
      case 'text':
        geminiSession?.sendRealtimeInput({ text: msg.data });
        break;
      case 'tool_response':
        geminiSession?.sendToolResponse({ functionResponses: msg.functionResponses });
        break;
      case 'stop':
        try { geminiSession?.close(); } catch (_) {}
        geminiSession = null;
        break;
    }
  });

  browserWs.on('close', () => {
    console.log('Browser disconnected, closing Gemini session');
    try { geminiSession?.close(); } catch (_) {}
    geminiSession = null;
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
