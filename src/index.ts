import basicAuthParser = require('basic-auth-parser');
import * as Promise from 'bluebird';
import { EventEmitter } from 'events';
import * as http from 'http';
import MiddlewareHandler = require('middleware-handler');
import * as net from 'net';
import * as url from 'url';

interface MiddlewareHandlerAsync extends MiddlewareHandler {
	handleAsync(args?: any[]): Promise<void>;
}
MiddlewareHandler.prototype = Promise.promisifyAll(MiddlewareHandler.prototype) as MiddlewareHandlerAsync;

// Connect an http socket to another tcp server.
// Based on tunneling proxy code from https://nodejs.org/api/http.html
export type NetConnectPromise = (port: number, hostname: string, cltSocket: net.Socket, req: Request) => Promise<net.Socket>;

interface ConnectSocketOptions {
	cltSocket: net.Socket;
	hostname: string;
	port: number;
	head: Buffer;
	connect: NetConnectPromise;
	req: Request;
}

const connectSocket = ({ cltSocket, hostname, port, head, connect, req }: ConnectSocketOptions) =>
	connect(port, hostname, cltSocket, req)
	.then((srvSocket) => {
		cltSocket.write('HTTP/1.0 200 Connection Established\r\nProxy-agent: Resin-VPN\r\n\r\n');
		srvSocket.write(head);
		srvSocket.pipe(cltSocket, {end: false});
		cltSocket.pipe(srvSocket, {end: false});

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

// Create an http CONNECT tunneling proxy
// Expressjs-like middleware can be used to change destination (by modifying req.url)
// or for filtering requests (for example by terminating a socket early.)
//
// Returns an object with methods "listen" to start listening on a port,
// and "use" for adding middleware.
//
// Middleware are functions of the form (request, controlSocket, head, next).
export class Request extends http.IncomingMessage {
	auth?: {
		username?: string;
		password?: string;
	};
}

export interface Tunnel extends EventEmitter {
	connect: NetConnectPromise;
	use: (middleware: Middleware) => void;
	listen: (path: string, callback?: (err?: Error, result?: any) => void) => this;
	close: (callback?: (err?: Error, result?: any) => void) => this;
}

export const createTunnel = (): Tunnel => {
	const tunnel = new EventEmitter() as Tunnel;

	const middleware = new MiddlewareHandler() as MiddlewareHandlerAsync;

	const server = http.createServer((_req, res) => {
		res.writeHead(405, {'Content-Type': 'text/plain'});
		res.end('Method not allowed');
	});

	server.on('connect', (req: Request, cltSocket: net.Socket, head: Buffer) =>
		middleware.handleAsync([ req, cltSocket, head ])
		.then(() => {
			const srvUrl = url.parse(`http://${req.url}`);
			return connectSocket({
				cltSocket,
				hostname: srvUrl.hostname!,
				port: parseInt(srvUrl.port!, 10),
				head,
				connect: tunnel.connect,
				req,
			})
			.then(() =>
				tunnel.emit('connect', srvUrl.hostname, srvUrl.port, head));
		}).catch((err) => {
			tunnel.emit('error', err);
			cltSocket.destroy();
		}));

	tunnel.connect = (port: number, host: string, _cltSocket: net.Socket, _req: Request): Promise<net.Socket> =>
		new Promise((resolve, reject) => {
			const socket = net.connect(port, host);
			socket.on('connect', () => resolve(socket));
			socket.on('error', reject);
		});
	tunnel.use = middleware.use.bind(middleware);
	tunnel.listen = server.listen.bind(server);
	tunnel.close = server.close.bind(server);

	return tunnel;
};

// Proxy authorization middleware for http tunnel.
export type Middleware = (req: Request, cltSocket: net.Socket, head: Buffer, next: () => void) => void;
export const basicAuth: Middleware = (req, _cltSocket, _head, next) => {
	if (req.headers['proxy-authorization'] != null) {
		req.auth = basicAuthParser(req.headers['proxy-authorization']!);
	}
	return next();
};
