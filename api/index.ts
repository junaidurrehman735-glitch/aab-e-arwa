import express from 'express';
import { apiRouter } from '../src/server/apiRouter.ts';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Handle requests with /api prefix as well as without /api prefix
app.use('/api', apiRouter);
app.use(apiRouter);

export default app;
