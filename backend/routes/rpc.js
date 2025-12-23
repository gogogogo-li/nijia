import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// RPC Proxy endpoint to bypass CORS issues
// This forwards JSON-RPC requests to the OneLabs RPC endpoint
const RPC_URL = process.env.ONECHAIN_RPC || 'https://rpc-testnet.onelabs.cc:443';

/**
 * POST /api/rpc
 * Proxies JSON-RPC requests to the OneLabs RPC endpoint
 */
router.post('/', async (req, res) => {
    try {
        const rpcRequest = req.body;

        // Log the RPC request (but not sensitive data)
        logger.info('RPC Proxy Request:', {
            method: rpcRequest.method,
            id: rpcRequest.id
        });

        // Forward request to the actual RPC endpoint
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(rpcRequest)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('RPC Proxy Error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });

            return res.status(response.status).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: `RPC error: ${response.statusText}`,
                    data: errorText
                },
                id: rpcRequest.id
            });
        }

        const data = await response.json();

        // Log successful response
        logger.info('RPC Proxy Response:', {
            method: rpcRequest.method,
            id: rpcRequest.id,
            hasResult: !!data.result,
            hasError: !!data.error
        });

        return res.json(data);

    } catch (error) {
        logger.error('RPC Proxy Exception:', {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: `Internal proxy error: ${error.message}`
            },
            id: req.body?.id || null
        });
    }
});

/**
 * GET /api/rpc/health
 * Check if the RPC endpoint is reachable
 */
router.get('/health', async (req, res) => {
    try {
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'sui_getLatestCheckpointSequenceNumber',
                params: [],
                id: 1
            })
        });

        const data = await response.json();

        res.json({
            status: 'ok',
            rpcEndpoint: RPC_URL,
            latestCheckpoint: data.result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            rpcEndpoint: RPC_URL,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

export default router;
