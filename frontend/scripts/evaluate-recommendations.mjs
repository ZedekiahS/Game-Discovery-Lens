import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode:true }, appType:'custom' });
try {
  const { evaluateRecommendations } = await server.ssrLoadModule('/tests/recommendation-evaluation.ts');
  const report = evaluateRecommendations();
  await writeFile(process.argv[2] ?? '../docs/evaluations/recommendations-2026-10-25.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report.summary));
  if (report.summary.violations) process.exitCode = 1;
} finally { await server.close(); }
