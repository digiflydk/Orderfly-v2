const { loadTs } = require('./load-ts.cjs');
const protocol = loadTs('src/lib/printing/cloudprnt-http.ts');

// In-memory HTTP-shaped harness only. No socket, database, credentials or production import.
function createCloudPrntSimulator({ mac, token = 'fixture-job-1', body = 'Fixture kitchen job\n' } = {}) {
  let state = 'queued', lastOutcome = null;
  const expectedMac = mac.toLowerCase();
  const bytes = Buffer.from(body, 'utf8');
  const reply = (status, body = '', contentType = 'text/plain') => ({ status, body, headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
  const identify = value => value.mac === expectedMac && value.token === token;
  return {
    get state() { return state; },
    // Caller explicitly declares a lost result. Never infer success from idle/missing optional fields.
    loseResult() { if (state === 'awaiting_result') state = 'uncertain'; },
    request({ method, query = '', body = '', contentType = 'application/json' }) {
      try {
        if (method === 'POST') {
          const poll = protocol.parseCloudPrntPoll(body, contentType);
          if (poll.printerMAC !== expectedMac) return reply(404);
          if (state === 'awaiting_result' && poll.jobToken === token && poll.status.kind === 'reported_error') {
            state = 'reported_failure';
          }
          const result = protocol.cloudPrntPollResponse(poll, state === 'queued'
            ? { jobToken: token, mediaTypes: ['text/plain'] } : null);
          if (result.jobReady) state = 'awaiting_result'; // POST owns the simulated offer, never GET.
          return reply(200, JSON.stringify(result), 'application/json');
        }
        if (method === 'GET') {
          const request = protocol.parseCloudPrntJobQuery(query);
          if (!identify(request) || state !== 'awaiting_result') return reply(404);
          if (request.mediaType !== null && request.mediaType !== 'text/plain') return reply(415);
          return reply(200, Buffer.from(bytes), 'text/plain'); // Repeated GET returns identical bytes without mutation.
        }
        if (method === 'DELETE') {
          const result = protocol.parseCloudPrntConfirmation(query);
          if (!identify(result)) return reply(404);
          if (lastOutcome !== null) return reply(lastOutcome === result.outcome ? 200 : 409);
          if (!['awaiting_result', 'uncertain', 'reported_failure'].includes(state)) return reply(409);
          lastOutcome = result.outcome;
          state = result.outcome;
          return reply(200); // Acknowledgment contains no JSON.
        }
        return reply(405);
      } catch (error) {
        if (error instanceof protocol.CloudPrntProtocolError) return reply(400);
        throw error;
      }
    },
  };
}
module.exports = { createCloudPrntSimulator };
