import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import yaml from 'js-yaml';
import multer from 'multer';
import {
  connectExistingSandbox,
  configureSandbox,
  destroySandbox,
  ensureSandbox,
  getRuntimeInfo,
  readOutputFile,
  runOpenCode,
  runtimeMode,
  uploadSkill,
  verifySandboxToken
} from './e2bRuntime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const skillsDir = path.join(dataDir, 'skills');
const conversationsDir = path.join(dataDir, 'conversations');
const port = Number(process.env.PORT || 3000);
const maxUploadBytes = Number(process.env.MAX_SKILL_UPLOAD_BYTES || 20 * 1024 * 1024);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 } });

await Promise.all([
  fs.mkdir(skillsDir, { recursive: true }),
  fs.mkdir(conversationsDir, { recursive: true })
]);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

const sandboxCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SANDBOX_CREATE_RATE_LIMIT || 20),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '创建云端沙箱过于频繁，请稍后再试。' }
});
const modelCallLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.MODEL_CALL_RATE_LIMIT || 120),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '模型调用过于频繁，请稍后再试。' }
});

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

const safeSkillId = value => {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64) {
    throw Object.assign(
      new Error('Skill name 必须是 1–64 位小写字母、数字和单连字符，并与 OpenCode Agent Skills 规范一致。'),
      { status: 400 }
    );
  }
  return id;
};

const parseSkill = raw => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const data = match ? yaml.load(match[1]) || {} : {};
  return { data, body: (match ? match[2] : raw).trim() };
};

const readSkill = async id => {
  const skillId = safeSkillId(id);
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

const conversationPath = id => path.join(conversationsDir, safeId(id));
const metadataPath = id => path.join(conversationPath(id), 'conversation.json');
const conversationLocks = new Map();

const withConversationLock = async (id, operation) => {
  const key = safeId(id);
  const previous = conversationLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  conversationLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (conversationLocks.get(key) === current) conversationLocks.delete(key);
  }
};

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

const publicConversation = conversation => {
  const {
    sandboxTokenHash: _sandboxTokenHash,
    sandboxTokenExpiresAt: _sandboxTokenExpiresAt,
    ...safeConversation
  } = conversation;
  return { ...safeConversation, runtime: runtimeMode() };
};

const ensureConversationRuntime = async conversation => {
  const { sandbox, created } = await ensureSandbox(conversation);
  if (sandbox && created) {
    try {
      await configureSandbox(sandbox, conversation.id);
      for (const skillId of conversation.skills || []) {
        await uploadSkill(sandbox, path.join(skillsDir, skillId), skillId);
      }
    } catch (error) {
      await destroySandbox(conversation);
      conversation.sandboxId = undefined;
      conversation.openCodeSessionId = undefined;
      conversation.sandboxTokenHash = undefined;
      throw error;
    }
  }
  conversation.runtime = runtimeMode();
  conversation.updatedAt = new Date().toISOString();
  await saveConversation(conversation);
  return { conversation, sandbox, created };
};

const installSkillIntoConversation = async (conversation, skillId, sandbox) => {
  const id = safeSkillId(skillId);
  const source = path.join(skillsDir, id);
  await fs.access(path.join(source, 'SKILL.md'));
  const target = path.join(conversationPath(conversation.id), 'skills', id);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
  if (sandbox) await uploadSkill(sandbox, source, id);
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
  const id = safeSkillId(typeof data.name === 'string' ? data.name : inferred);
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

const proxyDeepSeek = async (request, response) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return response.status(503).json({ error: { message: '服务端尚未配置 DEEPSEEK_API_KEY。' } });
  }
  const requestedModel = request.body?.model;
  const model = requestedModel === 'deepseek-v4-flash-vision-exp'
    ? requestedModel
    : process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const baseUrl = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      ...request.body,
      model
    }),
    signal: request.signal
  });
  response.status(upstream.status);
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).pipe(response);
};

app.get('/api/health', (_request, response) => response.json({ ok: true, runtime: runtimeMode() }));
app.get('/api/runtime', (_request, response) => response.json(getRuntimeInfo()));
app.post('/api/deepseek/v1/chat/completions', modelCallLimiter, async (request, response, next) => {
  try { await proxyDeepSeek(request, response); } catch (error) { next(error); }
});
app.post('/api/internal/deepseek/:conversationId/v1/chat/completions', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.conversationId);
    const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!verifySandboxToken(conversation, token)) {
      return response.status(401).json({ error: { message: 'Sandbox token 无效或已过期。' } });
    }
    await proxyDeepSeek(request, response);
  } catch (error) { next(error); }
});
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
    const id = safeSkillId(request.params.id);
    await fs.rm(path.join(skillsDir, id), { recursive: true, force: true });
    response.status(204).end();
  } catch (error) { next(error); }
});
app.post('/api/conversations', sandboxCreateLimiter, async (request, response, next) => {
  try {
    const id = request.body?.id ? safeId(request.body.id) : `chat-${crypto.randomUUID()}`;
    const conversation = await withConversationLock(id, async () => {
      const now = new Date().toISOString();
      let current;
      try {
        current = await loadConversation(id);
      } catch (error) {
        if (error.status !== 404) throw error;
        current = { id, skills: [], createdAt: now, updatedAt: now, runtime: runtimeMode() };
        await saveConversation(current);
      }
      await ensureConversationRuntime(current);
      return current;
    });
    response.status(201).json({ conversation: publicConversation(conversation) });
  } catch (error) { next(error); }
});
app.get('/api/conversations/:id', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    response.json({ conversation: publicConversation(conversation) });
  } catch (error) { next(error); }
});
app.post('/api/conversations/:id/skills/:skillId', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    const { sandbox } = await ensureConversationRuntime(conversation);
    await installSkillIntoConversation(conversation, request.params.skillId, sandbox);
    response.json({ conversation: publicConversation(conversation) });
  } catch (error) { next(error); }
});
app.post('/api/conversations/:id/chat', modelCallLimiter, async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    const { sandbox, created } = await ensureConversationRuntime(conversation);
    if (!sandbox) {
      throw Object.assign(new Error('未配置 E2B_API_KEY，无法启动云端 OpenCode。'), { status: 503 });
    }
    const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
    if (!messages.length) throw Object.assign(new Error('消息不能为空。'), { status: 400 });
    const installed = await Promise.all((conversation.skills || []).map(readSkill));
    if (!installed.length) throw Object.assign(new Error('请先为当前对话启用至少一个技能。'), { status: 400 });
    const selectedId = request.body?.skillId;
    if (!selectedId || !installed.some(skill => skill.id === selectedId)) {
      throw Object.assign(new Error('请选择当前对话已启用的 Skill。'), { status: 400 });
    }
    const selected = installed.find(skill => skill.id === selectedId);
    const trace = [
      { step: 'sandbox', detail: `连接 E2B OpenCode 沙箱 ${conversation.sandboxId}` },
      { step: 'select', detail: `指定 OpenCode 使用 ${selected.name}（${selected.id}）` }
    ];
    const latest = messages.at(-1);
    const prompt = created && messages.length > 1
      ? [
          'The previous cloud sandbox expired. Rehydrate context from this conversation transcript:',
          ...messages.map(message => `${message.role}: ${String(message.content || '')}`),
          '',
          'Continue by answering the final user message.'
        ].join('\n')
      : String(latest?.content || '');
    const result = await runOpenCode(sandbox, conversation, selectedId, prompt);
    conversation.openCodeSessionId = result.sessionId || conversation.openCodeSessionId;
    for (const tool of result.tools) {
      trace.push({
        step: tool.name === 'skill' ? 'load' : 'tool',
        detail: tool.name === 'skill'
          ? `OpenCode 原生 skill 工具加载 ${selectedId}/SKILL.md`
          : `OpenCode 调用 ${tool.name}${tool.title ? `：${tool.title}` : ''}`
      });
    }
    conversation.updatedAt = new Date().toISOString();
    await saveConversation(conversation);
    response.json({
      message: { role: 'assistant', content: result.text },
      skill: selectedId,
      trace,
      artifacts: result.artifacts,
      runtime: runtimeMode()
    });
  } catch (error) { next(error); }
});
app.get('/api/conversations/:id/files', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    const sandbox = await connectExistingSandbox(conversation);
    if (!sandbox) throw Object.assign(new Error('E2B 沙箱已过期，产出文件不可再下载。'), { status: 410 });
    const relativePath = String(request.query.path || '');
    const content = await readOutputFile(sandbox, relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    const contentTypes = {
      '.json': 'application/json',
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    response.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(relativePath))}`);
    response.send(Buffer.from(content));
  } catch (error) { next(error); }
});
app.delete('/api/conversations/:id', async (request, response, next) => {
  try {
    const conversation = await loadConversation(request.params.id);
    await destroySandbox(conversation);
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
