import type { Request, Response } from 'express';
import { app, ensureBackendReady } from '../backend/server.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await ensureBackendReady();

    const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
    const apiPath = (url.searchParams.get('__path') ?? '').replace(/^\/+/, '');
    const query = new URLSearchParams(url.searchParams);
    query.delete('__path');
    const search = query.toString();

    req.url = `/api/${apiPath}${search ? `?${search}` : ''}`;
    app(req, res);
  } catch (error) {
    console.error('Failed to initialize API backend:', error);
    res.status(503).json({ error: 'API service is not ready.' });
  }
}
