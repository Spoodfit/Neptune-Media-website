import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function openAiSemanticAssistPlugin() {
  return {
    name: 'neptune-openai-semantic-assist',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/main.js')) return null;
      const originalCondition = 'if (candidates.length < 3 && state.policy?.workersAiAssistAvailable) {';
      const semanticCondition = "if (state.policy?.openAiAnalysisAvailable || (candidates.length < 3 && state.policy?.workersAiAssistAvailable)) {";
      const originalProgress = "setUploadProgress(54, 'Secours Workers AI gratuit…');";
      const semanticProgress = "setUploadProgress(54, state.policy?.openAiAnalysisAvailable ? 'Analyse éditoriale OpenAI…' : 'Secours Workers AI gratuit…');";
      let transformed = code
        .replace(originalCondition, semanticCondition)
        .replace(originalProgress, semanticProgress)
        .replace("console.warn('workers_ai_free_assist_unavailable', error);", "console.warn('semantic_ai_assist_unavailable', error);");
      if (transformed === code || !transformed.includes('openAiAnalysisAvailable')) {
        throw new Error('Unable to activate Neptune OpenAI semantic assist in local video engine.');
      }
      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  root: resolve(here, 'src'),
  base: '/studio/local-engine/',
  plugins: [openAiSemanticAssistPlugin()],
  build: {
    outDir: resolve(here, '../public/studio/local-engine'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      input: resolve(here, 'src/main.js'),
      output: {
        entryFileNames: 'neptune-video-local-engine-v1.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
});
