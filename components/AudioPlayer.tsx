import React, { useState, useRef } from 'react';
import { PlayIcon, PauseIcon, SpinnerIcon } from './icons';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Audio Decoding Helpers from Gemini Docs ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Component ---

interface AudioPlayerProps {
  title: string;
  prompt: string;
  duration: string;
  waveformColor: string;
  buttonColor: string;
  textColor: string;
}

const WaveformBar: React.FC<{ height: number; color: string; delay: number }> = ({ height, color, delay }) => (
  <div
    className={`w-1 rounded-full ${color}`}
    style={{ height: `${height}px`, animation: `wave 1.5s ease-in-out infinite`, animationDelay: `${delay}s` }}
  >
    <style>{`
      @keyframes wave {
        0%, 100% { transform: scaleY(0.3); }
        50% { transform: scaleY(1); }
      }
    `}</style>
  </div>
);

const AudioPlayer: React.FC<AudioPlayerProps> = ({ title, prompt, duration, waveformColor, buttonColor, textColor }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const heights = [20, 30, 25, 35, 22, 28, 32, 26, 20, 30, 25, 35, 22, 28, 32, 26, 20, 30, 25, 35, 22, 28, 32, 26];
  
  const playAudio = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;
    // Stop any existing source
    if (sourceRef.current) {
        sourceRef.current.stop();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.start();
    source.onended = () => {
        setIsPlaying(false);
        sourceRef.current = null;
    };
    sourceRef.current = source;
    setIsPlaying(true);
  };


  const handlePlayPause = async () => {
    if (isLoading) return;
    
    // Initialize AudioContext on first interaction
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    if (isPlaying) {
        audioContextRef.current.suspend();
        setIsPlaying(false);
    } else {
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
            setIsPlaying(true);
            return;
        }

        if (audioBufferRef.current) {
            playAudio(audioBufferRef.current);
        } else {
            setIsLoading(true);
            try {
                const ai = new GoogleGenAI({apiKey: process.env.API_KEY as string});
                const response = await ai.models.generateContent({
                  model: "gemini-2.5-flash-preview-tts",
                  contents: [{ parts: [{ text: `Say with a calm, gentle, and reassuring voice: ${prompt}` }] }],
                  config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: 'Kore' },
                        },
                    },
                  },
                });

                const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (base64Audio) {
                    const audioBytes = decode(base64Audio);
                    const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
                    audioBufferRef.current = audioBuffer;
                    playAudio(audioBuffer);
                }
            } catch (error) {
                console.error("Failed to generate audio:", error);
                alert("Sorry, there was an error generating the audio. Please try again.");
            } finally {
                setIsLoading(false);
            }
        }
    }
  };

  return (
    <div className={`flex items-center space-x-4 ${textColor}`}>
      <button
        onClick={handlePlayPause}
        disabled={isLoading}
        className={`w-14 h-14 flex-shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 active:scale-95 active:shadow-inner disabled:opacity-50 disabled:cursor-not-allowed ${buttonColor}`}
      >
        {isLoading ? <SpinnerIcon className="w-7 h-7" /> : 
         isPlaying ? <PauseIcon className="w-7 h-7" /> : 
         <PlayIcon className="w-7 h-7" />}
      </button>
      <div className="flex-grow">
        <h3 className="font-bold text-lg">{title}</h3>
        <div className="flex items-center space-x-3 mt-2">
          <div className="flex items-end space-x-1 h-10">
            {heights.map((h, i) => (
              <WaveformBar key={i} height={h} color={waveformColor} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </div>
      <span className="font-semibold text-lg">{duration}</span>
    </div>
  );
};

export default AudioPlayer;