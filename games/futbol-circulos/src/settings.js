// Ajustes del jugador (menú de pausa), guardados en localStorage.
import { load, save } from './utils/save.js';

const DEFAULTS = { joystick: 'mobile', kick: 'tap', difficulty: 'easy', mode: '3v3', nick: '' };

export const settings = { ...DEFAULTS, ...load('futbol-circulos-settings', {}) };

export function setSetting(key, value) {
  settings[key] = value;
  save('futbol-circulos-settings', settings);
}
