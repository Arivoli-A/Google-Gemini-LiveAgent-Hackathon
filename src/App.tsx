import React, { useState, useRef, useEffect } from 'react';
import { 
  Palette, 
  Eraser, 
  Brush, 
  Send, 
  RotateCcw, 
  Image as ImageIcon,
  ChevronRight,
  Sparkles,
  Plus,
  Trash2,
  Download,
  ChevronLeft,
  Menu,
  Mic,
  MicOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, ThinkingLevel, Modality, Type } from "@google/genai";
import { cn } from './lib/utils';
import { Message, BrushSettings, ColorMixerState, DEFAULT_PALETTE } from './types';
import { AudioManager } from './services/audioManager';

// --- AI Service ---
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  // --- State ---
  const [targetImage, setTargetImage] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [history, setHistory] = useState<any[][]>([]);
  const [brush, setBrush] = useState<BrushSettings>({
    size: 10,
    color: "#000000",
    type: "paint"
  });
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [mixer, setMixer] = useState<ColorMixerState>({ drops: [] });
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: "Hello! I'm your AI Art Instructor. Upload a target image, and I'll guide you through the painting process step-by-step." }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 600 });
  const [voiceVolume, setVoiceVolume] = useState(0);
  
  // Live Voice State
  const [isLive, setIsLive] = useState(false);
  const [liveSession, setLiveSession] = useState<any>(null);
  const liveSessionRef = useRef<any>(null);
  const audioManager = useRef<AudioManager>(new AudioManager());
  const frameInterval = useRef<any>(null);
  const autoAnalysisInterval = useRef<any>(null);
  
  const stageRef = useRef<any>(null);
  const isDrawing = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Effects ---
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const height = containerRef.current.offsetHeight;
        setCanvasSize({ width, height });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Drawing Logic ---
  const handlePointerDown = (e: any) => {
    // Prevent default to avoid scrolling on touch devices
    if (e.evt) {
      // e.evt is the native event
    }
    
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    
    // Check for stylus pressure if available (experimental/limited in some browsers)
    const pressure = e.evt?.pressure || 1;
    const adjustedSize = brush.size * (pressure > 0 ? pressure : 1);

    setLines([...lines, { 
      tool: tool === 'eraser' ? 'eraser' : brush.type, 
      points: [pos.x, pos.y], 
      color: brush.color, 
      size: adjustedSize,
      opacity: brush.type === 'crayon' ? 0.6 : 1,
      shadowBlur: brush.type === 'crayon' ? 2 : 0
    }]);
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    if (!point) return;

    let lastLine = lines[lines.length - 1];
    if (!lastLine) return;

    lastLine.points = lastLine.points.concat([point.x, point.y]);
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
  };

  const handlePointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setHistory([...history, [...lines]]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    newHistory.pop();
    setHistory(newHistory);
    setLines(newHistory.length > 0 ? [...newHistory[newHistory.length - 1]] : []);
  };

  const clearCanvas = () => {
    setLines([]);
    setHistory([]);
  };

  const download = () => {
    const uri = stageRef.current.toDataURL();
    const link = document.createElement('a');
    link.download = 'my-masterpiece.png';
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Image Upload ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTargetImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Color Mixing ---
  const addDrop = (color: string) => {
    setMixer(prev => {
      const existing = prev.drops.find(d => d.color === color);
      if (existing) {
        return {
          drops: prev.drops.map(d => d.color === color ? { ...d, count: d.count + 1 } : d)
        };
      }
      return {
        drops: [...prev.drops, { color, count: 1 }]
      };
    });
  };

  const mixColors = () => {
    if (mixer.drops.length === 0) return;
    
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalDrops = 0;

    mixer.drops.forEach(drop => {
      const hex = drop.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      totalR += r * drop.count;
      totalG += g * drop.count;
      totalB += b * drop.count;
      totalDrops += drop.count;
    });

    const avgR = Math.floor(totalR / totalDrops);
    const avgG = Math.floor(totalG / totalDrops);
    const avgB = Math.floor(totalB / totalDrops);
    
    const mixed = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
    
    if (!palette.includes(mixed)) {
      setPalette([mixed, ...palette.slice(0, 11)]);
    }
    setBrush({ ...brush, color: mixed });
    setMixer({ drops: [] });
    setTool('brush');
  };

  // --- Live Voice Logic ---
  const startLiveSession = async () => {
    if (!targetImage) {
      setMessages(prev => [...prev, { role: "model", text: "Please upload a target image first so I can see what we're aiming for!" }]);
      return;
    }

    try {
      const getCurrentStateTool = {
        name: "get_current_state",
        description: "Get the current brush settings and color mixer state.",
        parameters: { type: Type.OBJECT, properties: {} }
      };

      const systemInstruction = `You are an AI Art Instructor in a real-time voice session. 
      You are helping a user recreate a target image. 
      You can see the user's canvas in real-time (frames sent every 2s).
      
      CRITICAL: You MUST use the 'get_current_state' tool to check the user's active brush color, type, and what's in their color mixer before giving specific mixing or brush advice.
      
      Your goal is to provide immediate, helpful, and HIGHLY ENCOURAGING feedback via voice.
      Be a warm, patient, and inspiring mentor. Use phrases like "You're doing great!", "I love that stroke!", "Don't worry about mistakes, they're part of the process."
      
      Be proactive! If you see the user struggling, making a mistake, or just pausing, speak up and offer a detailed tip.
      Explain the "why" behind your advice. For example, "Let's add a bit more blue to that green to make it look more like a deep forest shadow."
      
      Keep your responses natural for a conversation, but don't be afraid to be descriptive.
      Guide them on color mixing, brush strokes, composition, and even the mood of the piece.
      If the user asks "how does this look?", look at the latest canvas frame and compare it to the target image in detail.
      You can also see the target image.`;

      const sessionPromise = genAI.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: [getCurrentStateTool] }],
          outputAudioTranscription: {}, // Enable transcription
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          }
        },
        callbacks: {
          onopen: () => {
            console.log("Live session connection opened");
          },
          onclose: () => {
            stopLiveSession();
          },
          onerror: (e) => {
            console.error("Live Error:", e);
            stopLiveSession();
          },
          onmessage: (message) => {
            // Handle Audio Output - Iterate through all parts
            message.serverContent?.modelTurn?.parts.forEach(part => {
              if (part.inlineData?.data) {
                audioManager.current.playAudioChunk(part.inlineData.data);
              }
            });

            // Handle Transcription (Match Voice to Text)
            const transcription = message.serverContent?.modelTurn?.parts.find(p => p.text)?.text;
            if (transcription) {
              setMessages(prev => [...prev, { role: "model", text: transcription }]);
            }

            // Handle Tool Calls
            const toolCalls = message.serverContent?.modelTurn?.parts.filter(p => p.functionCall);
            if (toolCalls && toolCalls.length > 0 && liveSessionRef.current) {
              toolCalls.forEach(tc => {
                if (tc.functionCall?.name === "get_current_state") {
                  liveSessionRef.current.sendToolResponse({
                    functionResponses: [{
                      name: "get_current_state",
                      id: tc.functionCall.id,
                      response: {
                        brush: { type: brush.type, size: brush.size, color: brush.color },
                        mixer: mixer.drops
                      }
                    }]
                  });
                }
              });
            }
          }
        }
      });

      const session = await sessionPromise;
      setLiveSession(session);
      liveSessionRef.current = session;
      setIsLive(true);

      // Initialize Session Assets & Streams
      await audioManager.current.resumeAudioContext();
      
      // Send target image as first visual context
      session.sendRealtimeInput({
        media: { data: targetImage.split(',')[1], mimeType: 'image/png' }
      });
      
      // Start streaming canvas frames
      frameInterval.current = setInterval(() => {
        if (stageRef.current && liveSessionRef.current) {
          const canvasData = stageRef.current.toDataURL({ pixelRatio: 0.5 });
          liveSessionRef.current.sendRealtimeInput({
            media: { data: canvasData.split(',')[1], mimeType: 'image/png' }
          });
        }
      }, 2000);

      // Start microphone
      audioManager.current.startMicrophone((base64) => {
        if (liveSessionRef.current) {
          liveSessionRef.current.sendRealtimeInput({
            media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      }, (vol) => {
        setVoiceVolume(vol);
      });

      // Start Auto-Analysis every 1 minute
      autoAnalysisInterval.current = setInterval(() => {
        if (liveSessionRef.current) {
          askInstructor(true); // Call with 'isAuto' flag
        }
      }, 60000);
    } catch (error) {
      console.error("Failed to start live session:", error);
      setIsLive(false);
    }
  };

  const stopLiveSession = () => {
    if (frameInterval.current) clearInterval(frameInterval.current);
    if (autoAnalysisInterval.current) clearInterval(autoAnalysisInterval.current);
    audioManager.current.stopMicrophone();
    setVoiceVolume(0);
    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
    }
    setLiveSession(null);
    liveSessionRef.current = null;
    setIsLive(false);
  };

  // --- AI Instructor Logic ---
  const askInstructor = async (isAuto = false) => {
    if (!targetImage) {
      if (!isAuto) {
        setMessages(prev => [...prev, { role: "model", text: "Please upload a target image first so I can see what we're aiming for!" }]);
      }
      return;
    }

    // If not live, start the session first
    let currentSession = liveSessionRef.current;
    if (!isLive) {
      if (isAuto) return; // Don't auto-start session
      await startLiveSession();
      // Wait for ref to be populated (max 3s)
      for (let i = 0; i < 30; i++) {
        if (liveSessionRef.current) {
          currentSession = liveSessionRef.current;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Prevent overlapping analysis
    if (isThinking) return;

    setIsThinking(true);
    try {
      const canvasDataUrl = stageRef.current.toDataURL();
      
      const prompt = `You are an AI Art Instructor. Analyze the difference between the Target Image and the Current Canvas.
      Provide a VERY ELABORATE, detailed, and step-by-step guide for the user.
      
      CRITICAL: The user's current brush is ${brush.type} (size ${brush.size}) and color ${brush.color}.
      The mixer has: ${mixer.drops.map(d => `${d.count} drops of ${d.color}`).join(', ') || 'nothing'}.
      
      Break your advice down into:
      1. Color Mixing (exact drops if possible)
      2. Brush selection and size
      3. Specific stroke techniques
      4. Compositional adjustments
      
      Be encouraging but extremely thorough. This text will be read by the user.
      ${isAuto ? "NOTE: This is an automatic periodic check. Only provide significant new advice if the user has made progress or needs a course correction." : ""}`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: targetImage.split(',')[1] } },
              { inlineData: { mimeType: "image/png", data: canvasDataUrl.split(',')[1] } }
            ]
          }
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      const elaborateText = response.text || "I'm having a bit of trouble seeing the canvas. Let's try another stroke!";
      
      // Only add to chat if it's manual OR if the text is significantly different/new
      // For simplicity, we'll add it every time for now as requested by user "every 10 sec"
      setMessages(prev => [...prev, { role: "model", text: elaborateText }]);

      // Now, if we have a live session, ask it to summarize briefly via voice
      if (currentSession) {
        currentSession.sendRealtimeInput({
          text: `I just gave the user this elaborate advice in the chat: "${elaborateText}". 
          Please provide a VERY BRIEF (1-2 sentences) voice summary of this advice to the user now. 
          Start with something like "I've added some detailed steps to the chat..."`
        });
      }
    } catch (error) {
      console.error("AI Error:", error);
      if (!isAuto) {
        setMessages(prev => [...prev, { role: "model", text: "I'm sorry, I hit a little snag. Could you try asking again?" }]);
      }
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F2ED] text-[#1A1A1A] font-sans overflow-hidden">
      {/* Sidebar: Target & Chat */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isChatCollapsed ? 0 : (window.innerWidth < 1024 ? '100%' : 550),
          x: isChatCollapsed ? -550 : 0
        }}
        className={cn(
          "border-r border-[#1A1A1A]/10 flex flex-col bg-white shadow-2xl z-40 overflow-hidden absolute lg:relative h-full transition-all",
          isChatCollapsed ? "pointer-events-none" : "pointer-events-auto"
        )}
      >
        <div className="p-3 lg:p-4 border-b border-[#1A1A1A]/5 min-w-[320px] lg:min-w-[450px]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-serif italic mb-0.5">ArtMaster AI</h1>
              <p className="text-[9px] lg:text-[10px] uppercase tracking-widest text-[#1A1A1A]/50 font-bold">Personal Instructor</p>
            </div>
            <button 
              onClick={() => setIsChatCollapsed(true)}
              className="p-2 hover:bg-[#1A1A1A]/5 rounded-lg transition-colors"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Target Image Area */}
        <div className="p-3 bg-[#F5F2ED]/50 border-b border-[#1A1A1A]/5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">Target</span>
            {!isLive && (
              <div className="flex items-center gap-1.5 text-[9px] text-blue-600 font-medium">
                <Volume2 className="w-2.5 h-2.5" />
                <span>Open in new tab for audio</span>
              </div>
            )}
          </div>
          <div className="relative aspect-video rounded-lg border border-dashed border-[#1A1A1A]/20 flex items-center justify-center overflow-hidden group">
            {targetImage ? (
              <>
                <img src={targetImage} alt="Target" className="w-full h-full object-contain bg-white" referrerPolicy="no-referrer" />
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <span className="text-white text-[10px] font-medium">Change</span>
                  <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                </label>
              </>
            ) : (
              <label className="flex flex-col items-center gap-1 cursor-pointer p-3 text-center">
                <ImageIcon className="w-5 h-5 text-[#1A1A1A]/30" />
                <span className="text-[10px] font-medium text-[#1A1A1A]/60">Upload Target</span>
                <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
              </label>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-[#F5F2ED]/30 relative">
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "p-3 rounded-xl text-xs leading-relaxed shadow-sm",
                  msg.role === 'model' 
                    ? "bg-white border border-[#1A1A1A]/5 rounded-tl-none mr-4" 
                    : "bg-[#1A1A1A] text-white rounded-tr-none ml-8 shadow-lg"
                )}
              >
                {msg.text}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isThinking && !isLive && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex items-center gap-2 text-[#1A1A1A]/40 text-xs italic p-2"
            >
              <Sparkles className="w-3 h-3 animate-pulse" />
              Instructor is observing...
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-[#1A1A1A]/5 flex flex-col gap-2">
          <button
            onClick={() => askInstructor(false)}
            disabled={isThinking || !targetImage}
            className={cn(
              "w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md",
              isLive 
                ? "bg-[#1A1A1A] text-white hover:bg-[#333]" 
                : "bg-emerald-500 text-white hover:bg-emerald-600"
            )}
          >
            {isThinking ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : isLive ? (
              <Sparkles className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            {isLive ? "Ask ArtMaster" : "Start ArtMaster Session"}
          </button>
          
          {isLive && (
            <button
              onClick={stopLiveSession}
              className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              End Session
            </button>
          )}
        </div>
      </motion.div>

      {/* Collapse Toggle (When collapsed) */}
      {isChatCollapsed && (
        <button 
          onClick={() => setIsChatCollapsed(false)}
          className="absolute top-6 left-6 z-30 p-3 bg-white shadow-lg rounded-xl border border-[#1A1A1A]/10 hover:bg-[#F5F2ED] transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Vision Indicator */}
        {isLive && (
          <div className="absolute top-24 left-6 z-20 flex flex-col items-start gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vision Active</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
              <div className="flex gap-0.5 items-center h-2">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: isLive ? [4, Math.max(4, voiceVolume * 15 * (i + 1) / 3), 4] : 4,
                      opacity: isLive ? [0.4, 1, 0.4] : 0.4
                    }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                    className="w-0.5 bg-emerald-400 rounded-full"
                  />
                ))}
              </div>
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">Voice Active</span>
            </div>
          </div>
        )}

        {/* Canvas Toolbar */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2 lg:gap-4 p-2 lg:p-3 bg-white/90 backdrop-blur-xl rounded-2xl lg:rounded-3xl shadow-2xl border border-white/40 max-w-[95vw]">
          <div className="flex items-center gap-1 lg:gap-2 px-1 lg:px-2 border-r border-[#1A1A1A]/10">
            <button 
              onClick={() => { setTool('brush'); setBrush({ ...brush, type: 'paint' }); }}
              className={cn(
                "flex items-center gap-1 lg:gap-2 px-2 lg:px-4 py-1.5 lg:py-2 rounded-lg lg:rounded-xl transition-all font-medium text-xs lg:text-sm", 
                (tool === 'brush' && brush.type === 'paint') ? "bg-[#1A1A1A] text-white shadow-lg" : "hover:bg-[#1A1A1A]/5"
              )}
            >
              <Brush className="w-3.5 h-3.5 lg:w-4 h-4" />
              <span className="hidden sm:inline">Paint Brush</span>
            </button>
            <button 
              onClick={() => { setTool('brush'); setBrush({ ...brush, type: 'crayon' }); }}
              className={cn(
                "flex items-center gap-1 lg:gap-2 px-2 lg:px-4 py-1.5 lg:py-2 rounded-lg lg:rounded-xl transition-all font-medium text-xs lg:text-sm", 
                (tool === 'brush' && brush.type === 'crayon') ? "bg-[#1A1A1A] text-white shadow-lg" : "hover:bg-[#1A1A1A]/5"
              )}
            >
              <Palette className="w-3.5 h-3.5 lg:w-4 h-4" />
              <span className="hidden sm:inline">Crayon</span>
            </button>
            <button 
              onClick={() => setTool('eraser')}
              className={cn(
                "flex items-center gap-1 lg:gap-2 px-2 lg:px-4 py-1.5 lg:py-2 rounded-lg lg:rounded-xl transition-all font-medium text-xs lg:text-sm", 
                tool === 'eraser' ? "bg-[#1A1A1A] text-white shadow-lg" : "hover:bg-[#1A1A1A]/5"
              )}
            >
              <Eraser className="w-3.5 h-3.5 lg:w-4 h-4" />
              <span className="hidden sm:inline">Eraser</span>
            </button>
          </div>

          <div className="flex items-center gap-3 px-2 border-r border-[#1A1A1A]/10">
            <span className="text-[10px] font-bold uppercase tracking-tighter opacity-40">Size</span>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={brush.size} 
              onChange={(e) => setBrush({ ...brush, size: parseInt(e.target.value) })}
              className="w-24 accent-[#1A1A1A]"
            />
            <span className="text-xs font-mono w-6 text-center">{brush.size}</span>
          </div>

          <div className="flex items-center gap-2 px-2">
            <button 
              onClick={undo}
              disabled={history.length === 0}
              className="p-2 rounded-lg hover:bg-[#1A1A1A]/5 disabled:opacity-20 transition-all"
              title="Undo"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button 
              onClick={clearCanvas}
              className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-all"
              title="Clear Canvas"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button 
              onClick={download}
              className="p-2 rounded-lg hover:bg-[#1A1A1A]/5 transition-all"
              title="Download Masterpiece"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* The Canvas */}
        <div ref={containerRef} className="flex-1 bg-white cursor-crosshair touch-none">
          <Stage
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            ref={stageRef}
          >
            <Layer>
              <Rect width={canvasSize.width} height={canvasSize.height} fill="white" />
            </Layer>
            <Layer>
              {lines.map((line, i) => (
                <Line
                  key={i}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={line.size}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  opacity={line.opacity || 1}
                  shadowBlur={line.shadowBlur || 0}
                  shadowColor={line.color}
                  globalCompositeOperation={
                    line.tool === 'eraser' ? 'destination-out' : 'source-over'
                  }
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* Color Palette & Mixer (Bottom) */}
        <div className="h-auto lg:h-[120px] bg-white border-t border-[#1A1A1A]/10 flex flex-col lg:flex-row items-center px-4 lg:px-8 py-4 lg:py-0 gap-4 lg:gap-12 overflow-x-auto scrollbar-hide">
          {/* Palette */}
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Palette</span>
              <span className="text-[9px] font-medium opacity-30 italic">Long-press/Right-click to mix</span>
            </div>
            <div className="flex gap-2 flex-wrap lg:flex-nowrap">
              {palette.map((color, i) => (
                <button
                  key={i}
                  onClick={() => setBrush({ ...brush, color })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    addDrop(color);
                  }}
                  // For touch devices, we could add a long press or a separate button, 
                  // but for now let's ensure context menu works or add a small plus icon
                  className={cn(
                    "w-8 h-8 lg:w-8 lg:h-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95",
                    brush.color === color ? "border-[#1A1A1A] scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                  title="Click to select, Right-click to mix"
                />
              ))}
            </div>
          </div>

          {/* Mixer */}
          <div className="flex items-center gap-4 bg-[#F5F2ED] p-3 rounded-2xl border border-[#1A1A1A]/5">
            <div className="flex flex-col gap-1">
               <span className="text-[9px] font-bold uppercase opacity-40">Mixer</span>
               <div className="flex items-center gap-2">
                  <div className="flex -space-x-2 overflow-hidden max-w-[120px]">
                    {mixer.drops.length === 0 ? (
                      <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[#1A1A1A]/20 flex items-center justify-center bg-white">
                        <Plus className="w-4 h-4 opacity-20" />
                      </div>
                    ) : (
                      mixer.drops.map((drop, i) => (
                        <div 
                          key={i}
                          className="w-10 h-10 rounded-xl border-2 border-white shadow-sm flex items-center justify-center relative flex-shrink-0"
                          style={{ backgroundColor: drop.color }}
                        >
                          <span className="text-[10px] font-bold text-white drop-shadow-md">{drop.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-40" />
                  <button
                    onClick={mixColors}
                    disabled={mixer.drops.length === 0}
                    className="px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold rounded-lg disabled:opacity-30"
                  >
                    Blend
                  </button>
                  {mixer.drops.length > 0 && (
                    <button 
                      onClick={() => setMixer({ drops: [] })}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
               </div>
            </div>
          </div>

          <div className="flex-1 flex justify-end items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase opacity-40">Active Color</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono opacity-60 uppercase">{brush.color}</span>
                <div className="w-12 h-12 rounded-2xl shadow-inner border border-[#1A1A1A]/10" style={{ backgroundColor: brush.color }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
