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
              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2 border-black text-left">
                <div className="w-8 h-12 bg-black border border-black flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[1px_1px_0_#000]">
                  <img src="/cards/Rug red.jpeg" alt="Skip card" className="w-full h-full object-cover scale-[1.14] select-none" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>Skip Turn</span>
                    <span className="text-[7.5px] bg-[#ff4b4b] text-black px-1 border border-black font-black uppercase leading-tight">SKIP</span>
                  </h4>
                  <p className="text-slate-450 text-[9px] mt-0.5">The next player misses their turn.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2 border-black text-left">
                <div className="w-8 h-12 bg-black border border-black flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[1px_1px_0_#000]">
                  <img src="/cards/Flip red.jpeg" alt="Reverse card" className="w-full h-full object-cover scale-[1.14] select-none" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>Reverse Direction</span>
                    <span className="text-[7.5px] bg-[#00d2ff] text-black px-1 border border-black font-black uppercase leading-tight">REV</span>
                  </h4>
                  <p className="text-slate-450 text-[9px] mt-0.5">Changes play direction. In 2-player it acts like a skip.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2 border-black text-left">
                <div className="w-8 h-12 bg-black border border-black flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[1px_1px_0_#000]">
                  <img src="/cards/plus2_red_v2.jpeg" alt="Draw Two card" className="w-full h-full object-cover scale-[1.14] select-none" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>Draw Two (+2)</span>
                    <span className="text-[7.5px] bg-[#00ff66] text-black px-1 border border-black font-black uppercase leading-tight">+2</span>
                  </h4>
                  <p className="text-slate-450 text-[9px] mt-0.5">Next player draws 2 cards and misses their turn.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2 border-black text-left">
                <div className="w-8 h-12 bg-black border border-black flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[1px_1px_0_#000]">
                  <img src="/cards/wild 1.jpeg" alt="Wild card" className="w-full h-full object-cover scale-[1.14] select-none" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>Wild Suit</span>
                    <span className="text-[7.5px] bg-[#ffcc00] text-black px-1 border border-black font-black uppercase leading-tight">WILD</span>
                  </h4>
                  <p className="text-slate-450 text-[9px] mt-0.5">Playable anytime. Choose the next active suit for the table.</p>
                </div>
              </div>

              <div className="flex gap-3 items-center pixel-box-sm bg-slate-950/50 p-2 border-black text-left">
                <div className="w-8 h-12 bg-black border border-black flex-shrink-0 overflow-hidden flex items-center justify-center shadow-[1px_1px_0_#000]">
                  <img src="/cards/plus4_red_v2.jpeg" alt="Wild Draw Four card" className="w-full h-full object-cover scale-[1.14] select-none" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>Wild Draw Four (+4)</span>
                    <span className="text-[7.5px] bg-[#ec4899] text-black px-1 border border-black font-black uppercase leading-tight">+4</span>
                  </h4>
                  <p className="text-slate-450 text-[9px] mt-0.5">Next player draws 4 cards, misses turn, and you choose suit.</p>
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
