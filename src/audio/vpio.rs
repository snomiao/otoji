//! Microphone capture via Apple's VoiceProcessingIO Audio Unit (macOS only).
//!
//! Provides built-in Acoustic Echo Cancellation (AEC): speaker bleed from
//! system audio is cancelled before the mic samples reach SenseVoice.
//!
//! Pipeline: VPIO callback (48kHz mono f32) → gain → resample 16kHz → i16 → AudioTx
//!
//! The returned `VpioStream` must be kept alive. Drop it to stop capture.

use super::AudioTx;
use crate::core::{AudioChunk, AudioFormat};
use anyhow::{anyhow, Result};
use bytes::Bytes;
use std::ffi::c_void;
use std::ptr::null_mut;

// ── AudioToolbox C FFI ──────────────────────────────────────────────────────

#[link(name = "AudioToolbox", kind = "framework")]
extern "C" {
    fn AudioComponentFindNext(
        comp: *mut c_void,
        desc: *const AudioComponentDescription,
    ) -> *mut c_void;
    fn AudioComponentInstanceNew(comp: *mut c_void, instance: *mut *mut c_void) -> i32;
    fn AudioUnitSetProperty(
        unit: *mut c_void,
        prop: u32,
        scope: u32,
        element: u32,
        data: *const c_void,
        size: u32,
    ) -> i32;
    fn AudioUnitGetProperty(
        unit: *mut c_void,
        prop: u32,
        scope: u32,
        element: u32,
        data: *mut c_void,
        size: *mut u32,
    ) -> i32;
    fn AudioUnitInitialize(unit: *mut c_void) -> i32;
    fn AudioUnitUninitialize(unit: *mut c_void) -> i32;
    fn AudioOutputUnitStart(unit: *mut c_void) -> i32;
    fn AudioOutputUnitStop(unit: *mut c_void) -> i32;
    fn AudioUnitRender(
        unit: *mut c_void,
        flags: *mut u32,
        timestamp: *const AudioTimeStamp,
        bus: u32,
        frames: u32,
        buffers: *mut AudioBufferList,
    ) -> i32;
    fn AudioComponentInstanceDispose(unit: *mut c_void) -> i32;
}

// ── CoreAudio types ─────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Clone, Copy)]
struct AudioComponentDescription {
    component_type: u32,
    component_sub_type: u32,
    component_manufacturer: u32,
    component_flags: u32,
    component_flags_mask: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct AudioStreamBasicDescription {
    sample_rate: f64,
    format_id: u32,
    format_flags: u32,
    bytes_per_packet: u32,
    frames_per_packet: u32,
    bytes_per_frame: u32,
    channels_per_frame: u32,
    bits_per_channel: u32,
    reserved: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct AudioTimeStamp {
    sample_time: f64,
    host_time: u64,
    rate_scalar: f64,
    word_clock_time: u64,
    smpte_time: [u8; 24],
    flags: u32,
    reserved: u32,
}

#[repr(C)]
struct AudioBuffer {
    number_channels: u32,
    data_byte_size: u32,
    data: *mut c_void,
}

#[repr(C)]
struct AudioBufferList {
    number_buffers: u32,
    buffers: [AudioBuffer; 1],
}

#[repr(C)]
struct AURenderCallbackStruct {
    input_proc: Option<
        unsafe extern "C" fn(
            *mut c_void,
            *mut u32,
            *const AudioTimeStamp,
            u32,
            u32,
            *mut AudioBufferList,
        ) -> i32,
    >,
    input_proc_ref_con: *mut c_void,
}

// ── Constants ───────────────────────────────────────────────────────────────

const K_AUDIO_UNIT_TYPE_OUTPUT: u32 = 0x61756F75;
const K_AUDIO_UNIT_SUBTYPE_VOICE_PROCESSING_IO: u32 = 0x7670696F;
const K_AUDIO_UNIT_MANUFACTURER_APPLE: u32 = 0x6170706C;
const K_AUDIO_OUTPUT_UNIT_PROPERTY_ENABLE_IO: u32 = 2003;
const K_AUDIO_UNIT_SCOPE_INPUT: u32 = 1;
const K_AUDIO_UNIT_SCOPE_OUTPUT: u32 = 0;
const K_AUDIO_UNIT_SCOPE_GLOBAL: u32 = 0;
const K_AUDIO_UNIT_PROPERTY_STREAM_FORMAT: u32 = 8;
const K_AUDIO_OUTPUT_UNIT_PROPERTY_SET_INPUT_CALLBACK: u32 = 2005;
const K_AUDIO_UNIT_PROPERTY_SHOULD_ALLOCATE_BUFFER: u32 = 2;
const K_AUDIO_FORMAT_LINEAR_PCM: u32 = 0x6C70636D;
const K_AUDIO_FORMAT_FLAG_IS_FLOAT: u32 = 1;
const K_AUDIO_FORMAT_FLAG_IS_PACKED: u32 = 8;

// VPIO post-AEC output is very quiet — amplify before sending to SenseVoice.
const VPIO_GAIN: f32 = 30.0;

// ── Callback context ────────────────────────────────────────────────────────

struct CallbackCtx {
    unit: *mut c_void,
    render_buf: Vec<f32>,
    resample_carry: f64,
    chunk_buf: Vec<i16>,
    chunk_target: usize,
    tx: AudioTx,
    sample_rate: u32,
}

unsafe impl Send for CallbackCtx {}
unsafe impl Sync for CallbackCtx {}

unsafe extern "C" fn input_callback(
    in_ref_con: *mut c_void,
    io_flags: *mut u32,
    in_ts: *const AudioTimeStamp,
    in_bus: u32,
    in_frames: u32,
    _io_data: *mut AudioBufferList,
) -> i32 {
    let ctx = &mut *(in_ref_con as *mut CallbackCtx);
    let frames = in_frames as usize;

    if ctx.render_buf.len() < frames {
        ctx.render_buf.resize(frames, 0.0);
    }

    let mut abl = AudioBufferList {
        number_buffers: 1,
        buffers: [AudioBuffer {
            number_channels: 1,
            data_byte_size: (frames * 4) as u32,
            data: ctx.render_buf.as_mut_ptr() as *mut c_void,
        }],
    };

    let status = AudioUnitRender(ctx.unit, io_flags, in_ts, in_bus, in_frames, &mut abl);
    if status != 0 {
        return status;
    }

    let raw = &ctx.render_buf[..frames];

    // Gain + resample to 16kHz
    let src_rate = ctx.sample_rate;
    let gained: Vec<f32> = raw
        .iter()
        .map(|&s| (s * VPIO_GAIN).clamp(-1.0, 1.0))
        .collect();
    let at16k = resample_linear_carry(&gained, src_rate, 16_000, &mut ctx.resample_carry);

    // Convert to i16 and accumulate
    ctx.chunk_buf.extend(
        at16k
            .iter()
            .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16),
    );

    // Emit complete chunks
    while ctx.chunk_buf.len() * 2 >= ctx.chunk_target {
        let n = ctx.chunk_target / 2;
        let drain: Vec<i16> = ctx.chunk_buf.drain(..n).collect();
        let mut bytes = Vec::with_capacity(drain.len() * 2);
        for s in &drain {
            bytes.extend_from_slice(&s.to_le_bytes());
        }
        let _ = ctx.tx.try_send(AudioChunk::new(
            AudioFormat::PCM16K_MONO,
            Bytes::from(bytes),
        ));
    }

    0
}

fn resample_linear_carry(src: &[f32], from: u32, to: u32, carry: &mut f64) -> Vec<f32> {
    if src.is_empty() {
        return Vec::new();
    }
    if from == to {
        return src.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let mut out = Vec::with_capacity((src.len() as f64 / ratio) as usize + 1);
    let mut pos = *carry;
    while (pos as usize) + 1 < src.len() {
        let i = pos as usize;
        let frac = (pos - i as f64) as f32;
        out.push(src[i] + (src[i + 1] - src[i]) * frac);
        pos += ratio;
    }
    *carry = pos - src.len() as f64;
    out
}

// ── VpioStream ──────────────────────────────────────────────────────────────

pub struct VpioStream {
    unit: *mut c_void,
    _ctx: Box<CallbackCtx>,
}

unsafe impl Send for VpioStream {}
unsafe impl Sync for VpioStream {}

impl Drop for VpioStream {
    fn drop(&mut self) {
        if !self.unit.is_null() {
            unsafe {
                AudioOutputUnitStop(self.unit);
                AudioUnitUninitialize(self.unit);
                AudioComponentInstanceDispose(self.unit);
            }
        }
    }
}

/// Start VoiceProcessingIO mic capture with AEC. Returns a `VpioStream`
/// that must be kept alive. Drop it to stop capture.
pub fn start(frame_ms: u32, tx: AudioTx) -> Result<VpioStream> {
    unsafe {
        let desc = AudioComponentDescription {
            component_type: K_AUDIO_UNIT_TYPE_OUTPUT,
            component_sub_type: K_AUDIO_UNIT_SUBTYPE_VOICE_PROCESSING_IO,
            component_manufacturer: K_AUDIO_UNIT_MANUFACTURER_APPLE,
            component_flags: 0,
            component_flags_mask: 0,
        };
        let component = AudioComponentFindNext(null_mut(), &desc);
        if component.is_null() {
            return Err(anyhow!("VoiceProcessingIO AudioComponent not found"));
        }
        let mut unit: *mut c_void = null_mut();
        if AudioComponentInstanceNew(component, &mut unit) != 0 || unit.is_null() {
            return Err(anyhow!("AudioComponentInstanceNew failed"));
        }

        // Enable input on Bus 1 (microphone)
        let enable: u32 = 1;
        if AudioUnitSetProperty(
            unit,
            K_AUDIO_OUTPUT_UNIT_PROPERTY_ENABLE_IO,
            K_AUDIO_UNIT_SCOPE_INPUT,
            1,
            &enable as *const u32 as *const c_void,
            4,
        ) != 0
        {
            AudioComponentInstanceDispose(unit);
            return Err(anyhow!("Failed to enable VPIO input"));
        }

        // Set desired format: 48kHz mono f32 before init
        let fmt = AudioStreamBasicDescription {
            sample_rate: 48000.0,
            format_id: K_AUDIO_FORMAT_LINEAR_PCM,
            format_flags: K_AUDIO_FORMAT_FLAG_IS_FLOAT | K_AUDIO_FORMAT_FLAG_IS_PACKED,
            bytes_per_packet: 4,
            frames_per_packet: 1,
            bytes_per_frame: 4,
            channels_per_frame: 1,
            bits_per_channel: 32,
            reserved: 0,
        };
        AudioUnitSetProperty(
            unit,
            K_AUDIO_UNIT_PROPERTY_STREAM_FORMAT,
            K_AUDIO_UNIT_SCOPE_OUTPUT,
            1,
            &fmt as *const _ as *const c_void,
            std::mem::size_of::<AudioStreamBasicDescription>() as u32,
        );

        if AudioUnitInitialize(unit) != 0 {
            AudioComponentInstanceDispose(unit);
            return Err(anyhow!("AudioUnitInitialize failed"));
        }

        // Minimize audio ducking (macOS 14+)
        #[repr(C)]
        struct DuckingConfig {
            enable_advanced: u8,
            level: u32,
        }
        let ducking = DuckingConfig {
            enable_advanced: 0,
            level: 10,
        };
        AudioUnitSetProperty(
            unit,
            2108,
            K_AUDIO_UNIT_SCOPE_GLOBAL,
            0,
            &ducking as *const DuckingConfig as *const c_void,
            std::mem::size_of::<DuckingConfig>() as u32,
        );

        // Query actual sample rate
        let mut actual: AudioStreamBasicDescription = std::mem::zeroed();
        let mut sz = std::mem::size_of::<AudioStreamBasicDescription>() as u32;
        let rate = if AudioUnitGetProperty(
            unit,
            K_AUDIO_UNIT_PROPERTY_STREAM_FORMAT,
            K_AUDIO_UNIT_SCOPE_OUTPUT,
            1,
            &mut actual as *mut _ as *mut c_void,
            &mut sz,
        ) == 0
        {
            actual.sample_rate as u32
        } else {
            48000
        };

        // Tell AU not to allocate its own buffer
        let no_alloc: u32 = 0;
        AudioUnitSetProperty(
            unit,
            K_AUDIO_UNIT_PROPERTY_SHOULD_ALLOCATE_BUFFER,
            K_AUDIO_UNIT_SCOPE_OUTPUT,
            1,
            &no_alloc as *const u32 as *const c_void,
            4,
        );

        let bytes_per_ms = (16_000usize / 1000) * 2; // 16kHz mono i16
        let chunk_target = bytes_per_ms * frame_ms as usize;

        let mut ctx = Box::new(CallbackCtx {
            unit,
            render_buf: vec![0.0f32; 1024],
            resample_carry: 0.0,
            chunk_buf: Vec::new(),
            chunk_target,
            tx,
            sample_rate: rate,
        });

        let cb = AURenderCallbackStruct {
            input_proc: Some(input_callback),
            input_proc_ref_con: &mut *ctx as *mut CallbackCtx as *mut c_void,
        };
        if AudioUnitSetProperty(
            unit,
            K_AUDIO_OUTPUT_UNIT_PROPERTY_SET_INPUT_CALLBACK,
            K_AUDIO_UNIT_SCOPE_GLOBAL,
            0,
            &cb as *const AURenderCallbackStruct as *const c_void,
            std::mem::size_of::<AURenderCallbackStruct>() as u32,
        ) != 0
        {
            AudioComponentInstanceDispose(unit);
            return Err(anyhow!("Failed to set VPIO input callback"));
        }

        if AudioOutputUnitStart(unit) != 0 {
            AudioComponentInstanceDispose(unit);
            return Err(anyhow!("AudioOutputUnitStart failed"));
        }

        tracing::info!(
            "[otoji] VPIO AEC mic started ({}Hz → 16kHz, gain={}x)",
            rate,
            VPIO_GAIN
        );
        Ok(VpioStream { unit, _ctx: ctx })
    }
}
