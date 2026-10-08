'use client';

import { useState } from 'react';
import { Crosshair, Loader2 } from 'lucide-react';

export default function SimulateButton({ onSimulate }) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try { setSuccess(Boolean(await onSimulate())); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="glassmorphic p-6 flex flex-col items-center justify-center text-center space-y-4 mb-6">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          relative w-full py-4 rounded-xl font-bold text-lg uppercase tracking-wider
          transition-all duration-300 transform
          ${isLoading 
            ? 'bg-soc-card border-soc-border text-soc-muted cursor-not-allowed scale-95' 
            : success
              ? 'bg-soc-accent/20 border-soc-accent text-soc-accent shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : 'bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-500/50 text-white hover:from-red-800/60 hover:to-orange-800/60 hover:border-red-400 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:-translate-y-1'
          }
          border-2 overflow-hidden group
        `}
      >
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative flex items-center justify-center space-x-2 z-10">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Crosshair className={`w-5 h-5 ${success ? 'text-soc-accent' : 'text-white/80 group-hover:text-white group-hover:animate-spin-slow'}`} />
          )}
          <span>{isLoading ? 'Injecting...' : success ? 'Payload Sent' : 'Simulate Attack'}</span>
        </div>
      </button>
      
      <p className="text-xs text-soc-muted font-mono bg-black/20 px-3 py-1.5 rounded-full border border-white/5">
        Local detector demo. No external alert or PR.
      </p>
    </div>
  );
}
