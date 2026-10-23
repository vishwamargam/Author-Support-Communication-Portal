import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeEventDeduper } from '../src/utils/realtimeEventDeduper.js';

test('realtime duplicate event IDs are ignored while unique and legacy events are accepted', () => {
  const deduper = createRealtimeEventDeduper();
  assert.equal(deduper.accept({ eventId: 'one' }), true);
  assert.equal(deduper.accept({ eventId: 'one' }), false);
  assert.equal(deduper.accept({ eventId: 'two' }), true);
  assert.equal(deduper.accept({ ticketId: 'ticket-without-id' }), true);
});

test('deduper bounds its memory by resetting at the configured limit', () => {
  const deduper = createRealtimeEventDeduper(2);
  assert.equal(deduper.accept({ eventId: 'one' }), true);
  assert.equal(deduper.accept({ eventId: 'two' }), true);
  assert.equal(deduper.accept({ eventId: 'three' }), true);
  assert.equal(deduper.accept({ eventId: 'three' }), false);
});
