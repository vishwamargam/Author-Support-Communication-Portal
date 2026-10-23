import { useRealtime } from '../context/RealtimeContext.jsx';

export default function RealtimeIndicator() {
  const { connected } = useRealtime();
  return <span className={`realtime-indicator ${connected ? 'realtime-live' : 'realtime-fallback'}`} role="status">
    <i />{connected ? 'Live updates' : 'Auto-refreshing'}
  </span>;
}
