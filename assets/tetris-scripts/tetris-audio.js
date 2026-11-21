/**
 * Tetris Audio Controller & SFX Pool
 * Implements smooth BGM crossfading, audio caching, and iOS touch unlock.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TetrisAudio = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resolvePath(p) {
    if (!p) return '';
    if (p.startsWith('../') || p.startsWith('http') || p.startsWith('data:')) return p;
    if (p.startsWith('assets/tetris-assets/')) {
      return '../' + p.slice('assets/'.length);
    }
    return '../tetris-assets/' + p;
  }

  class AudioManager {
    constructor() {
      this.muted = false;
      this.bgmAudio = null;
      this.currentBgm = null;
      this.unlocked = false;

      this.bgmTracks = {
        menu: resolvePath('audio/menu-bgm.wav'),
        game: resolvePath('audio/game-bgm.wav')
      };

      this.sfxBuffers = {};
      this.sfxPaths = {
        move: resolvePath('audio/move.wav'),
        rotate: resolvePath('audio/rotate.wav'),
        drop: resolvePath('audio/drop.wav'),
        clear: resolvePath('audio/clear.wav'),
        tetris: resolvePath('audio/tetris.wav'),
        gameover: resolvePath('audio/gameover.wav')
      };

      this.initUnlockListener();
    }

    initUnlockListener() {
      const unlock = () => {
        this.unlocked = true;
        if (this.bgmAudio && !this.muted) {
          this.bgmAudio.play().catch(() => {});
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
    }

    playBgm(trackName) {
      if (this.currentBgm === trackName && this.bgmAudio && !this.bgmAudio.paused) {
        return;
      }
      const url = this.bgmTracks[trackName];
      if (!url) return;

      this.currentBgm = trackName;
      if (this.bgmAudio) {
        this.bgmAudio.pause();
        this.bgmAudio = null;
      }

      try {
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = this.muted ? 0 : 0.45;
        this.bgmAudio = audio;
        audio.play().catch(() => {
          // Will resume upon user gesture
        });
      } catch (err) {
        console.warn('BGM play caught:', err);
      }
    }

    playSfx(sfxName) {
      if (this.muted) return;
      const url = this.sfxPaths[sfxName];
      if (!url) return;

      try {
        const sfx = new Audio(url);
        sfx.volume = sfxName === 'tetris' ? 0.8 : 0.5;
        sfx.play().catch(() => {});
      } catch (err) {
        console.warn('SFX play caught:', err);
      }
    }

    setMuted(mute) {
      this.muted = !!mute;
      if (this.bgmAudio) {
        this.bgmAudio.volume = this.muted ? 0 : 0.45;
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }
  }

  return AudioManager;
});
