import type { PBLMode, PBLToolResult } from '../types';

export class ModeMCP {
  private modes: PBLMode[];
  private currentMode: PBLMode;

  constructor(modes: PBLMode[], initialMode: PBLMode) {
    this.modes = modes;
    this.currentMode = initialMode;
  }

  getCurrentMode(): PBLMode {
    return this.currentMode;
  }

  setMode(mode: PBLMode): PBLToolResult {
    if (!this.modes.includes(mode)) {
      return {
        success: false,
        error: `Invalid mode: ${mode}. Available modes: ${this.modes.join(', ')}`,
      };
    }
    const previous = this.currentMode;
    this.currentMode = mode;
    return {
      success: true,
      message: `Mode changed from '${previous}' to '${mode}'`,
      mode,
    };
  }
}
