/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PokerSoundId =
  | 'ui_click' | 'ui_confirm' | 'ui_cancel'
  | 'card_deal' | 'card_flip' | 'player_turn' | 'timer_warning'
  | 'bet_move' | 'pot_receive' | 'fold' | 'all_in'
  | 'player_join' | 'player_disconnect' | 'player_eliminated'
  | 'showdown' | 'game_start' | 'winner' | 'game_over' | 'scene_transition';

// Shared Web Audio synthesizer. Poker uses the dedicated dry, deterministic
// terminal cue bank below; the older game surfaces retain their existing cues.
class SoundSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private idleTimer: number | null = null;
  private userActivated = false;

  constructor() {
    // Only initialized on first user interaction to comply with browser autoplay policies
    if (typeof document !== 'undefined') {
      const unlock = () => { this.userActivated = true; };
      document.addEventListener('pointerdown', unlock, { once: true, capture: true });
      document.addEventListener('keydown', unlock, { once: true, capture: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      });
    }
  }

  private init() {
    if (!this.userActivated || document.hidden) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    }, 4000);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const cacheVal = this.isMuted ? 'true' : 'false';
    localStorage.setItem('redoapp_muted', cacheVal);
    return this.isMuted;
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('redoapp_muted', muted ? 'true' : 'false');
  }

  getMuted() {
    // Read from localStorage to persist user settings
    const stored = localStorage.getItem('redoapp_muted');
    if (stored !== null) {
      this.isMuted = stored === 'true';
    }
    return this.isMuted;
  }

  playPokerCue(id: PokerSoundId) {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const patterns: Record<PokerSoundId, Array<[number, number, number, number, OscillatorType]>> = {
      ui_click: [[520, 0, .045, .045, 'square']],
      ui_confirm: [[360, 0, .05, .05, 'square'], [610, .055, .06, .045, 'square']],
      ui_cancel: [[390, 0, .05, .045, 'square'], [220, .055, .07, .04, 'square']],
      card_deal: [[145, 0, .035, .035, 'sawtooth'], [95, .04, .025, .025, 'square']],
      card_flip: [[190, 0, .035, .035, 'square'], [560, .038, .045, .035, 'square']],
      player_turn: [[680, 0, .055, .045, 'square'], [820, .07, .055, .04, 'square']],
      timer_warning: [[920, 0, .06, .05, 'square'], [920, .12, .06, .045, 'square']],
      bet_move: [[180, 0, .035, .04, 'square'], [240, .035, .035, .035, 'square'], [310, .07, .04, .03, 'square']],
      pot_receive: [[260, 0, .04, .04, 'square'], [390, .045, .04, .04, 'square'], [520, .09, .055, .035, 'square']],
      fold: [[260, 0, .055, .04, 'sawtooth'], [120, .06, .08, .035, 'square']],
      all_in: [[110, 0, .12, .065, 'sawtooth'], [220, .1, .12, .055, 'square'], [440, .2, .14, .05, 'square']],
      player_join: [[330, 0, .05, .04, 'square'], [495, .06, .07, .04, 'square']],
      player_disconnect: [[420, 0, .045, .045, 'square'], [170, .05, .1, .04, 'sawtooth']],
      player_eliminated: [[230, 0, .07, .05, 'sawtooth'], [115, .075, .16, .045, 'square']],
      showdown: [[150, 0, .07, .045, 'square'], [300, .08, .07, .045, 'square'], [600, .16, .12, .05, 'square']],
      game_start: [[240, 0, .055, .04, 'square'], [360, .065, .055, .04, 'square'], [540, .13, .08, .045, 'square']],
      winner: [[330, 0, .07, .045, 'square'], [440, .08, .07, .045, 'square'], [660, .16, .12, .05, 'square']],
      game_over: [[300, 0, .08, .05, 'sawtooth'], [200, .09, .1, .045, 'square'], [100, .2, .18, .04, 'square']],
      scene_transition: [[480, 0, .04, .035, 'square'], [320, .045, .04, .03, 'square'], [160, .09, .06, .025, 'square']],
    };

    const now = this.ctx.currentTime;
    patterns[id].forEach(([frequency, offset, duration, volume, type]) => {
      if (!this.ctx) return;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(volume, now + offset);
      gain.gain.exponentialRampToValueAtTime(.001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(this.ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration);
    });
  }

  playPop() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  playDraw() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playPlay() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  playAction() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Wacky double pitch jump
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(500, now);
    osc1.frequency.setValueAtTime(700, now + 0.08);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
  }

  playWild() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Sparkling arpeggio (C Major chord)
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const t = now + i * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  playUno() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Trumpet double blow (e.g. "Toot toot!")
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.setValueAtTime(440, now + 0.08);
    osc1.frequency.setValueAtTime(554.37, now + 0.12); // Lift up pitch
    osc1.frequency.setValueAtTime(554.37, now + 0.25);

    osc2.frequency.setValueAtTime(445, now);
    osc2.frequency.setValueAtTime(560, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.setValueAtTime(0.005, now + 0.11);
    gain.gain.setValueAtTime(0.12, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  }

  playVictory() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Cheer scale
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major
    notes.forEach((f, i) => {
      if (!this.ctx) return;
      const t = now + i * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  playDefeat() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.7);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.75);
  }

  playShuffle() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Several quick card-flicking sound bites
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(10, t + 0.05);

      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  playError() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.setValueAtTime(140, now + 0.06);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.setValueAtTime(0.005, now + 0.05);
    gain.gain.setValueAtTime(0.15, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  playWarning() {
    if (this.getMuted()) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }
}

export const sound = new SoundSynth();
