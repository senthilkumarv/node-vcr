var proxyServer = require('./proxy-server')

proxyServer.proxy(3000, "http://www.google.com", {
  responseDirectory: '/tmp/responses'
});

