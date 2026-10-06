import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        checker({
            typescript: {
                tsconfigPath: './tsconfig.app.json',
            },
        }),
    ],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});