// Workers Builds owns CI for the existing Direct Upload Pages project.
// This controller has no public route, cron, storage binding or app traffic.
export default { fetch() { return new Response('Not found', { status: 404 }); } };
