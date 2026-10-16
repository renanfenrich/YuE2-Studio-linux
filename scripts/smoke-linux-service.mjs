#!/usr/bin/env node
// Build/test tooling only. The installed application runs without Node.js.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const binary = resolve(process.argv[2] || 'target/debug/music-server');
const root = await mkdtemp(join(tmpdir(), 'yue2 smoke '));
const port = Number(process.env.YUE_SMOKE_PORT || 18791);
const base = `http://127.0.0.1:${port}`;
let child;
let logs = '';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000), ...options });
  assert(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}
const json = async (path, options) => (await request(path, options)).json();
function pcm(wav) {
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') return wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no PCM data');
}
async function start() {
  assert.equal(await fetch(`${base}/health`).then(() => true, () => false), false, 'smoke port is already occupied');
  child = spawn(binary, [], { env: { ...process.env, YUE_STUDIO_DATA_ROOT: root,
    YUE_MODELS_ROOT: join(root, 'models'), YUE_STUDIO_SETTINGS_PATH: join(root, 'settings.json'),
    YUE_STUDIO_PORT: String(port), DO_NOT_TRACK: '1', STUDIO_TELEMETRY: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  child.on('error', error => { logs += error.message; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await fetch(`${base}/health`).then(response => response.ok, () => false)) return;
    assert.equal(child.exitCode, null, logs);
    await delay(200);
  }
  throw new Error(`Service did not start: ${logs}`);
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
  try { await exit; } finally { clearTimeout(timer); }
  assert.notEqual(child.signalCode, 'SIGKILL', 'graceful shutdown timed out');
}
try {
  await start();
  const setup = await json('/setup/status');
  assert.equal(setup.ready, false, 'empty model directory must not report ready');
  assert.equal(setup.data_directory, root);
  const assistant = await json('/v1/assistant/runtime');
  assert.match(assistant.unavailable_reason, /Windows only/);
  const refused = await fetch(`${base}/v1/assistant/runtime/install`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset_id: 'cpu' }) });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /Windows only/);
  // A real PCM WAV, explicitly synthetic: this tests storage/media, not model inference.
  const frames = 8000;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(8192 * Math.sin(2 * Math.PI * 440 * i / 8000)), 44 + i * 2);
  const form = new FormData();
  form.set('title', 'Linux smoke — synthetic audio');
  form.set('audio', new Blob([wav], { type: 'audio/wav' }), 'smoke.wav');
  const song = await json('/v1/library/import', { method: 'POST', body: form });
  assert.equal(song.source, 'audio_import');
  assert.equal(song.metadata.duration_seconds, 1);
  const media = `/v1/library/media/${song.id}`;
  const imported = Buffer.from(await (await request(media)).arrayBuffer());
  assert.deepEqual(pcm(imported), pcm(wav));
  const range = await request(media, { headers: { range: 'bytes=0-43' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), imported.subarray(0, 44));
  await stop();
  await start();
  const restored = await json(`/v1/library/songs/${song.id}`);
  assert.equal(restored.title, song.title);
  assert.deepEqual(pcm(Buffer.from(await (await request(media)).arrayBuffer())), pcm(wav));
  console.log('PASS: launch, honest install state, foreign-runtime refusal, WAV import, duration, unchanged PCM, seeking, shutdown and restart persistence. Model inference and audible playback are separate acceptance checks.');
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
  await rm(root, { recursive: true, force: true });
}
