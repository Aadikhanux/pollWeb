'use client';

import { Shield } from 'lucide-react';

export default function Header({ isConnected }) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glassmorphic z-50 rounded-none border-t-0 border-x-0 border-b-white/10 glow-green">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-soc-accent/10 rounded-lg">
            <Shield className="w-6 h-6 text-soc-accent" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
              KeySentry
            </h1>
            <span className="text-xs text-soc-muted font-mono uppercase tracking-wider">
              SOC Dashboard
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 bg-black/20 px-4 py-2 rounded-full border border-white/5">
          <div className="relative flex items-center justify-center w-3 h-3">
            {isConnected ? (
              <>
                <span className="absolute inline-flex w-full h-full rounded-full bg-soc-accent opacity-75 animate-ping"></span>
                <span className="relative inline-flex rounded-full w-2 h-2 bg-soc-accent"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full w-2 h-2 bg-soc-danger"></span>
            )}
          </div>
          <span className={`text-sm font-mono font-medium ${isConnected ? 'text-soc-accent' : 'text-soc-danger'}`}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
}
