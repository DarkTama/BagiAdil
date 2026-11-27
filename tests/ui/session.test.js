// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';

let session;
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  session = await import('../../src/ui/session.js');
});

describe('session', () => {
  it('starts empty', () => {
    expect(session.getSession()).toMatchObject({ historyId: null, paid: {}, receiptBlob: null, calc: null });
  });

  it('notifies subscribers once per update and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = session.subscribe(fn);
    session.update({ historyId: 'a' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].historyId).toBe('a');
    off();
    session.update({ historyId: 'b' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('setCalculated stores snapshot, result and itemsMap', () => {
    session.setCalculated({ participants: [] }, { result: { r: 1 }, itemsMap: { A: [] } });
    expect(session.getSession().calc).toEqual({ snapshot: { participants: [] }, result: { r: 1 }, itemsMap: { A: [] } });
  });

  it('resetSession clears everything and keeps the patch', () => {
    session.update({ historyId: 'a', paid: { Ani: true }, receiptBlob: {} });
    session.setCalculated({}, { result: {}, itemsMap: {} });
    session.resetSession();
    expect(session.getSession()).toMatchObject({ historyId: null, paid: {}, receiptBlob: null, calc: null });
    session.resetSession({ historyId: 'x' });
    expect(session.getSession().historyId).toBe('x');
    expect(session.getSession().calc).toBeNull();
  });
});
