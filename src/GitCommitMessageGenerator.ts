import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import {
  COMMIT_MESSAGE_EXAMPLE,
  COMMIT_MESSAGE_TEMPLATE,
} from "./commitMessageTemplate.js";

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
}

interface CommitMessage {
  title: string;
  body: string;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<GeneratorOptions>;

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = {
      maxTokens: options.maxTokens || 400,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20240620",
      numberOfSuggestions: options.numberOfSuggestions || 3,
      maxFileSizeKB: options.maxFileSizeKB || 100, // Default to 100KB
    };
  }

  async generateCommitMessages(): Promise<CommitMessage[]> {
    const diff = this.getGitDiff();
    const response = await this.callClaudeAPI(diff);

    return this.parseCommitMessages(response.content[0].text);
  }

  private getGitDiff(): string {
    try {
      const stagedFiles = execSync("git diff --cached --name-only")
        .toString()
        .split("\n")
        .filter(Boolean);

      let filteredDiff = "";

      for (const file of stagedFiles) {
        if (this.shouldSkipFile(file)) continue;

        const fileDiff = execSync(`git diff --cached -- "${file}"`).toString();

        const fileSizeKB = Buffer.byteLength(fileDiff, "utf8") / 1024;
        if (fileSizeKB > this.options.maxFileSizeKB) {
          console.warn(
            `Skipping large file: ${file} (${fileSizeKB.toFixed(2)} KB)`,
          );
          continue;
        }

        filteredDiff += fileDiff;
      }

      return filteredDiff;
    } catch (error) {
      throw new Error("Failed to get Git diff: " + (error as Error).message);
    }
  }

  private shouldSkipFile(filename: string): boolean {
    // Skip lock files and other patterns as needed
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
      let prompt = `You're a professional Git commit message writer. \n Create a commit message using the template and examples provided. \n template: ${COMMIT_MESSAGE_TEMPLATE}. \n example: ${COMMIT_MESSAGE_EXAMPLE}. \n\n Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:`;
      prompt += `\n\n${diff} \n\n If there are no changes, You must use the return “No changes”.`;

      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });
    } catch (error) {
      throw new Error("Failed to call Claude API: " + (error as Error).message);
    }
  }

  parseCommitMessages(response: string): CommitMessage[] {
    const lines = response.split("\n");
    const commitMessages: CommitMessage[] = [];
    let currentMessage: string[] = [];

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)$/);
      if (match) {
        if (currentMessage.length > 0) {
          commitMessages.push(this.createCommitMessage(currentMessage));
          currentMessage = [];
        }
        currentMessage.push(match[1].replace(/^"|"$/g, "").trim());
      } else if (currentMessage.length > 0 && line.trim()) {
        currentMessage.push(line.trim());
      }
    }

    if (currentMessage.length > 0) {
      commitMessages.push(this.createCommitMessage(currentMessage));
    }

    return commitMessages;
  }

  private createCommitMessage(lines: string[]): CommitMessage {
    const title = lines[0];
    const body = lines.slice(1).join("\n").trim();
    return { title, body };
  }

  async commitChanges(message: CommitMessage): Promise<void> {
    try {
      const stagedChanges = execSync("git diff --cached --name-only")
        .toString()
        .trim();
      if (!stagedChanges) {
        throw new Error("No changes staged for commit");
      }

      const fullMessage = `${message.title}\n\n${message.body}`;
      const escapedMessage = fullMessage.replace(/"/g, '\\"');
      execSync(`git commit -m "${escapedMessage}"`);
    } catch (error) {
      throw new Error("Failed to commit changes: " + (error as Error).message);
    }
  }
}

export default GitCommitMessageGenerator;
