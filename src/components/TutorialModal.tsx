import React from 'react';
import { Play, Sparkles, Gift, Wallet, X } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRules?: () => void;
}

const STEPS = [
  {
    icon: Play,
    title: '1. Play Your First Free Match',
    body: 'Open PVP -> Practice and start one free game versus bots to learn the pace, turns, and special cards.',
    accent: 'text-[#00ff66]',
    badge: 'FREE',
  },
  {
    icon: Wallet,
    title: '2. Connect Wallet For Rewards',
    body: 'After your first free match, connect your TON wallet to sync progress and unlock reward flows tied to your profile.',
    accent: 'text-[#00d2ff]',
    badge: 'SYNC',
  },
  {
    icon: Gift,
    title: '3. Claim XP And Energy',
    body: 'Use the Rewards tab for daily XP, then finish quests to collect extra energy and keep playing longer.',
    accent: 'text-[#ffcc00]',
    badge: 'REWARD',
  },
  {
    icon: Sparkles,
    title: '4. Use Public Or Private Tables',
    body: 'Public rooms are stake-based. Private rooms now also support a free 0 TKT mode for custom matches with friends.',
    accent: 'text-[#ff7ae6]',
    badge: 'TABLES',
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose, onOpenRules }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#0b0d14] border-4 border-black shadow-[6px_6px_0_#000] text-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[linear-gradient(90deg,#00d2ff_0%,#00ff66_50%,#ffcc00_100%)] text-black border-b-4 border-black">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em]">Quick Start</div>
            <h2 className="text-sm font-black uppercase">Neon Card Tutorial</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-black text-white border-2 border-black"
            aria-label="Close tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="h-20 rounded-sm border-2 border-[#ff4b4b] bg-[radial-gradient(circle_at_top,#ff4b4b55,transparent_65%),#12080a] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#ff9a9a]">Attack</div>
              <div className="mt-3 text-xl font-black text-white">+2</div>
            </div>
            <div className="h-20 rounded-sm border-2 border-[#00d2ff] bg-[radial-gradient(circle_at_top,#00d2ff55,transparent_65%),#071019] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#8fe8ff]">Flow</div>
              <div className="mt-3 text-xl font-black text-white">REV</div>
            </div>
            <div className="h-20 rounded-sm border-2 border-[#ffcc00] bg-[radial-gradient(circle_at_top,#ffcc0055,transparent_65%),#171205] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#ffe385]">Wild</div>
              <div className="mt-3 text-xl font-black text-white">WILD</div>
            </div>
          </div>

          <div className="space-y-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="border border-black bg-[#11131b] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 border border-black bg-black flex items-center justify-center ${step.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[11px] font-black uppercase">{step.title}</h3>
                        <span className={`text-[8px] font-black uppercase ${step.accent}`}>{step.badge}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{step.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 p-4 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-[#00ff66] text-black border-2 border-black font-black uppercase text-[11px] shadow-[2px_2px_0_#000]"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRules?.();
            }}
            className="flex-1 py-2 bg-black text-[#00d2ff] border-2 border-black font-black uppercase text-[11px]"
          >
            Open Rules
          </button>
        </div>
      </div>
    </div>
  );
};
