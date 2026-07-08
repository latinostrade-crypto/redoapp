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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'rule-modal-backdrop') onClose();
      }}
    >
      <div className="relative w-full max-w-lg max-h-[90vh] bg-[#0c0f12] text-[#f8fafc] pixel-box-lg flex flex-col overflow-hidden animate-pop">
        <div className="bg-[#00d2ff] p-4 text-black border-b-4 border-black flex justify-between items-center relative">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-6 h-6 stroke-[3]" />
            <h2 className="text-sm min-[370px]:text-base font-black tracking-tight font-mono">
              [ MATCH RULES ]
            </h2>
          </div>
          <button
            onClick={onClose}
            className="pixel-btn-interactive bg-[#ff4b4b] text-black font-black w-7 h-7 flex items-center justify-center border-2 border-black"
            aria-label="Close rules"
          >
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs leading-relaxed text-slate-300">
          <div className="pixel-box-sm bg-blue-950/40 p-3 border-black text-left">
            <h3 className="font-black text-[#00d2ff] text-xs uppercase mb-1 font-mono">
              :: Basic Match Goal
            </h3>
            <p>
              Match the top discard card by <strong>suit</strong> or <strong>value</strong>. Number cards match their number, action cards match their symbol, and wild cards can be played at any time.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-black text-slate-100 text-xs uppercase font-mono">
              :: Special Actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2.5 border-black text-left">
                <span className="text-[9px] bg-slate-900 border border-black px-1.5 py-0.5 text-[#ff4b4b] font-bold font-mono">SKIP</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Skip Turn</h4>
                  <p className="text-slate-400 text-[10px]">The next player misses their turn.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2.5 border-black text-left">
                <span className="text-[9px] bg-slate-900 border border-black px-1.5 py-0.5 text-[#00d2ff] font-bold font-mono">REV</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Reverse Direction</h4>
                  <p className="text-slate-400 text-[10px]">Changes play direction. In a 2-player match it behaves like a skip and gives you the next turn again.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2.5 border-black text-left">
                <span className="text-[9px] bg-slate-900 border border-black px-1.5 py-0.5 text-[#00ff66] font-bold font-mono">+2</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Draw Two (+2)</h4>
                  <p className="text-slate-400 text-[10px]">The next player draws 2 cards and misses their turn.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2.5 border-black text-left">
                <span className="text-[9px] bg-slate-900 border border-black px-1.5 py-0.5 text-[#ffcc00] font-bold font-mono">WILD</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Wild Suit</h4>
                  <p className="text-slate-400 text-[10px]">Playable anytime. Choose the next active suit for the table.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2.5 border-black text-left">
                <span className="text-[9px] bg-slate-900 border border-black px-1.5 py-0.5 text-[#ec4899] font-bold font-mono">+4</span>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">Wild Draw Four (+4)</h4>
                  <p className="text-slate-400 text-[10px]">The next player draws 4 cards, misses their turn, and you choose the next active suit.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pixel-box-sm bg-slate-950/50 p-3 border-black text-left">
            <h3 className="font-black text-slate-100 text-xs uppercase mb-1 font-mono">
              :: Final Card Call
            </h3>
            <p className="mb-1">
              When a player drops to <strong>exactly 1 card</strong>, they must make the final-card call before the next action.
            </p>
            <p>
              If they miss it, other players and AI bots can catch them. Caught players draw 2 penalty cards.
            </p>
          </div>

          <div className="pixel-box-sm bg-slate-950 p-3 border-black text-left">
            <h3 className="font-black text-slate-300 text-[11px] mb-1 flex items-center gap-1.5 font-mono">
              <Award className="w-3.5 h-3.5 text-slate-400" />
              POINTS SYSTEM
            </h3>
            <p className="text-[10px] text-slate-400">
              When a player wins, they score points from opponents&apos; remaining hands:
              <br />
              * Numbers: <strong>Face Value</strong>
              <br />
              * Actions (Skip / Reverse / Draw Two): <strong>20 Points</strong>
              <br />
              * Wilds (Wild / Wild Draw Four): <strong>50 Points</strong>
            </p>
          </div>

          <div className="pixel-box-sm bg-[#06131c] p-3 border-black text-left">
            <h3 className="font-black text-[#00ff66] text-xs uppercase mb-1 font-mono">
              :: Match Modes
            </h3>
            <p className="text-[10px] text-slate-300">
              Practice is free versus bots. Public PVP uses ticket stakes. Private rooms support both stake-based games and free 0 TKT matches.
            </p>
          </div>
        </div>

        <div className="p-3 bg-black border-t-2 border-black flex justify-center">
          <button
            onClick={onClose}
            className="pixel-btn-interactive w-full max-w-xs py-2 px-4 bg-[#00ff66] text-black font-black text-xs uppercase tracking-wide border-4 border-black font-mono"
          >
            LET&apos;S PLAY!
          </button>
        </div>
      </div>
    </div>
  );
};
