import { execSync } from 'child_process';
import { Anthropic, ClientOptions } from '@anthropic-ai/sdk';
import * as readline from 'readline';

interface GeneratorOptions {
    maxTokens?: number;
    temperature?: number;
    model?: string;
    commitMessageFormat?: 'conventional' | 'freeform';
    numberOfSuggestions?: number
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
            numberOfSuggestions: options.numberOfSuggestions || 3
        };
    }

    async generateCommitMessages(): Promise<string[]> {
        const diff = this.getGitDiff();
        const response = await this.callClaudeAPI(diff);
        return this.parseCommitMessages(response.content[0].text);
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
                        role: "user",
                        content: `Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:\n\n${diff}`
                    }
                ]
            });
        } catch (error) {
            throw new Error('Failed to call Claude API: ' + (error as Error).message);
        }
    }

    parseCommitMessages(response: string): string[] {
        const messages = response.split(/\d+\.\s/).slice(1);
        return messages.map(msg => msg.trim());
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

    async editMessage(message: string): Promise<string> {
        console.log(`\nCurrent commit message:`);
        console.log(message);
        const editedMessage = await this.promptUser('\nEnter your edited commit message (or press Enter to keep as is):\n');
        return editedMessage.trim() || message;
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

        const commitMessages = await generator.generateCommitMessages();
        console.log('Generated commit message:', commitMessages);

        console.log('Generated commit messages:');
        commitMessages.forEach((msg, index) => {
            console.log(`${index + 1}. ${msg}`);
        });

        const userChoice = await generator.promptUser('Enter the number of the commit message you want to use (or 0 to cancel): ');

        const choiceNum = parseInt(userChoice);
        if (choiceNum > 0 && choiceNum <= commitMessages.length) {
            await generator.commitChanges(commitMessages[choiceNum - 1]);
        } else if (choiceNum === 0) {
            console.log('Commit cancelled by user.');
        } else {
            console.log('Invalid choice. Commit cancelled.');
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