// Retro 8-bit Sound Generator using Web Audio API

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      // Support both standard and legacy AudioContext
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    // Resume context if suspended
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
  }

  getMuted() {
    return this.isMuted;
  }

  playJump() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Retro square wave for authentic 1980s bleeps
    osc.type = 'square';
    // Frequency sweeps upwards quickly
    const startTime = ctx.currentTime;
    osc.frequency.setValueAtTime(150, startTime);
    osc.frequency.exponentialRampToValueAtTime(600, startTime + 0.12);

    gain.gain.setValueAtTime(0.08, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

    osc.start(startTime);
    osc.stop(startTime + 0.13);
  }

  playCrouch() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    // Use a low white noise bursts or low saw frequency for rustling
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    const startTime = ctx.currentTime;
    osc.frequency.setValueAtTime(120, startTime);
    osc.frequency.linearRampToValueAtTime(40, startTime + 0.08);

    gain.gain.setValueAtTime(0.05, startTime);
    gain.gain.linearRampToValueAtTime(0.001, startTime + 0.08);

    osc.start(startTime);
    osc.stop(startTime + 0.09);
  }

  playCoin() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Two-tone arpeggio (classic Mario coin sound)
    osc.type = 'sine';
    const startTime = ctx.currentTime;
    
    // First high note
    osc.frequency.setValueAtTime(987.77, startTime); // B5
    // Second higher note
    osc.frequency.setValueAtTime(1318.51, startTime + 0.08); // E6

    gain.gain.setValueAtTime(0.06, startTime);
    gain.gain.setValueAtTime(0.06, startTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

    osc.start(startTime);
    osc.stop(startTime + 0.32);
  }

  playHit() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    // A dramatic pitch drop and noise-like decay (boop-crashed!)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    const startTime = ctx.currentTime;
    osc.frequency.setValueAtTime(300, startTime);
    osc.frequency.linearRampToValueAtTime(30, startTime + 0.4);

    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    osc.start(startTime);
    osc.stop(startTime + 0.42);
  }

  playMilestone() {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // High energetic pip-pip!
    osc.type = 'triangle';
    const startTime = ctx.currentTime;
    
    // First pip
    osc.frequency.setValueAtTime(1500, startTime);
    gain.gain.setValueAtTime(0.1, startTime);
    gain.gain.setValueAtTime(0, startTime + 0.08);

    // Second pip
    osc.frequency.setValueAtTime(2000, startTime + 0.12);
    gain.gain.setValueAtTime(0.1, startTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

    osc.start(startTime);
    osc.stop(startTime + 0.28);
  }
}

export const sounds = new SoundManager();
