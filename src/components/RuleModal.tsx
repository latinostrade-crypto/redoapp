import React from 'react';
import { X, Award, HelpCircle } from 'lucide-react';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RuleModal: React.FC<RuleModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="rule-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'rule-modal-backdrop') onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-pop text-slate-200"
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 p-5 pb-7 text-white border-b border-slate-850 flex justify-between items-center relative">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-8 h-8 text-white stroke-[3] drop-shadow" />
            <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.15)] font-sans">
              Surf Match Rules
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-slate-950 text-white hover:bg-slate-850 border border-slate-800 transition-transform active:scale-90"
            aria-label="Close rules"
          >
            <X className="w-5 h-5 stroke-[3]" />
          </button>
          
          {/* Wave cut at bottom of header */}
          <div className="absolute bottom-[-1px] left-0 right-0 h-3 bg-slate-900" style={{ clipPath: 'path("M0 10 Q 25 0, 50 10 T 100 10 L 100 12 L 0 12 Z")' }}></div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 font-sans leading-relaxed text-slate-350 text-sm">
          
          {/* Main Gameplay */}
          <div className="bg-blue-950/30 p-4 rounded-2xl border border-blue-900/30">
            <h3 className="font-extrabold text-blue-400 text-base mb-1.5 flex items-center gap-1.5">
              Basic Match Goal
            </h3>
            <p>
              Match the top card in the discard pile by <strong>Color</strong> (Red, Blue, Purple, Gold) or <strong>Value</strong> (Number, Skip, Reverse, Draw Two). Wild cards can be played on any card!
            </p>
          </div>

          {/* Action Cards */}
          <div>
            <h3 className="font-extrabold text-slate-100 text-base mb-3 flex items-center gap-1.5">
              Action & Special Maneuvers
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex gap-3 items-start bg-slate-850/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-blue-400 font-bold">SKIP</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Skip</h4>
                  <p className="text-slate-400 text-xs">Excludes the next player from their turn! Simple & sweet.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-slate-850/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-cyan-400 font-bold">REV</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Reverse</h4>
                  <p className="text-slate-400 text-xs">Swaps table play direction (Clockwise vs Counter-Clockwise)!</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-slate-850/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-teal-400 font-bold">+2</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Draw Two (+2)</h4>
                  <p className="text-slate-400 text-xs">Forces the next player to draw 2 cards and skips their turn!</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-slate-850/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-purple-400 font-bold">WILD</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Wild Color Select</h4>
                  <p className="text-slate-400 text-xs">Can play anytime! Pick a new active suit color for the table.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-slate-850/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-red-400 font-bold">+4</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Wild Draw Four (+4)</h4>
                  <p className="text-slate-400 text-xs">The ultimate attack! Next player draws 4 cards, gets skipped, and you choose the color swap.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Shouting UNO! Rules */}
          <div className="bg-slate-850/50 p-4 rounded-2xl border border-slate-800">
            <h3 className="font-extrabold text-slate-100 text-base mb-1.5 flex items-center gap-1.5">
              Calling "UNO!" Penalty
            </h3>
            <p className="mb-2">
              Whenever you play a card and have <strong>exactly 1 card left</strong>, you <strong>MUST</strong> tap the big yellow <strong>"UNO!"</strong> button!
            </p>
            <p>
              If you forget, other players (and AI bots!) have a short window to say <strong>"CATCH!"</strong>. Caught players draw 2 penalty cards! You can also catch bots if they forget!
            </p>
          </div>

          {/* Score calculations */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
            <h3 className="font-semibold text-slate-350 text-sm mb-1 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-slate-400" />
              Points Strategy
            </h3>
            <p className="text-xs text-slate-400">
              When someone wins, scores are calculated from opponents' hands:
              <br />
              • Numbers: <strong>Face Value</strong>
              <br />
              • Actions (Skip/Reverse/Draw2): <strong>20 Points each</strong>
              <br />• Wilds (Wild/Wild+4): <strong>50 Points each</strong>
            </p>
          </div>

        </div>

        {/* Footer Button */}
        <div className="p-4 bg-slate-950 border-t border-slate-850 flex justify-center">
          <button
            onClick={onClose}
            className="w-full max-w-xs py-3 px-6 bg-blue-600 text-white font-extrabold tracking-wide rounded-2xl border-b-4 border-blue-800 text-center hover:bg-blue-500 active:scale-[0.98] transition-transform font-sans"
          >
            LET'S PLAY
          </button>
        </div>
      </div>
    </div>
  );
};

