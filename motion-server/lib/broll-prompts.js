'use strict';

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.resolve(__dirname, '..', '..', 'Prompts', 'BRoll');

const DEFAULT_ANALYSIS_SYSTEM = `You are a professional video editor and visual storyteller specializing in educational content. Your task is to analyze a video transcript and identify moments where B-roll footage (supplementary visual content) would significantly enhance the educational impact.

## What is B-roll?
B-roll is supplementary footage that plays while the main speaker's audio continues. In educational videos, it reinforces concepts visually, maintains viewer engagement, and helps audiences understand abstract ideas through concrete visuals.

## When to recommend B-roll:
1. **Visual concepts**: When the speaker describes something that can be shown
2. **Abstract ideas**: Concepts that benefit from visual metaphors
3. **Statistics and data**: Numbers or trends that could be illustrated
4. **Technical processes**: Step-by-step operations or workflows
5. **Transitions**: Between major topic shifts
6. **Examples**: When the speaker references a real-world example
7. **Emphasis**: Key points that deserve visual reinforcement

## RULES:
- Identify 3–8 moments (be selective)
- Each moment should be 3–10 seconds long
- The description must be a specific, actionable image generation prompt
- Return ONLY valid JSON, no explanation text`;

const DEFAULT_ANALYSIS_USER = `Analyze the following transcript and identify B-roll opportunities.

{TRANSCRIPT}

Return ONLY a valid JSON array:
[
  {
    "startTime": "HH:MM:SS.mmm",
    "endTime": "HH:MM:SS.mmm",
    "description": "Specific, detailed visual prompt for image generation",
    "rationale": "Why this B-roll helps at this exact moment"
  }
]`;

function getAnalysisSystemPrompt() {
  const p = path.join(PROMPTS_DIR, 'analysis.md');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return DEFAULT_ANALYSIS_SYSTEM;
}

function buildAnalysisPrompt(transcript) {
  return DEFAULT_ANALYSIS_USER.replace('{TRANSCRIPT}', transcript);
}

module.exports = { getAnalysisSystemPrompt, buildAnalysisPrompt };
