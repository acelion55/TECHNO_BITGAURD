import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import routes from './routes/index.js';

const app = express();

// Security headers
app.use(helmet());

// CORS — allow credentials (cookies) from frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,   // required for httpOnly cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(cookieParser());  // parse httpOnly cookies

connectDB();

app.use('/api', routes);

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'BitGuard AI' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`BitGuard backend running on http://localhost:${PORT}`));
