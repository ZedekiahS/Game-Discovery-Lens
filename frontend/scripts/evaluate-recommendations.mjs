import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode:true }, appType:'custom' });
try {
  const { evaluateRecommendations } = await server.ssrLoadModule('/tests/recommendation-evaluation.ts');
  const fixture = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : undefined;
  const report = evaluateRecommendations(fixture);
  await writeFile(process.argv[2] ?? '../docs/evaluations/recommendations-2026-10-25.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report.summary));
  if (report.summary.violations) process.exitCode = 1;
} finally { await server.close(); }
