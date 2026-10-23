export function createRealtimeEventDeduper(limit = 200) {
  const seen = new Set();
  return {
    accept(payload) {
      const id = payload?.eventId;
      if (!id) return true;
      if (seen.has(id)) return false;
      if (seen.size >= limit) seen.clear();
      seen.add(id);
      return true;
    }
  };
}
