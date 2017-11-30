/// <reference types="node" />
/// <reference types="bluebird" />
import * as Promise from 'bluebird';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as net from 'net';
export declare type NetConnectPromise = (port: number, hostname: string, cltSocket: net.Socket, req: Request) => Promise<net.Socket>;
export declare class Request extends http.IncomingMessage {
    auth?: {
        username?: string;
        password?: string;
    };
}
export declare abstract class BaseTunnel extends EventEmitter {
    abstract connect: NetConnectPromise;
    abstract use: (middleware: Middleware) => void;
    abstract listen: (path: string, callback?: (err?: Error, result?: any) => void) => this;
    abstract close: (callback?: (err?: Error, result?: any) => void) => this;
}
export declare class Tunnel extends BaseTunnel {
    constructor();
    connect: (port: number, host: string, _cltSocket: net.Socket, _req: Request) => Promise<net.Socket>;
    private notImplemented;
    use: (_middleware: Middleware) => void;
    listen: (_path: string, _callback?: ((err?: Error | undefined, result?: any) => void) | undefined) => this;
    close: (_callback?: ((err?: Error | undefined, result?: any) => void) | undefined) => this;
}
export declare type Middleware = (req: Request, cltSocket: net.Socket, head: Buffer, next: () => void) => void;
export declare const basicAuth: Middleware;
