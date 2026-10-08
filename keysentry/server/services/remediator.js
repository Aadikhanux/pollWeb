import { Octokit } from '@octokit/rest';

export async function autoRemediateCommit(repoFullName, filePath, branch = 'main', secretString, keyType) {
  try {
    if (!secretString || secretString.includes('***')) throw new Error('A complete secret is required for remediation');
    const [owner, repo] = repoFullName.split('/');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    
    const baseSha = refData.object.sha;
    const newBranchName = `fix/keysentry-redact-${Date.now()}`;
    
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranchName}`,
      sha: baseSha
    });
    
    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: newBranchName
    });
    
    const originalContent = Buffer.from(fileData.content, 'base64').toString('utf8');
    if (!originalContent.includes(secretString)) throw new Error('Secret no longer present in target branch');
    const envVarName = `process.env.${keyType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`;
    const newContent = originalContent.split(secretString).join('${' + envVarName.replace('process.env.', '') + '}');
    
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `🔒 KeySentry: Redact exposed ${keyType} secret in ${filePath}`,
      content: Buffer.from(newContent).toString('base64'),
      sha: fileData.sha,
      branch: newBranchName
    });
    
    let envExampleSha;
    let envExampleContent = '';
    try {
      const { data: envData } = await octokit.repos.getContent({
        owner,
        repo,
        path: '.env.example',
        ref: newBranchName
      });
      envExampleSha = envData.sha;
      envExampleContent = Buffer.from(envData.content, 'base64').toString('utf8');
    } catch (e) {
    }
    
    const configKeyStr = `${keyType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY=YOUR_SECRET_HERE\n`;
    if (!envExampleContent.includes(configKeyStr.trim())) {
      const newEnvExampleContent = envExampleContent + (envExampleContent.endsWith('\n') || envExampleContent === '' ? '' : '\n') + configKeyStr;
      
      const updateParams = {
        owner,
        repo,
        path: '.env.example',
        message: `Create/update .env.example with ${keyType} placeholder`,
        content: Buffer.from(newEnvExampleContent).toString('base64'),
        branch: newBranchName
      };
      if (envExampleSha) updateParams.sha = envExampleSha;
      
      await octokit.repos.createOrUpdateFileContents(updateParams);
    }
    
    let gitignoreSha;
    let gitignoreContent = '';
    try {
      const { data: gitignoreData } = await octokit.repos.getContent({
        owner,
        repo,
        path: '.gitignore',
        ref: newBranchName
      });
      gitignoreSha = gitignoreData.sha;
      gitignoreContent = Buffer.from(gitignoreData.content, 'base64').toString('utf8');
    } catch (e) {
    }
    
    if (!gitignoreContent.includes('.env')) {
      const newGitignoreContent = gitignoreContent + (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') + '.env\n';
      const updateParams = {
        owner,
        repo,
        path: '.gitignore',
        message: 'Ensure .env is gitignored',
        content: Buffer.from(newGitignoreContent).toString('base64'),
        branch: newBranchName
      };
      if (gitignoreSha) updateParams.sha = gitignoreSha;
      
      await octokit.repos.createOrUpdateFileContents(updateParams);
    }
    
    const { data: prData } = await octokit.pulls.create({
      owner,
      repo,
      title: `🔒 KeySentry: Redact exposed ${keyType} secret`,
      head: newBranchName,
      base: branch,
      body: `### 🚨 Secret Exposure Detected\n\nKeySentry has identified a leaked \`${keyType}\` secret in \`${filePath}\`.\n\n**Remediation actions taken:**\n- Secret replaced with environment variable placeholder\n- Added placeholder to \`.env.example\`\n- Ensured \`.env\` is tracked in \`.gitignore\`\n\nPlease merge this PR immediately and rotate the exposed secret.`
    });
    
    return {
      prUrl: prData.html_url,
      prNumber: prData.number,
      branch: newBranchName
    };
    
  } catch (error) {
    console.error('Remediation failed:', error.message);
    return null;
  }
}
