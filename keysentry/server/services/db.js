import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import { mkdir } from 'node:fs/promises';

let dbInstance = null;

const defaultData = {
  threats: [],
  stats: { scannedCommits: 0, compromisedRepos: 0, redactedSecrets: 0, avgLatencyMs: 0, totalLatencyMs: 0 },
  falsePositiveRules: [],
  repoConfigs: [],
  config: {
    entropyThreshold: 3.8,
    criticalEntropyThreshold: 4.5,
    autoRemediate: false,
    watchedRepos: [], // e.g. ['owner/repo']
    discordWebhook: '',
    slackWebhook: ''
  }
};

export async function initDb() {
  if (!dbInstance) {
    const dbPath = path.resolve(process.cwd(), 'data', 'db.json');
    await mkdir(path.dirname(dbPath), { recursive: true });
    dbInstance = await JSONFilePreset(dbPath, defaultData);
  }
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}
