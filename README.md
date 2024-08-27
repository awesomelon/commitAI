# AutoCommit

AutoCommit is a CLI tool that automatically generates commit messages using AI.

## Installation

Install the package globally using npm:

```
npm install -g autocommit
```

## Usage

Before using AutoCommit, you need to set your Anthropic API key:

```
autocommit --key YOUR_API_KEY
```

To generate a commit message and create a commit:

```
autocommit
```

### Options

- `-m, --max-tokens <number>`: Set max tokens for message generation (default: 100)
- `-t, --temperature <number>`: Set temperature for message generation (default: 0)
- `-f, --format <format>`: Set commit message format (conventional or freeform, default: conventional)

Example with options:

```
autocommit -m 150 -t 0.2 -f freeform
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Run tests: `npm test`

## License

This project is licensed under the MIT License.