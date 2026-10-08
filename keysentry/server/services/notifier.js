import axios from 'axios';
import { getDb } from './db.js';

function webhook(channel) {
  return getDb().data.config?.[`${channel}Webhook`] || process.env[`${channel.toUpperCase()}_WEBHOOK_URL`];
}

export async function sendDiscordAlert(threat) {
  const webhookUrl = webhook('discord');
  if (!webhookUrl) return;

  const color = threat.severity === 'Critical' ? 0xFF0000 : 0xFF8C00;
  
  const embed = {
    title: `🚨 Secret Leak Detected — ${threat.keyType}`,
    color: color,
    fields: [
      { name: 'Repository', value: threat.repo || 'Unknown', inline: true },
      { name: 'Commit', value: threat.commit || 'Unknown', inline: true },
      { name: 'Author', value: threat.author || 'Unknown', inline: true },
      { name: 'File', value: threat.filePath || 'Unknown', inline: true },
      { name: 'Line', value: threat.line ? threat.line.toString() : 'Unknown', inline: true },
      { name: 'Entropy', value: `${threat.entropy.toFixed(2)} 📊`, inline: true },
      { name: 'Severity', value: threat.severity || 'Unknown', inline: true },
      { name: 'Remediation Status', value: threat.status || 'Pending', inline: true }
    ],
    footer: {
      text: 'KeySentry — API Key Leakage Monitor'
    },
    timestamp: new Date().toISOString()
  };

  try {
    await axios.post(webhookUrl, { embeds: [embed] }, { timeout: 10000 });
  } catch (error) {
    console.error('Failed to send Discord alert:', error.message);
    throw error;
  }
}

export async function sendSlackAlert(threat) {
  const webhookUrl = webhook('slack');
  if (!webhookUrl) return;

  const severityEmoji = threat.severity === 'Critical' ? '🔴' : '🟠';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} Secret Leak Detected — ${threat.keyType}`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Repository:*\n${threat.repo || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Commit:*\n${threat.commit || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Author:*\n${threat.author || 'Unknown'}` },
          { type: 'mrkdwn', text: `*File:*\n${threat.filePath || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Line:*\n${threat.line || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Entropy:*\n${threat.entropy.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Severity:*\n${threat.severity || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Status:*\n${threat.status || 'Pending'}` }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: `KeySentry Alert | ${new Date().toISOString()}`
          }
        ]
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 10000 });
  } catch (error) {
    console.error('Failed to send Slack alert:', error.message);
    throw error;
  }
}

export async function dispatchAlerts(threat) {
  const promises = [];
  if (webhook('discord')) promises.push(sendDiscordAlert(threat));
  if (webhook('slack')) promises.push(sendSlackAlert(threat));
  
  if (promises.length === 0) return { status: 'unconfigured' };
  
  const results = await Promise.allSettled(promises);
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.error('Alert dispatch failed:', result.reason?.message);
    }
  });
  return { status: results.every(result => result.status === 'fulfilled') ? 'sent' : 'failed' };
}
