import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import * as readline from "readline";

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  commitMessageFormat?: "conventional" | "freeform";
  numberOfSuggestions?: number;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<GeneratorOptions>;

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = {
      maxTokens: options.maxTokens || 100,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20240620",
      commitMessageFormat: options.commitMessageFormat || "conventional",
      numberOfSuggestions: options.numberOfSuggestions || 3,
    };
  }

  async generateCommitMessages(): Promise<string[]> {
    const diff = this.getGitDiff();
    const response = await this.callClaudeAPI(diff);
    return this.parseCommitMessages(response.content[0].text);
  }

  private getGitDiff(): string {
    try {
      return execSync("git diff --cached").toString();
    } catch (error) {
      throw new Error("Failed to get Git diff: " + (error as Error).message);
    }
  }

  private async callClaudeAPI(diff: string): Promise<any> {
    try {
      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [
          {
            role: "user",
            content: `Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:\n\n${diff}`,
          },
        ],
      });
    } catch (error) {
      throw new Error("Failed to call Claude API: " + (error as Error).message);
    }
  }

  parseCommitMessages(response: string): string[] {
    const messages = response.split(/\d+\.\s/).slice(1);
    return messages.map((msg) => msg.trim());
  }

  async promptUser(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async commitChanges(message: string): Promise<void> {
    try {
      const stagedChanges = execSync("git diff --cached --name-only")
        .toString()
        .trim();
      if (!stagedChanges) {
        throw new Error("No changes staged for commit");
      }

      const escapedMessage = message.replace(/"/g, '\\"');
      execSync(`git commit -m "${escapedMessage}"`);
      console.log("Commit successful!");
    } catch (error) {
      throw new Error("Failed to commit changes: " + (error as Error).message);
    }
  }
}

export default GitCommitMessageGenerator;
