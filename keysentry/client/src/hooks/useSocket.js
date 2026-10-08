'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [threats, setThreats] = useState([]);
  const [stats, setStats] = useState({
    scannedCommits: 0,
    compromisedRepos: 0,
    redactedSecrets: 0,
    avgLatencyMs: 0,
  });
  const [prs, setPrs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';

  const loadHistory = async (nextPage = 1) => {
    try {
      const response = await fetch(`${socketUrl}/api/threats?page=${nextPage}&limit=50`);
      if (!response.ok) throw new Error('Could not load detection history');
      const result = await response.json();
      setPrs([...new Map(result.data.filter(t => t.prUrl).map(t => [t.prUrl, { repo: t.repo, url: t.prUrl, number: t.prUrl.split('/').pop() }])).values()]);
      setThreats(prev => {
        const entries = nextPage === 1 ? [...prev, ...result.data] : [...prev, ...result.data];
        return [...new Map(entries.map(t => [t.id || `${t.repo}:${t.commit}:${t.filePath}:${t.line}:${t.keyType}`, t])).values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      });
      setPage(nextPage);
      setHasMore(nextPage < result.totalPages);
      setError('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const socket = io(socketUrl, {
      autoConnect: false,
      transports: ['polling', 'websocket'],
    });

    socket.connect();

    socket.on('connect', () => {
      setIsConnected(true);
      loadHistory();
    });
    socket.on('connect_error', () => { setError('Backend connection unavailable. Retrying automatically.'); setLoading(false); });
    loadHistory();

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('new-threat', (threat) => {
      setThreats((prev) => [threat, ...prev.filter(t => t.id !== threat.id)]);
    });

    socket.on('stats-update', (newStats) => {
      setStats(newStats);
    });
    socket.on('threat-update', threat => setThreats(prev => prev.map(t => t.id === threat.id ? threat : t)));

    socket.on('pr-created', (pr) => {
      setPrs((prev) => {
        // Replace existing PR for same repo/branch if exists, else add
        const existingIdx = prev.findIndex(p => p.repo === pr.repo && p.branch === pr.branch);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = pr;
          return updated;
        }
        return [pr, ...prev];
      });
      
      // Update threat with PR link if match
      setThreats(prev => prev.map(t => {
        if (t.repo === pr.repo) {
          return { ...t, prUrl: pr.url };
        }
        return t;
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new-threat');
      socket.off('stats-update');
      socket.off('pr-created');
      socket.disconnect();
    };
  }, []);

  const simulateAttack = async () => {
    try {
      const response = await fetch(`${socketUrl}/api/simulate`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Simulation failed. Check the backend connection.');
      setError('');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  return { isConnected, threats, stats, prs, simulateAttack, error, loading, hasMore, loadMore: () => loadHistory(page + 1) };
}
