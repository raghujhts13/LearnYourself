import type { PBLAgent, PBLProjectConfig, PBLRoleDivision, PBLToolResult } from '../types';

interface CreateAgentParams {
  name: string;
  system_prompt: string;
  default_mode: string;
  actor_role?: string;
  role_division?: PBLRoleDivision;
}

interface UpdateAgentParams {
  name: string;
  new_name?: string;
  system_prompt?: string;
  default_mode?: string;
  actor_role?: string;
  role_division?: PBLRoleDivision;
}

export class AgentMCP {
  private config: PBLProjectConfig;

  constructor(config: PBLProjectConfig) {
    this.config = config;
  }

  listAgents(): PBLToolResult {
    return {
      success: true,
      agents: this.config.agents.map((a) => ({
        name: a.name,
        actor_role: a.actor_role,
        role_division: a.role_division,
        default_mode: a.default_mode,
        is_system_agent: a.is_system_agent,
      })),
      count: this.config.agents.length,
    };
  }

  createAgent(params: CreateAgentParams): PBLToolResult {
    const { name, system_prompt, default_mode, actor_role = '', role_division = 'development' } = params;

    if (!name.trim()) {
      return { success: false, error: 'Agent name cannot be empty.' };
    }

    const exists = this.config.agents.find((a) => a.name === name.trim());
    if (exists) {
      return { success: false, error: `Agent with name "${name}" already exists.` };
    }

    const newAgent: PBLAgent = {
      name: name.trim(),
      actor_role,
      role_division,
      system_prompt,
      default_mode,
      delay_time: 0,
      env: {},
      is_user_role: role_division === 'development',
      is_active: true,
      is_system_agent: false,
    };

    this.config.agents.push(newAgent);

    return {
      success: true,
      message: `Agent "${name.trim()}" created successfully.`,
      agent: newAgent,
    };
  }

  createSystemAgent(params: Omit<CreateAgentParams, 'role_division'> & { role_division?: PBLRoleDivision }): PBLAgent {
    const agent: PBLAgent = {
      name: params.name,
      actor_role: params.actor_role ?? '',
      role_division: params.role_division ?? 'management',
      system_prompt: params.system_prompt,
      default_mode: params.default_mode,
      delay_time: 0,
      env: {},
      is_user_role: false,
      is_active: true,
      is_system_agent: true,
    };
    this.config.agents.push(agent);
    return agent;
  }

  updateAgent(params: UpdateAgentParams): PBLToolResult {
    const { name, new_name, ...updates } = params;

    const index = this.config.agents.findIndex((a) => a.name === name);
    if (index === -1) {
      return { success: false, error: `Agent "${name}" not found.` };
    }

    if (new_name && new_name !== name) {
      const nameConflict = this.config.agents.find((a) => a.name === new_name);
      if (nameConflict) {
        return { success: false, error: `Agent with name "${new_name}" already exists.` };
      }
      this.config.agents[index].name = new_name;
    }

    if (updates.system_prompt !== undefined) this.config.agents[index].system_prompt = updates.system_prompt;
    if (updates.default_mode !== undefined) this.config.agents[index].default_mode = updates.default_mode;
    if (updates.actor_role !== undefined) this.config.agents[index].actor_role = updates.actor_role;
    if (updates.role_division !== undefined) this.config.agents[index].role_division = updates.role_division;

    return {
      success: true,
      message: `Agent "${name}" updated successfully.`,
      agent: this.config.agents[index],
    };
  }

  deleteAgent(name: string): PBLToolResult {
    const index = this.config.agents.findIndex((a) => a.name === name);
    if (index === -1) {
      return { success: false, error: `Agent "${name}" not found.` };
    }
    this.config.agents.splice(index, 1);
    return {
      success: true,
      message: `Agent "${name}" deleted successfully.`,
    };
  }

  getAgent(name: string): PBLAgent | undefined {
    return this.config.agents.find((a) => a.name === name);
  }
}
