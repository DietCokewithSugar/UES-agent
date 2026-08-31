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
const providerId = 'deepseek';
const deepseekBaseUrl = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const sandboxCreationTimes = [];
export const sandboxWorkdir = process.env.E2B_WORKDIR || '/home/user/ues-workspace';
export const sandboxOutputDir = `${sandboxWorkdir}/output`;
let credentialCheckCache;

const deepseekApiKey = () => {
  const raw = process.env.DEEPSEEK_API_KEY?.trim() || '';
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
};

const credentialFingerprint = key => {
  if (!key) return 'missing';
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
  return `sha256:${digest}…${key.slice(-4)}`;
};

export const validateDeepSeekCredential = async () => {
  const key = deepseekApiKey();
  if (!key) throw Object.assign(new Error('Render 尚未配置 DEEPSEEK_API_KEY。'), { status: 503 });
  const fingerprint = credentialFingerprint(key);
  if (
    credentialCheckCache?.fingerprint === fingerprint &&
    credentialCheckCache.expiresAt > Date.now()
  ) {
    return credentialCheckCache.result;
  }
  const response = await fetch(`${deepseekBaseUrl}/user/balance`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  if (response.status === 401 || response.status === 403) {
    throw Object.assign(
      new Error(`Render 中的 DeepSeek Key 未通过官方 API 验证（${fingerprint}）。请检查 Key 所属平台及环境变量值。`),
      { status: 502 }
    );
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(`DeepSeek 凭据自检失败 (${response.status})，请稍后重试。`),
      { status: 502 }
    );
  }
  const result = { ok: true, fingerprint };
  credentialCheckCache = { fingerprint, expiresAt: Date.now() + 5 * 60 * 1000, result };
  return result;
};

export const isE2BConfigured = () => Boolean(process.env.E2B_API_KEY);
export const runtimeMode = () => isE2BConfigured() ? 'e2b' : 'workspace';
export const getRuntimeInfo = () => ({
  mode: runtimeMode(),
  isolated: isE2BConfigured(),
  template: isE2BConfigured() ? template : undefined,
  model: `${providerId}/${modelId}`,
  credentialFingerprint: credentialFingerprint(deepseekApiKey()),
  note: isE2BConfigured()
    ? `每个对话使用独立 E2B「${template}」沙箱，由 OpenCode 调用 ${modelId}。`
    : '未配置 E2B_API_KEY；可以管理 Skills，但无法运行 OpenCode。'
});

const createSandbox = async conversation => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (sandboxCreationTimes.length && sandboxCreationTimes[0] < cutoff) sandboxCreationTimes.shift();
  const hourlyLimit = Number(process.env.E2B_SANDBOX_CREATE_LIMIT || 50);
  if (sandboxCreationTimes.length >= hourlyLimit) {
    throw Object.assign(new Error('E2B 沙箱创建已达到每小时安全上限。'), { status: 429 });
  }
  sandboxCreationTimes.push(Date.now());
  const credential = await validateDeepSeekCredential();
  const apiKey = deepseekApiKey();
  const deepseekHost = new URL(deepseekBaseUrl).hostname;
  const sandbox = await Sandbox.create(template, {
    timeoutMs,
    metadata: {
      app: 'ues-agent',
      conversationId: conversation.id
    },
    lifecycle: {
      onTimeout: 'kill'
    },
    network: {
      allowOut: [deepseekHost],
      denyOut: ({ allTraffic }) => [allTraffic]
    },
    envs: {
      DEEPSEEK_API_KEY: apiKey,
      DEEPSEEK_API_BASE_URL: deepseekBaseUrl,
      OPENCODE_DISABLE_MODELS_FETCH: '1'
    }
  });
  try {
    const sandboxCheck = await sandbox.commands.run(
      `node -e 'fetch(process.env.DEEPSEEK_API_BASE_URL + "/user/balance", {headers:{Authorization:"Bearer " + process.env.DEEPSEEK_API_KEY}}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)})'`,
      { timeoutMs: 20_000 }
    );
    if (sandboxCheck.stdout.trim() !== '200') throw new Error(`HTTP ${sandboxCheck.stdout.trim()}`);
  } catch (error) {
    await sandbox.kill().catch(() => {});
    throw Object.assign(
      new Error(`E2B 沙箱中的 DeepSeek Key 自检失败（Render 指纹 ${credential.fingerprint}）：${error.result?.stderr || error.message}`),
      { status: 502 }
    );
  }
  conversation.sandboxId = sandbox.sandboxId;
  conversation.openCodeSessionId = undefined;
  conversation.runtime = 'e2b';
  return { sandbox, created: true };
};

export const ensureSandbox = async conversation => {
  if (!isE2BConfigured()) return { sandbox: undefined, created: false };
  if (conversation.sandboxId) {
    let existing;
    try {
      existing = await Sandbox.connect(conversation.sandboxId);
      await existing.setTimeout(timeoutMs);
      return { sandbox: existing, created: false };
    } catch {
      await existing?.kill().catch(() => {});
      conversation.sandboxId = undefined;
      conversation.openCodeSessionId = undefined;
    }
  }
  return createSandbox(conversation);
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

export const configureSandbox = async sandbox => {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    model: `${providerId}/${modelId}`,
    small_model: `${providerId}/${modelId}`,
    provider: {
      [providerId]: {
        options: {
          baseURL: deepseekBaseUrl,
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
  await sandbox.commands.run(`mkdir -p '${sandboxWorkdir}/.opencode/skills' && cd '${sandboxWorkdir}' && git init -q`);
  await sandbox.files.write(`${sandboxWorkdir}/opencode.json`, JSON.stringify(config, null, 2));
  await sandbox.files.write(
    `${sandboxWorkdir}/AGENTS.md`,
    [
      '# UES OpenCode Runtime',
      '',
      'You work inside an isolated E2B sandbox for one conversation.',
      'Use the user-selected Agent Skill through the native skill tool before acting.',
      `Keep all generated files under ${sandboxOutputDir}.`,
      'Never print credentials, environment variables, or authentication headers.',
      'Do not attempt to bypass network or filesystem restrictions.'
    ].join('\n')
  );
  await sandbox.commands.run(`mkdir -p '${sandboxOutputDir}'`);
};

export const uploadSkill = async (sandbox, source, skillId) => {
  const remoteRoot = `${sandboxWorkdir}/.opencode/skills/${skillId}`;
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
  let result;
  try {
    result = await sandbox.commands.run(
      `cd '${sandboxWorkdir}' && opencode run --auto --format json --model '${providerId}/${modelId}' ${sessionArg} "$(cat '${promptPath}')"`,
      {
        timeoutMs: commandTimeoutMs,
        envs: {
          DEEPSEEK_API_KEY: deepseekApiKey(),
          DEEPSEEK_API_BASE_URL: deepseekBaseUrl,
          OPENCODE_MODEL: `${providerId}/${modelId}`
        }
      }
    );
  } catch (error) {
    const stdout = error.result?.stdout || '';
    if (stdout) {
      try {
        parseOpenCodeEvents(stdout);
      } catch (parsedError) {
        throw Object.assign(
          new Error(`OpenCode 调用失败：${parsedError.message}`),
          { status: parsedError.message.includes('Authentication') ? 401 : 502 }
        );
      }
    }
    const detail = error.result?.stderr || error.result?.error || error.message || '未知错误';
    throw Object.assign(new Error(`OpenCode 执行失败：${String(detail).slice(0, 2000)}`), { status: 502 });
  } finally {
    await sandbox.commands.run(`rm -f '${promptPath}'`).catch(() => {});
  }
  if (result.exitCode !== 0) {
    throw new Error(`OpenCode 执行失败：${(result.stderr || result.stdout || '').slice(0, 2000)}`);
  }
  const parsed = parseOpenCodeEvents(result.stdout);
  const outputList = await sandbox.commands.run(
    `find '${sandboxOutputDir}' -type f -printf '%P\\n' 2>/dev/null`
  );
  const artifacts = outputList.stdout
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 50);
  return { ...parsed, artifacts };
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
