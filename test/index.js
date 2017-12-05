"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const chai_1 = require("chai");
const net = require("net");
const rp = require("request-promise");
Promise.config({
    longStackTraces: true,
});
const request = rp.defaults({
    resolveWithFullResponse: true,
    simple: false,
});
const nodeTunnel = require("../src/index");
const PORT = '3128';
describe('tunnel', function () {
    describe('proxy', function () {
        this.timeout(10000);
        before(function (done) {
            this.tunnel = nodeTunnel.createTunnel();
            return this.tunnel.listen(PORT, done);
        });
        after(function () {
            return this.tunnel.close();
        });
        return it('should proxy http requests', function (done) {
            const opts = {
                url: 'https://api.resin.io/ping',
                proxy: `http://localhost:${PORT}`,
                tunnel: true,
            };
            request.get(opts)
                .then((res) => {
                chai_1.expect(res.statusCode).to.equal(200);
                chai_1.expect(res.body).to.equal('OK');
                done();
            });
        });
    });
    describe('events', function () {
        this.timeout(60000);
        before(function (done) {
            this.tunnel = nodeTunnel.createTunnel();
            this.events = [];
            this.tunnel.on('connect', function () {
                return this.events.push({
                    name: 'connect',
                    data: arguments,
                });
            }.bind(this));
            this.tunnel.on('error', function () {
                return this.events.push({
                    name: 'error',
                    data: arguments,
                });
            }.bind(this));
            return this.tunnel.listen(PORT, done);
        });
        after(function () {
            return this.tunnel.close();
        });
        it('should generate connect event on success', function (done) {
            this.events = [];
            const opts = {
                url: 'https://api.resin.io/ping',
                proxy: `http://localhost:${PORT}`,
                tunnel: true,
            };
            request(opts)
                .promise()
                .delay(500)
                .then(() => {
                chai_1.expect(this.events.length).to.equal(1);
                chai_1.expect(this.events[0]).to.have.property('name').that.equals('connect');
                chai_1.expect(this.events[0]).to.have.deep.property('data[0]').that.equal('api.resin.io');
                chai_1.expect(this.events[0]).to.have.deep.property('data[1]').that.equal('443');
                done();
            });
        });
        return it('should generate connect and error events on error', function (done) {
            this.events = [];
            const opts = {
                url: 'https://api.resinosuchdomain.io/ping',
                proxy: `http://localhost:${PORT}`,
                tunnel: true,
            };
            request(opts)
                .catch(() => {
                chai_1.expect(this.events.length).to.equal(1);
                chai_1.expect(this.events[0]).to.have.property('name').that.equals('error');
                chai_1.expect(this.events[0]).to.have.deep.property('data[0]').that.is.instanceof(Error);
                done();
            });
        });
    });
    return describe('half-close connections between tunnel and server', function () {
        this.timeout(5000);
        let sock;
        const serverPort = 8080;
        const connectStr = `CONNECT localhost:${serverPort} HTTP/1.0\r\nHost: localhost:${serverPort}\r\n\r\n`;
        beforeEach(function (done) {
            this.tunnel = nodeTunnel.createTunnel();
            this.tunnel.connect = function (port, host) {
                sock = net.connect(port, host);
                return new Promise(function (resolve, reject) {
                    return sock
                        .on('connect', resolve)
                        .on('error', reject);
                }).return(sock);
            };
            this.tunnel.listen(PORT, done);
        });
        afterEach(function () {
            this.tunnel.close();
            this.server.close();
        });
        it('should be fully closed when client sends FIN', function (done) {
            this.server = net.createServer({ allowHalfOpen: true }, _socket => sock.on('close', done));
            this.server.listen(serverPort, function () {
                let socket;
                socket = net.createConnection(PORT, function () {
                    socket.write(connectStr);
                    socket.on('data', _data => socket.end());
                });
            });
        });
        it('should be fully closed when server sends FIN', function (done) {
            this.server = net.createServer({ allowHalfOpen: true }, function (socket) {
                sock.on('close', done);
                socket.end();
            });
            this.server.listen(serverPort, function () {
                let socket;
                socket = net.createConnection(PORT, () => socket.write(connectStr));
            });
        });
    });
});
