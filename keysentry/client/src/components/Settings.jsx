'use client';

import { useEffect, useState } from 'react';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || '';
  useEffect(() => {
    fetch(`${url}/api/config`).then(response => {
      if (!response.ok) throw new Error('Settings unavailable');
      return response.json();
    }).then(setConfig).catch(error => setMessage(error.message));
  }, [url]);
  const save = async event => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch(`${url}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save settings');
      setMessage('Monitoring settings saved.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };
  return <details className="glassmorphic p-4 mb-5">
    <summary className="cursor-pointer text-white font-semibold">Monitoring settings</summary>
    {config && <form onSubmit={save} className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="text-sm text-soc-muted">Repositories (one per line)
        <textarea className="block w-full mt-1 bg-black/30 rounded border border-white/10 p-2 text-white" rows={3} value={config.watchedRepos.join('\n')} onChange={e => setConfig({ ...config, watchedRepos: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} placeholder="owner/repository" />
      </label>
      <div className="flex gap-4">
        {['entropyThreshold', 'criticalEntropyThreshold'].map(key => <label key={key} className="text-sm text-soc-muted">{key === 'entropyThreshold' ? 'High entropy' : 'Critical entropy'}<input type="number" min="0.1" max="8" step="0.1" required value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })} className="block w-full mt-1 bg-black/30 border border-white/10 rounded p-2 text-white" /></label>)}
      </div>
      {['discord', 'slack'].map(channel => <label key={channel} className="text-sm text-soc-muted capitalize">{channel} webhook URL<input type="password" autoComplete="off" value={config[`${channel}Webhook`]} onChange={e => setConfig({ ...config, [`${channel}Webhook`]: e.target.value })} className="block w-full mt-1 bg-black/30 border border-white/10 rounded p-2 text-white" placeholder="https://..." /></label>)}
      <p className="text-xs text-soc-muted">Alert URLs can also be supplied in the server environment. GitHub credentials and webhook signing secret are configured in server/.env.</p>
      <button disabled={saving} className="rounded bg-soc-accent/20 text-soc-accent py-2 disabled:opacity-50">{saving ? 'Saving...' : 'Save settings'}</button>
    </form>}
    {message && <p role="status" className="mt-3 text-sm text-soc-info">{message}</p>}
  </details>;
}
