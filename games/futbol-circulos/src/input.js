// Controles táctiles: joystick flotante (mitad izquierda) + chute mantenido (mitad derecha).
import { CONFIG as C } from './config.js';

export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.dirX = 0;
    this.dirY = 0;
    this.kick = false;
    this.joyId = null;
    this.kickId = null;
    this.baseX = 0;
    this.baseY = 0;

    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setDepth(100);

    scene.input.on('pointerdown', (p) => {
      if (p.x < C.WIDTH / 2) {
        if (this.joyId !== null) return;
        this.joyId = p.id;
        this.baseX = p.worldX;
        this.baseY = p.worldY;
        this.update(p);
      } else {
        if (this.kickId !== null) return;
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

  update(p) {
    let dx = p.worldX - this.baseX, dy = p.worldY - this.baseY;
    let len = Math.hypot(dx, dy);
    if (len > C.JOY_RADIUS && C.JOY_FOLLOW) {
      this.baseX = p.worldX - (dx / len) * C.JOY_RADIUS;
      this.baseY = p.worldY - (dy / len) * C.JOY_RADIUS;
      dx = p.worldX - this.baseX;
      dy = p.worldY - this.baseY;
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
    if (this.joyId === null) return;
    g.lineStyle(2, 0xffffff, 0.35);
    g.strokeCircle(this.baseX, this.baseY, C.JOY_RADIUS);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(
      this.baseX + this.dirX * C.JOY_RADIUS,
      this.baseY + this.dirY * C.JOY_RADIUS,
      20
    );
  }
}
