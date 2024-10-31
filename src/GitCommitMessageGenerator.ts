import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import {
  COMMIT_MESSAGE_EXAMPLE,
  COMMIT_MESSAGE_TEMPLATE,
} from "./commitMessageTemplate.js";

const SUPPORTED_LANGUAGES = ["en", "ko", "ja", "zh-CN", "zh-TW"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
  language?: string;
}

interface CommitMessage {
  title: string;
  body: string;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<Omit<GeneratorOptions, "language">> & {
    language: SupportedLanguage;
  };

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = this.initializeOptions(options);
  }

  private validateLanguage(lang: string): SupportedLanguage {
    if (!lang || !SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      console.warn(
        `Language "${lang}" is not supported. Falling back to English (en).`,
      );
      return "en";
    }
    return lang as SupportedLanguage;
  }

  private initializeOptions(options: GeneratorOptions): Required<
    Omit<GeneratorOptions, "language">
  > & {
    language: SupportedLanguage;
  } {
    return {
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20241022",
      numberOfSuggestions: options.numberOfSuggestions || 3,
      maxFileSizeKB: options.maxFileSizeKB || 100,
      language: this.validateLanguage(options.language || "en"),
    };
  }

  async generateCommitMessages(): Promise<CommitMessage[]> {
    try {
      const diff = this.getGitDiff();
      const response = await this.callClaudeAPI(diff);
      console.log("response.content[0].text", response.content[0].text);
      return this.parseCommitMessages(response.content[0].text);
    } catch (error) {
      console.error(
        `Error generating commit messages: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private getGitDiff(): string {
    try {
      const stagedFiles = this.getStagedFiles();
      return this.getFilteredDiff(stagedFiles);
    } catch (error) {
      throw new Error(`Failed to get Git diff: ${(error as Error).message}`);
    }
  }

  private getStagedFiles(): string[] {
    return execSync("git diff --staged --name-only", {
      encoding: "utf8",
    })
      .toString()
      .split("\n")
      .filter(Boolean);
  }

  private getFilteredDiff(stagedFiles: string[]): string {
    let filteredDiff = "";
    for (const file of stagedFiles) {
      if (this.shouldSkipFile(file)) continue;
      const fileDiff = this.getFileDiff(file);
      if (this.isFileTooLarge(fileDiff)) {
        console.warn(
          `Skipping large file: ${file} (${this.getFileSizeKB(fileDiff).toFixed(2)} KB)`,
        );
        continue;
      }
      filteredDiff += fileDiff;
    }
    return filteredDiff;
  }

  private getFileDiff(file: string): string {
    return execSync(`git diff --staged -- "${file}"`, {
      encoding: "utf8",
    }).toString();
  }

  private isFileTooLarge(fileDiff: string): boolean {
    return this.getFileSizeKB(fileDiff) > this.options.maxFileSizeKB;
  }

  private getFileSizeKB(fileDiff: string): number {
    return Buffer.byteLength(fileDiff, "utf8") / 1024;
  }

  private shouldSkipFile(filename: string): boolean {
    const skipPatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.svg$/,
      /\.map$/,
    ];
    return skipPatterns.some((pattern) => pattern.test(filename));
  }

  private async callClaudeAPI(diff: string): Promise<any> {
    try {
      const prompt = this.buildPrompt(diff);

      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      throw new Error(`Failed to call Claude API: ${(error as Error).message}`);
    }
  }

  private buildPrompt(diff: string): string {
    const template = COMMIT_MESSAGE_TEMPLATE(this.options.language);
    return `
        You are a professional Git commit message writer. \n
        Write commit messages using the provided template and example. \n
        Template: ${template} \n
        Example: ${COMMIT_MESSAGE_EXAMPLE} \n\n 
        
        Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff: \n      
        ${diff} \n
        
        If there are no changes, you must return "No changes".`;
  }

  parseCommitMessages(response: string): CommitMessage[] {
    const cleanResponse = response
      .replace(/```\w*\n?/g, "")
      .replace(/^\s+|\s+$/g, "");

    const messages: CommitMessage[] = [];
    const messageBlocks = cleanResponse.split(/\n\s*\n(?=\d+\.)/);

    for (const block of messageBlocks) {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const titleMatch = lines[0]?.match(/^\d+\.\s*(.+)$/);

      if (titleMatch) {
        const title = titleMatch[1]
          .replace(/^["']/, "")
          .replace(/["']$/, "")
          .trim();
        const body = lines.slice(1).join("\n").trim();

        if (title) {
          messages.push({ title, body });
        }
      }
    }

    return messages;
  }

  async commitChanges(message: CommitMessage): Promise<void> {
    try {
      this.validateStagedChanges();
      this.executeGitCommit(message);
    } catch (error) {
      throw new Error(`No changes staged for commit`);
    }
  }

  private validateStagedChanges(): void {
    const stagedChanges = execSync("git diff --staged --name-only", {
      encoding: "utf8",
    })
      .toString()
      .trim();
    if (!stagedChanges) {
      throw new Error("No staged changes to commit");
    }
  }

  private executeGitCommit(message: CommitMessage): void {
    const fullMessage = `${message.title}\n\n${message.body}`;
    const escapedMessage = fullMessage.replace(/"/g, '\\"');
    execSync(`git commit -m "${escapedMessage}"`, { encoding: "utf8" });
  }
}

export {
  GitCommitMessageGenerator,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
};
