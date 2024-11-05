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

      const messages = this.parseCommitMessages(response.content[0].text);

      if (messages.length === 0) {
        console.warn("커밋 메시지 생성에 실패했습니다. 재시도합니다...");
        const retryResponse = await this.callClaudeAPI(diff);
        console.log("AI Retry Response:", retryResponse.content[0].text);
        return this.parseCommitMessages(retryResponse.content[0].text);
      }

      return messages;
    } catch (error) {
      console.error(
        `커밋 메시지 생성 중 오류 발생: ${(error as Error).message}`,
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
        Template: ${template}        
        
        Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff: \n      
        ${diff} \n
        
       Output the commit messages in the following JSON format, enclosed within a code block:

       \`\`\`json
       [
          {
             "title": "feat: Add user authentication",
             "body": "Implement secure login flow\\n- Add JWT token management\\n- Create password reset feature\\n- Set up email verification"
          },
          // ... more messages
        ]
        \`\`\`
    
        If there are no changes, return an empty array.
        `;
  }

  parseCommitMessages(response: string): CommitMessage[] {
    // 우선 JSON 형식으로 파싱 시도
    try {
      // 코드 블록 제거
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;

      const messages = JSON.parse(jsonString);

      if (Array.isArray(messages)) {
        return messages.map((msg) => ({
          title: msg.title.trim(),
          body: msg.body.trim(),
        }));
      } else {
        throw new Error("응답이 배열 형식이 아닙니다.");
      }
    } catch (jsonError) {
      console.warn(
        "JSON 파싱 실패, 번호 매기기 형식으로 시도합니다:",
        jsonError,
      );

      // 번호 매기기 형식으로 파싱 시도
      return this.parseNumberedList(response);
    }
  }

  private parseNumberedList(response: string): CommitMessage[] {
    const messages: CommitMessage[] = [];

    // 번호 매기기 패턴 예: 1. 제목\n본문
    const regex = /(\d+)\.\s*(.+)\n([\s\S]*?)(?=\n\d+\.|$)/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
      const title = match[2].trim();
      const body = match[3]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

      messages.push({ title, body });
    }

    if (messages.length === 0) {
      console.error("번호 매기기 형식 파싱에도 실패했습니다.");
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
