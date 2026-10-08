'use client';

import { useSocket } from '../hooks/useSocket';
import Header from './Header';
import MetricsRibbon from './MetricsRibbon';
import ThreatFeed from './ThreatFeed';
import SimulateButton from './SimulateButton';
import PRIndicator from './PRIndicator';
import { useState } from 'react';
import Settings from './Settings';

export default function Dashboard() {
  const { isConnected, threats, stats, prs, simulateAttack, error, loading, hasMore, loadMore } = useSocket();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('All');
  const filtered = threats.filter(t => (severity === 'All' || t.severity === severity) && `${t.repo} ${t.keyType || t.type} ${t.filePath || t.file} ${t.commit}`.toLowerCase().includes(query.toLowerCase()));
  const exportHistory = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'keysentry-history.json'; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header isConnected={isConnected} />
      
      <main className="pt-24 pb-8 px-6 max-w-7xl mx-auto min-h-screen flex flex-col">
        <MetricsRibbon stats={stats} />
        <Settings />
        {error && <p role="alert" className="mb-4 p-3 rounded bg-soc-danger/10 text-soc-danger">{error}</p>}
        <div className="flex flex-wrap gap-3 mb-4">
          <input aria-label="Search detection history" placeholder="Search repository, file, secret type or commit" value={query} onChange={e => setQuery(e.target.value)} className="flex-1 min-w-48 bg-soc-card border border-white/10 rounded p-2 text-white" />
          <select aria-label="Filter severity" value={severity} onChange={e => setSeverity(e.target.value)} className="bg-soc-card text-white rounded p-2"><option>All</option><option>Critical</option><option>High</option></select>
          <button onClick={exportHistory} className="text-soc-accent border border-white/10 rounded px-3">Export loaded history</button>
        </div>
        {loading && <p role="status" className="text-soc-muted mb-3">Loading detection history...</p>}
        
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <ThreatFeed threats={filtered} />
            {hasMore && <button onClick={loadMore} className="mt-3 text-soc-accent p-2">Load older detections</button>}
          </div>
          
          <div className="flex flex-col space-y-6">
            <SimulateButton onSimulate={simulateAttack} />
            <PRIndicator prs={prs} />
          </div>
        </div>
        
        <footer className="mt-8 text-center text-soc-muted font-mono text-xs opacity-50">
          KeySentry v1.0 &copy; {new Date().getFullYear()} - Real-time Threat Intelligence
        </footer>
      </main>
    </>
  );
}
