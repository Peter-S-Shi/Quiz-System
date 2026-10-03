// Fail-closed contract for Objective media (image / audio): Focused Practice cannot yet show or play it, so a session that
// needs a media-bearing question must not start (and so can never produce Evidence the learner could not fully see).
// Media metadata is never removed or rewritten. Real rendering is a required carry-forward item of the final product UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectiveSession } from '../web/src/objective/session.js';
import { mediaRefs, unsupportedMedia } from '../web/src/objective/questions.js';
import { correctAnswerForView, paperWithExplanations } from './objective-fixtures.mjs';

const base = { sessionId: 's-1', evidenceId: 'e-1', startedAt: '2026-10-02T09:00:00.000Z', feedbackTiming: 'instant', intent: 'practice' };
const IMAGE = { id: 'media-1', name: 'figure.png', alt: 'a synthetic figure' };
const AUDIO = { id: 'media-2', name: 'clip.mp3' };

function withMedia(which) {
  const paper = paperWithExplanations({ id: 'paper-media' });
  if (which === 'image') paper.questions[1].image = IMAGE;
  if (which === 'audio') paper.questions[1].audio = AUDIO;
  return paper;
}

test('mediaRefs lists the references; one without a usable id can never be presentable', () => {
  assert.deepEqual(mediaRefs({ image: IMAGE, audio: AUDIO }), [{ kind: 'image', id: 'media-1' }, { kind: 'audio', id: 'media-2' }]);
  assert.deepEqual(mediaRefs({ image: { name: 'no id' } }), [{ kind: 'image', id: null }]);
  assert.equal(unsupportedMedia({ image: { name: 'no id' } }, new Set(['media-1'])), 'image');
});

test('unsupportedMedia names what is not proven presentable, and is null for plain questions', () => {
  assert.equal(unsupportedMedia({ type: 'single' }), null);
  assert.equal(unsupportedMedia({ image: IMAGE }), 'image');
  assert.equal(unsupportedMedia({ audio: AUDIO }), 'audio');
  assert.equal(unsupportedMedia({ image: IMAGE, audio: AUDIO }), 'image and audio');
  assert.equal(unsupportedMedia({ image: IMAGE, audio: AUDIO }, new Set(['media-1'])), 'audio', 'only the unproven part is named');
  assert.equal(unsupportedMedia({ image: IMAGE, audio: AUDIO }, new Set(['media-1', 'media-2'])), null);
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

for (const which of ['image', 'audio']) {
  test(`once the ${which} is PROVEN presentable the session starts, carries the reference and keeps the paper intact`, () => {
    const paper = withMedia(which);
    const before = JSON.stringify(paper);
    const id = which === 'image' ? IMAGE.id : AUDIO.id;
    assert.throws(() => ObjectiveSession.start({ paper, ...base, presentableMedia: new Set(['some-other-id']) }), (e) => e.code === 'MEDIA_UNSUPPORTED', 'a proof for another object proves nothing');
    const s = ObjectiveSession.start({ paper, ...base, presentableMedia: new Set([id]) });
    s.go(1);
    assert.equal(s.view().question[which].id, id, 'the view hands the reference to the surface');
    assert.equal(JSON.stringify(paper), before);
    const restored = ObjectiveSession.restore(s.snapshot(), { presentableMedia: new Set([id]) });
    assert.equal(restored.view().total, 5);
    assert.throws(() => ObjectiveSession.restore(s.snapshot()), (e) => e.code === 'MEDIA_UNSUPPORTED', 'resuming needs the proof again');
    for (let i = 0; i < 5; i += 1) {
      s.go(i);
      s.answer(correctAnswerForView(s.view(), paper));
      s.submitItem();
    }
    const done = s.finalize({ now: '2026-10-02T10:00:00.000Z' });
    assert.equal(done.material.snapshot.items[1][which].id, id, 'the stored snapshot keeps the media reference');
  });
}

test('a paper without media is unaffected', () => {
  const s = ObjectiveSession.start({ paper: paperWithExplanations(), ...base });
  assert.equal(s.view().total, 5);
});
