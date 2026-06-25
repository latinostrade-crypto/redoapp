/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'rule-modal-backdrop') onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-3xl border-4 border-slate-900 overflow-hidden flex flex-col shadow-2xl animate-pop"
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 p-5 pb-7 text-slate-900 border-b-4 border-slate-900 flex justify-between items-center relative">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-8 h-8 text-white stroke-[3] drop-shadow" />
            <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.15)] font-sans">
              Cartoon Rules! 🦄🃏
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-slate-900 text-white hover:bg-slate-800 border-2 border-white transition-transform active:scale-90"
            aria-label="Close rules"
          >
            <X className="w-5 h-5 stroke-[3]" />
          </button>
          
          {/* Wave cut at bottom of header */}
          <div className="absolute bottom-[-1px] left-0 right-0 h-3 bg-white" style={{ clipPath: 'path("M0 10 Q 25 0, 50 10 T 100 10 L 100 12 L 0 12 Z")' }}></div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 font-sans leading-relaxed text-slate-700 text-sm">
          
          {/* Main Gameplay */}
          <div className="bg-amber-50 p-4 rounded-2xl border-2 border-amber-200">
            <h3 className="font-extrabold text-amber-900 text-base mb-1.5 flex items-center gap-1.5">
              <span>🎯</span> Basic Match Goal
            </h3>
            <p>
              Match the top card in the discard pile by <strong>Color</strong> (Red, Blue, Green, Yellow) or <strong>Value</strong> (Number, Skip, Reverse, Draw Two). Wild cards can be played on any card!
            </p>
          </div>

          {/* Action Cards */}
          <div>
            <h3 className="font-extrabold text-slate-900 text-base mb-3 flex items-center gap-1.5">
              <span>⚡</span> Action & Trick Cards
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex gap-3 items-start bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <span className="text-xl bg-blue-100 p-1 rounded-lg">🚫</span>
                <div>
                  <h4 className="font-bold text-blue-900 text-sm">Skip</h4>
                  <p className="text-slate-650 text-xs">Excludes the next player from their turn! Simple & sweet.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                <span className="text-xl bg-indigo-100 p-1 rounded-lg">🔄</span>
                <div>
                  <h4 className="font-bold text-indigo-900 text-sm">Reverse</h4>
                  <p className="text-slate-650 text-xs">Swaps table play direction (Clockwise vs Counter-Clockwise)!</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-pink-50/50 p-3 rounded-xl border border-pink-100">
                <span className="text-xl bg-pink-100 p-1 rounded-lg">📥</span>
                <div>
                  <h4 className="font-bold text-pink-900 text-sm">Draw Two (+2)</h4>
                  <p className="text-slate-650 text-xs">Forces the next player to draw 2 cards and skips their turn!</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                <span className="text-xl bg-emerald-100 p-1 rounded-lg">🌈</span>
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">Wild Color Select</h4>
                  <p className="text-slate-650 text-xs">Can play anytime! Pick a new active suit color for the table.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-red-50/50 p-3 rounded-xl border border-red-100">
                <span className="text-xl bg-red-100 p-1 rounded-lg">💥</span>
                <div>
                  <h4 className="font-bold text-red-950 text-sm">Wild Draw Four (+4)</h4>
                  <p className="text-slate-650 text-xs">The ultimate attack! Next player draws 4 cards, gets skipped, and you choose the color swap.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Shouting UNO! Rules */}
          <div className="bg-rose-50 p-4 rounded-2xl border-2 border-rose-100">
            <h3 className="font-extrabold text-rose-950 text-base mb-1.5 flex items-center gap-1.5">
              <span>📣</span> Calling "UNO!" Penalty
            </h3>
            <p className="mb-2">
              Whenever you play a card and have <strong>exactly 1 card left</strong>, you <strong>MUST</strong> tap the big yellow <strong>"UNO!"</strong> button!
            </p>
            <p>
              If you forget, other players (and smart AI bots!) have a short window to say <strong>"CATCH!"</strong>. Caught players draw 2 penalty cards! You can also catch AI bots if they forget!
            </p>
          </div>

          {/* Score calculations */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-slate-500" />
              Points Strategy
            </h3>
            <p className="text-xs text-slate-600">
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
        <div className="p-4 bg-slate-50 border-t-2 border-slate-150 flex justify-center">
          <button
            onClick={onClose}
            className="w-full max-w-xs py-3 px-6 bg-slate-900 text-white font-extrabold tracking-wide rounded-2xl border-b-4 border-slate-950 text-center hover:bg-slate-800 active:scale-[0.98] transition-transform font-sans"
          >
            LET'S PLAY! 🐾
          </button>
        </div>
      </div>
    </div>
  );
};
