import { exec } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

exec("tsc", (error, stdout, stderr) => {
  if (error) {
    console.error(`TypeScript compilation error: ${error}`);
    return;
  }
  console.log("TypeScript compilation successful");

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const version = packageJson.version;

  // cli.js 파일 읽기
  const cliPath = path.join(__dirname, "dist", "cli.js");
  let cliContent = fs.readFileSync(cliPath, "utf8");

  // 버전 플레이스홀더 교체
  cliContent = cliContent.replace("__VERSION__", version);

  // 수정된 내용 저장
  fs.writeFileSync(cliPath, cliContent);

  console.log(`Version ${version} injected into cli.js`);
});
