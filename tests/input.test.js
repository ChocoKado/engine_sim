import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/controls/InputManager.js';

const setup = () => {
  const events = {};
  globalThis.window = { addEventListener: (name, handler) => events[name] = handler };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const counts = { start: 0, up: 0, down: 0 };
  const input = new InputManager({ shiftUp: () => counts.up++, shiftDown: () => counts.down++ }, () => counts.start++);
  const key = (code, repeat = false) => events.keydown({ code, repeat, preventDefault() {}, stopPropagation() {} });
  return { events, counts, input, key };
};

test('holding X/E/Q triggers once per press while throttle and brake stay held', () => {
  const { events, counts, input, key } = setup();
  for (const code of ['KeyX', 'KeyE', 'KeyQ', 'KeyW', 'KeyS']) {
    key(code); key(code, true); key(code, true);
  }
  assert.deepEqual(counts, { start: 1, up: 1, down: 1 });
  assert.equal(input.getThrottle(), 1);
  assert.equal(input.getBrake(), 1);
  events.keyup({ code: 'KeyX' }); key('KeyX');
  assert.equal(counts.start, 2);
  events.blur();
  assert.equal(input.getThrottle(), 0);
  assert.equal(input.getBrake(), 0);
});

test('keyboard full throttle can override a partial slider setting', () => {
  const { events, input, key } = setup();
  input.manualThrottleSlider = 0.3;
  assert.equal(input.getThrottle(), 0.3);
  key('KeyW'); assert.equal(input.getThrottle(), 1);
  events.keyup({ code: 'KeyW' }); assert.equal(input.getThrottle(), 0.3);
});

test('rebinding swaps conflicts and does not invoke driving controls', () => {
  const { input, counts, key } = setup();
  input.startRebinding('startEngine', () => {});
  key('KeyW');
  assert.equal(input.keybindings.startEngine, 'KeyW');
  assert.equal(input.keybindings.throttle, 'KeyX');
  assert.equal(counts.start, 0);
  assert.equal(input.getThrottle(), 0);
  input.controlsPaused = true;
  key('KeyW');
  assert.equal(counts.start, 0);
});
