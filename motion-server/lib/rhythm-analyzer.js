/**
 * Rhythm Analyzer — detects pauses, emphasis, tempo changes, and topic transitions
 * from transcript word-level timestamps.
 */

function analyzeRhythm(transcriptJson) {
  const segments = transcriptJson.segments || [];
  const markers = [];
  const allWords = [];
  
  // Flatten all words with absolute timestamps
  segments.forEach(seg => {
    (seg.words || []).forEach(w => {
      if (w.type === 'word' && w.text) {
        allWords.push({
          text: w.text,
          start: w.start,
          duration: w.duration,
          end: w.start + w.duration,
          confidence: w.confidence || 1,
          eos: w.eos || false,
        });
      }
    });
  });
  
  if (allWords.length < 2) return { markers: [], summary: {} };
  
  // 1. Detect PAUSES between words
  for (let i = 1; i < allWords.length; i++) {
    const gap = allWords[i].start - allWords[i-1].end;
    
    // Dramatic pause: > 0.5s gap between words
    if (gap > 0.5) {
      markers.push({
        time: allWords[i-1].end,
        type: 'pause',
        subtype: gap > 1.0 ? 'topic_change' : gap > 0.7 ? 'dramatic_pause' : 'breath_pause',
        duration: parseFloat(gap.toFixed(2)),
        beforeWord: allWords[i].text,
        afterWord: allWords[i-1].text,
      });
    }
  }
  
  // 2. Detect EMPHASIS — slow word relative to neighbors + high confidence
  const avgDuration = allWords.reduce((sum, w) => sum + w.duration, 0) / allWords.length;
  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i];
    // Word is significantly slower than average (2x) = emphasis
    if (w.duration > avgDuration * 2 && w.text.length > 2) {
      markers.push({
        time: w.start,
        type: 'emphasis',
        word: w.text,
        duration: parseFloat(w.duration.toFixed(2)),
        ratio: parseFloat((w.duration / avgDuration).toFixed(1)),
      });
    }
  }
  
  // 3. Detect TEMPO CHANGES — sliding window of 5 words
  const windowSize = 5;
  const tempoData = [];
  for (let i = 0; i <= allWords.length - windowSize; i++) {
    const windowWords = allWords.slice(i, i + windowSize);
    const windowDuration = windowWords[windowSize-1].end - windowWords[0].start;
    const wordsPerSecond = windowSize / windowDuration;
    tempoData.push({
      time: windowWords[0].start,
      wps: parseFloat(wordsPerSecond.toFixed(1)),
    });
  }
  
  // Find tempo transitions (fast to slow or slow to fast)
  for (let i = 1; i < tempoData.length; i++) {
    const diff = tempoData[i].wps - tempoData[i-1].wps;
    if (Math.abs(diff) > 1.0) { // significant tempo change
      markers.push({
        time: tempoData[i].time,
        type: 'tempo_change',
        subtype: diff > 0 ? 'accelerating' : 'decelerating',
        fromWps: tempoData[i-1].wps,
        toWps: tempoData[i].wps,
      });
    }
  }
  
  // 4. Detect SENTENCE BOUNDARIES from EOS markers
  const sentences = [];
  let sentenceStart = allWords[0].start;
  for (let i = 0; i < allWords.length; i++) {
    if (allWords[i].eos) {
      sentences.push({
        start: sentenceStart,
        end: allWords[i].end,
        duration: parseFloat((allWords[i].end - sentenceStart).toFixed(2)),
        wordCount: 0, // will count
      });
      if (i + 1 < allWords.length) {
        sentenceStart = allWords[i + 1].start;
      }
    }
  }
  
  // 5. Summary stats
  const totalDuration = allWords[allWords.length-1].end - allWords[0].start;
  const avgWps = allWords.length / totalDuration;
  const pauses = markers.filter(m => m.type === 'pause');
  const topicChanges = pauses.filter(p => p.subtype === 'topic_change');
  const dramaticPauses = pauses.filter(p => p.subtype === 'dramatic_pause');
  
  const summary = {
    totalDuration: parseFloat(totalDuration.toFixed(1)),
    totalWords: allWords.length,
    averageWordsPerSecond: parseFloat(avgWps.toFixed(1)),
    averageWordDuration: parseFloat(avgDuration.toFixed(3)),
    sentenceCount: sentences.length,
    pauseCount: pauses.length,
    topicChangeCount: topicChanges.length,
    dramaticPauseCount: dramaticPauses.length,
    emphasisCount: markers.filter(m => m.type === 'emphasis').length,
  };
  
  // Sort markers by time
  markers.sort((a, b) => a.time - b.time);
  
  return { markers, summary, sentences };
}

/**
 * Format rhythm data as text to append to the analysis prompt
 */
function formatRhythmForPrompt(rhythmData) {
  if (!rhythmData || !rhythmData.markers || rhythmData.markers.length === 0) {
    return '';
  }
  
  let text = '\n\nANÁLISIS RÍTMICO DEL NARRADOR:\n';
  text += `- Duración total: ${rhythmData.summary.totalDuration}s\n`;
  text += `- Velocidad promedio: ${rhythmData.summary.averageWordsPerSecond} palabras/segundo\n`;
  text += `- ${rhythmData.summary.sentenceCount} oraciones\n`;
  text += `- ${rhythmData.summary.pauseCount} pausas detectadas\n`;
  text += `- ${rhythmData.summary.topicChangeCount} cambios de tema\n\n`;
  
  text += 'MARCADORES DE RITMO (usa estos para sincronizar las animaciones):\n';
  
  rhythmData.markers.forEach(m => {
    if (m.type === 'pause' && m.subtype === 'topic_change') {
      text += `  [${m.time.toFixed(1)}s] 🔄 CAMBIO DE TEMA (pausa ${m.duration}s) — buen punto para corte entre clips\n`;
    } else if (m.type === 'pause' && m.subtype === 'dramatic_pause') {
      text += `  [${m.time.toFixed(1)}s] ⏸️ PAUSA DRAMÁTICA (${m.duration}s) — momento de impacto visual\n`;
    } else if (m.type === 'emphasis') {
      text += `  [${m.time.toFixed(1)}s] ⚡ ÉNFASIS: "${m.word}" (${m.ratio}x más lento que promedio)\n`;
    } else if (m.type === 'tempo_change') {
      text += `  [${m.time.toFixed(1)}s] ${m.subtype === 'accelerating' ? '🏃 ACELERA' : '🐢 DESACELERA'} (${m.fromWps} → ${m.toWps} palabras/s)\n`;
    }
  });
  
  text += '\nUSA ESTOS MARCADORES PARA:\n';
  text += '- Iniciar clips nuevos en CAMBIOS DE TEMA\n';
  text += '- Mostrar elementos destacados en PAUSAS DRAMÁTICAS\n';
  text += '- Usar callouts/reveals en momentos de ÉNFASIS\n';
  text += '- Ajustar la cantidad de contenido según el TEMPO (rápido = menos items, lento = más items)\n';
  
  return text;
}

module.exports = { analyzeRhythm, formatRhythmForPrompt };
