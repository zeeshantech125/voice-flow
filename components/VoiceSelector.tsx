
import React, { useRef } from 'react';
import { VoiceName, VoiceOption, CustomVoice } from '../types';
import { User, Mic, PlayCircle, Fingerprint } from 'lucide-react';

interface VoiceSelectorProps {
  selectedVoice: VoiceName | string;
  onSelect: (voice: VoiceName | string) => void;
  onHover?: (voice: VoiceName) => void;
  onLeave?: () => void;
  disabled?: boolean;
  customVoices?: CustomVoice[];
}

const VOICES: VoiceOption[] = [
  { id: VoiceName.Puck, name: 'Puck', gender: 'Male', description: 'Energetic & clear' },
  { id: VoiceName.Charon, name: 'Charon', gender: 'Male', description: 'Deep & authoritative' },
  { id: VoiceName.Kore, name: 'Kore', gender: 'Female', description: 'Warm & soothing' },
  { id: VoiceName.Fenrir, name: 'Fenrir', gender: 'Male', description: 'Gravelly & intense' },
  { id: VoiceName.Zephyr, name: 'Zephyr', gender: 'Female', description: 'Soft & airy' },
];

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelect, onHover, onLeave, disabled, customVoices = [] }) => {
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = (voiceId: VoiceName) => {
    if (disabled || !onHover) return;
    
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = window.setTimeout(() => {
      onHover(voiceId);
    }, 300);
  };

  const handleCustomMouseEnter = (baseVoice: VoiceName) => {
    if (disabled || !onHover) return;
    
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = window.setTimeout(() => {
      onHover(baseVoice);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (onLeave) {
      onLeave();
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {VOICES.map((voice) => (
        <button
          key={voice.id}
          onClick={() => onSelect(voice.id)}
          onMouseEnter={() => handleMouseEnter(voice.id)}
          onMouseLeave={handleMouseLeave}
          disabled={disabled}
          className={`
            relative p-4 rounded-xl border transition-all duration-200 text-left group
            ${selectedVoice === voice.id 
              ? 'bg-blue-500/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
              : 'bg-slate-800 border-slate-700 hover:border-blue-400 hover:bg-slate-750'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`p-2 rounded-full transition-colors duration-300 ${selectedVoice === voice.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'}`}>
              <User size={16} />
            </span>
            {selectedVoice === voice.id && <Mic size={16} className="text-blue-500 animate-pulse" />}
            {selectedVoice !== voice.id && (
              <PlayCircle size={16} className="text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-blue-400 transition-all duration-300 group-hover:scale-110" />
            )}
          </div>
          <h3 className={`font-semibold ${selectedVoice === voice.id ? 'text-blue-100' : 'text-slate-200'}`}>
            {voice.name}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{voice.description}</p>
        </button>
      ))}

      {customVoices.map((voice) => (
        <button
          key={voice.id}
          onClick={() => onSelect(voice.id)}
          onMouseEnter={() => handleCustomMouseEnter(voice.baseVoice)}
          onMouseLeave={handleMouseLeave}
          disabled={disabled}
          className={`
            relative p-4 rounded-xl border transition-all duration-200 text-left group
            ${selectedVoice === voice.id 
              ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
              : 'bg-slate-800 border-slate-700 hover:border-purple-400 hover:bg-slate-750'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`p-2 rounded-full transition-colors duration-300 ${selectedVoice === voice.id ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'}`}>
              <Fingerprint size={16} />
            </span>
            {selectedVoice === voice.id && <Mic size={16} className="text-purple-500 animate-pulse" />}
             {selectedVoice !== voice.id && (
              <PlayCircle size={16} className="text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-purple-400 transition-all duration-300 group-hover:scale-110" />
            )}
          </div>
          <h3 className={`font-semibold truncate ${selectedVoice === voice.id ? 'text-purple-100' : 'text-slate-200'}`}>
            {voice.name}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Clone of {voice.baseVoice}</p>
        </button>
      ))}
    </div>
  );
};

export default VoiceSelector;
