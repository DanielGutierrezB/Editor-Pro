'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFile } = require('child_process');
const { findFfmpeg } = require('./media-utils');

// ── Placeholder: silent audio via ffmpeg ──────────────────────────────────────

function _createPlaceholderAudio(durationSecs, outputPath, callback) {
  findFfmpeg((ffmpeg) => {
    if (!ffmpeg) return callback(new Error('ffmpeg not found — required for placeholder audio'));
    const dur = Math.max(1, Math.round(durationSecs)) || 5;
    execFile(ffmpeg, [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', String(dur),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', outputPath,
    ], { timeout: 15000 }, (err) => callback(err, outputPath));
  });
}

// ── ElevenLabs Sound Effects API ──────────────────────────────────────────────

function _generateElevenLabsAudio(description, durationSecs, apiKey, outputPath, callback) {
  if (!apiKey) return callback(new Error('ElevenLabs API key required for audio generation'));

  const body = JSON.stringify({
    text: description,
    duration_seconds: Math.min(22, Math.max(1, Math.round(durationSecs))), // ElevenLabs max ~22s
    prompt_influence: 0.3,
  });

  const req = https.request({
    hostname: 'api.elevenlabs.io',
    path: '/v1/sound-generation',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'xi-api-key': apiKey,
    },
  }, (res) => {
    if (res.statusCode !== 200) {
      let errData = '';
      res.on('data', (c) => { errData += c; });
      res.on('end', () => {
        callback(new Error('ElevenLabs Sound FX error HTTP ' + res.statusCode + ': ' + errData.substring(0, 300)));
      });
      return;
    }
    // Response is raw audio bytes (MP3)
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const audioBuf = Buffer.concat(chunks);
      if (audioBuf.length < 100) {
        return callback(new Error('ElevenLabs returned empty audio'));
      }
      fs.writeFile(outputPath, audioBuf, (err) => callback(err, outputPath));
    });
  });
  req.on('error', callback);
  req.setTimeout(60000, () => { req.destroy(); callback(new Error('ElevenLabs audio timeout (60s)')); });
  req.write(body);
  req.end();
}

// ── Build ambient audio description from visual description ───────────────────

function buildAudioDescription(visualDescription) {
  // Strip style/rendering instructions, extract the scene context
  // The goal: ambient sound that matches the visual scene
  let desc = visualDescription || '';

  // Remove common style prefixes/suffixes
  desc = desc.replace(/\[.*?\]/g, '').trim();
  desc = desc.replace(/photorealistic|comic sketch|blueprint|courtroom sketch/gi, '').trim();
  desc = desc.replace(/shallow depth of field|cinematic photography|warm lighting|natural lighting/gi, '').trim();

  // Build an ambient audio prompt
  if (!desc) return 'quiet ambient room tone';

  // Extract location/environment cues
  const locationCues = [];
  if (/office|oficina|workspace|escritorio/i.test(desc)) locationCues.push('quiet office ambiance');
  if (/server|datacenter|computer/i.test(desc)) locationCues.push('soft computer fan hum');
  if (/street|calle|city|ciudad|urban/i.test(desc)) locationCues.push('distant city traffic');
  if (/café|coffee|cafetería/i.test(desc)) locationCues.push('coffee shop ambiance with subtle chatter');
  if (/nature|naturaleza|forest|bosque|park|parque/i.test(desc)) locationCues.push('birds chirping, gentle wind');
  if (/rain|lluvia/i.test(desc)) locationCues.push('light rain on a window');
  if (/classroom|aula|class/i.test(desc)) locationCues.push('quiet classroom ambiance');
  if (/hospital|medical|clínica/i.test(desc)) locationCues.push('subtle hospital ambient sounds');
  if (/factory|fábrica|industrial/i.test(desc)) locationCues.push('distant industrial machinery hum');
  if (/kitchen|cocina|restaurant/i.test(desc)) locationCues.push('kitchen ambiance, subtle sounds');
  if (/typing|keyboard|teclado|código|code/i.test(desc)) locationCues.push('soft keyboard typing');
  if (/meeting|reunión|conference/i.test(desc)) locationCues.push('quiet meeting room atmosphere');

  if (locationCues.length > 0) {
    return locationCues.join(', ') + ', no voices, no music, ambient only';
  }

  // Generic: extract key nouns and build a prompt
  return 'subtle ambient atmosphere matching: ' + desc.substring(0, 100) + ', no voices, no music, gentle and atmospheric';
}

// ── Main entry point ──────────────────────────────────────────────────────────

function generateAudio(options, outputPath, callback) {
  const { provider, description, durationSecs, apiKey } = options;
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Ensure .mp3 extension for ElevenLabs, .m4a for placeholder
  if (!path.extname(outputPath)) {
    outputPath = outputPath + (provider === 'elevenlabs' ? '.mp3' : '.m4a');
  }

  const audioDesc = buildAudioDescription(description);
  console.log('[Audio] Generating:', provider, '—', audioDesc.substring(0, 80), '— duration:', durationSecs + 's');

  switch (provider) {
    case 'elevenlabs':
      return _generateElevenLabsAudio(audioDesc, durationSecs, apiKey, outputPath, callback);
    case 'placeholder':
    default:
      return _createPlaceholderAudio(durationSecs, outputPath, callback);
  }
}

module.exports = { generateAudio, buildAudioDescription };
