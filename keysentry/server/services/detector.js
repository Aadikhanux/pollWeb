import { getDb } from './db.js';

export function computeShannonEntropy(str) {
  if (!str) return 0;
  const len = str.length;
  const frequencies = {};
  for (let i = 0; i < len; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  let entropy = 0;
  for (const key in frequencies) {
    const p = frequencies[key] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export const REGEX_PATTERNS = [
  { name: 'OpenAI', pattern: /sk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{48,}/g, severity: 'Critical' },
  { name: 'GitHub Fine-grained PAT', pattern: /github_pat_[a-zA-Z0-9_]{60,}/g, severity: 'Critical' },
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'Critical' },
  { name: 'GitHub PAT', pattern: /ghp_[a-zA-Z0-9]{36}/g, severity: 'Critical' },
  { name: 'Stripe Secret', pattern: /sk_live_[0-9a-zA-Z]{24}/g, severity: 'Critical' },
  { name: 'Google/Gemini', pattern: /AIzaSy[A-Za-z0-9_-]{33}/g, severity: 'High' },
  { name: 'Generic Token', pattern: /(?:api_key|token|secret)\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]/gi, severity: 'High' }
];

export function isFalsePositive(match, filePath) {
  if (/^[0-9a-f]{40}$/i.test(match)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match)) return true;
  
  const lowerMatch = match.toLowerCase();
  const falsePositiveKeywords = ['dummy', 'test', 'example', 'your_', 'xxx', 'placeholder', 'sample'];
  if (falsePositiveKeywords.some(kw => lowerMatch.includes(kw))) return true;

  if (filePath) {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('package-lock.json') || 
      /(^|\/)dist\//.test(lowerPath) ||
        lowerPath.endsWith('.min.js') || 
        lowerPath.includes('node_modules/') || 
        lowerPath.endsWith('.map')) {
      return true;
    }
  }
  
  return false;
}

export function scanContent(content, filePath, includeRaw = false) {
  if (!content) return [];
  const findings = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineContent = lines[i];
    for (const { name, pattern, severity } of REGEX_PATTERNS) {
      const localPattern = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = localPattern.exec(lineContent)) !== null) {
        const secretCandidate = match[1] || match[0];
        
        if (isFalsePositive(secretCandidate, filePath)) continue;
        
        const entropy = computeShannonEntropy(secretCandidate);
        
        let db;
        try { db = getDb(); } catch (e) {}
        
        const criticalThreshold = db?.data?.config?.criticalEntropyThreshold || 4.5;
        const highThreshold = db?.data?.config?.entropyThreshold || 3.8;
        
        let finalSeverity = null;
        if (entropy >= criticalThreshold) finalSeverity = 'Critical';
        else if (entropy >= highThreshold) finalSeverity = 'High';
        
        if (finalSeverity) {
          findings.push({
            ...(includeRaw ? { rawSecret: secretCandidate } : {}),
            keyType: name,
            match: secretCandidate.substring(0, 8) + '***',
            severity: finalSeverity,
            entropy,
            line: i + 1,
            filePath
          });
        }
      }
    }
  }
  
  return findings;
}
