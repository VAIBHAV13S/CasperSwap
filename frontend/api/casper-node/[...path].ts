import type { VercelRequest, VercelResponse } from '@vercel/node';

const UPSTREAM_BASE = 'https://node.testnet.casper.network';

function getUpstreamUrl(req: VercelRequest) {
    // req.url will look like: /api/casper-node[/...]
    // We want to forward anything after /api/casper-node to the upstream.
    const url = req.url || '/';
    const suffix = url.replace(/^\/api\/casper-node/, '');
    return `${UPSTREAM_BASE}${suffix || '/rpc'}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const upstreamUrl = getUpstreamUrl(req);

    try {
        const upstreamRes = await fetch(upstreamUrl, {
            method: req.method,
            headers: {
                // Forward content-type for JSON-RPC
                'content-type': req.headers['content-type'] || 'application/json',
            },
            body: req.method && req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body ?? {}) : undefined,
        });

        const text = await upstreamRes.text();
        res.status(upstreamRes.status);
        res.setHeader('content-type', upstreamRes.headers.get('content-type') || 'application/json');
        res.send(text);
    } catch (err: any) {
        res.status(502).json({
            error: 'Upstream Casper RPC request failed',
            message: err?.message || String(err),
        });
    }
}
