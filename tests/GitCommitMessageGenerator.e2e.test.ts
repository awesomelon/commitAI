
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import GitCommitMessageGenerator from "../src/GitCommitMessageGenerator";

describe('GitCommitMessageGenerator E2E Tests', () => {
    const testRepoPath = path.join(__dirname, 'test-repo');
    let generator: GitCommitMessageGenerator;

    beforeAll(() => {
        // Set up a test Git repository
        fs.mkdirSync(testRepoPath);
        process.chdir(testRepoPath);
        execSync('git init');
        execSync('git config user.email "test@example.com"');
        execSync('git config user.name "Test User"');

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }
        generator = new GitCommitMessageGenerator(apiKey);
    });

    afterAll(() => {
        // Clean up the test repository
        process.chdir(__dirname);
        fs.rmdirSync(testRepoPath, { recursive: true });
    });

    test('should generate commit message and create a commit', async () => {
        // Create a test file and stage it
        fs.writeFileSync(path.join(testRepoPath, 'test.txt'), 'Hello, World!');
        execSync('git add test.txt');

        // Generate commit message
        const commitMessage = await generator.generateCommitMessage();
        expect(commitMessage).toBeTruthy();

        // Commit changes
        await generator.commitChanges(commitMessage);

        // Verify that a commit was created
        const logOutput = execSync('git log -1 --pretty=%B').toString().trim();
        expect(logOutput).toBe(commitMessage);
    });

    test('should handle empty diff', async () => {
        // Try to generate commit message when there are no changes
        await expect(generator.generateCommitMessage()).rejects.toThrow('Failed to get Git diff');
    });

    test('should handle multiple file changes', async () => {
        // Create and modify multiple files
        fs.writeFileSync(path.join(testRepoPath, 'file1.txt'), 'Content 1');
        fs.writeFileSync(path.join(testRepoPath, 'file2.txt'), 'Content 2');
        fs.appendFileSync(path.join(testRepoPath, 'test.txt'), '\nNew line');
        execSync('git add .');

        // Generate commit message
        const commitMessage = await generator.generateCommitMessage();
        expect(commitMessage).toBeTruthy();

        // Commit changes
        await generator.commitChanges(commitMessage);

        // Verify that the commit message reflects multiple changes
        const logOutput = execSync('git log -1 --pretty=%B').toString().trim();
        expect(logOutput).toBe(commitMessage);
        expect(logOutput).toMatch(/file1\.txt|file2\.txt|test\.txt/);
    });
});