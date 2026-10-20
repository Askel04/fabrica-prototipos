// Arranque: renderer Three.js en un escenario 9:16 escalado con FIT, capa de UI en DOM y bucle principal.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { MatchScene } from './scenes/MatchScene.js';
import { TitleScene } from './scenes/TitleScene.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const ui = document.getElementById('ui');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, C.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const app = {
  renderer,
  stage,
  ui,
  width: 0,
  height: 0,
  scene: null,
  go(SceneClass, params) {
    this.scene?.exit?.();
    ui.innerHTML = '';
    this.scene = new SceneClass(this, params);
    this.scene.enter?.();
  },
};

function fit() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let w = W;
  let h = W / C.ASPECT;
  if (h > H) {
    h = H;
    w = H * C.ASPECT;
  }
  w = Math.floor(w);
  h = Math.floor(h);
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.left = `${Math.floor((W - w) / 2)}px`;
  stage.style.top = `${Math.floor((H - h) / 2)}px`;
  stage.style.setProperty('--u', `${w / 100}px`);
  renderer.setSize(w, h, false);
  app.width = w;
  app.height = h;
  app.scene?.resize?.();
}
window.addEventListener('resize', fit);
fit();

// ?speed=N acelera el juego (solo para pruebas automáticas)
const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;
let last = performance.now();
function loop(now) {
  // El primer timestamp de rAF puede ser anterior a performance.now(): nunca dt negativo
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) * SPEED;
  last = now;
  app.scene?.update(dt);
  requestAnimationFrame(loop);
}

// ?match abre directamente un partido suelto (pruebas)
app.go(new URLSearchParams(location.search).has('match') ? MatchScene : TitleScene);
requestAnimationFrame(loop);
window.__padel = app; // para pruebas automáticas
