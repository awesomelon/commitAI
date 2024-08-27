#!/usr/bin/env node

import { program } from 'commander';
import Configstore from 'configstore';
import GitCommitMessageGenerator from './GitCommitMessageGenerator.js';

const config = new Configstore('autocommit');

program
    .version('1.0.0')
    .description('Automatically generate commit messages using AI')
    .option('-k, --key <key>', 'Set Anthropic API key')
    .option('-m, --max-tokens <number>', 'Set max tokens for message generation', '100')
    .option('-t, --temperature <number>', 'Set temperature for message generation', '0')
    .option('-f, --format <format>', 'Set commit message format (conventional or freeform)', 'conventional')
    .action(async (options) => {
        if (options.key) {
            config.set('apiKey', options.key);
            console.log('API key saved successfully.');
            return;
        }

        const apiKey = config.get('apiKey');
        if (!apiKey) {
            console.error('API key not set. Please set it using --key option.');
            return;
        }

        const generator = new GitCommitMessageGenerator(apiKey, {
            maxTokens: parseInt(options.maxTokens),
            temperature: parseFloat(options.temperature),
            commitMessageFormat: options.format as 'conventional' | 'freeform'
        });

        try {
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
        }
    });

program.parse(process.argv);