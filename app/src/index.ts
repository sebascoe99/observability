// 🟢 Inicia OpenTelemetry ANTES de cargar Express
import './tracing';

import express, { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import pino from 'pino';
import pinoHttp, { Options as PinoHttpOptions } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

// --- Configuración del logger principal ---
const logger = pino();

// --- Express app ---
const app = express();
const port = Number(process.env.PORT || 8080);

// --- Integración de logs HTTP con Pino ---
const httpLogger: PinoHttpOptions<IncomingMessage, ServerResponse> = {
  logger: logger as any, // compatibilidad tipada con Pino v9
};
app.use(pinoHttp(httpLogger));

// --- Registro de métricas Prometheus ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// --- Histograma para medir latencia HTTP ---
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histograma de latencias de solicitudes HTTP',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDuration);

// --- Middleware para medir latencia por ruta ---
app.use((req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDuration.startTimer({
    method: req.method,
    route: req.path,
  });
  res.on('finish', () => end({ status_code: String(res.statusCode) }));
  next();
});

// --- Rutas demo ---
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/hello', async (_req: Request, res: Response) => {
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 200)));
  res.json({ message: 'Hello Observability!' });
});

// --- Exponer métricas Prometheus ---
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// --- Arranque ---
app.listen(port, () => {
  logger.info({ port }, '🚀 Node demo API listening');
});
