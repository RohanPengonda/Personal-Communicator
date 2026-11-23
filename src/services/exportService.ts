import type { Session } from '../types';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportTranscript(session: Session) {
  const lines = [
    `${session.modeLabel} — ${new Date(session.timestamp).toLocaleString()}`,
    `Score: ${session.score.toFixed(1)}/10`,
    `Prompt: ${session.contextPrompt}`,
    `Feedback source: ${session.evaluationSource === 'AI' ? 'Gemini AI' : 'Local mock'}`,
    '',
    'TRANSCRIPT',
    session.transcript,
    ''
  ];

  if (session.replays.length > 0) {
    lines.push('COACHING MARKERS');
    session.replays.forEach((marker) => {
      const time = `${Math.floor(marker.timestampSeconds / 60).toString().padStart(2, '0')}:${Math.round(marker.timestampSeconds % 60).toString().padStart(2, '0')}`;
      lines.push(`[${time}] ${marker.label}: ${marker.advice}`);
    });
    lines.push('');
  }

  lines.push('ONE THING TO PRACTICE', session.oneThingToPractice);
  triggerDownload(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `${session.id}-transcript.txt`);
}

export function exportSessionJson(session: Session) {
  triggerDownload(
    new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }),
    `${session.id}.json`
  );
}

export async function exportRecording(session: Session) {
  if (!session.mediaUrl) return;
  const response = await fetch(session.mediaUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  triggerDownload(blob, `${session.id}.${extension}`);
}
