/**
 * See Saw - Audio Manager
 * Handles HTML5/Web Audio with iOS gesture unlock, smooth BGM crossfading,
 * SFX pooling, and persistent mute state.
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.SeeSawAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function resolveAudioUrl(p) {
    if (typeof window !== 'undefined' && window.location) {
      if (p.startsWith('assets/see-saw-assets/audio/')) {
        return '../see-saw-assets/audio/' + p.split('/').pop();
      }
    }
    return p;
  }

  class AudioManager {
    constructor() {
      this.isBrowser = typeof window !== 'undefined' && typeof Audio !== 'undefined';
      this.muted = false;
      this.unlocked = false;
      this.currentBgm = null;
      this.currentTrackName = null;
      this.bgmVolume = 0.5;
      this.sfxVolume = 0.7;

      this.bgmTracks = {
        menu: 'assets/see-saw-assets/audio/menu-bgm.wav',
        game: 'assets/see-saw-assets/audio/game-bgm.wav'
      };

      this.sfxTracks = {
        drop: 'assets/see-saw-assets/audio/drop.wav',
        balance: 'assets/see-saw-assets/audio/balance.wav',
        star: 'assets/see-saw-assets/audio/star.wav',
        fail: 'assets/see-saw-assets/audio/fail.wav'
      };

      this.sfxPool = {};
      this.activeFadeInterval = null;

      if (this.isBrowser) {
        this.initPools();
        this.setupGestureUnlock();
      }
    }

    initPools() {
      Object.keys(this.sfxTracks).forEach(key => {
        const rawUrl = this.sfxTracks[key];
        const url = resolveAudioUrl(rawUrl);
        this.sfxPool[key] = [];
        for (let i = 0; i < 4; i++) {
          try {
            const audio = new Audio(url);
            audio.preload = 'auto';
            this.sfxPool[key].push(audio);
          } catch (e) {}
        }
      });
    }

    setupGestureUnlock() {
      const unlockHandler = () => {
        if (this.unlocked) return;
        this.unlocked = true;

        Object.keys(this.sfxPool).forEach(key => {
          const pool = this.sfxPool[key];
          if (pool && pool[0]) {
            pool[0].play().then(() => {
              pool[0].pause();
              pool[0].currentTime = 0;
            }).catch(() => {});
          }
        });

        ['pointerdown', 'touchstart', 'keydown'].forEach(evt => {
          window.removeEventListener(evt, unlockHandler, { capture: true });
        });
      };

      ['pointerdown', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, unlockHandler, { capture: true, once: true });
      });
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (this.currentBgm) {
        this.currentBgm.volume = this.muted ? 0 : this.bgmVolume;
      }
      return this.muted;
    }

    toggleMute() {
      return this.setMuted(!this.muted);
    }

    isMuted() {
      return this.muted;
    }

    playBgm(trackName) {
      if (!this.isBrowser) return;
      if (this.currentTrackName === trackName && this.currentBgm && !this.currentBgm.paused) {
        return;
      }

      const url = this.bgmTracks[trackName];
      if (!url) return;

      const outgoing = this.currentBgm;
      let incoming;
      try {
        incoming = new Audio(resolveAudioUrl(url));
        incoming.loop = true;
        incoming.volume = 0;
      } catch (e) {
        return;
      }

      this.currentBgm = incoming;
      this.currentTrackName = trackName;

      const playPromise = incoming.play();
      if (playPromise) playPromise.catch(() => {});

      if (this.activeFadeInterval) {
        clearInterval(this.activeFadeInterval);
        this.activeFadeInterval = null;
      }

      const steps = 12;
      const stepDuration = 50;
      let step = 0;
      const targetVol = this.muted ? 0 : this.bgmVolume;

      this.activeFadeInterval = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);

        if (!this.muted) {
          incoming.volume = progress * targetVol;
        }

        if (outgoing) {
          if (!this.muted) {
            outgoing.volume = Math.max(0, (1 - progress) * this.bgmVolume);
          }
          if (step >= steps) {
            try {
              outgoing.pause();
              outgoing.currentTime = 0;
            } catch (e) {}
          }
        }

        if (step >= steps) {
          clearInterval(this.activeFadeInterval);
          this.activeFadeInterval = null;
        }
      }, stepDuration);
    }

    playSfx(sfxName) {
      if (!this.isBrowser || this.muted) return;
      const pool = this.sfxPool[sfxName];
      if (!pool || pool.length === 0) return;

      let sound = pool.find(a => a.paused || a.ended);
      if (!sound) sound = pool[0];

      try {
        sound.currentTime = 0;
        sound.volume = this.sfxVolume;
        const p = sound.play();
        if (p) p.catch(() => {});
      } catch (e) {}
    }

    stopAll() {
      if (this.activeFadeInterval) {
        clearInterval(this.activeFadeInterval);
        this.activeFadeInterval = null;
      }
      if (this.currentBgm) {
        try {
          this.currentBgm.pause();
          this.currentBgm.currentTime = 0;
        } catch (e) {}
        this.currentBgm = null;
        this.currentTrackName = null;
      }
    }
  }

  return AudioManager;
});
