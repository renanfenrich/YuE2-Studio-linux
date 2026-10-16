# Linux core acceptance — 2026-10-16

Status: technical validation complete; human review required. No merge or release publication.

## Provenance

- Fork baseline: `7714b676b502383dfb71e6fd99fedf9feb320321`.
- Built application code: `a3cc386c45da6fe27baeef88990f72a6f84e8508`.
  Subsequent changes correct the AppImage smoke launcher and document results;
  they do not change the built application, engine pins or dependency locks.
- Builder: Ubuntu 22.04 container, Rust 1.99.1, Node 22.23.3,
  LunarG Vulkan SDK 1.4.363.0. Node is build/test tooling only.
- Desktop/inference host: Ubuntu 24.04.5 LTS, kernel `7.0.0-38-generic`,
  32 GB RAM; Intel RPL-P / Mesa 25.2.8 and NVIDIA RTX 3050 Laptop 6 GB /
  driver 580.178.04.
- Engine: yue2.cpp `c8516dbf44d660cca40d3f420c67063e37ec8258`.
- Model selection: Q5_K_M backbone, F32 VAE and v9 companion; no transcriber.
- Application settings: Vulkan, max sequence 8192, max batch 1, clamp enabled
  by the existing Vulkan launch policy. NVIDIA run used `GGML_VK_VISIBLE_DEVICES=1`.
- Isolated test data; telemetry disabled with `DO_NOT_TRACK=1` and
  `STUDIO_TELEMETRY=0`. No credentials, weights or generated media committed.

## Observed results

| Check | Evidence / result |
| --- | --- |
| Rust workspace, Linux | 373 passed, 4 ignored; includes a real parent-kill sidecar regression test |
| Frontend | 79 tests passed; TypeScript and production build passed |
| Service lifecycle/media | Real synthetic PCM WAV imported, duration measured, seeking checked, PCM unchanged after restart |
| Foreign assistant runtimes | Rejected before downloading; HTTP 409 for a Windows runtime request on Linux |
| Packaging | Native Vulkan/CPU engine and MIDI runtime compiled; `.deb` and AppImage produced |
| Package launch | Both extracted formats launch under Xvfb; packaged engine resolves; first-run storage uses XDG, including a path with spaces |
| Clean installation | `.deb` installed and launched in Ubuntu 22.04; installed binary SHA matches extracted tested binary |
| Runtime independence | Neither Node nor Python installed in the clean installation container |
| Media dependencies | Generated FLAC decoded through GStreamer in that installation container |
| Model download | Cancelled at 131,377,810 bytes, resumed, completed all 3,293,994,768 bytes; pinned hashes matched |
| Intel Vulkan inference | Job `c58c1aefd1d872e1`; 20 s requested, 19.998667 s decoded; engine reported 116.5 s processing |
| Progress | SSE recorded acoustic stage fractions 0.903125 and 0.91875, with steps 13/16 and 14/16 |
| Generation cancellation | Job `4f78bf4984fb1e11` cancelled in both service and engine; engine recorded cancellation at AR step 17 |
| Recovery after cancellation | Job `6efabd2df30826de` completed; 4.998 s stored for a 5 s request |
| Native packaged NVIDIA inference | Embedded service executable was the packaged `YuE2-Studio`; job `e06b0cbcce0ad4fd` completed; engine reported 36.5 s for 20 s requested |
| NVIDIA device confirmation | Same packaged engine PID appeared in `nvidia-smi` with 1329 MiB allocated during NAR |
| Signal validation | Both generated files decoded to 1,919,872 finite stereo samples at 48 kHz, 24-bit FLAC; RMS 0.12205 (Intel), 0.13620 (NVIDIA) |
| UI playback | Browser UI showed the stored track, Pause control and elapsed time advancing to 0:07 / 0:19 |
| Export / reopen | Audio exported through the media endpoint; native desktop restart reopened the earlier track with identical decoded PCM SHA-256 |
| Hard shutdown | Killing the owned packaged desktop stopped its engine; engine PID disappeared and port 18087 closed; desktop restarted and reopened the NVIDIA track |

These are finite local checks, not performance guarantees or general GPU certification.
The browser playback check exercises the shared player against the local service;
it is not a human listening test or a native WebKit player interaction test.

## Hashes

Packages built from application commit `a3cc386`:

```text
645952f148ade224a2fea39e141e467182c0ee210c4565dba922eb0b9edd7dc4  YuE2-Studio-3.6.0-linux-amd64.deb
f68f3e61a6f8a20a78a224fa6d43904ac785cdb6793c595869dadde48f56a40b  YuE2-Studio-3.6.0-linux-x86_64.AppImage
```

Model files verified on disk:

```text
cd3efd250b734a229172800f08f33a893ad1f66b521666e176cdae4a0729b281  YuE2-3B-Q5_K_M.gguf
93e49dfb1970e89ad64cacb17cf13b5d05f6bb30ef7ed3adae3050bcb728638a  YuE2-Vae-F32.gguf
585f303da1d5252d228d1e8ac6d4c4d11d970df9297406935cc8bdafa49cfa7e  nar_lora_joint_v9.safetensors
```

Decoded PCM before/after native desktop restart:
`48b38d7df2f50494d350386761bcc159f4022f125dc32bd2f843b26002b77dfb`.

## Preserved evidence and limits

Raw logs, JSON observations, generated test audio, packages and checksums are
local under `$HOME/.cache/yue2-linux/`. Relevant files include
`service-tests-final.log`, `frontend-tests-final.log`, `service-smoke.log`,
`package-smoke-corrected.log`, `installed-launch-evidence.json`,
`install-no-node-python.log`, `generation-progress.sse`,
`generation-result.json`, `cancellation-engine-result.json`,
`recovery-generation-result.json`, `nvidia-generation-result.json`,
`audio-statistics.json`, `nvidia-audio-statistics.json`,
`restart-pcm-checksums.txt`, and `output/`.

The baseline package failed the XDG regression check as expected
(`baseline-package-smoke.log`). An initial smoke check bypassed AppRun and
failed to find WebKit's network subprocess (`output/smoke.log`); the corrected
check launches AppRun and both formats pass (`package-smoke-corrected.log`).

Native Save/Cancel dialog interaction, native WebKit player interaction and
subjective audible output still need human review. Browser screenshot capture
timed out, so no screenshot evidence is claimed. CUDA, training, managed local
assistant and VST parity remain deferred. Other optional runtimes, other
distributions, ARM and long generations were not validated.

GitHub CI is configured; local results above are independent of hosted CI status.
Approval must come from `octavariumdigitalpartners` on the PR's current head.
