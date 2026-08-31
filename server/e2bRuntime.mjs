import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Sandbox } from 'e2b';
import yaml from 'js-yaml';
import './env.mjs';

const template = process.env.E2B_TEMPLATE || 'opencode';
const timeoutMs = Math.min(
  Number(process.env.E2B_SANDBOX_TIMEOUT_MS || 30 * 60 * 1000),
  60 * 60 * 1000
);
const commandTimeoutMs = Number(process.env.OPENCODE_COMMAND_TIMEOUT_MS || 10 * 60 * 1000);
const modelId = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const providerId = 'ues-deepseek';

export const isE2BConfigured = () => Boolean(process.env.E2B_API_KEY);
export const runtimeMode = () => isE2BConfigured() ? 'e2b' : 'workspace';
export const getRuntimeInfo = () => ({
  mode: runtimeMode(),
  isolated: isE2BConfigured(),
  template: isE2BConfigured() ? template : undefined,
  model: `${providerId}/${modelId}`,
  note: isE2BConfigured()
    ? `每个对话使用独立 E2B「${template}」沙箱，由 OpenCode 调用 ${modelId}。`
    : '未配置 E2B_API_KEY；可以管理 Skills，但无法运行 OpenCode。'
});

const proxyBaseUrl = conversationId => {
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!publicBaseUrl) {
    throw Object.assign(
      new Error('E2B 模式需要配置 PUBLIC_BASE_URL（例如 https://your-app.onrender.com）。'),
      { status: 503 }
    );
  }
  return `${publicBaseUrl}/api/internal/deepseek/${encodeURIComponent(conversationId)}/v1`;
};

const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

const createSandbox = async conversation => {
  const proxyToken = crypto.randomBytes(32).toString('base64url');
  const sandbox = await Sandbox.create(template, {
    timeoutMs,
    metadata: {
      app: 'ues-agent',
      conversationId: conversation.id
    },
    lifecycle: {
      onTimeout: 'kill'
    },
    envs: {
      DEEPSEEK_API_KEY: proxyToken
    }
  });
  conversation.sandboxId = sandbox.sandboxId;
  conversation.sandboxTokenHash = tokenHash(proxyToken);
  conversation.sandboxTokenExpiresAt = new Date(Date.now() + timeoutMs).toISOString();
  conversation.openCodeSessionId = undefined;
  conversation.runtime = 'e2b';
  return { sandbox, created: true };
};

export const ensureSandbox = async conversation => {
  if (!isE2BConfigured()) return { sandbox: undefined, created: false };
  if (conversation.sandboxId) {
    try {
      const sandbox = await Sandbox.connect(conversation.sandboxId);
      await sandbox.setTimeout(timeoutMs);
      conversation.sandboxTokenExpiresAt = new Date(Date.now() + timeoutMs).toISOString();
      return { sandbox, created: false };
    } catch {
      conversation.sandboxId = undefined;
      conversation.openCodeSessionId = undefined;
    }
  }
  return createSandbox(conversation);
};

export const connectExistingSandbox = async conversation => {
  if (!isE2BConfigured() || !conversation.sandboxId) return undefined;
  try {
    return await Sandbox.connect(conversation.sandboxId);
  } catch {
    return undefined;
  }
};

const walkFiles = async (directory, prefix = '') => {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative));
    else if (entry.isFile()) files.push({ absolute, relative });
  }
  return files;
};

export const configureSandbox = async (sandbox, conversationId) => {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    model: `${providerId}/${modelId}`,
    small_model: `${providerId}/${modelId}`,
    provider: {
      [providerId]: {
        npm: '@ai-sdk/openai-compatible',
        name: 'DeepSeek via UES',
        options: {
          baseURL: proxyBaseUrl(conversationId),
          apiKey: '{env:DEEPSEEK_API_KEY}',
          timeout: commandTimeoutMs
        },
        models: {
          [modelId]: {
            name: 'DeepSeek V4 Flash'
          }
        }
      }
    },
    permission: {
      skill: 'allow',
      read: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      bash: 'allow',
      edit: 'allow',
      write: 'allow',
      external_directory: 'deny',
      webfetch: 'deny',
      websearch: 'deny'
    }
  };
  await sandbox.commands.run('mkdir -p /workspace/.opencode/skills && cd /workspace && git init -q');
  await sandbox.files.write('/workspace/opencode.json', JSON.stringify(config, null, 2));
  await sandbox.files.write(
    '/workspace/AGENTS.md',
    [
      '# UES OpenCode Runtime',
      '',
      'You work inside an isolated E2B sandbox for one conversation.',
      'Use the user-selected Agent Skill through the native skill tool before acting.',
      'Keep all generated files under /workspace/output.',
      'Never print credentials, environment variables, or authentication headers.',
      'Do not attempt to bypass network or filesystem restrictions.'
    ].join('\n')
  );
  await sandbox.commands.run('mkdir -p /workspace/output');
};

export const uploadSkill = async (sandbox, source, skillId) => {
  const remoteRoot = `/workspace/.opencode/skills/${skillId}`;
  await sandbox.commands.run(`rm -rf '${remoteRoot}' && mkdir -p '${remoteRoot}'`);
  for (const file of await walkFiles(source)) {
    const remotePath = path.posix.join(remoteRoot, file.relative);
    await sandbox.commands.run(`mkdir -p '${path.posix.dirname(remotePath)}'`);
    if (file.relative === 'SKILL.md') {
      const raw = await fs.readFile(file.absolute, 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
      const sourceMeta = match ? yaml.load(match[1]) || {} : {};
      const openCodeMeta = {
        name: skillId,
        description: typeof sourceMeta.description === 'string'
          ? sourceMeta.description.trim()
          : `Instructions for ${skillId}`
      };
      for (const field of ['license', 'compatibility', 'metadata']) {
        if (sourceMeta[field] !== undefined) openCodeMeta[field] = sourceMeta[field];
      }
      const normalized = `---\n${yaml.dump(openCodeMeta, { lineWidth: 100 })}---\n${match ? match[2] : raw}`;
      await sandbox.files.write(remotePath, normalized);
    } else {
      await sandbox.files.write(remotePath, await fs.readFile(file.absolute));
    }
  }
  await sandbox.commands.run(
    `if [ -d '${remoteRoot}/scripts' ]; then find '${remoteRoot}/scripts' -type f -exec chmod u+x {} +; fi`
  );
};

export const parseOpenCodeEvents = stdout => {
  const text = [];
  const tools = [];
  let sessionId;
  let error;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      sessionId ||= event.sessionID;
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        text.push(event.part.text);
      } else if (event.type === 'tool_use') {
        tools.push({
          name: event.part?.tool || 'tool',
          title: event.part?.state?.title,
          input: event.part?.state?.input
        });
      } else if (event.type === 'error') {
        error = event.error?.data?.message || event.error?.name || 'OpenCode 执行失败';
      }
    } catch {
      // OpenCode may emit a non-JSON diagnostic line; stderr is handled separately.
    }
  }
  if (error) throw new Error(error);
  if (!text.length) throw new Error('OpenCode 没有返回文本结果。');
  return { text: text.join('\n'), tools, sessionId };
};

export const runOpenCode = async (sandbox, conversation, skillId, prompt) => {
  const promptPath = `/tmp/ues-prompt-${crypto.randomUUID()}.txt`;
  const instruction = [
    `The user explicitly selected the Agent Skill "${skillId}".`,
    `First load it with the native skill tool: skill({ name: "${skillId}" }).`,
    'Follow that skill exactly. You may read its references/templates and run its scripts when needed.',
    'Return the final user-facing response in Chinese unless the user asks for another language.',
    '',
    'User request:',
    prompt
  ].join('\n');
  await sandbox.files.write(promptPath, instruction);
  const sessionArg = conversation.openCodeSessionId
    ? `--session '${conversation.openCodeSessionId}'`
    : `--title 'UES ${conversation.id}'`;
  const result = await sandbox.commands.run(
    `cd /workspace && opencode run --auto --format json --model '${providerId}/${modelId}' ${sessionArg} "$(cat '${promptPath}')"`,
    {
      timeoutMs: commandTimeoutMs,
      envs: {
        OPENCODE_MODEL: `${providerId}/${modelId}`
      }
    }
  );
  await sandbox.commands.run(`rm -f '${promptPath}'`).catch(() => {});
  if (result.exitCode !== 0) {
    throw new Error(`OpenCode 执行失败：${(result.stderr || result.stdout || '').slice(0, 2000)}`);
  }
  const parsed = parseOpenCodeEvents(result.stdout);
  const outputList = await sandbox.commands.run(
    "find /workspace/output -type f -printf '%P\\n' 2>/dev/null"
  );
  const artifacts = outputList.stdout
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 50);
  return { ...parsed, artifacts };
};

export const readOutputFile = async (sandbox, relativePath) => {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => !part || part === '..')) {
    throw Object.assign(new Error('输出文件路径不安全。'), { status: 400 });
  }
  return sandbox.files.read(`/workspace/output/${normalized}`, { format: 'bytes' });
};

export const destroySandbox = async conversation => {
  if (!conversation.sandboxId || !isE2BConfigured()) return;
  try {
    const sandbox = await Sandbox.connect(conversation.sandboxId);
    await sandbox.kill();
  } catch {
    // An expired sandbox is already destroyed.
  }
};

export const verifySandboxToken = (conversation, token) => {
  if (!conversation.sandboxTokenHash || !token || !conversation.sandboxTokenExpiresAt) return false;
  if (Date.parse(conversation.sandboxTokenExpiresAt) < Date.now()) return false;
  const supplied = Buffer.from(tokenHash(token));
  const expected = Buffer.from(conversation.sandboxTokenHash);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
