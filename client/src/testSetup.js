// Node 25 exposes an incomplete global localStorage without a storage file.
// Use JSDOM's browser implementation explicitly, also on supported Node 24.
import { JSDOM } from 'jsdom';
const storageWindow = new JSDOM('', { url: 'http://localhost' }).window;
Object.defineProperty(globalThis, 'localStorage', { value: storageWindow.localStorage, configurable: true });
