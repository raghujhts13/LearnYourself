import type { PBLProjectConfig, PBLToolResult } from '../types';

export class ProjectMCP {
  private config: PBLProjectConfig;

  constructor(config: PBLProjectConfig) {
    this.config = config;
  }

  getProjectInfo(): PBLToolResult {
    return {
      success: true,
      projectInfo: this.config.projectInfo,
    };
  }

  updateTitle(title: string): PBLToolResult {
    if (!title.trim()) {
      return { success: false, error: 'Title cannot be empty.' };
    }
    this.config.projectInfo.title = title.trim();
    return {
      success: true,
      message: `Project title updated to: "${title.trim()}"`,
      title: this.config.projectInfo.title,
    };
  }

  updateDescription(description: string): PBLToolResult {
    if (!description.trim()) {
      return { success: false, error: 'Description cannot be empty.' };
    }
    this.config.projectInfo.description = description.trim();
    return {
      success: true,
      message: 'Project description updated.',
      description: this.config.projectInfo.description,
    };
  }
}
