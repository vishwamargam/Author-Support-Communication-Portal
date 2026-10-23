import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const RealtimeContext = createContext({ socket: null, connected: false });

function socketOrigin() {
  const apiUrl = new URL(import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1', window.location.href);
  return import.meta.env.VITE_SOCKET_URL || apiUrl.origin;
}

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [connection, setConnection] = useState({ socket: null, connected: false });

  useEffect(() => {
    if (!user) { setConnection({ socket: null, connected: false }); return undefined; }
    const socket = io(socketOrigin(), {
      withCredentials: true,
      auth: { portal: user.role },
      path: '/api/v1/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
    const onConnect = () => setConnection({ socket, connected: true });
    const onDisconnect = () => setConnection({ socket, connected: false });
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnection({ socket, connected: socket.connected });
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      setConnection({ socket: null, connected: false });
    };
  }, [user?.id, user?.role]);

  const value = useMemo(() => connection, [connection]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() { return useContext(RealtimeContext); }
