import { http, HttpResponse, delay } from 'msw';
import { MockDatabase } from './db';
import { ScenarioManager } from './scenarios';
import type { SubmitMatchRequest } from '../types/api';
import { queryParams, RequestError } from '../../functions/lib/http';

const db = MockDatabase.getInstance();
const scenarios = ScenarioManager.getInstance();

export const handlers = [
  // 1. GET /api/ranking
  http.get('/api/ranking', async ({ request }) => {
    const scenario = scenarios.getScenario();
    if (scenarios.latency) await delay(scenarios.latency);

    // Check scenario behaviors
    if (scenario === 'server_offline') {
      return HttpResponse.error();
    }
    if (scenario === 'error_500' || scenario === 'ranking_fails') {
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
      await delay(scenarios.nextDelay('ranking'));
    }

    if (scenario === 'empty') {
      return HttpResponse.json({
        items: [],
        totalItems: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    }

    const url = new URL(request.url);
    try { return HttpResponse.json(db.getRanking(queryParams(url))); }
    catch (error) { return HttpResponse.json({ error: error instanceof Error ? error.message : 'Invalid query' },
      { status: error instanceof RequestError ? error.status : 400 }); }
  }),

  // 2. GET /api/history
  http.get('/api/history', async ({ request }) => {
    const scenario = scenarios.getScenario();
    if (scenarios.latency) await delay(scenarios.latency);

    if (scenario === 'server_offline') {
      return HttpResponse.error();
    }
    if (scenario === 'error_500' || scenario === 'history_fails') {
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
    } else if (scenario === 'out_of_order') {
      await delay(scenarios.nextDelay('history'));
    }

    if (scenario === 'empty') {
      return HttpResponse.json({
        items: [],
        totalItems: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || undefined;
    try { return HttpResponse.json(db.getHistory({ ...queryParams(url), playerId })); }
    catch (error) { return HttpResponse.json({ error: error instanceof Error ? error.message : 'Invalid query' },
      { status: error instanceof RequestError ? error.status : 400 }); }
  }),

  // 3. POST /api/match
  http.post('/api/match', async ({ request }) => {
    const scenario = scenarios.getScenario();
    if (scenarios.latency) await delay(scenarios.latency);

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

    try {
      const result = db.insertMatch(payload);
      // Commit before the client times out. The same ID acknowledges immediately on retry,
      // including after a reload because the mock database persists the accepted record.
      if (scenario === 'idempotency_recovery' && !result.isDuplicate) {
        // Lose only the acknowledgement, immediately. Reads stay available and
        // the player's next retry acknowledges the already committed match.
        return HttpResponse.error();
      }
      if (scenario === 'timeout' && !result.isDuplicate) {
        await delay(6000);
        return HttpResponse.error();
      }
      return HttpResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
    } catch (error) { return HttpResponse.json({ error: error instanceof Error ? error.message : 'Match conflict' }, { status: 409 }); }
  }),
];
