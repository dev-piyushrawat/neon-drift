import { defineConfig } from 'vite';

export default defineConfig({
  // The same static build works at the root or under an arbitrary Pages repository path.
  base: './',
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } }
    }
  }
});
