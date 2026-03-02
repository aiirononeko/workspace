// Audio capture module using cpal
// Handles microphone input and WAV encoding via hound

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::{Arc, Mutex};

/// Target sample rate for Whisper API (16kHz mono 16-bit PCM)
const TARGET_SAMPLE_RATE: u32 = 16_000;
const TARGET_CHANNELS: u16 = 1;
const TARGET_BITS_PER_SAMPLE: u16 = 16;

/// Recording state shared between the main thread and the audio callback thread.
struct RecordingState {
    samples: Vec<f32>,
    is_recording: bool,
}

/// Audio recorder that captures microphone input and produces WAV data.
pub struct Recorder {
    device: Device,
    config: StreamConfig,
    native_sample_rate: u32,
    native_channels: u16,
    state: Arc<Mutex<RecordingState>>,
    stream: Option<Stream>,
}

impl Recorder {
    /// Create a new recorder using the default input device.
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .context("No default input device available")?;

        let default_config = device
            .default_input_config()
            .context("Failed to get default input config")?;

        let native_sample_rate = default_config.sample_rate().0;
        let native_channels = default_config.channels();

        // Build a stream config from the device defaults
        let config = StreamConfig {
            channels: native_channels,
            sample_rate: default_config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        let state = Arc::new(Mutex::new(RecordingState {
            samples: Vec::new(),
            is_recording: false,
        }));

        Ok(Self {
            device,
            config,
            native_sample_rate,
            native_channels,
            state,
            stream: None,
        })
    }

    /// Begin recording audio from the microphone.
    /// Spawns a cpal stream that writes samples into the shared buffer.
    pub fn start(&mut self) -> Result<()> {
        // Reset state
        {
            let mut state = self
                .state
                .lock()
                .map_err(|e| anyhow::anyhow!("Failed to lock recording state: {}", e))?;
            state.samples.clear();
            state.is_recording = true;
        }

        let state_clone = Arc::clone(&self.state);
        let channels = self.native_channels as usize;

        let default_config = self
            .device
            .default_input_config()
            .context("Failed to get default input config")?;

        let err_fn = |err: cpal::StreamError| {
            eprintln!("Audio stream error: {}", err);
        };

        let stream = match default_config.sample_format() {
            SampleFormat::F32 => self.device.build_input_stream(
                &self.config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut state) = state_clone.lock() {
                        if state.is_recording {
                            // Mix down to mono by averaging channels
                            for frame in data.chunks(channels) {
                                let mono: f32 =
                                    frame.iter().sum::<f32>() / channels as f32;
                                state.samples.push(mono);
                            }
                        }
                    }
                },
                err_fn,
                None,
            )?,
            SampleFormat::I16 => {
                let state_clone = Arc::clone(&self.state);
                self.device.build_input_stream(
                    &self.config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut state) = state_clone.lock() {
                            if state.is_recording {
                                for frame in data.chunks(channels) {
                                    let mono: f32 = frame
                                        .iter()
                                        .map(|&s| s as f32 / i16::MAX as f32)
                                        .sum::<f32>()
                                        / channels as f32;
                                    state.samples.push(mono);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )?
            }
            SampleFormat::U16 => {
                let state_clone = Arc::clone(&self.state);
                self.device.build_input_stream(
                    &self.config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut state) = state_clone.lock() {
                            if state.is_recording {
                                for frame in data.chunks(channels) {
                                    let mono: f32 = frame
                                        .iter()
                                        .map(|&s| {
                                            (s as f32 - u16::MAX as f32 / 2.0)
                                                / (u16::MAX as f32 / 2.0)
                                        })
                                        .sum::<f32>()
                                        / channels as f32;
                                    state.samples.push(mono);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )?
            }
            format => {
                anyhow::bail!("Unsupported sample format: {:?}", format);
            }
        };

        stream.play().context("Failed to start audio stream")?;
        self.stream = Some(stream);

        Ok(())
    }

    /// Stop recording and return the captured audio as WAV bytes.
    /// The WAV is encoded as 16kHz, mono, 16-bit PCM.
    pub fn stop_and_collect_wav(&mut self) -> Result<Vec<u8>> {
        // Signal stop
        {
            let mut state = self
                .state
                .lock()
                .map_err(|e| anyhow::anyhow!("Failed to lock recording state: {}", e))?;
            state.is_recording = false;
        }

        // Drop the stream to stop the audio callback
        self.stream.take();

        // Extract samples
        let samples = {
            let mut state = self
                .state
                .lock()
                .map_err(|e| anyhow::anyhow!("Failed to lock recording state: {}", e))?;
            std::mem::take(&mut state.samples)
        };

        if samples.is_empty() {
            anyhow::bail!("No audio data was captured");
        }

        // Resample to 16kHz if necessary
        let resampled = if self.native_sample_rate != TARGET_SAMPLE_RATE {
            resample(&samples, self.native_sample_rate, TARGET_SAMPLE_RATE)
        } else {
            samples
        };

        // Encode to WAV
        encode_wav(&resampled)
    }
}

/// Simple linear interpolation resampler.
/// Converts samples from `from_rate` to `to_rate`.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (samples.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f64;

        let sample = if src_idx + 1 < samples.len() {
            // Linear interpolation between two adjacent samples
            samples[src_idx] as f64 * (1.0 - frac)
                + samples[src_idx + 1] as f64 * frac
        } else if src_idx < samples.len() {
            samples[src_idx] as f64
        } else {
            0.0
        };

        output.push(sample as f32);
    }

    output
}

/// Encode f32 mono samples into a WAV byte buffer (16-bit PCM, 16kHz, mono).
fn encode_wav(samples: &[f32]) -> Result<Vec<u8>> {
    let spec = WavSpec {
        channels: TARGET_CHANNELS,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: TARGET_BITS_PER_SAMPLE,
        sample_format: HoundSampleFormat::Int,
    };

    let mut buffer = Cursor::new(Vec::new());

    {
        let mut writer =
            WavWriter::new(&mut buffer, spec).context("Failed to create WAV writer")?;

        for &sample in samples {
            // Clamp to [-1.0, 1.0] and convert to i16
            let clamped = sample.clamp(-1.0, 1.0);
            let value = (clamped * i16::MAX as f32) as i16;
            writer
                .write_sample(value)
                .context("Failed to write WAV sample")?;
        }

        writer.finalize().context("Failed to finalize WAV")?;
    }

    Ok(buffer.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resample_identity() {
        let samples = vec![0.0, 0.5, 1.0, -1.0];
        let result = resample(&samples, 16000, 16000);
        assert_eq!(result, samples);
    }

    #[test]
    fn test_resample_downsample() {
        // 48kHz -> 16kHz should produce roughly 1/3 the samples
        let input: Vec<f32> = (0..4800).map(|i| (i as f32 / 4800.0)).collect();
        let output = resample(&input, 48000, 16000);
        assert!((output.len() as f64 - 1600.0).abs() < 2.0);
    }

    #[test]
    fn test_encode_wav_produces_valid_header() {
        let samples = vec![0.0f32; 16000]; // 1 second of silence
        let wav = encode_wav(&samples).unwrap();

        // WAV files start with "RIFF"
        assert_eq!(&wav[0..4], b"RIFF");
        // Followed by file size - 8, then "WAVE"
        assert_eq!(&wav[8..12], b"WAVE");
    }

    #[test]
    fn test_encode_wav_correct_size() {
        let num_samples = 16000; // 1 second at 16kHz
        let samples = vec![0.0f32; num_samples];
        let wav = encode_wav(&samples).unwrap();

        // WAV header is 44 bytes, each 16-bit sample is 2 bytes
        let expected_size = 44 + num_samples * 2;
        assert_eq!(wav.len(), expected_size);
    }

    #[test]
    fn test_resample_empty() {
        let result = resample(&[], 48000, 16000);
        assert!(result.is_empty());
    }
}
