// Controles táctiles en coordenadas de pantalla.
// Joystick (mitad izquierda): 'mobile' aparece donde pones el pulgar, 'fixed' en la esquina inferior izquierda.
// Tiro (mitad derecha): 'tap' mantener en cualquier punto, 'button' solo el botón gris.
import { CONFIG as C } from './config.js';

export class TouchControls {
  constructor(scene, ignore) {
    this.scene = scene;
    this.ignore = ignore; // (pointer) => true si el toque es de otro elemento (p. ej. pausa)
    this.joystickMode = 'mobile';
    this.kickMode = 'tap';
    this.release();

    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setDepth(100).setScrollFactor(0);

    scene.input.on('pointerdown', (p) => {
      if (this.ignore(p)) return;
      const { width } = scene.scale.gameSize;
      if (p.x < width / 2) {
        if (this.joyId !== null) return;
        this.joyId = p.id;
        if (this.joystickMode === 'fixed') {
          [this.baseX, this.baseY] = this.fixedBase();
        } else {
          this.baseX = p.x;
          this.baseY = p.y;
        }
        this.update(p);
      } else {
        if (this.kickId !== null) return;
        if (this.kickMode === 'button') {
          const [bx, by] = this.kickButton();
          if (Math.hypot(p.x - bx, p.y - by) > C.KICK_BTN_RADIUS + C.KICK_BTN_SLOP) return;
        }
        this.kickId = p.id;
        this.kick = true;
      }
    });
    scene.input.on('pointermove', (p) => {
      if (p.id === this.joyId) this.update(p);
    });
    const up = (p) => {
      if (p.id === this.joyId) {
        this.joyId = null;
        this.dirX = this.dirY = 0;
      }
      if (p.id === this.kickId) {
        this.kickId = null;
        this.kick = false;
      }
    };
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
  }

  setModes(joystickMode, kickMode) {
    this.joystickMode = joystickMode;
    this.kickMode = kickMode;
    this.release();
  }

  // suelta todo (al pausar o cambiar de modo)
  release() {
    this.dirX = 0;
    this.dirY = 0;
    this.kick = false;
    this.joyId = null;
    this.kickId = null;
    this.baseX = 0;
    this.baseY = 0;
  }

  fixedBase() {
    const { height } = this.scene.scale.gameSize;
    const off = C.JOY_FIXED_MARGIN + C.JOY_RADIUS;
    return [off, height - off];
  }

  kickButton() {
    const { width, height } = this.scene.scale.gameSize;
    const off = C.KICK_BTN_MARGIN + C.KICK_BTN_RADIUS;
    return [width - off, height - off];
  }

  update(p) {
    let dx = p.x - this.baseX, dy = p.y - this.baseY;
    let len = Math.hypot(dx, dy);
    if (len > C.JOY_RADIUS && C.JOY_FOLLOW && this.joystickMode === 'mobile') {
      this.baseX = p.x - (dx / len) * C.JOY_RADIUS;
      this.baseY = p.y - (dy / len) * C.JOY_RADIUS;
      dx = p.x - this.baseX;
      dy = p.y - this.baseY;
      len = C.JOY_RADIUS;
    }
    const m = Math.min(len / C.JOY_RADIUS, 1);
    if (m < C.JOY_DEADZONE || len === 0) {
      this.dirX = this.dirY = 0;
      return;
    }
    const mag = (m - C.JOY_DEADZONE) / (1 - C.JOY_DEADZONE);
    this.dirX = (dx / len) * mag;
    this.dirY = (dy / len) * mag;
  }

  draw() {
    const g = this.gfx;
    g.clear();
    const fixed = this.joystickMode === 'fixed';
    if (this.joyId !== null || fixed) {
      const [bx, by] = this.joyId !== null ? [this.baseX, this.baseY] : this.fixedBase();
      const a = this.joyId !== null ? 1 : 0.6;
      g.fillStyle(0x000000, 0.12 * a);
      g.fillCircle(bx, by, C.JOY_RADIUS);
      g.lineStyle(2, 0xffffff, 0.35 * a);
      g.strokeCircle(bx, by, C.JOY_RADIUS);
      g.fillStyle(0xffffff, 0.3 * a);
      g.fillCircle(bx + this.dirX * C.JOY_RADIUS, by + this.dirY * C.JOY_RADIUS, 20);
    }
    if (this.kickMode === 'button') {
      const [bx, by] = this.kickButton();
      g.fillStyle(this.kick ? 0x555555 : 0x9a9a9a, this.kick ? 0.9 : 0.6);
      g.fillCircle(bx, by, C.KICK_BTN_RADIUS);
      g.lineStyle(3, 0x000000, 0.6);
      g.strokeCircle(bx, by, C.KICK_BTN_RADIUS);
    }
  }
}
