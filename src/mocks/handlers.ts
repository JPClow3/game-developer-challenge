import { http, HttpResponse, delay } from 'msw';
import { MockDatabase } from './db';
import { ScenarioManager } from './scenarios';
import type { SubmitMatchRequest } from '../types/api';

const db = MockDatabase.getInstance();
const scenarios = ScenarioManager.getInstance();

export const handlers = [
  // 1. GET /api/ranking
  http.get('/api/ranking', async ({ request }) => {
    const scenario = scenarios.getScenario();

    // Check scenario behaviors
    if (scenario === 'server_offline') {
      return HttpResponse.error();
    }
    if (scenario === 'error_500') {
      return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    if (scenario === 'error_400') {
      return HttpResponse.json({ error: 'Bad Request - Invalid query parameters' }, { status: 400 });
    }
    if (scenario === 'slow_network') {
      await delay(2500);
    } else if (scenario === 'timeout') {
      await delay(6000);
      return HttpResponse.error();
    } else if (scenario === 'out_of_order') {
      // Simulate variable latency
      const randomDelay = Math.floor(Math.random() * 800) + 200;
      await delay(randomDelay);
    }

    if (scenario === 'empty') {
      return HttpResponse.json({
        items: [],
        totalItems: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);
    const sessionDuration = url.searchParams.get('sessionDuration')
      ? parseInt(url.searchParams.get('sessionDuration')!, 10)
      : undefined;
    const spawnInterval = url.searchParams.get('spawnInterval')
      ? parseInt(url.searchParams.get('spawnInterval')!, 10)
      : undefined;

    const data = db.getRanking({ page, pageSize, sessionDuration, spawnInterval });
    return HttpResponse.json(data);
  }),

  // 2. GET /api/history
  http.get('/api/history', async ({ request }) => {
    const scenario = scenarios.getScenario();

    if (scenario === 'server_offline') {
      return HttpResponse.error();
    }
    if (scenario === 'error_500') {
      return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    if (scenario === 'error_400') {
      return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
    }
    if (scenario === 'slow_network') {
      await delay(2500);
    } else if (scenario === 'timeout') {
      await delay(6000);
      return HttpResponse.error();
    }

    if (scenario === 'empty') {
      return HttpResponse.json({
        items: [],
        totalItems: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || undefined;
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

    const data = db.getHistory({ playerId, page, pageSize });
    return HttpResponse.json(data);
  }),

  // 3. POST /api/match
  http.post('/api/match', async ({ request }) => {
    const scenario = scenarios.getScenario();

    if (scenario === 'server_offline') {
      return HttpResponse.error();
    }
    if (scenario === 'error_500') {
      return HttpResponse.json({ error: 'Failed to record match: Internal Server Error' }, { status: 500 });
    }
    if (scenario === 'error_400') {
      return HttpResponse.json({ error: 'Validation failed: Bad Request' }, { status: 400 });
    }
    if (scenario === 'slow_network') {
      await delay(2500);
    } else if (scenario === 'timeout') {
      await delay(6000);
      return HttpResponse.error();
    }

    let payload: SubmitMatchRequest;
    try {
      payload = (await request.json()) as SubmitMatchRequest;
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!payload.id || !payload.playerId || payload.score === undefined) {
      return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = db.insertMatch(payload);
    return HttpResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
  }),
];
