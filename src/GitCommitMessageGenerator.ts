import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  commitMessageFormat?: "conventional" | "freeform" | "template";
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
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
      maxFileSizeKB: options.maxFileSizeKB || 100, // Default to 100KB
    };
  }

  async generateCommitMessages(): Promise<string[]> {
    const diff = this.getGitDiff();
    const template = this.getCommitTemplate();
    const response = await this.callClaudeAPI(diff, template);
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

  private getCommitTemplate(): string | null {
    try {
      const templatePath = execSync("git config --get commit.template")
        .toString()
        .trim();
      if (templatePath) {
        let fullPath = templatePath;
        if (templatePath.startsWith("~")) {
          fullPath = path.join(os.homedir(), templatePath.slice(1));
        } else if (!path.isAbsolute(templatePath)) {
          fullPath = path.resolve(process.cwd(), templatePath);
        }

        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          return content;
        } else {
          console.warn(`Commit template file not found: ${fullPath}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn("Commit template not set in Git config");
      } else {
        console.warn(
          "Failed to get commit template:",
          (error as Error).message,
        );
      }
    }
    return null;
  }
  private async callClaudeAPI(
    diff: string,
    template: string | null,
  ): Promise<any> {
    try {
      let prompt = `Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:\n\n${diff}`;

      if (template && this.options.commitMessageFormat === "template") {
        prompt += `Note the commented out ones for reference only. \n\nUse the following commit message template:\n\n${template}`;
      } else if (this.options.commitMessageFormat === "conventional") {
        prompt += "\n\nUse the Conventional Commits format.";
      }

      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      throw new Error("Failed to call Claude API: " + (error as Error).message);
    }
  }

  parseCommitMessages(response: string): string[] {
    const lines = response.split("\n");
    const commitMessages: string[] = [];
    let currentMessage = "";

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*"?(.+?)"?$/);
      if (match) {
        if (currentMessage) {
          commitMessages.push(currentMessage.trim());
        }
        currentMessage = match[1];
      } else if (line.trim() && currentMessage) {
        currentMessage += " " + line.trim();
      }
    }

    if (currentMessage) {
      commitMessages.push(currentMessage.trim());
    }

    return commitMessages.map((msg) => msg.replace(/^"(.+)"$/, "$1"));
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
    } catch (error) {
      throw new Error("Failed to commit changes: " + (error as Error).message);
    }
  }
}

export default GitCommitMessageGenerator;
