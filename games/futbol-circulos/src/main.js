import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { MenuScene } from './scenes/MenuScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: CONFIG.BG_COLOR,
  scale: {
    // EXPAND: llena toda la pantalla; el campo (860x440) siempre cabe entero
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT,
  },
  scene: [GameScene, MenuScene],
});
