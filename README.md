httpi.pe
========

httpi.pe makes it easier to test code running on a local web server that is not exposed to the outer world.
httpi.pe consists of 3 parts that play together using [socket.io](http://socket.io): a node.js server, a web frontend and a (optional) forwarder.
The server accepts incoming requests, and depending on the host the requests are directed at, either serves the frontend content (the static files), or captures the request so that it can be displayed on the web frontend or handled by the forwarder. The web frontend allows you to view captured requests, as well as replay them - no more working hard to get that webhook to be resent!
Optionally, you may run a forwarder (client_fwd.js) and have it forward the requests to a web server of your choice, such as one running on your local development machine. If a forwarder is not used httpi.pe will return a simple 200 OK response to each request it receives.

You can see it live by going to [http://httpi.pe/](http://httpi.pe/).

When using the httpi.pe frontend you are assigned a random session id which is used to separate your requests from other users requests, so that multiple people can use a single httpi.pe server. To capture/forward requests to a given session id, you will need to use the URL http://sessionid.httpi.pe/ (for example http://dKLDKskAKKA.httpi.pe/). You can see your session id when you browse to [httpi.pe](http://httpi.pe/).

Using the forwarder
-------------------
Okay, so capturing requests is nice and useful - but this isn't the highlight of httpi.pe (and to be honest, [requestsb.in](http://requestsb.in/) does this much nicer!).

The interesting feature is the option to forward requests to your local web server. In order to do that you would need to clone this repository and run ```npm install``` to install required dependencies. You can then start the forwarder by running ```node client_fwd.js```. Note that the client forwarder requires 2 mandatory parameters (in this order): *httpi.pe session id* and *destination server address*.
Your session id is shown when you access an httpi.pe server using a web browser, and not providing it a session id in the URL you are accessing.

For example, if your session id is dKLDKskAKKA, and you want to forward all requests from http://dKLDKskAKKA.httpi.pe/ to 127.0.0.1:8000, you will need to run:
```node client_fwd.js dKLDKskAKKA 127.0.0.1:8000```.

This would also work, and would default to 127.0.0.1:
```node client_fwd.js dKLDKskAKKA :8000```.