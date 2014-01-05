Replay Proxy
------------

This proxy can be used for proxying request and also doing record-replay. The initial idea is to forward request that do not match any routes to the origin server.

How to use ?
------------

Clone the repo and include the "proxy-server.js"

var proxyServer = require('./proxy-server');

proxyServer.proxy(PORT, HOST, [CONFIG]); -> proxyServer.proxy(3000, 'http://services.xyz.com', { responseDirectory: '/tmp/responses' });


