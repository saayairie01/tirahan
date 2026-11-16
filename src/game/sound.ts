import type { OnlineSfxCue } from './onlineTypes.ts';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  public onCue: ((cue: OnlineSfxCue) => void) | null = null;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playSelect() {
    this.onCue?.('select');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.05);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playFire(heavy = false) {
    this.onCue?.(heavy ? 'fire_heavy' : 'fire');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(heavy ? 420 : 760, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 110 : 190, now + (heavy ? 0.22 : 0.14));

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.23 : 0.15));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.24 : 0.16));
  }

  public playMove() {
    this.onCue?.('move');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playBounce() {
    this.onCue?.('bounce');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.06);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playShieldHit(shattered: boolean) {
    this.onCue?.(shattered ? 'shield_break' : 'shield');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shattered ? 'square' : 'sine';
    osc.frequency.setValueAtTime(shattered ? 280 : 940, now);
    osc.frequency.exponentialRampToValueAtTime(shattered ? 75 : 420, now + (shattered ? 0.2 : 0.1));
    gain.gain.setValueAtTime(shattered ? 0.15 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (shattered ? 0.22 : 0.11));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (shattered ? 0.23 : 0.12));
  }

  public playShipExplosion(isMothership: boolean) {
    this.onCue?.(isMothership ? 'mothership_explosion' : 'explosion');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = isMothership ? 0.55 : 0.24;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.6);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isMothership ? 620 : 1100, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isMothership ? 0.24 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playAsteroidHit(shattered: boolean) {
    this.onCue?.(shattered ? 'asteroid_break' : 'asteroid_hit');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shattered ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(shattered ? 180 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(shattered ? 48 : 95, now + (shattered ? 0.24 : 0.11));
    gain.gain.setValueAtTime(shattered ? 0.17 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (shattered ? 0.25 : 0.12));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (shattered ? 0.26 : 0.13));
  }

  public playCellPickup() {
    this.onCue?.('cell_pickup');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  public playShieldBoost() {
    this.onCue?.('shield_boost');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.22);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playTridentSplit() {
    this.onCue?.('trident_split');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [640, 820, 1040].forEach((freq, idx) => {
      const t = now + idx * 0.02;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.65, t + 0.09);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  }

  public playFlakBurst() {
    this.onCue?.('flak_burst');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.28;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.0);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playMineExplosion() {
    this.onCue?.('mine_explosion');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.34);
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playVictory() {
    this.onCue?.('victory');
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    });
  }

  private musicAudio: HTMLAudioElement | null = null;
  private musicObjectUrl: string | null = null;
  private musicEnabled = true;
  private musicStatus: 'checking' | 'bundled' | 'custom' | 'missing' = 'checking';
  private customMusicBytes: Uint8Array | null = null;
  private musicListeners: Set<() => void> = new Set();

  public subscribeMusic(listener: () => void): () => void {
    this.musicListeners.add(listener);
    return () => {
      this.musicListeners.delete(listener);
    };
  }

  private notifyMusicListeners() {
    for (const fn of this.musicListeners) {
      fn();
    }
  }

  public getMusicStatus(): 'checking' | 'bundled' | 'custom' | 'missing' {
    return this.musicStatus;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public getCustomMusicBytes(): Uint8Array | null {
    return this.customMusicBytes;
  }

  private attachAudioSource(src: string) {
    if (typeof window === 'undefined') return;
    if (!this.musicAudio) {
      this.musicAudio = new Audio();
      this.musicAudio.loop = true;
      this.musicAudio.volume = 0.42;
      this.musicAudio.preload = 'auto';
    }
    if (this.musicAudio.src !== src) {
      this.musicAudio.src = src;
    }
    if (this.musicEnabled) {
      this.musicAudio.play().catch(() => {});
    }
  }

  public async probeBundledMusic(): Promise<void> {
    if (typeof window === 'undefined' || this.musicStatus === 'custom') return;
    try {
      const res = await fetch('./mattoglseby-3.ogg', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('text/html')) {
        this.musicStatus = 'missing';
        this.notifyMusicListeners();
        return;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 128) {
        this.musicStatus = 'missing';
        this.notifyMusicListeners();
        return;
      }
      if (this.musicObjectUrl) {
        URL.revokeObjectURL(this.musicObjectUrl);
      }
      this.customMusicBytes = new Uint8Array(buf);
      this.musicObjectUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/ogg' }));
      this.musicStatus = 'bundled';
      this.attachAudioSource(this.musicObjectUrl);
      this.notifyMusicListeners();
    } catch {
      this.musicStatus = 'missing';
      this.notifyMusicListeners();
    }
  }

  public async loadLocalMusicFile(file: File): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const buf = await file.arrayBuffer();
      if (buf.byteLength === 0) return false;
      if (this.musicObjectUrl) {
        URL.revokeObjectURL(this.musicObjectUrl);
      }
      this.customMusicBytes = new Uint8Array(buf);
      this.musicObjectUrl = URL.createObjectURL(
        new Blob([buf], { type: file.type || 'audio/ogg' })
      );
      this.musicStatus = 'custom';
      this.attachAudioSource(this.musicObjectUrl);
      this.notifyMusicListeners();
      return true;
    } catch {
      return false;
    }
  }

  public setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    if (this.musicAudio) {
      if (enabled) {
        this.musicAudio.play().catch(() => {});
      } else {
        this.musicAudio.pause();
      }
    }
    this.notifyMusicListeners();
  }

  public tryStartMusicOnGesture() {
    if (!this.musicEnabled || !this.musicAudio) return;
    if (this.musicAudio.paused && this.musicAudio.src) {
      this.musicAudio.play().catch(() => {});
    }
  }
}

export const sound = new SoundEngine();
