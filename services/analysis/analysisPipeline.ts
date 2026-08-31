import type { Attachment } from '../../utils/attachments';
import { deepseekJson, type DeepSeekMessage } from '../deepseekService';
import type { ChartSpec } from '../docx/blocks';
import type { SkillMeta } from '../skills/skillRegistry';
import {
  prepareAnalysisData,
  splitTextForAnalysis,
  type AnalysisChunk,
  type PreparedAnalysisData
} from './dataPreparation';

export interface AnalysisBundle {
  version: 1;
  manifest: PreparedAnalysisData['manifest'];
  deterministicProfiles: PreparedAnalysisData['profiles'];
  synthesis: unknown;
  recommendedCharts: ChartSpec[];
  coverage: {
    totalChunks: number;
    analyzedChunks: number;
    failedChunks: number;
  };
}

interface PipelineOptions {
  context: string;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, phase: string) => void;
}

const ENGINE_REFS: Array<{ pattern: RegExp; file: string }> = [
  { pattern: /问卷|调查|survey|量表|满意度|nps|\.xlsx|\.csv|\.tsv/i, file: 'questionnaire.md' },
  { pattern: /访谈|interview|逐字稿|转录|主持人|受访者/i, file: 'interview.md' },
  { pattern: /埋点|行为|漏斗|转化|analytics|事件名|时间戳/i, file: 'analytics.md' },
  { pattern: /可用性|usability|任务测试|完成率|sus|seq/i, file: 'usability.md' },
  { pattern: /眼动|热区|aoi|注视|eyetracking/i, file: 'eyetracking.md' },
  { pattern: /用户声音|评论|投诉|工单|反馈|voc|开放题/i, file: 'user_voice.md' }
];

const MAP_RULES = `你在执行用户研究数据的一个分块分析任务。只输出合法 JSON 对象。
要求：
1. 只报告当前数据块能直接支持的事实，不补造未出现的数据；
2. 数字必须保留来源文件和块编号；不要把分块样本量误当整份文件样本量；
3. 引用保留受访者编号并脱敏；个人身份信息不得输出；
4. 区分 observation（直接事实）与 inference（解释性推断）；
5. 识别统计口径、缺失值、异常数据和可能的重复表头；
6. 若参考资料定义了 ETS、NPS、SUS、Kano 等公式，严格按定义识别，但跨块才能计算的指标只输出所需的可加总计数，禁止猜最终值。
输出结构：
{"source":"文件名","chunk":"1/3","dataType":"识别类型","observations":[{"fact":"事实","evidence":"数值或引文","scope":"口径"}],"additiveCounts":[{"metric":"可加总指标","key":"类别","value":0}],"qualityIssues":[],"candidateInsights":[]}`;

const PROFILE_RULES = `你在读取由程序对整份表格计算出的确定性统计摘要。只输出合法 JSON。
这些 rows/nonEmpty/missing/distinct/min/max/mean/topValues 是程序遍历整份表后得到的事实锚点，优先级高于模型估算。根据研究目标挑出有决策价值的统计，保持原数值，不自行重算或改写。
输出：{"source":"文件名","exactFacts":[{"metric":"字段","value":"原始统计","interpretation":"与目标的关系"}],"qualityIssues":[],"candidateCharts":[{"title":"图名","reason":"用途"}]}`;

const REDUCE_RULES = `你在执行用户研究分析的分层归并。只输出合法 JSON 对象。
输入是若干已覆盖不同文件/分块的证据摘要。合并时：
- 保留每条结论的来源、样本口径和可复核数字；程序确定性统计优先；
- 只有口径兼容的 additiveCounts 才能相加，均值/百分比绝不能直接相加或平均；
- 同义发现合并，矛盾发现并列标记，不得用“多数”掩盖冲突；
- 单源证据永不标为“高”可信度；
- 输出应紧凑但不能丢掉关键负面发现、异常和限制。
输出：{"dataInventory":[],"exactMetrics":[],"themes":[{"name":"结论式主题名","evidence":[],"confidence":"中高/中/中低/低","limitations":[]}],"contradictions":[],"qualityIssues":[],"chartPlan":[{"title":"图名","metric":"使用哪些精确数据","type":"bar/line/pie/scatter/funnel/radar"}]}`;

const refContents = (skill: SkillMeta, haystack: string): string => {
  const [sourceSignals, contextSignals = ''] = haystack.split('\n=== 已确认上下文 ===\n', 2);
  const direct = ENGINE_REFS.filter(item => item.pattern.test(sourceSignals)).map(item => item.file);
  const fallback = ENGINE_REFS.filter(item => item.pattern.test(contextSignals)).map(item => item.file);
  const names = [...direct, ...fallback]
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 2);
  return names
    .map(name => skill.references.find(ref => ref.name === name))
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
    .map(ref => `=== references/${ref.name} ===\n${ref.content}`)
    .join('\n\n');
};

const stringify = (value: unknown): string => JSON.stringify(value);

const retryJson = async (
  messages: DeepSeekMessage[],
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    return await deepseekJson(messages, { temperature: 0.1, maxTokens: 4_096, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return deepseekJson(
      [
        ...messages,
        {
          role: 'user',
          content: `上次调用失败：${(error as Error).message.slice(
            0,
            180
          )}。请重新检查当前输入，只输出完整合法 JSON。`
        }
      ],
      { temperature: 0, maxTokens: 4_096, signal }
    );
  }
};

const mapChunk = async (
  chunk: AnalysisChunk,
  skill: SkillMeta,
  context: string,
  signal?: AbortSignal
): Promise<unknown> => {
  const reference = refContents(
    skill,
    `${chunk.source}\n${chunk.text?.slice(0, 4_000) ?? ''}\n=== 已确认上下文 ===\n${context}`
  );
  const system = [MAP_RULES, reference].filter(Boolean).join('\n\n');
  const label = `来源：${chunk.source}\n分块：${chunk.index}/${chunk.total}\n研究目标与已确认方案：${context}`;
  const content = chunk.imageDataUrl
    ? [
        { type: 'text' as const, text: `${label}\n请读取随附图片中的可见信息。` },
        { type: 'image_url' as const, image_url: { url: chunk.imageDataUrl } }
      ]
    : `${label}\n\n=== 当前数据块（完整）===\n${chunk.text ?? ''}`;
  return retryJson(
    [
      { role: 'system', content: system },
      { role: 'user', content }
    ],
    signal
  );
};

const mapProfilePart = (
  text: string,
  context: string,
  signal?: AbortSignal
): Promise<unknown> =>
  retryJson(
    [
      { role: 'system', content: PROFILE_RULES },
      {
        role: 'user',
        content: `研究目标与已确认方案：${context}\n\n=== 程序确定性统计（完整）===\n${text}`
      }
    ],
    signal
  );

const groupByPayloadSize = (items: unknown[], maxChars = 38_000): unknown[][] => {
  const groups: unknown[][] = [];
  let group: unknown[] = [];
  let length = 0;
  for (const item of items) {
    const itemLength = stringify(item).length;
    if (group.length && length + itemLength > maxChars) {
      groups.push(group);
      group = [];
      length = 0;
    }
    group.push(item);
    length += itemLength;
  }
  if (group.length) groups.push(group);
  return groups;
};

const reduceEvidence = async (
  evidence: unknown[],
  skill: SkillMeta,
  context: string,
  signal?: AbortSignal,
  onRound?: (round: number, groups: number) => void
): Promise<unknown> => {
  let current = evidence;
  let round = 0;
  const synthesis = skill.references.find(ref => ref.name === 'synthesis.md')?.content ?? '';
  while (current.length > 1) {
    round += 1;
    const groups = groupByPayloadSize(current);
    // 极端情况下单项已经很大，仍需确保本轮数量收敛。
    const normalizedGroups =
      groups.length === current.length && groups.every(group => group.length === 1)
        ? Array.from({ length: Math.ceil(current.length / 2) }, (_, index) =>
            current.slice(index * 2, index * 2 + 2)
          )
        : groups;
    onRound?.(round, normalizedGroups.length);
    current = await Promise.all(
      normalizedGroups.map((group, index) =>
        retryJson(
          [
            {
              role: 'system',
              content: `${REDUCE_RULES}\n\n=== references/synthesis.md ===\n${synthesis}`
            },
            {
              role: 'user',
              content: `研究目标与已确认方案：${context}\n归并轮次：${round}，组 ${
                index + 1
              }/${normalizedGroups.length}\n\n=== 待归并证据 ===\n${stringify(group)}`
            }
          ],
          signal
        )
      )
    );
  }
  return current[0] ?? {
    dataInventory: [],
    exactMetrics: [],
    themes: [],
    contradictions: [],
    qualityIssues: ['没有可分析的有效数据'],
    chartPlan: []
  };
};

const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
  onDone?: () => void
): Promise<R[]> => {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await task(items[index], index);
      onDone?.();
    }
  });
  await Promise.all(workers);
  return output;
};

const hashText = (text: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const cache = new Map<string, Promise<AnalysisBundle>>();

const cacheKey = (attachments: Attachment[], context: string): string =>
  hashText(
    `${context}\n${attachments
      .map(item => `${item.id}:${item.name}:${item.size}:${hashText(item.text ?? item.dataUrl ?? '')}`)
      .join('|')}`
  );

export const runAnalysisPipeline = (
  attachments: Attachment[],
  skill: SkillMeta,
  options: PipelineOptions
): Promise<AnalysisBundle> => {
  const key = cacheKey(attachments, options.context);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise: Promise<AnalysisBundle> = (async () => {
    const prepared = prepareAnalysisData(attachments);
    const profileParts = splitTextForAnalysis(stringify(prepared.profiles), 14_000);
    const totalMapTasks = prepared.chunks.length + profileParts.length;
    let completed = 0;
    const done = (phase: string) => {
      completed += 1;
      options.onProgress?.(completed, totalMapTasks, phase);
    };

    const [chunkEvidence, profileEvidence] = await Promise.all([
      runWithConcurrency(
        prepared.chunks,
        3,
        chunk => mapChunk(chunk, skill, options.context, options.signal),
        () => done('逐块分析原始数据')
      ),
      runWithConcurrency(
        profileParts,
        2,
        part => mapProfilePart(part, options.context, options.signal),
        () => done('读取程序统计结果')
      )
    ]);
    const allEvidence = [...chunkEvidence, ...profileEvidence];
    const synthesis = await reduceEvidence(
      allEvidence,
      skill,
      options.context,
      options.signal,
      (round, groups) =>
        options.onProgress?.(
          totalMapTasks,
          totalMapTasks,
          `第 ${round} 轮证据归并（${groups} 组）`
        )
    );

    return {
      version: 1,
      manifest: prepared.manifest,
      deterministicProfiles: prepared.profiles,
      synthesis,
      recommendedCharts: prepared.recommendedCharts,
      coverage: {
        totalChunks: prepared.chunks.length,
        analyzedChunks: chunkEvidence.length,
        failedChunks: 0
      }
    };
  })();

  cache.set(key, promise);
  if (cache.size > 3) cache.delete(cache.keys().next().value as string);
  promise.catch(() => cache.delete(key));
  return promise;
};
