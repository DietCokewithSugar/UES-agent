/**
 * Agent 注册表。新增一个对话式技能入口 = 往这里加一个 AgentDefinition。
 */
import type { AgentDefinition, AgentId } from './types';
import { uxAnalysisAgent } from './uxAnalysisAgent';
import { uxKitAgent } from './uxKitAgent';

export const AGENTS: Record<AgentId, AgentDefinition> = {
  'ux-kit': uxKitAgent,
  'ux-analysis': uxAnalysisAgent
};

export const getAgent = (id: AgentId): AgentDefinition => AGENTS[id];

export { uxAnalysisAgent, uxKitAgent };
export type { AgentDefinition, AgentId };
