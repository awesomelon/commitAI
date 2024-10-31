interface LanguageSpecificInstructions {
  [key: string]: string;
}

const LANGUAGE_INSTRUCTIONS: LanguageSpecificInstructions = {
  en: "Format: {type}: {Generate the title in English} + empty line + {Generate the body in English}",
  ko: "Format: {type}: {Generate the title in Korean} + empty line + {Generate the body in Korean}",
  ja: "Format: {type}: {Generate the title in Japanese} + empty line + {Generate the body in Japanese}",
  "zh-CN":
    "Format: {type}: {Generate the title in Simplified Chinese} + empty line + {Generate the body in Simplified Chinese}",
  "zh-TW":
    "Format: {type}: {Generate the title in Traditional Chinese} + empty line + {Generate the body in Traditional Chinese}",
};

export const COMMIT_MESSAGE_TEMPLATE = (lang: string) => {
  const languageInstruction =
    LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS.en;

  console.log(languageInstruction);

  return `You are a commit message generator.
Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
Rules:
- Title: <type>: <subject> (50 chars max)
- One blank line after title
- Body: bullet points with "-"
- ${languageInstruction}

Generate commit messages for this diff. Messages only, no explanations.`;
};

export const COMMIT_MESSAGE_EXAMPLE = `feat: Add user authentication system

- Implement secure login flow
- Add JWT token management
- Create password reset feature
- Set up email verification`;
