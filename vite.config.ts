import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router-dom')) {
            return 'router';
          }

          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }

          if (id.includes('node_modules/three')) {
            return 'three-core';
          }

          if (id.includes('node_modules/@react-three/fiber')) {
            return 'r3f';
          }

          if (id.includes('node_modules/@react-three/drei')) {
            return 'drei';
          }

          if (
            id.includes('node_modules/@react-three/postprocessing') ||
            id.includes('node_modules/postprocessing')
          ) {
            return 'effects';
          }

          return undefined;
        },
      },
    },
  },
});
