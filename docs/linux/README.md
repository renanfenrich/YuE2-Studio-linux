# Linux core compatibility

Target: Ubuntu x86_64, starting with Ubuntu 22.04 (glibc 2.35). The desktop
embeds its Rust service and bundles the native YuE2 engine with Vulkan and
CPU backends. Python and Node.js are not application runtime requirements.
Node.js, Rust, CMake and Ninja are build/test tools.

## Build

From a committed checkout with Docker available:

```sh
bash scripts/build-linux-docker.sh "$PWD/linux-out" "$HOME/.cache/yue2-linux-build"
```

The container builds **committed HEAD**, not uncommitted files. It checks
the engine's shared libraries and startup, then launches both extracted
package formats under Xvfb to check engine discovery and XDG data placement.
Outputs: `.deb`, `.AppImage`, `build.log` and `smoke.log`. Model weights are downloaded
separately by the application and never bundled. Allow several GB for tools,
native build caches and packages, plus the model set selected in the app.

The **Linux packages** GitHub workflow runs the same build on demand and
uploads artifacts without publishing a release. Rust workspace tests and a
model-free service lifecycle/media check also run on Linux in normal CI.

For direct builds, see the dependencies in `scripts/build-linux-docker.sh`.
Install the Vulkan development headers and `glslc` (the container uses the
LunarG SDK), then run `bash scripts/build-release-linux.sh`.

## Install and run

On the target Ubuntu desktop, install the `.deb` with its system dependencies:

```sh
sudo apt install ./linux-out/YuE2-Studio-*-linux-amd64.deb
```

Or make the AppImage executable and launch it. A working Vulkan GPU driver
is required for GPU inference. First launch presents the model manager;
choose a set that fits the available memory. The smallest core set is the
Q5 backbone, F32 VAE and decoder companion (approximately 3.3 GB on disk).
SheetSage2 is optional for generation. A successful install/startup is not
proof that a particular card can generate a song.

On a hybrid laptop, Vulkan may choose the integrated card. The native ggml
`GGML_VK_VISIBLE_DEVICES` variable selects Vulkan devices before launch:
`GGML_VK_VISIBLE_DEVICES=1 ./YuE2-Studio-3.6.0-linux-x86_64.AppImage`.
Index 1 was NVIDIA on the tested laptop; check the Vulkan device enumeration
on your own machine. The studio's CUDA card setting does not select Vulkan
devices. Both Intel and NVIDIA Vulkan were tested; see `acceptance.md`.

Default user data: `$XDG_DATA_HOME/yue2-studio`, or
`~/.local/share/yue2-studio`. This holds settings, models, the library and media.
An explicit `YUE_STUDIO_DATA_ROOT` applies consistently to the shell and service.
The existing `YUE_MODELS_ROOT` and `YUE_STUDIO_SETTINGS_PATH` overrides still
take precedence for those individual paths. An explicit `portable.flag`
beside the executable keeps portable behavior; extracted AppImages otherwise
use XDG storage, not a disposable extraction directory.

## Capability boundary

| Capability | Linux delivery |
| --- | --- |
| Core local song workflow | Vulkan/CPU engine bundled; see acceptance evidence |
| Score, library, export and player | Shared UI/service; verify on the target desktop |
| Audio-to-MIDI | Bundled native CPU transcriber; not GPU parity |
| CUDA generation | Not bundled; deferred |
| Managed local assistant | Windows binaries unavailable; use a server by address |
| LoRA training | Windows binary unavailable; deferred |
| VST plugins | No Linux host bundled; deferred |
| Other optional models/tools | Only claim support after their native runtime is tested |
| Automatic updates | Disabled for these Linux fork packages; install a new package manually |

## Acceptance

Model-free checks:

```sh
cargo test --workspace --locked
cargo build -p music-server --locked
node scripts/smoke-linux-service.mjs target/debug/music-server
bash scripts/smoke-linux-package.sh /path/to/package.deb
bash scripts/smoke-linux-package.sh /path/to/package.AppImage
```

Package smoke checks require Node.js, curl, Xvfb, xauth and dbus-run-session
on the **test machine**. They run extracted packages without replacing an
installation. The service check uses synthetic PCM audio and verifies import,
duration, PCM preservation, seeking, shutdown and persistence after restart.
It does not substitute for actual model inference or audible playback.

For the full core acceptance, record package/source revisions, OS, GPU/driver,
model checksums and selected backend; complete a short generated song; observe
progress; cancel a second generation and ensure another request works; play
and export the result; restart and reopen it; verify native Save/Cancel dialogs
and that shutdown leaves no owned engine process. Keep results and limitations
in `acceptance.md`. Stop at READY FOR HUMAN REVIEW; merging requires approval
from `octavariumdigitalpartners`.
