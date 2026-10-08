'use client';

import { AlertOctagon, FileCode, GitBranch, User, Lock, ExternalLink } from 'lucide-react';

export default function ThreatCard({ threat, index }) {
  const isCritical = threat.severity === 'Critical';
  const severityClass = isCritical ? 'severity-critical' : 'severity-high';
  const borderColor = isCritical ? 'border-l-soc-danger' : 'border-l-soc-warning';
  
  // Compute relative time
  const getTimeAgo = (ts) => {
    if (!ts) return 'Just now';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };
  const timeAgo = getTimeAgo(threat.timestamp);
  
  const entropyRatio = Math.min((threat.entropy / 6.0) * 100, 100);

  return (
    <div 
      className={`glassmorphic threat-card p-4 mb-4 border-l-4 ${borderColor} animate-slide-in`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Top Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center space-x-1 ${severityClass}`}>
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>{threat.severity}</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-soc-card/80 border border-white/5 text-soc-text text-xs font-medium flex items-center space-x-1">
            <Lock className="w-3 h-3 text-soc-info" />
            <span>{threat.keyType || threat.type || 'API Key'}</span>
          </span>
        </div>
        <span className="text-xs text-soc-muted font-mono">{timeAgo}</span>
      </div>

      {/* Middle Row */}
      <div className="mb-3 space-y-1">
        <div className="flex items-center space-x-2">
          <GitBranch className="w-4 h-4 text-soc-muted" />
          <span className="text-white font-semibold truncate hover:text-soc-accent cursor-pointer flex items-center group">
            {threat.repo}
            <ExternalLink className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-soc-muted">
          <User className="w-4 h-4" />
          <span className="truncate">{threat.author}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm font-mono text-soc-muted/80 bg-black/20 p-1.5 rounded">
          <FileCode className="w-4 h-4" />
          <span className="truncate">{threat.filePath || threat.file}:{threat.line}</span>
        </div>
      </div>

      {/* Bottom Row */}
      {threat.commit && <a className="text-xs text-soc-info font-mono" href={`https://github.com/${threat.repo}/commit/${threat.commit}`} target="_blank" rel="noopener noreferrer">Commit {threat.commit.slice(0, 7)}</a>}
      {threat.source === 'simulation' && <span className="ml-3 text-xs text-soc-warning">Demo data</span>}
      {threat.alertStatus && <span className="ml-3 text-xs text-soc-muted">Alert: {threat.alertStatus}</span>}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
        <div className="flex-1 mr-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-soc-muted">Shannon Entropy</span>
            <span className="font-mono text-white">{threat.entropy?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${isCritical ? 'bg-soc-danger' : 'bg-soc-warning'} transition-all duration-1000`}
              style={{ width: `${entropyRatio}%` }}
            />
          </div>
        </div>
        
        {threat.prUrl && (
          <a 
            href={threat.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-soc-accent/20 text-soc-accent border border-soc-accent/30 rounded text-xs font-bold hover:bg-soc-accent/30 transition-colors flex items-center space-x-1"
          >
            <GitBranch className="w-3 h-3" />
            <span>PR Created</span>
          </a>
        )}
      </div>
    </div>
  );
}
