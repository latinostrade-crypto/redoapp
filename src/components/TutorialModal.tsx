import { useLanguage } from '../i18n/LanguageProvider';
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
    title: 'tutorialPlayTitle',
    body: 'tutorialPlayBody',
    accent: 'text-[#00ff66]',
    badge: 'freeUpper',
  },
  {
    icon: Wallet,
    title: 'tutorialWalletTitle',
    body: 'tutorialWalletBody',
    accent: 'text-[#00d2ff]',
    badge: 'sync',
  },
  {
    icon: Gift,
    title: 'tutorialEnergyTitle',
    body: 'tutorialEnergyBody',
    accent: 'text-[#ffcc00]',
    badge: 'reward',
  },
  {
    icon: Sparkles,
    title: 'tutorialTablesTitle',
    body: 'tutorialTablesBody',
    accent: 'text-[#ff7ae6]',
    badge: 'tables',
  },
] as const;

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose, onOpenRules }) => {
  const { tr } = useLanguage();
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
            <div className="text-[10px] font-black uppercase tracking-[0.24em]">{tr("quickStart")}</div>
            <h2 className="text-sm font-black uppercase">{tr("tutorialHeading")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-black text-white border-2 border-black"
            aria-label={tr("closeTutorial")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="h-20 rounded-sm border-2 border-[#ff4b4b] bg-[radial-gradient(circle_at_top,#ff4b4b55,transparent_65%),#12080a] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#ff9a9a]">{tr("attack")}</div>
              <div className="mt-3 text-xl font-black text-white">+2</div>
            </div>
            <div className="h-20 rounded-sm border-2 border-[#00d2ff] bg-[radial-gradient(circle_at_top,#00d2ff55,transparent_65%),#071019] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#8fe8ff]">{tr("flow")}</div>
              <div className="mt-3 text-xl font-black text-white">REV</div>
            </div>
            <div className="h-20 rounded-sm border-2 border-[#ffcc00] bg-[radial-gradient(circle_at_top,#ffcc0055,transparent_65%),#171205] px-2 py-3">
              <div className="text-[8px] font-black uppercase text-[#ffe385]">{tr("wild")}</div>
              <div className="mt-3 text-xl font-black text-white">WILD</div>
            </div>
          </div>

          <div className="space-y-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={tr(step.title)} className="border border-black bg-[#11131b] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 border border-black bg-black flex items-center justify-center ${step.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[11px] font-black uppercase">{step.title}</h3>
                        <span className={`text-[8px] font-black uppercase ${step.accent}`}>{tr(step.badge)}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{tr(step.body)}</p>
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
          >{tr("start")}</button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRules?.();
            }}
            className="flex-1 py-2 bg-black text-[#00d2ff] border-2 border-black font-black uppercase text-[11px]"
          >{tr("openRules")}</button>
        </div>
      </div>
    </div>
  );
};
