import { execSync } from 'child_process';
import { Anthropic, ClientOptions } from '@anthropic-ai/sdk';
import * as readline from 'readline';

interface GeneratorOptions {
    maxTokens?: number;
    temperature?: number;
    model?: string;
    commitMessageFormat?: 'conventional' | 'freeform';
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
            commitMessageFormat: options.commitMessageFormat || 'conventional',
        };
    }

    async generateCommitMessage(): Promise<string> {
        const diff = this.getGitDiff();
        const response = await this.callClaudeAPI(diff);
        return response.content[0].text.trim();
    }

    private getGitDiff(): string {
        try {
            return execSync('git diff --cached').toString();
        } catch (error) {
            throw new Error('Failed to get Git diff: ' + (error as Error).message);
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
                        role: "assistant",
                        content: `You are an AI assistant that generates concise and informative Git commit messages based on the provided diff. Use the ${this.options.commitMessageFormat} commit message format.`
                    },
                    {
                        role: "user",
                        content: `Generate a commit message for the following Git diff:\n\n${diff}`
                    }
                ]
            });
        } catch (error) {
            throw new Error('Failed to call Claude API: ' + (error as Error).message);
        }
    }

    async promptUser(message: string): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
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
            execSync(`git commit -m "${message}"`);
            console.log('Commit successful!');
        } catch (error) {
            throw new Error('Failed to commit changes: ' + (error as Error).message);
        }
    }
}

async function main() {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }

        const generator = new GitCommitMessageGenerator(apiKey, {
            maxTokens: 150,
            temperature: 0.2,
            commitMessageFormat: 'conventional'
        });

        const commitMessage = await generator.generateCommitMessage();
        console.log('Generated commit message:', commitMessage);

        const userConfirmation = await generator.promptUser('Do you want to use this commit message? (yes/no): ');

        if (userConfirmation.toLowerCase() === 'yes') {
            await generator.commitChanges(commitMessage);
        } else {
            console.log('Commit cancelled by user.');
        }
    } catch (error) {
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

// ES 모듈에서는 이렇게 main 모듈 체크를 합니다
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}


export default GitCommitMessageGenerator;