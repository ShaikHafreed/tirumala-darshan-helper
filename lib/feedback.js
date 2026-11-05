// Builds a prefilled GitHub issue for user feedback. Nothing is sent by the extension itself:
// the user reviews the text on GitHub and submits it (or copies it). No personal data is added.
export const REPO = 'ShaikHafreed/tirumala-darshan-helper';
export const KINDS = { idea: 'Idea', problem: 'Problem', praise: 'Praise' };
export function feedbackText({ rating, kind, message, version }) {
  const r = Math.min(5, Math.max(0, parseInt(rating, 10) || 0));
  return [`Rating: ${r ? '★'.repeat(r) + '☆'.repeat(5 - r) + ` (${r}/5)` : 'not given'}`,
          `Type: ${KINDS[kind] || 'Idea'}`, '', String(message || '').trim().slice(0, 1500), '', `Version: ${version || ''}`].join('\n');
}
export function feedbackUrl(f) {
  const title = `[${KINDS[f.kind] || 'Idea'}] ${String(f.message || '').trim().split('\n')[0].slice(0, 60) || 'Feedback'}`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(feedbackText(f))}&labels=feedback`;
}
