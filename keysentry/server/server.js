import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

import healthRouter from './routes/health.js';
import webhookRouter from './routes/webhook.js';
import apiRouter from './routes/api.js';

import { initDb, getDb } from './services/db.js';
import { startPollingWorker } from './services/githubService.js';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

app.use(cors({ origin: CLIENT_URL, credentials: true }));

app.use('/api/webhook', express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  try {
    const db = getDb();
    if (db?.data?.stats) {
      socket.emit('stats-update', db.data.stats);
    }
  } catch (e) {
    // DB not yet initialized
  }

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

app.use('/health', healthRouter);
app.use('/api/webhook', webhookRouter(io));
app.use('/api', apiRouter(io));
app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status === 400 ? 'Invalid JSON body' : 'Request could not be completed' });
});

async function startServer() {
  try {
    await initDb();
    
    httpServer.listen(PORT, process.env.HOST || '127.0.0.1', () => {
      console.log(`
  _  __          ____             _              
 | |/ /___ _   _/ ___|  ___ _ __ | |_ _ __ _   _ 
 | ' // _ \\ | | \\___ \\ / _ \\ '_ \\| __| '__| | | |
 | . \\  __/ |_| |___) |  __/ | | | |_| |  | |_| |
 |_|\\_\\___|\\__, |____/ \\___|_| |_|\\__|_|   \\__, |
           |___/                           |___/ 
      `);
      console.log(`KeySentry Server is running on http://localhost:${PORT}`);
    });

    startPollingWorker(io);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
