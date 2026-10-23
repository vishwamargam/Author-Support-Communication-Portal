import { useEffect, useRef } from 'react';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { createRealtimeEventDeduper } from '../utils/realtimeEventDeduper.js';

// Events are hints to re-fetch; REST remains authoritative. A short debounce
// collapses duplicates from a message and its corresponding ticket update.
export function useRealtimeInvalidation({ events = [], ticketIds = [], onInvalidate, pollMs = 15000, pollWhenConnected = false }) {
  const { socket, connected } = useRealtime();
  const callback = useRef(onInvalidate);
  callback.current = onInvalidate;
  const eventKey = [...events].sort().join('|');
  const ticketKey = [...new Set(ticketIds.filter(Boolean).map(String))].sort().join('|');

  useEffect(() => {
    if (!socket) return undefined;
    const eventNames = eventKey ? eventKey.split('|') : [];
    const ticketList = ticketKey ? ticketKey.split('|') : [];
    const deduper = createRealtimeEventDeduper();
    let debounceTimer;
    const invalidate = (payload) => {
      if (!deduper.accept(payload)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => callback.current?.(), 160);
    };
    const subscribe = () => {
      ticketList.forEach((ticketId) => socket.emit('ticket:subscribe', { ticketId }));
      // Reconcile from REST after both initial connection and reconnect, since
      // events emitted while this client was away are not replayed.
      callback.current?.();
    };
    for (const eventName of eventNames) socket.on(eventName, invalidate);
    socket.on('connect', subscribe);
    if (socket.connected) subscribe();

    return () => {
      clearTimeout(debounceTimer);
      for (const eventName of eventNames) socket.off(eventName, invalidate);
      socket.off('connect', subscribe);
      if (socket.connected) ticketList.forEach((ticketId) => socket.emit('ticket:unsubscribe', { ticketId }));
    };
  }, [socket, eventKey, ticketKey]);

  useEffect(() => {
    if ((!socket && !pollWhenConnected) || (connected && !pollWhenConnected) || !pollMs) return undefined;
    const timer = setInterval(() => callback.current?.(), pollMs);
    return () => clearInterval(timer);
  }, [socket, connected, pollMs, pollWhenConnected]);

  return { connected, usingPollingFallback: !connected };
}
