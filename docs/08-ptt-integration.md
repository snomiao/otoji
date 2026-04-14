# PTT (Push-to-Talk) Integration

Design notes and implementation gotchas from integrating otoji as CapsLockX's
STT backend for push-to-talk voice typing.

## Protocol

A consumer (like CapsLockX) drives PTT via Unix signals:

| Signal | Action |
|--------|--------|
| `SIGUSR1` | Start a PTT segment — otoji begins accumulating PCM into a separate `ptt_buf` |
| `SIGUSR2` | End the PTT segment — otoji transcribes and emits `ptt_final`, clears state |

While a segment is active, otoji emits `ptt_partial` events every `partial_ms`
(re-decoding the growing buffer).

### Events on stdout (`--plain` mode)

```json
{"type":"ptt_partial","text":"hello"}
{"type":"ptt_partial","text":"hello world"}
{"type":"ptt_final","text":"hello world."}
```

The normal VAD-driven `partial`/`final` events continue to fire in parallel
(useful for an always-on overlay).

### Minimum segment length

250 ms (shorter segments emit `ptt_final` with empty text so the caller can
still clean up its placeholder UI).

## Implementation gotchas hit during integration

### 1. WAV streaming length must be even

`0xFFFFFFFF` as the data chunk length fails hound's parser with
`"data chunk length is not a multiple of sample size"` because it's odd and
16-bit PCM requires a 2-byte alignment.

**Fix**: use `0xFFFFFFFE` as the streaming sentinel in the RIFF header.

### 2. Devices that don't support 16 kHz

Many macOS built-in mics only expose 48 kHz mono. otoji's original cpal
config hard-coded 16 kHz and failed to build a stream.

**Fix**: fall back to the device's default config and resample to 16 kHz
in the callback before feeding to SenseVoice.

### 3. Piped stdout is block-buffered

Rust's `println!` on a piped stdout doesn't flush until the buffer fills.
Events emitted by `drive_plain` never reached the CapsLockX reader in
real-time.

**Fix**: `writeln!` + explicit `out.flush()` after every JSON line.

### 4. Auto-rebuild + `exec::execvp` breaks pipes

`maybe_rebuild_and_reexec()` detects source changes and re-execs the new
binary. When spawned as a subprocess with piped stdio, the exec transition
briefly closes stdout (from the consumer's perspective), causing the
reader to see EOF and exit.

**Fix**: consumers should spawn otoji with `OTOJI_REBUILDING=1` to skip
the rebuild check entirely:

```rust
Command::new("otoji")
    .args(["listen", "--plain", "-"])
    .env("OTOJI_REBUILDING", "1")
    .spawn()?;
```

### 5. PttStart during lazy model load

otoji defers SenseVoice model loading until the first PCM frame arrives
(saves ~1 GB of memory for pipelines that error before any audio). If
`SIGUSR1` arrives during this window, the signal was previously discarded.

**Fix**: track `ptt_pending` during lazy-load and activate PTT state as
soon as the main worker loop starts.

### 6. `signal_hook` unreliable in piped tokio subprocess

`signal_hook::iterator::Signals` uses an internal self-pipe to dispatch
signals. When the process is spawned by CapsLockX (tokio parent, piped
stdio, CGEventTap context), signals delivered via `kill(pid, SIGUSR1)`
arrived at the kernel but never triggered the `Signals::forever()`
iterator — likely a fd/runtime interaction we didn't fully diagnose.

**Fix**: raw `signal()` + `AtomicBool` flags + 10 ms polling thread.
The async-signal-safe handler just sets a flag; the polling thread
forwards to the worker via `std::sync::mpsc`.

```rust
extern "C" fn handler(sig: i32) {
    match sig {
        10 => PTT_SIGNAL_PENDING_START.store(true, Ordering::Relaxed),
        12 => PTT_SIGNAL_PENDING_END.store(true, Ordering::Relaxed),
        _ => {}
    }
}
```

### 7. Consumers should NOT put otoji in its own process group

Using `Command::process_group(0)` (i.e. `setpgid` to make the child a
process-group leader) interfered with signal delivery from the parent on
macOS. `kill(child_pid, SIGUSR1)` appeared to be delivered but never
triggered handlers until `process_group(0)` was removed.

**Fix**: don't set `process_group(0)`. To kill otoji and any children on
shutdown, send `SIGTERM`/`SIGKILL` directly to the child PID.

### 8. EINTR from signals interrupting `read()`

Consumers reading otoji's stdout via `BufReader::lines()` may get
`Err(Interrupted)` when a signal (sent to *their own* process, e.g. the
same `kill` from another layer) interrupts the read syscall.

**Fix**: in the consumer's reader loop, continue on `Interrupted`:

```rust
match line {
    Ok(l) => l,
    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
    Err(_) => break,
}
```

## Reference consumer flow

1. Spawn `otoji listen --plain -` with `OTOJI_REBUILDING=1`, piped stdio.
2. Stream 16 kHz mono WAV (header with `0xFFFFFFFE` data length) to stdin.
3. Parse JSON events from stdout (`serde_json` or minimal parser).
4. On user press: `kill(otoji_pid, SIGUSR1)`, show `~` placeholder.
5. Update placeholder with `text~` on each `ptt_partial` event.
6. On user release: `kill(otoji_pid, SIGUSR2)`, wait for `ptt_final`.
7. On `ptt_final`: backspace the placeholder, type the committed text.

See CapsLockX's `voice_otoji.rs` and `voice_ptt.rs` for a complete
reference implementation.
