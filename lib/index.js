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
class BaseTunnel extends events_1.EventEmitter {
}
exports.BaseTunnel = BaseTunnel;
class Tunnel extends BaseTunnel {
    constructor() {
        super();
        this.connect = (port, host, _cltSocket, _req) => {
            const socket = net.connect(port, host);
            return new Promise((resolve, reject) => {
                socket.on('connect', () => resolve(socket));
                socket.on('error', reject);
            });
        };
        this.notImplemented = () => { throw new Error(); };
        this.use = (_middleware) => { this.notImplemented(); return; };
        this.listen = (_path, _callback) => { this.notImplemented(); return this; };
        this.close = (_callback) => { this.notImplemented(); return this; };
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
                connect: this.connect,
                req,
            })
                .then(() => this.emit('connect', srvUrl.hostname, srvUrl.port, head));
        }).catch((err) => {
            this.emit('error', err);
            cltSocket.destroy();
        }));
        this.use = middleware.use.bind(middleware);
        this.listen = server.listen.bind(server);
        this.close = server.close.bind(server);
    }
}
exports.Tunnel = Tunnel;
exports.basicAuth = (req, _cltSocket, _head, next) => {
    if (req.headers['proxy-authorization'] != null) {
        req.auth = basicAuthParser(req.headers['proxy-authorization']);
    }
    return next();
};
