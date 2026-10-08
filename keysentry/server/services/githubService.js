import { Octokit } from '@octokit/rest';
import { scanContent } from './detector.js';
import { getDb } from './db.js';
import { autoRemediateCommit } from './remediator.js';
import { dispatchAlerts } from './notifier.js';
import crypto from 'crypto';

let processing = Promise.resolve();

export async function fetchFileContent(owner, repo, path, ref) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref
    });
    if (response.data && response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    }
    throw new Error('File content unavailable');
  } catch (error) {
    console.error(`Error fetching file content for ${owner}/${repo}/${path} at ${ref}: ${error.message}`);
    throw error;
  }
}

export function processWebhookPush(payload, io) {
  const task = processing.then(() => processPush(payload, io));
  processing = task.catch(() => {});
  return task;
}

async function processPush(payload, io) {
  const findings = [];
  const db = getDb();
  const repoFullName = payload.repository.full_name;
  const [owner, repo] = repoFullName.split('/');
  
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.pdf'];

  for (const commit of (payload.commits || [])) {
    db.data.processedCommits ||= [];
    const commitKey = `${repoFullName}:${commit.id}`;
    if (db.data.processedCommits.includes(commitKey)) continue;
    const filesToScan = [...(commit.added || []), ...(commit.modified || [])];
    
    for (const filePath of filesToScan) {
      if (binaryExtensions.some(ext => filePath.toLowerCase().endsWith(ext))) continue;
      
      const startTime = Date.now();
      const content = await fetchFileContent(owner, repo, filePath, commit.id);
      if (!content) continue;
      
      const fileFindings = scanContent(content, filePath);
      
      for (const finding of fileFindings) {
        const latency = Date.now() - startTime;
        const threat = {
          ...finding,
          id: crypto.randomUUID(),
          source: 'github',
          repo: repoFullName,
          commit: commit.id,
          author: commit.author ? commit.author.name : 'Unknown',
          latencyMs: latency,
          timestamp: new Date().toISOString(),
          status: 'Open'
        };
        if (db.data.threats.some(t => t.repo === repoFullName && t.commit === commit.id && t.filePath === filePath && t.line === finding.line && t.keyType === finding.keyType)) continue;
        
        db.data.threats.push(threat);
        db.data.stats.totalLatencyMs += latency;
        db.data.stats.avgLatencyMs = db.data.stats.totalLatencyMs / db.data.threats.filter(t => t.source !== 'simulation').length;
        
        db.data.stats.compromisedRepos = new Set(db.data.threats.map(t => t.repo)).size;
        
        await db.write();
        findings.push(threat);
        if (io) {
          io.emit('new-threat', threat);
        }
        
        // Dispatch external alerts asynchronously
        dispatchAlerts(threat).then(async result => {
          threat.alertStatus = result.status;
          await db.write();
          io?.emit('threat-update', threat);
        }).catch(err => console.error(err));
        
        // Trigger auto-remediation if Critical/High and enabled
        if (db.data.config?.autoRemediate === true && process.env.ENABLE_AUTO_REMEDIATION === 'true') {
          const rawFinding = scanContent(content, filePath, true).find(f => f.line === finding.line && f.keyType === finding.keyType);
          autoRemediateCommit(repoFullName, filePath, payload.ref?.replace('refs/heads/', '') || payload.repository.default_branch || 'main', rawFinding?.rawSecret, finding.keyType)
            .then(prResult => {
               if (prResult) { threat.prUrl = prResult.prUrl; db.write().catch(console.error); }
               if (prResult && io) {
                 io.emit('pr-created', {
                   repo: repoFullName,
                   branch: prResult.branch,
                   number: prResult.prNumber,
                   url: prResult.prUrl
                 });
               }
            })
            .catch(err => console.error(err));
        }
      }
    }
    db.data.processedCommits.push(commitKey);
    db.data.stats.scannedCommits += 1;
    await db.write();
    io?.emit('stats-update', db.data.stats);
  }
  
  return findings;
}

export async function startPollingWorker(io, intervalMs = 15000) {
  const lastSeenSha = new Map(Object.entries(getDb().data.pollingCursors || {}));
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
    const db = getDb();
    
    // Read from DB config, fallback to ENV for backwards compat
    let watchedRepos = db.data.config?.watchedRepos || [];
    if (watchedRepos.length === 0 && process.env.WATCHED_REPOS) {
      watchedRepos = process.env.WATCHED_REPOS.split(',').map(r => r.trim()).filter(r => r);
    }
    
    for (const repoFullName of watchedRepos) {
      const [owner, repo] = repoFullName.split('/');
      if (!owner || !repo) continue;
      
      try {
        const previousSha = lastSeenSha.get(repoFullName);
        const commits = [];
        for (let page = 1; ; page++) {
          const { data: batch } = await octokit.repos.listCommits({ owner, repo, per_page: 100, page });
          commits.push(...batch);
          if (!previousSha || batch.some(c => c.sha === previousSha) || batch.length < 100) break;
        }
        
        if (commits.length === 0) continue;
        
        const latestSha = commits[0].sha;
        
        if (previousSha !== latestSha) {
          const newCommits = [];
          for (const c of commits) {
            if (!previousSha && newCommits.length === 1) break;
            if (c.sha === previousSha) break;
            
            const { data: commitDetail } = await octokit.repos.getCommit({
              owner, repo, ref: c.sha
            });
            
            newCommits.push({
              id: commitDetail.sha,
              author: commitDetail.commit.author,
              added: commitDetail.files.filter(f => f.status === 'added').map(f => f.filename),
              modified: commitDetail.files.filter(f => f.status === 'modified').map(f => f.filename)
            });
          }
          
          if (newCommits.length > 0) {
            const payload = {
              repository: { full_name: repoFullName },
              commits: newCommits.reverse()
            };
            await processWebhookPush(payload, io);
          }
        }
        
        lastSeenSha.set(repoFullName, latestSha);
        db.data.pollingCursors ||= {};
        db.data.pollingCursors[repoFullName] = latestSha;
        await db.write();
        
      } catch (error) {
        console.error(`Error polling repository ${repoFullName}: ${error.message}`);
      }
    }
    } finally { busy = false; }
  };
  poll().catch(console.error);
  return setInterval(() => poll().catch(console.error), intervalMs);
}
