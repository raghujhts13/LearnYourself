import { nanoid } from 'nanoid';
import type { PBLIssue, PBLProjectConfig, PBLToolResult } from '../types';
import type { AgentMCP } from './agent-mcp';

interface CreateIssueParams {
  title: string;
  description: string;
  person_in_charge: string;
  participants?: string[];
  notes?: string;
  parent_issue?: string | null;
  index?: number;
}

interface UpdateIssueParams {
  issue_id: string;
  title?: string;
  description?: string;
  person_in_charge?: string;
  participants?: string[];
  notes?: string;
  parent_issue?: string | null;
  index?: number;
}

export class IssueboardMCP {
  private config: PBLProjectConfig;
  private agentMCP: AgentMCP;
  private language: string;

  constructor(config: PBLProjectConfig, agentMCP: AgentMCP, language: string) {
    this.config = config;
    this.agentMCP = agentMCP;
    this.language = language;
  }

  createIssueboard(): PBLToolResult {
    this.config.issueboard = {
      agent_ids: [],
      issues: [],
      current_issue_id: null,
    };
    return {
      success: true,
      message: 'Issueboard created/reset successfully.',
    };
  }

  getIssueboard(): PBLToolResult {
    return {
      success: true,
      issueboard: this.config.issueboard,
    };
  }

  updateIssueboardAgents(agent_ids: string[]): PBLToolResult {
    const missing = agent_ids.filter((id) => !this.agentMCP.getAgent(id));
    if (missing.length > 0) {
      return {
        success: false,
        error: `Agents not found: ${missing.join(', ')}`,
      };
    }
    this.config.issueboard.agent_ids = agent_ids;
    return {
      success: true,
      message: `Issueboard agents updated: ${agent_ids.join(', ')}`,
      agent_ids,
    };
  }

  createIssue(params: CreateIssueParams): PBLToolResult {
    const {
      title,
      description,
      person_in_charge,
      participants = [],
      notes = '',
      parent_issue = null,
      index,
    } = params;

    if (!title.trim()) {
      return { success: false, error: 'Issue title cannot be empty.' };
    }

    const issueId = nanoid();
    const isZH = this.language === 'zh-CN';

    // Auto-create Question and Judge system agents for this issue
    const questionAgentName = isZH
      ? `提问助手 (${title.slice(0, 20)})`
      : `Question Agent (${title.slice(0, 20)})`;
    const judgeAgentName = isZH
      ? `评判助手 (${title.slice(0, 20)})`
      : `Judge Agent (${title.slice(0, 20)})`;

    this.agentMCP.createSystemAgent({
      name: questionAgentName,
      system_prompt: isZH
        ? `你是"${title}"任务的提问助手。你的职责是通过提出引导性问题来帮助学生理解并完成这个任务。\n\n任务描述：${description}\n\n负责人：${person_in_charge}`
        : `You are the Question Agent for the issue: "${title}". Your role is to help students understand and complete this issue by asking guiding questions.\n\nIssue description: ${description}\n\nPerson in charge: ${person_in_charge}`,
      default_mode: 'chat',
      actor_role: isZH ? '提问助手' : 'Question Agent',
      role_division: 'management',
    });

    this.agentMCP.createSystemAgent({
      name: judgeAgentName,
      system_prompt: isZH
        ? `你是"${title}"任务的评判助手。你的职责是评估学生的工作成果，提供建设性反馈，并判断任务是否完成。\n\n任务描述：${description}\n\n负责人：${person_in_charge}`
        : `You are the Judge Agent for the issue: "${title}". Your role is to evaluate student work, provide constructive feedback, and determine if the issue is complete.\n\nIssue description: ${description}\n\nPerson in charge: ${person_in_charge}`,
      default_mode: 'chat',
      actor_role: isZH ? '评判助手' : 'Judge Agent',
      role_division: 'management',
    });

    const newIssue: PBLIssue = {
      id: issueId,
      title: title.trim(),
      description: description.trim(),
      person_in_charge,
      participants,
      notes,
      parent_issue: parent_issue ?? null,
      index: index ?? this.config.issueboard.issues.length,
      is_done: false,
      is_active: false,
      generated_questions: '',
      question_agent_name: questionAgentName,
      judge_agent_name: judgeAgentName,
    };

    this.config.issueboard.issues.push(newIssue);

    return {
      success: true,
      message: `Issue "${title.trim()}" created with Question and Judge agents.`,
      issue: newIssue,
      question_agent_name: questionAgentName,
      judge_agent_name: judgeAgentName,
    };
  }

  listIssues(): PBLToolResult {
    const sorted = [...this.config.issueboard.issues].sort((a, b) => a.index - b.index);
    return {
      success: true,
      issues: sorted,
      count: sorted.length,
    };
  }

  updateIssue(params: UpdateIssueParams): PBLToolResult {
    const { issue_id, ...updates } = params;
    const issue = this.config.issueboard.issues.find((i) => i.id === issue_id);

    if (!issue) {
      return { success: false, error: `Issue "${issue_id}" not found.` };
    }

    if (updates.title !== undefined) issue.title = updates.title.trim();
    if (updates.description !== undefined) issue.description = updates.description.trim();
    if (updates.person_in_charge !== undefined) issue.person_in_charge = updates.person_in_charge;
    if (updates.participants !== undefined) issue.participants = updates.participants;
    if (updates.notes !== undefined) issue.notes = updates.notes;
    if (updates.parent_issue !== undefined) issue.parent_issue = updates.parent_issue ?? null;
    if (updates.index !== undefined) issue.index = updates.index;

    return {
      success: true,
      message: `Issue "${issue_id}" updated successfully.`,
      issue,
    };
  }

  deleteIssue(issue_id: string): PBLToolResult {
    const index = this.config.issueboard.issues.findIndex((i) => i.id === issue_id);
    if (index === -1) {
      return { success: false, error: `Issue "${issue_id}" not found.` };
    }

    const issue = this.config.issueboard.issues[index];

    // Remove sub-issues
    this.config.issueboard.issues = this.config.issueboard.issues.filter(
      (i) => i.id !== issue_id && i.parent_issue !== issue_id,
    );

    // Remove associated system agents
    this.agentMCP.deleteAgent(issue.question_agent_name);
    this.agentMCP.deleteAgent(issue.judge_agent_name);

    if (this.config.issueboard.current_issue_id === issue_id) {
      this.config.issueboard.current_issue_id = null;
    }

    return {
      success: true,
      message: `Issue "${issue_id}" and its sub-issues deleted successfully.`,
    };
  }

  reorderIssues(issue_ids: string[]): PBLToolResult {
    const existing = new Set(this.config.issueboard.issues.map((i) => i.id));
    const invalid = issue_ids.filter((id) => !existing.has(id));
    if (invalid.length > 0) {
      return { success: false, error: `Unknown issue IDs: ${invalid.join(', ')}` };
    }

    issue_ids.forEach((id, idx) => {
      const issue = this.config.issueboard.issues.find((i) => i.id === id);
      if (issue) issue.index = idx;
    });

    return {
      success: true,
      message: 'Issues reordered successfully.',
    };
  }
}
