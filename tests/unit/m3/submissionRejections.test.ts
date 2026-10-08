import { beforeEach, expect, it, vi } from 'vitest';
import { SubmissionRejections } from '../../../src/api/submissionRejections';

beforeEach(() => localStorage.clear());

it('restores terminal outcomes after reload without retaining retryable errors or corrupt data', () => {
  const records = new SubmissionRejections();
  records.record({ id: 'rejected', message: 'Unverified score', status: 400 });
  expect(new SubmissionRejections().get('rejected')).toEqual(records.get('rejected'));
  localStorage.setItem('pirate_battle_submission_rejections_v1', JSON.stringify([
    { id: 'timeout', message: 'timeout', status: 408 }, { id: 'rate', message: 'retry later', status: 429 },
    { id: 'bad', status: 400 }, { id: 'server', message: 'offline', status: 503 },
  ]));
  const restored = new SubmissionRejections();
  for (const id of ['timeout', 'rate', 'bad', 'server']) expect(restored.get(id)).toBeUndefined();
});

it('bounds retained outcomes and preserves feedback when storage is blocked', () => {
  const records = new SubmissionRejections();
  for (let i = 0; i < 51; i++) records.record({ id: String(i), message: 'Rejected', status: 409 });
  expect(new SubmissionRejections().get('0')).toBeUndefined();
  expect(new SubmissionRejections().get('50')?.status).toBe(409);
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  records.record({ id: 'blocked', message: 'Still visible', status: 400 });
  expect(records.get('blocked')?.message).toBe('Still visible');
  storage.mockRestore();
});
