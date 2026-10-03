// Fail-closed contract for Objective media (image / audio): Focused Practice cannot yet show or play it, so a session that
// needs a media-bearing question must not start (and so can never produce Evidence the learner could not fully see).
// Media metadata is never removed or rewritten. Real rendering is a required carry-forward item of the final product UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectiveSession } from '../web/src/objective/session.js';
import { unsupportedMedia } from '../web/src/objective/questions.js';
import { paperWithExplanations } from './objective-fixtures.mjs';

const base = { sessionId: 's-1', evidenceId: 'e-1', startedAt: '2026-10-02T09:00:00.000Z', feedbackTiming: 'instant', intent: 'practice' };
const IMAGE = { name: 'figure.png', alt: 'a synthetic figure', mediaId: 'media-1' };
const AUDIO = { name: 'clip.mp3', mediaId: 'media-2' };

function withMedia(which) {
  const paper = paperWithExplanations({ id: 'paper-media' });
  if (which === 'image') paper.questions[1].image = IMAGE;
  if (which === 'audio') paper.questions[1].audio = AUDIO;
  return paper;
}

test('unsupportedMedia names what cannot be shown, and is null for plain questions', () => {
  assert.equal(unsupportedMedia({ type: 'single' }), null);
  assert.equal(unsupportedMedia({ image: IMAGE }), 'image');
  assert.equal(unsupportedMedia({ audio: AUDIO }), 'audio');
  assert.equal(unsupportedMedia({ image: IMAGE, audio: AUDIO }), 'image and audio');
});

for (const which of ['image', 'audio']) {
  test(`a paper whose session needs a question with ${which} cannot be started (no bypass through the engine)`, () => {
    const paper = withMedia(which);
    assert.throws(() => ObjectiveSession.start({ paper, ...base }), (e) => e.code === 'MEDIA_UNSUPPORTED' && new RegExp(which).test(e.message));
    assert.throws(() => ObjectiveSession.start({ paper, ...base, feedbackTiming: 'submit-at-end', intent: 'test' }), (e) => e.code === 'MEDIA_UNSUPPORTED');
  });

  test(`a retry is blocked only when a REQUESTED question has ${which}`, () => {
    const paper = withMedia(which);
    assert.throws(() => ObjectiveSession.start({ paper, ...base, questionIds: ['q-multi', 'q-tf'], provenance: { purpose: 'retry' } }), (e) => e.code === 'MEDIA_UNSUPPORTED');
    const ok = ObjectiveSession.start({ paper, ...base, questionIds: ['q-single', 'q-tf'], provenance: { purpose: 'retry' } });
    assert.equal(ok.view().total, 2, 'the retry of plain questions of a media paper is startable');
  });

  test(`the media metadata of the source paper is untouched (${which})`, () => {
    const paper = withMedia(which);
    const before = JSON.stringify(paper);
    assert.throws(() => ObjectiveSession.start({ paper, ...base }));
    assert.equal(JSON.stringify(paper), before);
  });

  test(`a recovery state that needs ${which} is refused too, not silently resumed`, () => {
    const plain = ObjectiveSession.start({ paper: paperWithExplanations(), ...base });
    const snap = plain.snapshot();
    snap.questions[1][which] = which === 'image' ? IMAGE : AUDIO;
    assert.throws(() => ObjectiveSession.restore(snap), (e) => e.code === 'MEDIA_UNSUPPORTED');
  });
}

test('a paper without media is unaffected', () => {
  const s = ObjectiveSession.start({ paper: paperWithExplanations(), ...base });
  assert.equal(s.view().total, 5);
});
