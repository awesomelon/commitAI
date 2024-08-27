# commit-ai

commit-ai is a CLI tool that automatically generates Git commit messages using AI.

## Features

- Multiple commit message suggestions using AI
- Customizable message generation options
- Easy-to-use CLI interface
- Interactive commit message selection using arrow keys
- Visual progress indication for commit message generation and commit process

## Installation

You can install it globally using npm:

```
npm install -g @j-ho/commit-ai
```

## Usage

Before using commit-ai, you need to set up your Anthropic API key:

```
commit-ai --key YOUR_API_KEY
```

To generate a commit message, simply run:

```
commit-ai
```

### Options

- `-k, --key <key>`: Set Anthropic API key
- `-m, --max-tokens <number>`: Set max tokens for message generation (default: 300)
- `-t, --temperature <number>`: Set temperature for message generation (default: 0.7)
- `-f, --format <format>`: Set commit message format (conventional or freeform, default: conventional)
- `-n, --number <number>`: Number of commit message suggestions to generate (default: 3)

Example:

```
commit-ai -n 5 -m 400 -t 0.8 -f freeform
```

This command generates 5 freeform commit message suggestions, using a maximum of 400 tokens and a temperature of 0.8.

## How It Works

1. Analyzes staged changes in the current Git repository
2. Uses AI to generate multiple commit message candidates (with visual progress indication)
3. Displays the list of generated messages
4. Allows the user to select a message using arrow keys or cancel the commit
5. Performs the Git commit with the selected message (with visual progress indication)

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Run tests: `npm test`

## Dependencies

- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk): For interacting with the Anthropic AI API
- [@inquirer/prompts](https://www.npmjs.com/package/@inquirer/prompts): For interactive command-line user interfaces
- [commander](https://www.npmjs.com/package/commander): For building the command-line interface
- [configstore](https://www.npmjs.com/package/configstore): For storing configuration data
- [ora](https://www.npmjs.com/package/ora): For elegant terminal spinners

## License

This project is licensed under the MIT License.

## Contributing

We welcome all forms of contributions, including bug reports, feature suggestions, and pull requests. For major changes, please open an issue first to discuss what you would like to change.