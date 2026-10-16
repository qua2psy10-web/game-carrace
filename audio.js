// Web Audio API Sound Synthesizer for 3D Racing Game
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;

    // Engine nodes
    this.osc1 = null;
    this.osc2 = null;
    this.subOsc = null;
    this.engineFilter = null;
    this.engineGain = null;

    // Skid nodes
    this.skidGain = null;
    this.skidToneOsc = null;
    this.skidFilter = null;

    // Curb / offroad rumble nodes
    this.rumbleGain = null;
    this.rumbleOsc = null;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Unlock audio on iOS Safari with a 1-frame silent buffer
    try {
      const silentBuf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (e) {}

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    this._setupEngineSound();
    this._setupSkidSound();
    this._setupRumbleSound();

    this.initialized = true;
  }

  _makeDistortionCurve(amount = 30) {
    const k = amount;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  _setupEngineSound() {
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 350;
    this.engineFilter.Q.value = 3.5;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._makeDistortionCurve(25);
    shaper.oversample = '2x';

    // Primary sawtooth oscillator (exhaust pulse)
    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 55;

    // Secondary harmonic oscillator
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 110;

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.35;

    // Sub-bass cylinder rumble
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'triangle';
    this.subOsc.frequency.value = 27.5;

    this.osc1.connect(shaper);
    this.osc2.connect(osc2Gain);
    osc2Gain.connect(shaper);
    this.subOsc.connect(this.engineFilter);

    shaper.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.osc1.start();
    this.osc2.start();
    this.subOsc.start();
  }

  _setupSkidSound() {
    // Create 2-second white noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1100;
    this.skidFilter.Q.value = 4.5;

    // Tire squeal harmonic tone
    this.skidToneOsc = this.ctx.createOscillator();
    this.skidToneOsc.type = 'sine';
    this.skidToneOsc.frequency.value = 880;

    const toneGain = this.ctx.createGain();
    toneGain.gain.value = 0.25;

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;

    noise.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);

    this.skidToneOsc.connect(toneGain);
    toneGain.connect(this.skidGain);

    this.skidGain.connect(this.masterGain);

    noise.start();
    this.skidToneOsc.start();
  }

  _setupRumbleSound() {
    this.rumbleOsc = this.ctx.createOscillator();
    this.rumbleOsc.type = 'sawtooth';
    this.rumbleOsc.frequency.value = 38;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0;

    this.rumbleOsc.connect(filter);
    filter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);

    this.rumbleOsc.start();
  }

  update(rpmNormalized, throttle, skidIntensity, curbIntensity, speedRatio) {
    if (!this.initialized || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Engine frequency mapping: idle ~48Hz to redline ~230Hz
    const baseFreq = 46 + rpmNormalized * 185;
    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.03);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03);

    // Filter opens up with throttle and RPM
    const cutoff = 220 + rpmNormalized * 1400 + (throttle ? 450 : 0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.04);

    const targetEngineGain = 0.14 + rpmNormalized * 0.16 + (throttle ? 0.08 : 0);
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.05);

    // Skid sound
    const clampedSkid = Math.min(1, Math.max(0, skidIntensity));
    this.skidGain.gain.setTargetAtTime(clampedSkid * 0.28, now, 0.04);
    this.skidToneOsc.frequency.setTargetAtTime(780 + speedRatio * 260, now, 0.05);

    // Curb / Offroad rumble
    const clampedCurb = Math.min(1, Math.max(0, curbIntensity));
    this.rumbleOsc.frequency.setTargetAtTime(28 + speedRatio * 55, now, 0.03);
    this.rumbleGain.gain.setTargetAtTime(clampedCurb * 0.25, now, 0.03);
  }

  stopContinuous() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.04, now, 0.1);
    this.skidGain.gain.setTargetAtTime(0, now, 0.05);
    this.rumbleGain.gain.setTargetAtTime(0, now, 0.05);
  }

  playTone(freq, duration = 0.18, type = 'sine', vol = 0.35) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  playCountdownBeep(isGo = false) {
    if (isGo) {
      this.playTone(880, 0.45, 'triangle', 0.45);
      this.playTone(1320, 0.45, 'sine', 0.3);
    } else {
      this.playTone(440, 0.18, 'sine', 0.35);
    }
  }

  playLapSound() {
    if (!this.initialized || this.muted) return;
    this.playTone(587.33, 0.14, 'triangle', 0.3);
    setTimeout(() => this.playTone(880, 0.28, 'triangle', 0.35), 110);
  }

  playFinishFanfare() {
    if (!this.initialized || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.35, 'triangle', 0.35), idx * 120);
    });
  }

  playCollision() {
    if (!this.initialized || this.muted) return;
    this.playTone(95, 0.16, 'sawtooth', 0.45);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.45, this.ctx.currentTime);
    }
    return this.muted;
  }
}

window.soundEngine = new SoundEngine();
