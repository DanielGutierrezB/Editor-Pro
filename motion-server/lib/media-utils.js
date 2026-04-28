'use strict';

/**
 * media-utils.js — Shared media utilities for image-generator and video-generator.
 * Extracted to eliminate duplication between both modules.
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const path = require('path');

// ── Find ffmpeg binary ───────────────────────────────────────────────────────

function findFfmpeg(callback) {
  const candidates = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  let idx = 0;
  function next() {
    if (idx >= candidates.length) return callback(null);
    exec(candidates[idx] + ' -version 2>/dev/null', { timeout: 3000 }, (err) => {
      if (!err) return callback(candidates[idx]);
      idx++;
      next();
    });
  }
  next();
}

// ── Download URL to file with redirect support + format detection ─────────────

function downloadToFile(url, outputPath, callback) {
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;
  const tmpPath = outputPath + '.tmp';
  const file = fs.createWriteStream(tmpPath);
  lib.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      file.close();
      fs.unlink(tmpPath, () => {}); // clean up partial file on redirect
      return downloadToFile(res.headers.location, outputPath, callback);
    }
    res.pipe(file);
    file.on('finish', () => file.close(() => {
      // Detect actual format from file magic bytes
      try {
        const fd = fs.openSync(tmpPath, 'r');
        const magic = Buffer.alloc(4);
        fs.readSync(fd, magic, 0, 4, 0);
        fs.closeSync(fd);
        const hex = magic.toString('hex');
        let ext;
        if (hex.startsWith('89504e47')) ext = '.png';
        else if (hex.startsWith('ffd8ff')) ext = '.jpg';
        else if (hex.startsWith('52494646')) ext = '.webp';
        else if (hex.startsWith('00000')) ext = '.mp4'; // ftyp box
        else ext = path.extname(outputPath) || '.png';

        // Build final path with correct extension
        const base = outputPath.replace(/\.[^.]+$/, '') || outputPath;
        const finalPath = base + ext;
        fs.renameSync(tmpPath, finalPath);
        console.log('[Download] Saved:', path.basename(finalPath), '(magic:', hex.substring(0, 8), ')');
        callback(null, finalPath);
      } catch (e) {
        // Fallback: just rename tmp to outputPath
        try { fs.renameSync(tmpPath, outputPath); } catch (_e) {}
        callback(null, outputPath);
      }
    }));
  }).on('error', (err) => {
    fs.unlink(tmpPath, () => {});
    callback(err);
  });
}

/**
 * Simple download (no format detection) — for video files where extension is known.
 */
function downloadToFileSimple(url, outputPath, callback) {
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;
  const file = fs.createWriteStream(outputPath);
  lib.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      file.close();
      fs.unlink(outputPath, () => {}); // clean up partial file on redirect
      return downloadToFileSimple(res.headers.location, outputPath, callback);
    }
    res.pipe(file);
    file.on('finish', () => file.close(() => callback(null, outputPath)));
  }).on('error', (err) => {
    fs.unlink(outputPath, () => {});
    callback(err);
  });
}

module.exports = { findFfmpeg, downloadToFile, downloadToFileSimple };
