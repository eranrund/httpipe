var http = require('http'),
    io_server = require('socket.io'),
    io_client = require('socket.io-client'),
    crypto = require('crypto'),
    express = require('express'),
    events = require('events'),
    moment = require('moment'),
    _ = require('underscore')._,
    config = require('konphyg')(__dirname);

var server_config = config('server');


///////////////////////////////////////////////////////////////////////////////
// Frontend app (serves web clients + socket.io)
///////////////////////////////////////////////////////////////////////////////

var frontend_app = express();

frontend_app.configure(function(){
  var ejs = require('ejs');
  ejs.open = '<$';
  ejs.close = '$>';
  frontend_app.set('views', __dirname + '/views');
  frontend_app.engine('.html', ejs.__express)
});

frontend_app.get('/', function(req, resp) {
    resp.render('index.html', {
        server_config: server_config
    });
});

frontend_app.use(express.static(__dirname + '/static'));

frontend_app.use(function(req, resp) {
    resp.send(404, 'Not found');
});

///////////////////////////////////////////////////////////////////////////////
// socket.io server
///////////////////////////////////////////////////////////////////////////////

var SocketIoServer = (function() {
    // Constructor
    function SocketIoServer(http_server) {
        var self = this;
        events.EventEmitter.call(this);

        // Init
        this.server = http_server;

        // socket.io server
        this.io = io_server.listen(this.server, {
            resource: '/__httpipe_socket.io'
        });

        this.io.on('connection', function(socket) {
            socket.on('room:join', function(data) {
                self.on_room_join(socket, data);
            });

            // pluggable events (ugly...)
            _.each(['fwd_response', 'replay_request'], function(event) {
                socket.on(event, function() {
                    var args = [event, socket];
                    _.each(arguments, function(arg) { args.push(arg); });
                    self.emit.apply(self, args);
                });
            });
        });

    }

    SocketIoServer.prototype.__proto__ = events.EventEmitter.prototype;

    // broadcast to everyone
    /* UNUSED SocketIoServer.prototype.broadcast = function() {
        this.io.sockets.emit.apply(this.io.sockets, arguments);
        return this;
    }; */

    // broadcast to a room
    SocketIoServer.prototype.broadcast_to = function() {
        var room_name = [].shift.apply(arguments);
        var room = this.io.sockets.in(room_name);
        room.emit.apply(room, arguments);
        return this;
    };

    // check if a room is empty or not
    SocketIoServer.prototype.is_room_empty = function(room_name) {
        return this.io.sockets.clients(room_name).length == 0;
    };

    // socket.io event: join room
    SocketIoServer.prototype.on_room_join = function(socket, data) {
        console.log('SocketIoServer: on_room_join: '+data);
        socket.join(data);
    };

    return SocketIoServer;
})();


///////////////////////////////////////////////////////////////////////////////
// Request Catcher Server
///////////////////////////////////////////////////////////////////////////////

var ReqCatcherServer = (function() {
    // Constructor
    function ReqCatcherServer(frontend_hosts) {
        var self = this;
        events.EventEmitter.call(this);

        this.frontend_hosts = frontend_hosts;

        this.app = http
            .createServer(function(req, resp) { self.on_raw_request(req, resp); })
            .on('clientError', this.on_client_error);
    }

    ReqCatcherServer.prototype.__proto__ = events.EventEmitter.prototype;

    // Incoming HTTP request handler that reads all incoming
    // data before moving on to on_request
    ReqCatcherServer.prototype.on_raw_request = function(req, resp, next) {
        var that = this;

        // Get the session id we are operating with
        var sid = req.headers.host.split('.')[0];

        //console.log('ReqCatcherServer: on_raw_request: '+req.url);

        // httpipe specific data
        req.httpipe_data = {
            id: crypto.randomBytes(16).toString('hex'),
            method: req.method,
            url: req.url,
            headers: req.headers,
            data: null,
            started_at: moment.utc().valueOf(),
            sid: sid
        };

        // Read incoming data
        var data = '';
        req.on('data', function(chunk) {
            data += chunk;
        });

        // Wait for request to end
        req.on('end', function() {
            that.on_request(req, data, resp);
        });
    };

    // Complete incoming HTTP request
    ReqCatcherServer.prototype.on_request = function(req, data, resp) {
        console.log('ReqCatcherServer: on_request: '+req.method+' '+req.url+ ' ('+data.length+' data bytes)');

        // Store data
        req.httpipe_data.data = data;

        // See if we have any listeners - if not we'll discard this request
        if (!this.listeners('request').length) {
            resp.writeHead(200);
            resp.end('OK');
            return;
        }

        this.emit('request', req.httpipe_data, resp);
    };

    // TODO
    ReqCatcherServer.prototype.on_client_error = function() {
        console.log('on client error');
    };

    return ReqCatcherServer;
})();


///////////////////////////////////////////////////////////////////////////////
// httpi.pe logic
///////////////////////////////////////////////////////////////////////////////

// make everything play together
var httpipeBusinessLogic = (function(reqcatcher_server, socketio_server) {
    // request id -> {req: ..., resp: ...}
    var pending_fwd_requests = {};

    // catch incoming requests
    reqcatcher_server.on('request', function(req, resp) {
        // Get session id
        var sid = req.sid;

        // See if we have any forwarders in the fwd socketio room
        // If we do, we'll let one of them handle generating a response
        // (they were made aware of it through the broadcast below).
        // If we don't, we'll generate a response and finish with the request
        if (socketio_server.is_room_empty(sid+':fwd')) {
            console.log('httpi.pe: ['+sid+'] '+req.method+' '+req.url+ ' ('+req.data.length+' data bytes): no forwarders');

            req.forwarded = false;
            resp.writeHead(200);
            resp.end('OK');

            // Broadcast the request & response
            socketio_server.broadcast_to(sid, 'request', req);

            socketio_server.broadcast_to(sid, 'response', req.id, {
                status_code: 200,
                headers: {}, // TODO how to figure out the headers we write
                data: 'OK',
                auto: true, // Indicates this is generated as we have no forwarders
            });
        } else {
            // Store state to enable forwarder response
            req.forwarded = true;
            pending_fwd_requests[req.id] = {req: req, resp: resp};

            // Broadcast request
            socketio_server.broadcast_to(sid, 'request', req);
        }
    });

    // handle responses from forwarders
    socketio_server.on('fwd_response', function(socket, data) {
        var req_id = data.req_id;
        var req_info = pending_fwd_requests[req_id];
        if (!req_info) {
            console.log('httpi.pe: fwd_response: unknown id: '+req_id);
            return;
        }

        console.log('httpi.pe: fwd_response: '+req_info.req.url+': '+data.status_code);

        if (req_info.resp) {
            req_info.resp.writeHead(data.status_code, data.headers);
            req_info.resp.write(new Buffer(data.data, 'base64'));
            req_info.resp.end();
        }

        // Broadcast the response
        socketio_server.broadcast_to(req_info.req.sid, 'response', req_info.req.id, {
            status_code: data.status_code,
            headers: data.headers,
            data: data.data,
            auto: false, // Indicates this is from a forwarder
        });

        delete pending_fwd_requests[req_id];
    });

    // replay requests from frontend
    socketio_server.on('replay_request', function(socket, req) {
        // TODO vertify req?

        // Add our metadata
        req.id = crypto.randomBytes(16).toString('hex');
        req.started_at = moment.utc().valueOf();

        req.data = req.data ? req.data : '';

        // See if there are forwarders or not
        if (socketio_server.is_room_empty(req.sid + ':fwd')) {
            console.log('httpi.pe: REPLAY: '+req.method+' '+req.url+ ' ('+req.data.length+' data bytes): no forwarders');

            req.forwarded = false;

            // Broadcast the request & response
            socketio_server.broadcast_to(req.sid, 'request', req);
            socketio_server.broadcast_to(req.sid, 'response', req.id, {
                status_code: 200,
                headers: {}, // TODO how to figure out the headers we write
                data: 'OK',
                auto: true, // Indicates this is generated as we have no forwarders
            });
        } else {
            // Store state to enable forwarder response
            req.forwarded = true;
            pending_fwd_requests[req.id] = {req: req, resp: null}; // No response as there isn't an actual client waiting for one

            // Broadcast request
            socketio_server.broadcast_to(req.sid, 'request', req);
        }

    });
});

///////////////////////////////////////////////////////////////////////////////
// Main app
///////////////////////////////////////////////////////////////////////////////

// Configuration
frontend_hosts = server_config.frontend_hosts;

// Init main server
var app = express()
  , server = http.createServer(app);

// socketio
var socketio_server = new SocketIoServer(server);

// frontend
_.each(frontend_hosts, function(host) {
    app.use(express.vhost(host, frontend_app));
});

// request catcher
var reqcatcher_server = new ReqCatcherServer(frontend_hosts);
app.use(express.vhost(server_config.reqcatcher_host, reqcatcher_server.app));

// httpi.pe app
httpipeBusinessLogic(reqcatcher_server, socketio_server);

// Listen
console.log("Listening on "+server_config.port);
server.listen(server_config.port);

