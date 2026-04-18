import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import routes from './routes/index.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

connectDB();

app.use('/api', routes);

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'BitGuard AI' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`BitGuard backend running on http://localhost:${PORT}`));
