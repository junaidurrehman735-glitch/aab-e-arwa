import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging for API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    brand: 'AAB E ARWA',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  try {
    console.log('AAB E ARWA: Supabase PostgreSQL production backend configured.');

    if (isDev) {
      console.log('Mounting Vite dev middleware...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`AAB E ARWA Water Management running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
