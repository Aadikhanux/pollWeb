'use client';

import { GitPullRequest, ExternalLink } from 'lucide-react';

export default function PRIndicator({ prs }) {
  return (
    <div className="glassmorphic flex flex-col h-[calc(100vh-25rem)] overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <GitPullRequest className="w-5 h-5 text-soc-accent" />
          <h3 className="font-bold text-white">Auto-Remediation</h3>
        </div>
        {prs.length > 0 && (
          <span className="bg-soc-accent/20 text-soc-accent text-xs font-bold px-2 py-0.5 rounded-full border border-soc-accent/30">
            {prs.length} Active
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {prs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-soc-muted opacity-60">
            <GitPullRequest className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm font-mono text-center">No active PRs</p>
          </div>
        ) : (
          prs.map((pr, idx) => (
            <div key={idx} className="bg-black/30 border border-soc-accent/20 rounded-lg p-3 hover:border-soc-accent/50 transition-colors group">
              <div className="flex items-start justify-between mb-2">
                <span className="text-soc-accent font-mono text-sm font-bold">#{pr.number || 'PR'}</span>
                <a 
                  href={pr.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-soc-muted hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="text-sm text-white font-medium truncate mb-1" title={pr.repo}>
                {pr.repo}
              </div>
              <div className="text-xs text-soc-muted font-mono truncate" title={pr.branch}>
                {pr.branch}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
