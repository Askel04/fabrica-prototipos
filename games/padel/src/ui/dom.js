// Utilidades de DOM compartidas por las escenas de menú.
import { META as M } from '../config.js';
import { state, tickEnergy, xpForNext } from '../state.js';

export function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export const stars = (n, max = 5) =>
  `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(Math.max(0, max - n))}</i></span>`;

export function button(parent, label, cls, onClick) {
  const b = el('button', `btn ${cls || ''}`, parent, label);
  b.addEventListener('click', () => {
    navigator.vibrate?.(10);
    onClick();
  });
  return b;
}

/** Barra superior: nivel/XP, monedas y energía con temporizador de recarga. */
export function topBar(parent) {
  const bar = el('div', 'topbar', parent);
  const update = () => {
    const left = tickEnergy();
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const pct = Math.round((state.xp / xpForNext(state.level)) * 100);
    bar.innerHTML = `
      <div class="chip lvl"><b>${state.level}</b><div class="xp"><i style="width:${pct}%"></i></div></div>
      <div class="chip"><span class="coin"></span>${state.coins}</div>
      <div class="chip en"><span class="bolt">⚡</span>${state.energy}/${M.ENERGY_MAX}${left ? `<small>${mm}:${ss}</small>` : ''}</div>`;
  };
  update();
  const id = setInterval(update, 1000);
  return { el: bar, update, stop: () => clearInterval(id) };
}

export function modal(parent, title, body, onClose) {
  const back = el('div', 'modal', parent);
  const card = el('div', 'card', back);
  el('div', 'title', card, title);
  const content = el('div', 'content', card);
  if (typeof body === 'string') content.innerHTML = body;
  else body(content);
  button(card, 'CERRAR', 'blue small', () => {
    back.remove();
    onClose?.();
  });
  return back;
}

/** Colores de club deterministas a partir del nombre. */
const KITS = [
  [0xe2453c, 0xf4f4f4], [0x2d9cdb, 0x1e2a44], [0x27ae60, 0xf4f4f4], [0x9b51e0, 0x222222],
  [0xf2994a, 0x1e2a44], [0x56ccf2, 0xffffff], [0xeb5757, 0x222222], [0x6fcf97, 0x1e2a44],
];
export function kitFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return KITS[h % KITS.length];
}
