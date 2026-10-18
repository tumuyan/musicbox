/**
 * Physical Music Box Sound Synthesizer using Web Audio API
 * Accurately models clamped steel cantilever tines + walnut wood acoustic cavity
 */

import { MUSIC_BOX_SCALE } from '../types/musicBox';

class MusicBoxAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private boxBodyFilter: BiquadFilterNode | null = null;
  private highShelf: BiquadFilterNode | null = null;
  private volume: number = 0.8;
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master output gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      // Walnut Box Body Acoustic Filter (simulating wooden soundboard resonance)
      this.boxBodyFilter = this.ctx.createBiquadFilter();
      this.boxBodyFilter.type = 'peaking';
      this.boxBodyFilter.frequency.value = 320; // 320Hz box resonance
      this.boxBodyFilter.Q.value = 2.2;
      this.boxBodyFilter.gain.value = 4.0; // Warm walnut box amplification

      // Gentle high shelf to enhance metallic sparkle without harshness
      this.highShelf = this.ctx.createBiquadFilter();
      this.highShelf.type = 'highshelf';
      this.highShelf.frequency.value = 3500;
      this.highShelf.gain.value = 2.5;

      this.boxBodyFilter.connect(this.highShelf);
      this.highShelf.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Trigger a plucked chime for a specific comb tine
   * @param tineIndex Index of tine (0 to 29)
   * @param velocity Dynamics (0.1 to 1.0)
   */
  public playTine(tineIndex: number, velocity: number = 0.85) {
    this.initContext();
    if (!this.ctx || !this.boxBodyFilter || this.isMuted) return;

    const note = MUSIC_BOX_SCALE[tineIndex];
    if (!note) return;

    const freq = note.freq;
    const now = this.ctx.currentTime;

    // Decay time: lower bass notes ring longer, higher notes decay faster
    // C3 (~130Hz) rings ~2.5s, E6 (~1318Hz) rings ~0.8s
    const decayFactor = Math.max(0.7, 3.2 - Math.log2(freq / 100) * 0.65);

    // 1. Fundamental Cantilever Tone (Pure Bell Chime)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    // Dynamic micro-detuning for physical steel tine character
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.9992, now + decayFactor);

    gain1.gain.setValueAtTime(0.0001, now);
    // Instant attack (0.8ms)
    gain1.gain.exponentialRampToValueAtTime(velocity * 0.65, now + 0.001);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + decayFactor);

    osc1.connect(gain1);
    gain1.connect(this.boxBodyFilter);

    // 2. High Metallic Overtone Mode (~2.76x or 5.4x cantilever overtone)
    const overtoneFreq = freq * 2.756;
    if (overtoneFreq < 18000) {
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(overtoneFreq, now);

      gain2.gain.setValueAtTime(0.0001, now);
      // Quick metallic strike
      gain2.gain.exponentialRampToValueAtTime(velocity * 0.28, now + 0.0008);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + (decayFactor * 0.22));

      osc2.connect(gain2);
      gain2.connect(this.boxBodyFilter);

      osc2.start(now);
      osc2.stop(now + decayFactor * 0.25);
    }

    // 3. Physical Star-Wheel Plectrum Release Snap (Noise transient)
    this.playPlectrumClick(now, freq, velocity);

    osc1.start(now);
    osc1.stop(now + decayFactor);
  }

  /**
   * Realistic microscopic click of the star wheel tooth plucking and releasing the tine
   */
  private playPlectrumClick(time: number, freq: number, velocity: number) {
    if (!this.ctx || !this.boxBodyFilter) return;

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.006); // 6ms transient
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // White noise with exponential damping
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Bandpass tuned near the tine pitch to simulate mechanical contact
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(Math.min(freq * 1.5, 9000), time);
    clickFilter.Q.setValueAtTime(4.0, time);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(velocity * 0.12, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.006);

    noiseSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.boxBodyFilter);

    noiseSource.start(time);
  }

  /**
   * Sound effect for manual paper hole puncher tool
   */
  public playHolePunchSound() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    // Crisp mechanical snap of puncher hitting cardstock
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.04);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Subtle mechanical gear ratchet sound when hand-cranking
   */
  public playGearTick() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.015);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.02);
  }
}

export const musicBoxSynth = new MusicBoxAudioEngine();
