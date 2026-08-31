import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';
import Docker from 'dockerode';
import express from 'express';
import yaml from 'js-yaml';
import multer from 'multer';
import tar from 'tar-stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const skillsDir = path.join(dataDir, 'skills');
const conversationsDir = path.join(dataDir, 'conversations');
const port = Number(process.env.PORT || 3000);
const maxUploadBytes = Number(process.env.MAX_SKILL_UPLOAD_BYTES || 20 * 1024 * 1024);
const containerImage = process.env.SANDBOX_IMAGE || 'node:22-alpine';
const containerTtlMs = Number(process.env.CONVERSATION_TTL_MS || 24 * 60 * 60 * 1000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 } });

await Promise.all([
  fs.mkdir(skillsDir, { recursive: true }),
  fs.mkdir(conversationsDir, { recursive: true })
]);

const app = express();
app.use(express.json({ limit: '2mb' }));

const requireAdmin = (request, response, next) => {
  const expected = process.env.SKILLS_ADMIN_TOKEN;
  if (!expected) return next();
  const supplied = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  const suppliedBuffer = Buffer.from(supplied || '');
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return next();
  response.status(401).json({ error: '上传或删除 Skill 需要管理员令牌。' });
};

const safeId = value => {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw Object.assign(new Error('ID 只能包含小写字母、数字、点、下划线和连字符。'), { status: 400 });
  }
  return id;
};

const parseSkill = raw => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const data = match ? yaml.load(match[1]) || {} : {};
  return { data, body: (match ? match[2] : raw).trim() };
};

const readSkill = async id => {
  const skillId = safeId(id);
  const directory = path.join(skillsDir, skillId);
  const raw = await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8');
  const { data, body } = parseSkill(raw);
  const assets = [];
  for (const group of ['references', 'templates', 'scripts']) {
    const folder = path.join(directory, group);
    try {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (entry.isFile()) assets.push(`${group}/${entry.name}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return {
    id: skillId,
    name: typeof data.name === 'string' ? data.name : skillId,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    body,
    assets: assets.sort(),
    source: 'uploaded'
  };
};

const listUploadedSkills = async () => {
  const result = [];
  for (const entry of await fs.readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const skill = await readSkill(entry.name);
      result.push({ ...skill, body: undefined });
    } catch {
      // Ignore incomplete folders left by an interrupted upload.
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
};

const copyBundledSkills = async () => {
  const bundled = path.join(rootDir, 'skills');
  try {
    for (const entry of await fs.readdir(bundled, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(skillsDir, entry.name);
      try {
        await fs.access(target);
      } catch {
        await fs.cp(path.join(bundled, entry.name), target, { recursive: true });
      }
    }
  } catch {
    // Production images may deliberately contain only uploaded skills.
  }
};
await copyBundledSkills();

const dockerOptions = () => {
  const host = process.env.DOCKER_HOST;
  if (!host) return { socketPath: '/var/run/docker.sock' };
  const url = new URL(host);
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 2376 : 2375))
  };
};

let docker;
let dockerAvailable = false;
let imageReady;
try {
  docker = new Docker(dockerOptions());
  await docker.ping();
  dockerAvailable = true;
} catch {
  dockerAvailable = false;
}

const runtimeMode = () => (dockerAvailable ? 'container' : 'workspace');
const conversationPath = id => path.join(conversationsDir, safeId(id));
const metadataPath = id => path.join(conversationPath(id), 'conversation.json');

const cleanupExpiredContainers = async () => {
  if (!dockerAvailable) return;
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ['ues-agent.managed=true'] }
  });
  await Promise.all(containers.map(async info => {
    const expiresAt = Number(info.Labels?.['ues-agent.expires-at'] || 0);
    if (expiresAt && expiresAt < Date.now()) {
      await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
    }
  }));
};
void cleanupExpiredContainers();
setInterval(() => void cleanupExpiredContainers(), 60 * 60 * 1000).unref();

const loadConversation = async id => {
  try {
    return JSON.parse(await fs.readFile(metadataPath(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('对话不存在。'), { status: 404 });
    throw error;
  }
};

const saveConversation = async conversation => {
  await fs.mkdir(conversationPath(conversation.id), { recursive: true });
  await fs.writeFile(metadataPath(conversation.id), JSON.stringify(conversation, null, 2));
};

const ensureSandboxImage = async () => {
  if (!dockerAvailable) return;
  if (!imageReady) {
    imageReady = (async () => {
      try {
        await docker.getImage(containerImage).inspect();
      } catch {
        const stream = await docker.pull(containerImage);
        await new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, error => error ? reject(error) : resolve());
        });
      }
    })();
  }
  return imageReady;
};

const createTar = async (source, rootName) => {
  const pack = tar.pack();
  const walk = async (directory, prefix = rootName) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else {
        const content = await fs.readFile(absolute);
        pack.entry({ name: relative, mode: 0o644 }, content);
      }
    }
  };
  await walk(source);
  pack.finalize();
  return pack;
};

const ensureContainer = async conversation => {
  if (!dockerAvailable) return conversation;
  if (conversation.containerId) {
    try {
      const existing = docker.getContainer(conversation.containerId);
      const info = await existing.inspect();
      if (!info.State.Running) await existing.start();
      return conversation;
    } catch {
      conversation.containerId = undefined;
    }
  }
  await ensureSandboxImage();
  const container = await docker.createContainer({
    Image: containerImage,
    Cmd: ['sh', '-c', 'mkdir -p /workspace/skills && exec tail -f /dev/null'],
    WorkingDir: '/workspace',
    Labels: {
      'ues-agent.managed': 'true',
      'ues-agent.conversation': conversation.id,
      'ues-agent.expires-at': String(Date.now() + containerTtlMs)
    },
    HostConfig: {
      AutoRemove: false,
      NetworkMode: 'none',
      Memory: Number(process.env.SANDBOX_MEMORY_BYTES || 256 * 1024 * 1024),
      NanoCpus: Number(process.env.SANDBOX_NANO_CPUS || 500_000_000),
      PidsLimit: 128,
      ReadonlyRootfs: false,
      SecurityOpt: ['no-new-privileges']
    }
  });
  await container.start();
  conversation.containerId = container.id;
  await saveConversation(conversation);
  return conversation;
};

const installSkillIntoConversation = async (conversation, skillId) => {
  const id = safeId(skillId);
  const source = path.join(skillsDir, id);
  await fs.access(path.join(source, 'SKILL.md'));
  const target = path.join(conversationPath(conversation.id), 'skills', id);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
  if (dockerAvailable && conversation.containerId) {
    const archive = await createTar(source, id);
    await docker.getContainer(conversation.containerId).putArchive(archive, {
      path: '/workspace/skills',
      noOverwriteDirNonDir: true
    });
  }
  conversation.skills = [...new Set([...(conversation.skills || []), id])];
  conversation.updatedAt = new Date().toISOString();
  await saveConversation(conversation);
};

const extractZip = async buffer => {
  const zip = new AdmZip(buffer);
  const files = zip.getEntries().filter(entry => !entry.isDirectory);
  if (!files.length || files.length > 500) throw Object.assign(new Error('技能压缩包为空或文件过多。'), { status: 400 });
  const skillEntry = files.find(entry => /(^|\/)SKILL\.md$/i.test(entry.entryName));
  if (!skillEntry) throw Object.assign(new Error('压缩包中缺少 SKILL.md。'), { status: 400 });
  const prefix = skillEntry.entryName.slice(0, -'SKILL.md'.length);
  const raw = skillEntry.getData().toString('utf8');
  const { data } = parseSkill(raw);
  const inferred = prefix.split('/').filter(Boolean).at(-1);
  const id = safeId(typeof data.name === 'string' ? data.name : inferred);
  const target = path.join(skillsDir, id);
  const temporary = `${target}.upload-${crypto.randomUUID()}`;
  await fs.mkdir(temporary, { recursive: true });
  let total = 0;
  try {
    for (const entry of files) {
      if (!entry.entryName.startsWith(prefix)) continue;
      const relative = entry.entryName.slice(prefix.length).replaceAll('\\', '/');
      if (!relative || relative.split('/').some(part => part === '..' || part === '')) continue;
      const content = entry.getData();
      total += content.length;
      if (total > maxUploadBytes * 2) throw Object.assign(new Error('解压后的技能包过大。'), { status: 413 });
      const destination = path.resolve(temporary, relative);
      if (!destination.startsWith(`${path.resolve(temporary)}${path.sep}`)) {
        throw Object.assign(new Error('技能包包含不安全路径。'), { status: 400 });
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content);
    }
    await fs.access(path.join(temporary, 'SKILL.md'));
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return readSkill(id);
};

const callModelResponse = async (messages, options = {}) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw Object.assign(new Error('服务端尚未配置 DEEPSEEK_API_KEY。'), { status: 503 });
  const base = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages,
      temperature: options.temperature ?? 0.3,
      response_format: options.json ? { type: 'json_object' } : undefined,
      tools: options.tools
    })
  });
  if (!response.ok) throw Object.assign(new Error(`模型调用失败 (${response.status})：${(await response.text()).slice(0, 500)}`), { status: 502 });
  const result = await response.json();
  const message = result?.choices?.[0]?.message;
  if (!message) throw Object.assign(new Error('模型未返回有效消息。'), { status: 502 });
  return message;
};

const callModel = async (messages, options = {}) => {
  const message = await callModelResponse(messages, options);
  const content = message.content;
  if (typeof content !== 'string') throw Object.assign(new Error('模型未返回有效内容。'), { status: 502 });
  return content;
};

const safeSkillAssetPath = (skillId, relativePath) => {
  const id = safeId(skillId);
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => part === '..' || !part)) {
    throw Object.assign(new Error('资源路径不安全。'), { status: 400 });
  }
  const root = path.resolve(skillsDir, id);
  const destination = path.resolve(root, normalized);
  if (!destination.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error('资源路径超出技能目录。'), { status: 400 });
  }
  return destination;
};

const runContainerCommand = async (conversation, command) => {
  if (!dockerAvailable || !conversation.containerId) {
    return { error: '当前为工作区降级模式，禁止执行 Skill 脚本。请连接 Docker Engine 后重试。' };
  }
  const container = docker.getContainer(conversation.containerId);
  const exec = await container.exec({
    Cmd: ['timeout', '-s', 'KILL', '20', 'sh', '-lc', String(command).slice(0, 4000)],
    WorkingDir: '/workspace',
    AttachStdout: true,
    AttachStderr: true
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      if (chunks.reduce((sum, item) => sum + item.length, 0) < 64 * 1024) chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').slice(0, 64 * 1024)));
    stream.on('error', reject);
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve('命令执行超过 20 秒，已停止等待输出。'), 20_000));
  return { output: await Promise.race([output, timeout]) };
};

const runSkillAgent = async ({ conversation, selected, messages, trace }) => {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'read_skill_file',
        description: '读取当前 Skill 的 references、templates 或 scripts 文件。仅在完成任务确实需要时调用。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '相对 Skill 根目录的路径，例如 references/guide.md' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: '在当前对话的独立容器中执行 Skill 所需的短命令。工作区降级模式会拒绝执行。',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '在 /workspace 中运行的 shell 命令' }
          },
          required: ['command']
        }
      }
    }
  ];
  const modelMessages = [
    {
      role: 'system',
      content: [
        '你运行在每个对话独立的工作空间中。严格遵循下面已选技能的说明完成用户请求。',
        '资源采用渐进式加载：仅在确实需要时调用 read_skill_file；不要声称读取了未调用的文件。',
        '仅当 Skill 明确要求脚本或命令时使用 run_command。不得尝试访问凭据、网络或技能目录以外的数据。',
        `可用资源：${selected.assets.join(', ') || '无'}`,
        `\n# Skill: ${selected.name}\n${selected.body}`
      ].join('\n')
    },
    ...messages.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || '').slice(0, 100_000)
    }))
  ];

  for (let turn = 0; turn < 8; turn += 1) {
    const assistant = await callModelResponse(modelMessages, { tools });
    modelMessages.push(assistant);
    if (!assistant.tool_calls?.length) {
      if (typeof assistant.content !== 'string') throw Object.assign(new Error('模型未返回最终答复。'), { status: 502 });
      return assistant.content;
    }
    for (const call of assistant.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        if (call.function?.name === 'read_skill_file') {
          if (!selected.assets.includes(args.path)) throw new Error('该文件不在当前 Skill 的资源清单中。');
          const content = await fs.readFile(safeSkillAssetPath(selected.id, args.path), 'utf8');
          result = { path: args.path, content: content.slice(0, 100_000) };
          trace.push({ step: 'resource', detail: `按需读取 ${selected.id}/${args.path}` });
        } else if (call.function?.name === 'run_command') {
          result = await runContainerCommand(conversation, args.command);
          trace.push({ step: 'execute', detail: `在对话运行环境执行命令：${String(args.command).slice(0, 120)}` });
        } else {
          result = { error: '未知工具。' };
        }
      } catch (error) {
        result = { error: error.message };
      }
      modelMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
  }
  throw Object.assign(new Error('Skill 工具调用轮次过多，已停止。'), { status: 502 });
};

const chooseSkill = async (skills, messages) => {
  if (skills.length === 1) return skills[0].id;
  const catalog = skills.map(skill => ({ id: skill.id, name: skill.name, description: skill.description }));
  const raw = await callModel([
    {
      role: 'system',
      content: `你是技能路由器。只根据技能元数据选择最适合当前请求的技能。返回 JSON：{"skillId":"...","reason":"..."}。可选技能：${JSON.stringify(catalog)}`
    },
    ...messages.slice(-4)
  ], { json: true, temperature: 0 });
  const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
  return skills.some(skill => skill.id === parsed.skillId) ? parsed.skillId : skills[0].id;
};

app.get('/api/health', (_request, response) => response.json({ ok: true, runtime: runtimeMode() }));
app.get('/api/runtime', (_request, response) => response.json({
  mode: runtimeMode(),
  containerImage: dockerAvailable ? containerImage : undefined,
  isolated: dockerAvailable,
  note: dockerAvailable
    ? '每个对话使用独立、无网络的 Docker 容器。'
    : '未连接 Docker Engine；每个对话使用独立服务端工作区，但不具备容器级安全隔离。'
}));
app.get('/api/skills', async (_request, response, next) => {
  try { response.json({ skills: await listUploadedSkills() }); } catch (error) { next(error); }
});
app.post('/api/skills', requireAdmin, upload.single('skill'), async (request, response, next) => {
  try {
    if (!request.file) throw Object.assign(new Error('请选择一个 ZIP 技能包。'), { status: 400 });
    if (!/\.zip$/i.test(request.file.originalname)) throw Object.assign(new Error('目前仅支持 ZIP 技能包。'), { status: 400 });
    const skill = await extractZip(request.file.buffer);
    response.status(201).json({ skill: { ...skill, body: undefined } });
  } catch (error) { next(error); }
});
app.delete('/api/skills/:id', requireAdmin, async (request, response, next) => {
  try {
    const id = safeId(request.params.id);
    await fs.rm(path.join(skillsDir, id), { recursive: true, force: true });
    response.status(204).end();
  } catch (error) { next(error); }
});
app.post('/api/conversations', async (request, response, next) => {
  try {
    const id = request.body?.id ? safeId(request.body.id) : `chat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let conversation;
    try {
      conversation = await loadConversation(id);
    } catch (error) {
      if (error.status !== 404) throw error;
      conversation = { id, skills: [], createdAt: now, updatedAt: now, runtime: runtimeMode() };
      await saveConversation(conversation);
    }
    await ensureContainer(conversation);
    response.status(201).json({ conversation: { ...conversation, runtime: runtimeMode() } });
  } catch (error) { next(error); }
});
app.get('/api/conversations/:id', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    response.json({ conversation: { ...conversation, runtime: runtimeMode() } });
  } catch (error) { next(error); }
});
app.post('/api/conversations/:id/skills/:skillId', async (request, response, next) => {
  try {
    const conversation = await ensureContainer(await loadConversation(request.params.id));
    await installSkillIntoConversation(conversation, request.params.skillId);
    response.json({ conversation: { ...conversation, runtime: runtimeMode() } });
  } catch (error) { next(error); }
});
app.post('/api/conversations/:id/chat', async (request, response, next) => {
  try {
    const conversation = await ensureContainer(await loadConversation(request.params.id));
    const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
    if (!messages.length) throw Object.assign(new Error('消息不能为空。'), { status: 400 });
    const installed = await Promise.all((conversation.skills || []).map(readSkill));
    if (!installed.length) throw Object.assign(new Error('请先为当前对话启用至少一个技能。'), { status: 400 });
    const selectedId = request.body?.skillId && installed.some(skill => skill.id === request.body.skillId)
      ? request.body.skillId
      : await chooseSkill(installed, messages);
    const selected = installed.find(skill => skill.id === selectedId);
    const trace = [
      { step: 'discover', detail: `读取 ${installed.length} 个技能的 name / description 元数据` },
      { step: 'select', detail: `选择 ${selected.name}（${selected.id}）` },
      { step: 'load', detail: `按需加载 ${selected.id}/SKILL.md` }
    ];
    const answer = await runSkillAgent({ conversation, selected, messages, trace });
    conversation.updatedAt = new Date().toISOString();
    await saveConversation(conversation);
    response.json({ message: { role: 'assistant', content: answer }, skill: selectedId, trace, runtime: runtimeMode() });
  } catch (error) { next(error); }
});
app.delete('/api/conversations/:id', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    if (dockerAvailable && conversation.containerId) {
      await docker.getContainer(conversation.containerId).remove({ force: true }).catch(() => {});
    }
    await fs.rm(conversationPath(conversation.id), { recursive: true, force: true });
    response.status(204).end();
  } catch (error) { next(error); }
});

const distDir = path.join(rootDir, 'dist');
app.use(express.static(distDir));
app.use(async (request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  try { response.sendFile(path.join(distDir, 'index.html')); } catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({ error: error.message || '服务器内部错误。' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`UES Agent listening on :${port}; conversation runtime=${runtimeMode()}`);
});
