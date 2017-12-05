"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const basicAuthParser = require("basic-auth-parser");
const Promise = require("bluebird");
const events_1 = require("events");
const http = require("http");
const MiddlewareHandler = require("middleware-handler");
const net = require("net");
const url = require("url");
MiddlewareHandler.prototype = Promise.promisifyAll(MiddlewareHandler.prototype);
const connectSocket = ({ cltSocket, hostname, port, head, connect, req }) => connect(port, hostname, cltSocket, req)
    .then((srvSocket) => {
    cltSocket.write('HTTP/1.0 200 Connection Established\r\nProxy-agent: Resin-VPN\r\n\r\n');
    srvSocket.write(head);
    srvSocket.pipe(cltSocket, { end: false });
    cltSocket.pipe(srvSocket, { end: false });
    return Promise.fromCallback((cb) => {
        cltSocket.on('error', cb);
        srvSocket.on('error', cb);
        cltSocket.on('end', cb);
        srvSocket.on('end', cb);
    }).finally(() => {
        srvSocket.destroy();
        cltSocket.destroy();
    });
}).tapCatch(() => {
    cltSocket.end('HTTP/1.0 500 Internal Server Error\r\n');
    cltSocket.destroy();
});
class Request extends http.IncomingMessage {
}
exports.Request = Request;
exports.createTunnel = () => {
    const tunnel = new events_1.EventEmitter();
    const middleware = new MiddlewareHandler();
    const server = http.createServer((_req, res) => {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method not allowed');
    });
    server.on('connect', (req, cltSocket, head) => middleware.handleAsync([req, cltSocket, head])
        .then(() => {
        const srvUrl = url.parse(`http://${req.url}`);
        return connectSocket({
            cltSocket,
            hostname: srvUrl.hostname,
            port: parseInt(srvUrl.port, 10),
            head,
            connect: tunnel.connect,
            req,
        })
            .then(() => tunnel.emit('connect', srvUrl.hostname, srvUrl.port, head));
    }).catch((err) => {
        tunnel.emit('error', err);
        cltSocket.destroy();
    }));
    tunnel.connect = (port, host, _cltSocket, _req) => new Promise((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.on('connect', () => resolve(socket));
        socket.on('error', reject);
    });
    tunnel.use = middleware.use.bind(middleware);
    tunnel.listen = server.listen.bind(server);
    tunnel.close = server.close.bind(server);
    return tunnel;
};
exports.basicAuth = (req, _cltSocket, _head, next) => {
    if (req.headers['proxy-authorization'] != null) {
        req.auth = basicAuthParser(req.headers['proxy-authorization']);
    }
    return next();
};
