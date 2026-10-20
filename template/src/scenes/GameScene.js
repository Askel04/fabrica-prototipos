import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { beep } from '../utils/sound.js';
import { load, save } from '../utils/save.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.taps = load('taps', 0);

    this.player = this.add.circle(
      CONFIG.WIDTH / 2,
      CONFIG.HEIGHT / 2,
      CONFIG.PLAYER_RADIUS,
      CONFIG.PLAYER_COLOR
    );

    this.input.on('pointerdown', (pointer) => {
      this.tweens.killTweensOf(this.player);
      this.tweens.add({
        targets: this.player,
        x: pointer.x,
        y: pointer.y,
        duration: CONFIG.MOVE_DURATION,
        ease: 'Cubic.Out',
      });

      navigator.vibrate?.(CONFIG.VIBRATE_MS);
      beep(CONFIG.SOUND_FREQ, CONFIG.SOUND_DURATION);

      this.taps++;
      save('taps', this.taps);
    });
  }
}
