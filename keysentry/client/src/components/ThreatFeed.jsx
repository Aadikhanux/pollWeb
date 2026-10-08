'use client';

import { Activity, Shield } from 'lucide-react';
import ThreatCard from './ThreatCard';

export default function ThreatFeed({ threats }) {
  return (
    <div className="glassmorphic h-[calc(100vh-12rem)] flex flex-col relative overflow-hidden scan-line">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20 backdrop-blur-md z-10">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-soc-danger" />
          <h2 className="text-lg font-bold text-white tracking-wide">Detection History <span className="text-soc-muted text-sm">({threats.length})</span></h2>
        </div>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-soc-danger opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-soc-danger"></span>
          </span>
          <span className="text-xs font-mono text-soc-muted uppercase">Monitoring</span>
        </div>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto p-4 z-10 scroll-smooth">
        {threats.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-soc-muted opacity-50 space-y-4 animate-fade-in">
            <Shield className="w-16 h-16 text-soc-muted/50" />
            <p className="font-mono text-sm">No threats detected. System monitoring...</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {threats.map((threat, idx) => (
              <ThreatCard key={threat.id || idx} threat={threat} index={idx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
