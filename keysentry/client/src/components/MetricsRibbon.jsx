'use client';

import { GitCommit, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

export default function MetricsRibbon({ stats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* Scanned Commits */}
      <div className="glassmorphic p-5 flex flex-col relative overflow-hidden group hover:glow-green transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <span className="text-soc-muted text-sm font-medium uppercase tracking-wider">Scanned Commits</span>
          <GitCommit className="w-5 h-5 text-soc-info/70" />
        </div>
        <div className="stat-number text-white animate-count-up">
          {stats.scannedCommits.toLocaleString()}
        </div>
      </div>

      {/* Compromised Repos */}
      <div className={`glassmorphic p-5 flex flex-col relative overflow-hidden group transition-all duration-300 ${stats.compromisedRepos > 0 ? 'hover:glow-red' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-soc-muted text-sm font-medium uppercase tracking-wider">Compromised Repos</span>
          <AlertTriangle className={`w-5 h-5 ${stats.compromisedRepos > 0 ? 'text-soc-danger' : 'text-soc-muted'}`} />
        </div>
        <div className={`stat-number animate-count-up ${stats.compromisedRepos > 0 ? 'text-soc-danger' : 'text-white'}`}>
          {stats.compromisedRepos.toLocaleString()}
        </div>
      </div>

      {/* Redacted Secrets */}
      <div className="glassmorphic p-5 flex flex-col relative overflow-hidden group hover:glow-green transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <span className="text-soc-muted text-sm font-medium uppercase tracking-wider">Redacted Secrets</span>
          <ShieldCheck className="w-5 h-5 text-soc-accent/70" />
        </div>
        <div className="stat-number text-soc-accent animate-count-up">
          {stats.redactedSecrets.toLocaleString()}
        </div>
      </div>

      {/* Avg Latency */}
      <div className="glassmorphic p-5 flex flex-col relative overflow-hidden group hover:glow-green transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <span className="text-soc-muted text-sm font-medium uppercase tracking-wider">Avg Latency</span>
          <Zap className="w-5 h-5 text-soc-warning/70" />
        </div>
        <div className="stat-number text-white flex items-baseline animate-count-up">
          {Math.round(stats.avgLatencyMs || 0)}
          <span className="text-sm text-soc-muted ml-1 font-sans">ms</span>
        </div>
      </div>
    </div>
  );
}
