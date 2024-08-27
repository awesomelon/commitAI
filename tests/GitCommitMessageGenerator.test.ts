
import { execSync } from 'child_process';
import { Anthropic } from '@anthropic-ai/sdk';
import GitCommitMessageGenerator from "../src/GitCommitMessageGenerator";

jest.mock('child_process');
jest.mock('@anthropic-ai/sdk');

describe('GitCommitMessageGenerator', () => {
    let generator: GitCommitMessageGenerator;

    beforeEach(() => {
        generator = new GitCommitMessageGenerator('fake-api-key');
        jest.clearAllMocks();
    });

    describe('getGitDiff', () => {
        test('should return git diff', () => {
            (execSync as jest.Mock).mockReturnValue('mock git diff');
            const diff = (generator as any).getGitDiff();
            expect(diff).toBe('mock git diff');
            expect(execSync).toHaveBeenCalledWith('git diff --cached');
        });

        test('should throw error when git diff fails', () => {
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Git command failed');
            });
            expect(() => (generator as any).getGitDiff()).toThrow('Failed to get Git diff: Git command failed');
        });
    });

    describe('callClaudeAPI', () => {
        test('should call Anthropic API with correct parameters', async () => {
            const mockCreate = jest.fn().mockResolvedValue({
                content: [{ text: 'Generated commit message' }]
            });
            (Anthropic.prototype.messages as any) = { create: mockCreate };

            const result = await (generator as any).callClaudeAPI('mock diff');

            expect(result.content[0].text).toBe('Generated commit message');
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 100,
                temperature: 0,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        role: "system",
                        content: expect.stringContaining("conventional")
                    }),
                    expect.objectContaining({
                        role: "user",
                        content: expect.stringContaining("mock diff")
                    })
                ])
            }));
        });

        test('should throw error when API call fails', async () => {
            const mockCreate = jest.fn().mockRejectedValue(new Error('API call failed'));
            (Anthropic.prototype.messages as any) = { create: mockCreate };

            await expect((generator as any).callClaudeAPI('mock diff')).rejects.toThrow('Failed to call Claude API: API call failed');
        });
    });

    describe('generateCommitMessage', () => {
        test('should return a commit message', async () => {
            (execSync as jest.Mock).mockReturnValue('mock git diff');
            const mockCreate = jest.fn().mockResolvedValue({
                content: [{ text: 'Generated commit message' }]
            });
            (Anthropic.prototype.messages as any) = { create: mockCreate };

            const message = await generator.generateCommitMessage();

            expect(message).toBe('Generated commit message');
        });
    });

    describe('commitChanges', () => {
        test('should execute git commit command', async () => {
            await generator.commitChanges('Test commit message');

            expect(execSync).toHaveBeenCalledWith('git commit -m "Test commit message"');
        });

        test('should throw error when git commit fails', async () => {
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Git commit failed');
            });

            await expect(generator.commitChanges('Test commit message')).rejects.toThrow('Failed to commit changes: Git commit failed');
        });
    });

    describe('Custom options', () => {
        test('should use custom options when provided', async () => {
            const customGenerator = new GitCommitMessageGenerator('fake-api-key', {
                maxTokens: 200,
                temperature: 0.5,
                model: 'custom-model',
                commitMessageFormat: 'freeform'
            });

            (execSync as jest.Mock).mockReturnValue('mock git diff');
            const mockCreate = jest.fn().mockResolvedValue({
                content: [{ text: 'Custom generated commit message' }]
            });
            (Anthropic.prototype.messages as any) = { create: mockCreate };

            await customGenerator.generateCommitMessage();

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                model: 'custom-model',
                max_tokens: 200,
                temperature: 0.5,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: expect.stringContaining("freeform")
                    })
                ])
            }));
        });
    });
});