import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LoadingScreenProps {
  message: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  const [tipIndex, setTipIndex] = useState(0);

  const tips = [
    "CHOOSE YOUR COLOR WISELY!",
    "WILD CARDS CAN TURN THE TIDE!",
    "DON'T FORGET TO SHOUT UNO!",
    "COMPETE IN PVP STAKE ARENAS TO WIN TKT!",
    "DAILY CHECK-IN GRANTS FREE XP!",
    "PLAY PRACTICE MATCHES VERSUS BOTS TO HONE YOUR SKILLS!",
    "KEEP AN EYE ON YOUR STAKE AND BALANCE!",
    "EVERY SECOND COUNTS - DON'T RUN OUT OF TIME!"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <div className="fixed inset-0 bg-[#0c0f12] z-[9999] flex flex-col items-center justify-center p-4 font-mono select-none overflow-hidden pixel-scanlines crt-flicker">
      {/* Glow background */}
      <div className="absolute w-[300px] h-[300px] bg-[#00d2ff]/10 rounded-full blur-[80px] pointer-events-none animate-pulse-soft"></div>
      
      <div className="w-full max-w-sm flex flex-col items-center gap-6 z-10 text-center">
        {/* Loading Header */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-[#ff4b4b] text-black font-black text-xs border-2 border-black transform rotate-[-2deg] shadow-[2px_2px_0_#000]">
            REDO
          </span>
          <h1 className="text-sm font-black text-white tracking-tight">
            <span className="text-[#ffcc00]">APP</span>
          </h1>
        </div>

        {/* Loading Image */}
        <div className="w-full border-4 border-black overflow-hidden bg-slate-950 shadow-[4px_4px_0_#000] aspect-[16/10] relative animate-float">
          <img
            src="/loading-screener.webp"
            alt="Loading Screener"
            className="w-full h-full object-cover select-none pointer-events-none"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Loading Status & Bar */}
        <div className="w-full space-y-4">
          <div className="text-[10px] font-black tracking-widest text-[#00d2ff] uppercase drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
            {message}
          </div>

          {/* Pixelated Progress Bar */}
          <div className="w-full h-4 bg-black border-2 border-black relative p-0.5 shadow-[2px_2px_0_#000] overflow-hidden">
            <div className="h-full bg-[#00ff66] animate-loading-bar" style={{ width: '40%' }}></div>
          </div>

          {/* Loading Tip */}
          <div className="min-h-[40px] flex items-center justify-center px-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={tipIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.25 }}
                className="text-[7.5px] text-slate-400 uppercase leading-relaxed max-w-xs"
              >
                TIP: {tips[tipIndex]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
