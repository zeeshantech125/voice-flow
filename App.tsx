import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, RefreshCw, Volume2, Sparkles, 
  AlertCircle, Download, Gauge, Mic2, History as HistoryIcon,
  UtensilsCrossed, Wand2, Globe, Cpu, Radio,
  Zap, Settings2, LayoutGrid, Disc, Plus, Trash2, StopCircle, Fingerprint, Mic,
  ChevronDown, Sliders, Waves
} from 'lucide-react';
import { VoiceName, HistoryItem, AppView, SupportedLanguage, ScriptModel, ChatMessage, PodcastLine, CustomVoice } from './types';
import VoiceSelector from './components/VoiceSelector';
import Visualizer from './components/Visualizer';
import { generateSpeech, generateDishDescription, expandScript, generateChatResponse, generatePodcastScript } from './services/geminiService';
import { decodeBase64, decodeAudioData, audioBufferToWav, audioBufferToMp3 } from './utils/audioUtils';

// --- Configuration ---
const DISHES = [
  { id: 'wagyu', name: 'A5 Wagyu Steak', icon: '🥩', type: 'Main' },
  { id: 'sushi', name: 'Omakase Nigiri', icon: '🍣', type: 'Seafood' },
  { id: 'truffle', name: 'Truffle Risotto', icon: '🍄', type: 'Italian' },
  { id: 'souffle', name: 'Chocolate Soufflé', icon: '🍫', type: 'Dessert' },
  { id: 'pho', name: 'Midnight Pho', icon: '🍜', type: 'Asian' },
  { id: 'tacos', name: 'Al Pastor Tacos', icon: '🌮', type: 'Mexican' },
  { id: 'lobster', name: 'Butter Poached Lobster', icon: '🦞', type: 'Seafood' },
  { id: 'croissant', name: 'Parisian Croissant', icon: '🥐', type: 'Bakery' },
];

const LANGUAGES: SupportedLanguage[] = [
  'English', 'Spanish', 'French', 'German', 
  'Japanese', 'Korean', 'Chinese', 'Hindi', 
  'Italian', 'Portuguese', 'Russian', 'Arabic'
];

function App() {
  // --- Global State ---
  const [view, setView] = useState<AppView>('studio');
  const [text, setText] = useState("Welcome to Audio Flow. Design your soundscape.");
  const [voice, setVoice] = useState<VoiceName | string>(VoiceName.Kore);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  
  // --- Generation Config ---
  const [language, setLanguage] = useState<SupportedLanguage>('English');
  const [scriptModel, setScriptModel] = useState<ScriptModel>('gemini-2.5-flash');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [downloadFormat, setDownloadFormat] = useState<'wav' | 'mp3'>('wav');
  
  // --- Audio State ---
  const [isLoading, setIsLoading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  // --- FX State ---
  const [reverbAmt, setReverbAmt] = useState(0);
  const [echoAmt, setEchoAmt] = useState(0);
  
  // --- Feature State ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  
  // Podcast State
  const [podcastTopic, setPodcastTopic] = useState("");
  const [podcastLines, setPodcastLines] = useState<PodcastLine[]>([
    { speaker: 'Host', text: 'Welcome back to the flow.' },
    { speaker: 'Guest', text: 'Thanks for having me.' }
  ]);
  const [currentPodcastLineIndex, setCurrentPodcastLineIndex] = useState<number | null>(null);
  const [hostVoice, setHostVoice] = useState<VoiceName | string>(VoiceName.Puck);
  const [guestVoice, setGuestVoice] = useState<VoiceName | string>(VoiceName.Kore);

  // Clone State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneStep, setCloneStep] = useState<'idle' | 'recording' | 'review' | 'processing' | 'done'>('idle');
  
  // --- Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  // FX Refs
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const echoGainRef = useRef<GainNode | null>(null);
  const feedbackNodeRef = useRef<GainNode | null>(null);

  const previewCacheRef = useRef<Map<VoiceName, AudioBuffer>>(new Map());
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const podcastStopRef = useRef<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // --- Initialization ---
  useEffect(() => {
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.onplay = () => setIsPlaying(true);
      audioElRef.current.onpause = () => setIsPlaying(false);
      audioElRef.current.onended = () => setIsPlaying(false);
      audioElRef.current.onerror = () => setError("Error playing audio.");
    }
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = "";
      }
    };
  }, []);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update FX Parameters real-time
  useEffect(() => {
    if (reverbGainRef.current) {
      reverbGainRef.current.gain.setTargetAtTime(reverbAmt / 100, audioContextRef.current?.currentTime || 0, 0.1);
    }
    if (echoGainRef.current) {
      echoGainRef.current.gain.setTargetAtTime(echoAmt / 100, audioContextRef.current?.currentTime || 0, 0.1);
    }
  }, [reverbAmt, echoAmt]);

  const createImpulseResponse = (ctx: AudioContext) => {
    const rate = ctx.sampleRate;
    const length = rate * 2.0; // 2 seconds
    const decay = 2.0;
    const impulse = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const channelData = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        // Simple noise with exponential decay
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  };

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        return null;
      }
      
      const ctx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      if (audioElRef.current && !mediaSourceRef.current) {
        const source = ctx.createMediaElementSource(audioElRef.current);
        mediaSourceRef.current = source;

        // --- FX Graph Setup ---
        
        // 1. Dry Path
        source.connect(analyser);

        // 2. Reverb Path
        const reverb = ctx.createConvolver();
        reverb.buffer = createImpulseResponse(ctx);
        const reverbGain = ctx.createGain();
        reverbGain.gain.value = reverbAmt / 100;
        
        source.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(analyser);

        reverbNodeRef.current = reverb;
        reverbGainRef.current = reverbGain;

        // 3. Echo Path
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.3; // 300ms delay
        const feedback = ctx.createGain();
        feedback.gain.value = 0.4;
        const echoGain = ctx.createGain();
        echoGain.gain.value = echoAmt / 100;

        source.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay); // Loop
        delay.connect(echoGain);
        echoGain.connect(analyser);

        delayNodeRef.current = delay;
        feedbackNodeRef.current = feedback;
        echoGainRef.current = echoGain;

        // Final Output
        analyser.connect(ctx.destination);
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  };

  // --- Core Logic ---
  const handleGenerate = async (textToSpeak: string = text, targetVoice: VoiceName | string = voice, skipHistory = false): Promise<string | undefined> => {
    if (!textToSpeak.trim()) return;
    
    stopAudio();
    setIsLoading(true);
    setError(null);
    const ctx = initAudioContext();

    try {
      // Resolve Voice ID (Map custom voice to base voice)
      let actualVoiceName = targetVoice as VoiceName;
      const customVoice = customVoices.find(v => v.id === targetVoice);
      if (customVoice) {
        actualVoiceName = customVoice.baseVoice;
      }

      const base64Audio = await generateSpeech(textToSpeak, actualVoiceName);
      
      const rawBytes = decodeBase64(base64Audio);
      if (ctx) {
        const buffer = await decodeAudioData(rawBytes, ctx);
        setAudioBuffer(buffer); // Save buffer for downloading logic
        const wavBlob = audioBufferToWav(buffer);
        const audioUrl = URL.createObjectURL(wavBlob);

        if (!skipHistory) {
          const newItem: HistoryItem = {
            id: Date.now().toString(),
            text: textToSpeak,
            voice: targetVoice,
            language: language,
            timestamp: Date.now(),
            audioBase64: base64Audio
          };
          setHistory(prev => [newItem, ...prev].slice(0, 10)); // Keep last 10
        }
        
        if (audioElRef.current) {
          audioElRef.current.src = audioUrl;
          audioElRef.current.playbackRate = playbackSpeed;
          setHasAudio(true);
          await audioElRef.current.play();
        }
        return audioUrl;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate speech.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Live Flow Logic ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    const inputSnapshot = chatInput;
    setChatInput("");
    setIsWriting(true);

    try {
      // 1. Get Text Response
      const responseText = await generateChatResponse([], inputSnapshot);
      const botMsgId = (Date.now() + 1).toString();
      
      // 2. Generate Audio and Play (handleGenerate returns the URL)
      const generatedUrl = await handleGenerate(responseText, voice, true);

      // 3. Create Assistant Message with Audio
      const botMsg: ChatMessage = { 
        id: botMsgId, 
        role: 'assistant', 
        text: responseText,
        audioUrl: generatedUrl,
        voice: typeof voice === 'string' ? voice : VoiceName.Kore 
      };
      
      setChatMessages(prev => [...prev, botMsg]);
      setIsWriting(false);
      
    } catch (err) {
      setError("Failed to connect to Live Flow.");
      setIsWriting(false);
    }
  };

  const playMessageAudio = (url: string) => {
    if (audioElRef.current) {
      audioElRef.current.src = url;
      audioElRef.current.play();
      setIsPlaying(true);
      // Ensure visualizer starts
      initAudioContext(); 
    }
  };

  const downloadMessageAudio = async (url: string, id: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow_response_${id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Podcast Logic ---
  const handlePodcastGenerate = async () => {
    if (!podcastTopic.trim()) return;
    setIsWriting(true);
    setPodcastLines([]);
    
    try {
      const script = await generatePodcastScript(podcastTopic);
      setPodcastLines(script);
      setIsWriting(false);
      
      // Auto-play sequence
      for (const line of script) {
        if (podcastStopRef.current) break; // Check for stop
        const v = line.speaker === 'Host' ? hostVoice : guestVoice;
        await handleGenerate(line.text, v, true);
        await new Promise(resolve => {
            if (audioElRef.current) {
                audioElRef.current.onended = () => resolve(true);
            } else {
                resolve(true);
            }
        });
      }
    } catch (err) {
      setError("Failed to produce podcast.");
      setIsWriting(false);
    }
  };

  const playPodcastSequence = async () => {
    if (podcastLines.length === 0) return;
    
    stopAudio();
    podcastStopRef.current = false;
    
    for (let i = 0; i < podcastLines.length; i++) {
        if (podcastStopRef.current) break;
        
        setCurrentPodcastLineIndex(i);
        const line = podcastLines[i];
        const v = line.speaker === 'Host' ? hostVoice : guestVoice;
        
        await handleGenerate(line.text, v, true);
        
        await new Promise(resolve => {
            if (audioElRef.current && !podcastStopRef.current) {
                audioElRef.current.onended = () => resolve(true);
                setTimeout(() => resolve(true), 30000); 
            } else {
                resolve(true);
            }
        });
    }
    setCurrentPodcastLineIndex(null);
  };

  const stopPodcastSequence = () => {
    podcastStopRef.current = true;
    stopAudio();
    setCurrentPodcastLineIndex(null);
  }

  const addPodcastLine = () => {
    setPodcastLines([...podcastLines, { speaker: 'Host', text: '' }]);
  };

  const updatePodcastLine = (index: number, field: keyof PodcastLine, value: string) => {
    const newLines = [...podcastLines];
    // @ts-ignore
    newLines[index] = { ...newLines[index], [field]: value };
    setPodcastLines(newLines);
  };

  const removePodcastLine = (index: number) => {
    setPodcastLines(podcastLines.filter((_, i) => i !== index));
  };

  // --- Existing Features ---
  const handleScriptExpand = async () => {
    if (!text.trim()) {
      setError("Please enter a short concept first.");
      return;
    }
    setIsWriting(true);
    setError(null);
    try {
      const expanded = await expandScript(text, language, scriptModel);
      setText(expanded);
    } catch (err) {
      setError("Failed to expand script.");
    } finally {
      setIsWriting(false);
    }
  };

  const handleDishSelect = async (dishName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const desc = await generateDishDescription(dishName);
      setText(desc);
      setView('studio');
      await handleGenerate(desc);
    } catch (err: any) {
      setError("Chef is busy.");
      setIsLoading(false);
    }
  };

  const handleVoiceHover = async (previewVoice: VoiceName) => {
    if (isLoading || isPlaying) return;
    const ctx = initAudioContext();
    if (!ctx) return;
    stopPreview();
    try {
      let buffer = previewCacheRef.current.get(previewVoice);
      if (!buffer) {
        const sampleText = `This is a preview of the ${previewVoice} voice.`;
        const base64 = await generateSpeech(sampleText, previewVoice);
        const rawBytes = decodeBase64(base64);
        buffer = await decodeAudioData(rawBytes, ctx);
        previewCacheRef.current.set(previewVoice, buffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      } else {
        source.connect(ctx.destination);
      }
      source.start();
      previewSourceRef.current = source;
    } catch (err) {
      console.warn("Preview failed", err);
    }
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch(e) {}
      previewSourceRef.current = null;
    }
  };

  const togglePlayback = () => {
    if (!audioElRef.current || !hasAudio) return;
    if (isPlaying) audioElRef.current.pause();
    else { initAudioContext(); audioElRef.current.play(); }
  };

  const stopAudio = () => {
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.currentTime = 0; }
    stopPreview();
  };

  const handleDownload = () => {
    if (!hasAudio || !audioBuffer) return;
    
    let blob: Blob;
    let ext: string;

    if (downloadFormat === 'mp3') {
      blob = audioBufferToMp3(audioBuffer);
      ext = 'mp3';
    } else {
      blob = audioBufferToWav(audioBuffer);
      ext = 'wav';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio_flow_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const loadFromHistory = async (item: HistoryItem) => {
    setText(item.text);
    setVoice(item.voice);
    if (item.language) setLanguage(item.language as SupportedLanguage);
    stopAudio();
    const ctx = initAudioContext();
    if (ctx) {
      const rawBytes = decodeBase64(item.audioBase64);
      const buffer = await decodeAudioData(rawBytes, ctx);
      setAudioBuffer(buffer); // Save buffer for download
      const wavBlob = audioBufferToWav(buffer);
      const audioUrl = URL.createObjectURL(wavBlob);
      if (audioElRef.current) {
        audioElRef.current.src = audioUrl;
        audioElRef.current.playbackRate = playbackSpeed;
        setHasAudio(true);
        audioElRef.current.play();
      }
    }
  };

  // --- Clone Flow Logic ---
  const startRecording = async () => {
    const ctx = initAudioContext();
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      }
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordingBlob(blob);
        source.disconnect();
      };
      mediaRecorder.start();
      setIsRecording(true);
      setCloneStep('recording');
    } catch (err) {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      setCloneStep('review');
    }
  };

  const playRecording = () => {
    if (recordingBlob && audioElRef.current) {
      const url = URL.createObjectURL(recordingBlob);
      audioElRef.current.src = url;
      audioElRef.current.play();
      setIsPlaying(true);
    }
  };

  const createClone = async () => {
    if (!cloneName.trim()) {
      setError("Please name your voice.");
      return;
    }
    setCloneStep('processing');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const baseVoices = [VoiceName.Puck, VoiceName.Charon, VoiceName.Kore, VoiceName.Fenrir, VoiceName.Zephyr];
    const randomBase = baseVoices[Math.floor(Math.random() * baseVoices.length)];
    const newVoice: CustomVoice = {
      id: `clone_${Date.now()}`,
      name: cloneName,
      baseVoice: randomBase,
      createdAt: Date.now()
    };
    setCustomVoices(prev => [...prev, newVoice]);
    setVoice(newVoice.id);
    setCloneStep('done');
    setRecordingBlob(null);
    setCloneName("");
  };

  // --- Helpers for Views ---
  const StudioView = () => (
    <div className="space-y-6 animate-fade-in pb-32">
      <section className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif text-slate-200 flex items-center gap-2">
            <Mic2 className="text-blue-500" size={20} /> Voice Persona
          </h2>
          <span className="text-xs font-medium text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700/50">
            Hover to Preview
          </span>
        </div>
        <VoiceSelector 
          selectedVoice={voice} 
          onSelect={setVoice} 
          onHover={handleVoiceHover}
          onLeave={stopPreview}
          disabled={isLoading} 
          customVoices={customVoices}
        />
      </section>

      {/* Control Toolbar + FX Studio */}
      <section className="space-y-4">
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 backdrop-blur-md flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="relative group w-full md:w-48">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Globe size={16} /></div>
                <select value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)} className="w-full bg-slate-900/80 text-sm text-slate-200 pl-10 pr-4 py-2.5 rounded-lg border border-slate-700/50 focus:border-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-900">
                  {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
             </div>
             <div className="relative group w-full md:w-48">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Cpu size={16} /></div>
                <select value={scriptModel} onChange={(e) => setScriptModel(e.target.value as ScriptModel)} className="w-full bg-slate-900/80 text-sm text-slate-200 pl-10 pr-4 py-2.5 rounded-lg border border-slate-700/50 focus:border-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-900">
                  <option value="gemini-2.5-flash">Flash 2.5 (Fast)</option>
                  <option value="gemini-3-pro-preview">Pro 3.0 (Reasoning)</option>
                </select>
             </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700/30">
              <Gauge size={16} className="text-blue-500" />
              <input type="range" min="0.5" max="2.0" step="0.1" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="w-full md:w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              <span className="text-xs font-mono text-slate-200 w-8 text-right">{playbackSpeed.toFixed(1)}x</span>
          </div>
        </div>
        
        {/* Advanced Audio Effects Panel */}
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
           <div className="p-4 flex items-center gap-2 border-b border-slate-700/50 bg-slate-800/60">
             <Sliders size={16} className="text-purple-400" />
             <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">FX Studio</span>
           </div>
           <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-2"><Waves size={14} /> Reverb (Ambience)</span>
                    <span className="text-purple-400 font-mono">{reverbAmt}%</span>
                 </div>
                 <input 
                   type="range" min="0" max="80" step="1" 
                   value={reverbAmt} onChange={(e) => setReverbAmt(parseInt(e.target.value))} 
                   className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                 />
              </div>
              <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-2"><Settings2 size={14} /> Echo (Delay)</span>
                    <span className="text-purple-400 font-mono">{echoAmt}%</span>
                 </div>
                 <input 
                   type="range" min="0" max="60" step="1" 
                   value={echoAmt} onChange={(e) => setEchoAmt(parseInt(e.target.value))} 
                   className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                 />
              </div>
           </div>
        </div>
      </section>

      <section className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm relative group">
         <div className="flex justify-between items-center mb-4">
           <div className="flex items-center gap-2">
             <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">Script Editor</label>
             {isWriting && <span className="text-xs text-blue-500 animate-pulse">Generative AI Active...</span>}
           </div>
           <div className="flex items-center gap-2">
             <button onClick={handleScriptExpand} disabled={isWriting || isLoading} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-full transition-colors border border-blue-500/20">
               <Wand2 size={12} /> {isWriting ? "Expanding..." : "Magic Expand"}
             </button>
             <button onClick={() => setText("")} className="text-xs text-slate-500 hover:text-white transition-colors px-2">Clear</button>
           </div>
         </div>
         <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={isLoading || isWriting} className={`w-full h-48 bg-slate-900/60 rounded-xl p-5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-slate-700/50 transition-all resize-none font-light leading-relaxed text-lg shadow-inner ${isWriting ? 'animate-pulse opacity-70' : ''}`} placeholder="Enter your text or concept..." />
         <div className="flex justify-between items-center mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
               <span>{text.length} chars</span>
               <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
               <span>{language}</span>
            </div>
            <button onClick={() => handleGenerate()} disabled={isLoading || !text || isWriting} className={`px-8 py-3 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2 transition-all ${(isLoading || isWriting) ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white shadow-blue-900/20 hover:shadow-blue-500/30 transform hover:-translate-y-0.5'}`}>
              {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {isLoading ? "Generating..." : "Generate Voiceover"}
            </button>
         </div>
      </section>
    </div>
  );

  const LiveView = () => (
    <div className="h-[calc(100vh-140px)] flex flex-col animate-fade-in">
       <div className="flex items-center justify-between mb-6 px-4 pt-2">
         <div className="text-left">
           <h2 className="text-2xl font-serif text-pink-500">Live Flow</h2>
           <p className="text-slate-500 text-sm">Real-time conversational voice stream.</p>
         </div>
         <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg p-1.5">
           <span className="text-xs text-slate-400 font-medium px-2 uppercase tracking-wide">Voice</span>
           <select 
              value={voice} 
              onChange={(e) => setVoice(e.target.value as VoiceName)}
              className="bg-slate-900 text-sm text-pink-400 font-medium border border-slate-700/50 rounded-md py-1.5 px-3 focus:outline-none focus:border-pink-500 appearance-none cursor-pointer hover:bg-slate-800"
           >
             {[VoiceName.Puck, VoiceName.Charon, VoiceName.Kore, VoiceName.Fenrir, VoiceName.Zephyr].map(v => (
               <option key={v} value={v}>{v}</option>
             ))}
             {customVoices.map(v => (
               <option key={v.id} value={v.id}>{v.name} (Clone)</option>
             ))}
           </select>
         </div>
       </div>
       
       <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-slate-900/30 rounded-2xl border border-slate-800 mb-4 mx-4">
          {chatMessages.length === 0 && <div className="text-center text-slate-600 mt-20">Start the conversation...</div>}
          {chatMessages.map((msg) => (
             <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl overflow-hidden ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-br-none' : 'bg-pink-900/20 border border-pink-500/20 text-pink-100 rounded-bl-none'}`}>
                   <div className="p-4">{msg.text}</div>
                   {msg.role === 'assistant' && msg.audioUrl && (
                     <div className="bg-pink-950/30 border-t border-pink-500/10 px-4 py-2 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-xs text-pink-400 font-mono">
                           <Mic size={12} />
                           <span>{msg.voice}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={() => playMessageAudio(msg.audioUrl!)}
                             className="p-1.5 bg-pink-500/20 hover:bg-pink-500 text-pink-400 hover:text-white rounded-full transition-all"
                             title="Play Response"
                           >
                             <Play size={14} fill="currentColor" />
                           </button>
                           <button 
                             onClick={() => downloadMessageAudio(msg.audioUrl!, msg.id)}
                             className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-all"
                             title="Download Audio"
                           >
                             <Download size={14} />
                           </button>
                        </div>
                     </div>
                   )}
                </div>
             </div>
          ))}
          {isWriting && <div className="text-xs text-pink-500 animate-pulse ml-4">Flow is thinking...</div>}
       </div>
       <form onSubmit={handleChatSubmit} className="flex gap-2 px-4 pb-2">
         <input 
           value={chatInput} 
           onChange={(e) => setChatInput(e.target.value)} 
           placeholder="Say something..."
           className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 transition-colors text-slate-200"
         />
         <button type="submit" disabled={isWriting} className="bg-pink-600 hover:bg-pink-500 text-white p-3 rounded-xl transition-colors">
            <Zap size={20} fill="currentColor" />
         </button>
       </form>
    </div>
  );

  const PodcastView = () => (
    <div className="animate-fade-in pb-32 max-w-2xl mx-auto text-center">
       <div className="mb-8">
          <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
             <Radio size={32} className="text-purple-500" />
          </div>
          <h2 className="text-3xl font-serif text-slate-200">Podcast Flow</h2>
          <p className="text-slate-500 mt-2">Powered by Pout's Port Engine</p>
       </div>

       {/* New Voice Selection for Podcast Roles */}
       <div className="flex flex-col md:flex-row gap-4 justify-center mb-8">
          <div className="flex items-center gap-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700">
             <div className="text-xs font-bold uppercase tracking-wider text-blue-400 px-2">Host</div>
             <select 
               value={hostVoice} 
               onChange={(e) => setHostVoice(e.target.value)}
               className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-sm focus:outline-none text-slate-200 appearance-none cursor-pointer"
             >
                {Object.values(VoiceName).map(v => <option key={v} value={v}>{v}</option>)}
                {customVoices.map(v => <option key={v.id} value={v.id}>{v.name} (Clone)</option>)}
             </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700">
             <div className="text-xs font-bold uppercase tracking-wider text-purple-400 px-2">Guest</div>
             <select 
               value={guestVoice} 
               onChange={(e) => setGuestVoice(e.target.value)}
               className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-sm focus:outline-none text-slate-200 appearance-none cursor-pointer"
             >
                {Object.values(VoiceName).map(v => <option key={v} value={v}>{v}</option>)}
                 {customVoices.map(v => <option key={v.id} value={v.id}>{v.name} (Clone)</option>)}
             </select>
          </div>
       </div>
       
       <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm mb-8">
          <div className="flex gap-3">
            <input 
                value={podcastTopic}
                onChange={(e) => setPodcastTopic(e.target.value)}
                placeholder="Topic (e.g., 'Coffee Culture')"
                className="flex-1 bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 focus:border-purple-500 focus:outline-none text-slate-200"
            />
            <button 
                onClick={handlePodcastGenerate} 
                disabled={isWriting || isLoading || !podcastTopic}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-purple-900/20 whitespace-nowrap"
            >
                {isWriting ? <RefreshCw className="animate-spin" /> : <Sparkles />}
            </button>
          </div>
       </div>

       <div className="space-y-3 mb-8">
          {podcastLines.map((line, idx) => (
             <div 
                key={idx} 
                className={`
                    flex gap-3 p-3 rounded-xl border transition-colors relative
                    ${currentPodcastLineIndex === idx ? 'bg-purple-900/20 border-purple-500' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}
                `}
             >
                <button
                    onClick={() => updatePodcastLine(idx, 'speaker', line.speaker === 'Host' ? 'Guest' : 'Host')}
                    className={`
                        w-20 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center h-full min-h-[50px]
                        ${line.speaker === 'Host' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'}
                    `}
                >
                    {line.speaker}
                </button>
                <textarea 
                    value={line.text}
                    onChange={(e) => updatePodcastLine(idx, 'text', e.target.value)}
                    className="flex-1 bg-transparent resize-none focus:outline-none text-slate-200 text-sm py-2 leading-relaxed"
                    rows={2}
                />
                <button 
                    onClick={() => removePodcastLine(idx)}
                    className="text-slate-600 hover:text-red-400 p-2"
                >
                    <Trash2 size={16} />
                </button>
             </div>
          ))}
       </div>

       <div className="flex items-center justify-between">
            <button onClick={addPodcastLine} className="flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors">
                <Plus size={18} /> Add Line
            </button>
            <div className="flex gap-3">
                {currentPodcastLineIndex !== null ? (
                     <button onClick={stopPodcastSequence} className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/50 px-6 py-3 rounded-xl font-bold hover:bg-red-500/20 transition-all">
                        <StopCircle size={20} /> Stop Flow
                     </button>
                ) : (
                    <button onClick={playPodcastSequence} className="flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-white/10">
                        <Play size={20} fill="currentColor" /> Play Flow
                    </button>
                )}
            </div>
       </div>
    </div>
  );

  const CloneView = () => (
    <div className="animate-fade-in pb-32 max-w-2xl mx-auto text-center">
       <div className="mb-8">
          <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
             <Fingerprint size={32} className="text-purple-500" />
          </div>
          <h2 className="text-3xl font-serif text-slate-200">Voice Clone Flow</h2>
          <p className="text-slate-500 mt-2">Create a digital twin of your voice.</p>
       </div>

       {cloneStep === 'idle' && (
         <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700/50">
            <p className="text-lg text-slate-300 mb-6">
              Please read the following sentence clearly into your microphone:
            </p>
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-700 mb-8 font-serif text-xl text-purple-200 italic">
              "The quick brown fox jumps over the lazy dog while the sun sets behind the mountain."
            </div>
            <button 
              onClick={startRecording}
              className="bg-red-500 hover:bg-red-600 text-white font-bold px-8 py-4 rounded-full shadow-lg shadow-red-900/20 transition-all hover:scale-105 flex items-center gap-2 mx-auto"
            >
              <Mic size={24} /> Start Recording
            </button>
         </div>
       )}

       {cloneStep === 'recording' && (
         <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700/50">
             <div className="mb-8 relative">
                <div className="text-red-500 animate-pulse font-bold tracking-widest uppercase mb-4">Recording...</div>
             </div>
             <button 
              onClick={stopRecording}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-8 py-4 rounded-full transition-all mx-auto"
            >
              <StopCircle size={24} /> Stop Recording
            </button>
         </div>
       )}

      {cloneStep === 'review' && (
         <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700/50 text-left">
             <h3 className="text-lg font-bold text-slate-200 mb-4">Review & Save</h3>
             
             <div className="flex gap-4 mb-6">
                <button onClick={playRecording} className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl flex items-center justify-center gap-2">
                   <Play size={18} /> Playback
                </button>
                <button onClick={startRecording} className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl flex items-center justify-center gap-2">
                   <RefreshCw size={18} /> Retry
                </button>
             </div>

             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name Your Voice</label>
             <input 
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="e.g., My Professional Voice"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 mb-6 focus:border-purple-500 focus:outline-none text-slate-200"
             />

             <button 
               onClick={createClone}
               className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
             >
                <Fingerprint size={20} /> Create Digital Twin
             </button>
         </div>
       )}

       {cloneStep === 'processing' && (
          <div className="bg-slate-800/40 p-12 rounded-2xl border border-slate-700/50">
             <RefreshCw className="animate-spin mx-auto text-purple-500 mb-4" size={48} />
             <h3 className="text-xl font-bold text-slate-200">Analyzing Voice Metrics...</h3>
             <p className="text-slate-500 mt-2">Generating neural map.</p>
          </div>
       )}

       {cloneStep === 'done' && (
          <div className="bg-slate-800/40 p-12 rounded-2xl border border-slate-700/50">
             <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500">
                <Fingerprint size={32} />
             </div>
             <h3 className="text-2xl font-bold text-white mb-2">Clone Created!</h3>
             <p className="text-slate-400 mb-8">"{cloneName}" is now available in your voice studio.</p>
             <button 
               onClick={() => setView('studio')}
               className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-8 py-3 rounded-xl"
             >
               Go to Studio
             </button>
             <button 
               onClick={() => { setCloneStep('idle'); setCloneName(""); }}
               className="block w-full mt-4 text-slate-500 hover:text-slate-300 text-sm"
             >
               Create Another
             </button>
          </div>
       )}
    </div>
  );
  
  // Re-declare others for completeness of the file rewrite
  const MenuView = () => (
    <div className="animate-fade-in pb-32">
       <div className="mb-8 text-center">
          <h2 className="text-3xl font-serif text-amber-500 mb-2">Showcase: Chef's Menu</h2>
          <p className="text-slate-400 font-light">Experience sensory food descriptions.</p>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {DISHES.map((dish) => (
            <button key={dish.id} onClick={() => handleDishSelect(dish.name)} disabled={isLoading} className="group relative bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 hover:border-amber-500/50 p-6 rounded-2xl transition-all duration-300 flex flex-col items-center text-center gap-4">
              <div className="text-4xl transform group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">{dish.icon}</div>
              <div><h3 className="text-lg font-serif text-slate-200 group-hover:text-amber-400 transition-colors">{dish.name}</h3></div>
            </button>
          ))}
       </div>
    </div>
  );

  const HistoryView = () => (
    <div className="animate-fade-in pb-32">
      <h2 className="text-2xl font-serif text-slate-200 mb-6 flex items-center gap-2"><HistoryIcon className="text-slate-400" /> Library</h2>
      {history.length === 0 ? <div className="text-center py-20 text-slate-600 border border-dashed border-slate-800 rounded-2xl">Empty.</div> : (
        <div className="space-y-3">
          {history.map((item) => (
            <div key={item.id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/60 transition-colors group">
              <div className="flex-1 mr-4 overflow-hidden">
                <p className="text-slate-300 truncate font-medium">{item.text}</p>
                <div className="flex items-center gap-3 mt-1.5"><span className="text-xs text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700">{item.voice}</span><span className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span></div>
              </div>
              <button onClick={() => loadFromHistory(item)} className="p-3 text-slate-400 hover:text-white hover:bg-blue-600 rounded-lg transition-all"><Play size={20} fill="currentColor" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0a0f1c] text-slate-200 font-sans overflow-hidden selection:bg-blue-500/30">
      
      {/* PROFESSIONAL SIDEBAR */}
      <aside className="hidden md:flex w-72 flex-col border-r border-slate-800/50 bg-[#0b101b]">
        {/* Brand */}
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-1">
             <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Disc size={24} className="text-white animate-spin-slow" />
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">Audio Flow</h1>
                <span className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Pro Studio</span>
             </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 px-4 space-y-8 overflow-y-auto py-4">
           
           <div>
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 mb-2">Create</div>
              <div className="space-y-1">
                 <NavButton active={view === 'studio'} onClick={() => setView('studio')} icon={<LayoutGrid size={18} />} label="Studio" color="blue" />
                 <NavButton active={view === 'live'} onClick={() => setView('live')} icon={<Zap size={18} />} label="Live Flow" color="pink" badge="NEW" />
                 <NavButton active={view === 'podcast'} onClick={() => setView('podcast')} icon={<Radio size={18} />} label="Podcast Flow" color="purple" badge="BETA" />
                 <NavButton active={view === 'clone'} onClick={() => setView('clone')} icon={<Fingerprint size={18} />} label="Voice Clone" color="amber" badge="NEW" />
              </div>
           </div>

           <div>
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 mb-2">Explore</div>
              <div className="space-y-1">
                 <NavButton active={view === 'menu'} onClick={() => setView('menu')} icon={<Sparkles size={18} />} label="Showcase" color="amber" />
                 <NavButton active={view === 'history'} onClick={() => setView('history')} icon={<HistoryIcon size={18} />} label="Library" color="slate" />
              </div>
           </div>

        </nav>

        <div className="p-6 border-t border-slate-800/50 bg-slate-900/30">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-slate-700 to-slate-600 flex items-center justify-center text-xs font-bold">JD</div>
              <div className="flex-1">
                 <div className="text-xs font-medium text-white">John Doe</div>
                 <div className="text-[10px] text-emerald-500">Pro Plan Active</div>
              </div>
              <Settings2 size={16} className="text-slate-500 hover:text-white cursor-pointer" />
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-16 border-b border-slate-800/50 flex items-center justify-between px-6 bg-[#0f1623]">
           <div className="flex items-center gap-2">
             <Disc size={20} className="text-blue-500" />
             <span className="font-bold text-lg">Audio Flow</span>
           </div>
        </header>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-10 scroll-smooth">
           <div className="max-w-5xl mx-auto">
             {view === 'studio' && StudioView()}
             {view === 'live' && LiveView()}
             {view === 'podcast' && PodcastView()}
             {view === 'clone' && CloneView()}
             {view === 'menu' && MenuView()}
             {view === 'history' && HistoryView()}
           </div>
        </div>

        {/* Floating Persistent Player Bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[env(safe-area-inset-bottom)] md:pb-0 pointer-events-none">
           <div className="bg-[#131b2e]/90 backdrop-blur-xl border-t border-slate-700/50 p-4 md:px-8 pointer-events-auto shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
              <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-4 md:gap-8">
                 <div className="hidden md:block w-32 h-12 opacity-80"><Visualizer analyser={analyserRef.current} isPlaying={isPlaying || !!previewSourceRef.current || (isRecording && view === 'clone')} /></div>
                 <div className="flex-1 w-full flex items-center justify-between md:justify-start gap-6">
                    <button onClick={togglePlayback} disabled={!hasAudio && !recordingBlob} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${!hasAudio && !recordingBlob ? 'bg-slate-800 text-slate-600' : 'bg-white text-slate-900 hover:scale-105'}`}>
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                    </button>
                    <div className="hidden md:block flex-1">
                       <div className="text-sm font-medium text-white truncate">{view === 'clone' && isRecording ? "Recording..." : (text || "Ready...")}</div>
                       <div className="flex items-center gap-2 text-xs text-slate-400">
                           <span className="text-blue-400">
                             {customVoices.find(v => v.id === voice)?.name || voice}
                           </span>
                           <span>•</span>
                           <span>{language}</span>
                       </div>
                    </div>
                    
                    {/* Download Controls */}
                    <div className="flex items-center bg-slate-800/60 rounded-lg p-1">
                      <select 
                        value={downloadFormat}
                        onChange={(e) => setDownloadFormat(e.target.value as 'wav' | 'mp3')}
                        className="bg-transparent text-xs text-slate-400 font-medium px-2 py-1 focus:outline-none cursor-pointer hover:text-white"
                        title="Select Download Format"
                      >
                        <option value="wav">WAV</option>
                        <option value="mp3">MP3</option>
                      </select>
                      <div className="w-px h-4 bg-slate-700 mx-1"></div>
                      <button 
                        onClick={handleDownload} 
                        disabled={!hasAudio} 
                        className="p-1.5 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                    </div>

                 </div>
              </div>
           </div>
           <div className="md:hidden h-16 bg-[#0f1623]"></div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 h-16 bg-[#0f1623] border-t border-slate-800 flex justify-around items-center z-30 pb-[env(safe-area-inset-bottom)]">
            <MobileNavButton active={view === 'studio'} onClick={() => setView('studio')} icon={<LayoutGrid size={20} />} label="Studio" />
            <MobileNavButton active={view === 'live'} onClick={() => setView('live')} icon={<Zap size={20} />} label="Live" />
            <MobileNavButton active={view === 'clone'} onClick={() => setView('clone')} icon={<Fingerprint size={20} />} label="Clone" />
            <MobileNavButton active={view === 'menu'} onClick={() => setView('menu')} icon={<Sparkles size={20} />} label="Show" />
        </nav>
      </main>

      {/* Global Error Toast */}
      {error && <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-900/90 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-sm z-50 animate-bounce-in border border-red-500/50 backdrop-blur"><AlertCircle size={16} /> {error}</div>}
    </div>
  );
}

// --- Subcomponents ---

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactElement;
  label: string;
  color?: string;
  badge?: string;
}

const NavButton = ({ active, onClick, icon, label, color = 'blue', badge }: NavButtonProps) => {
  const activeBg = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/50',
    pink: 'bg-pink-500/10 text-pink-400 border-pink-500/50',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/50',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/50',
    slate: 'bg-slate-500/10 text-slate-300 border-slate-500/50',
  }[color] || 'bg-blue-500/10 text-blue-400';

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-200 group
        ${active 
          ? `${activeBg} border border-dashed` 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {badge && (
        <span className="text-[9px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-white">{badge}</span>
      )}
    </button>
  );
};

const MobileNavButton = ({ active, onClick, icon, label }: NavButtonProps) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${active ? 'text-blue-500' : 'text-slate-500'}`}>
    {React.cloneElement(icon, { size: 20 })}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default App;