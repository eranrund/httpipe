httpi.pe
========

httpi.pe makes it easier to test code running on a local web server that is not exposed to the outer world.
It is especially useful when dealing with webhooks.
httpi.pe consists of 3 parts that play together using [socket.io](http://socket.io): a node.js server,
a web frontend and a (optional) forwarder.

The server accepts incoming requests, and depending on the host the requests are directed at, either serves the
frontend content (the static files), or captures the request so that it can be displayed on the web frontend or
handled by the forwarder. The web frontend allows you to view captured requests, as well as replay them - no more
working hard to get that webhook to be resent!
Optionally, you may run a forwarder (client_fwd.js) and have it forward the requests to a web server of your choice,
such as one running on your local development machine. If a forwarder is not used httpi.pe will return a simple
200 OK response to each request it receives.

httpi.pe is running on [http://httpi.pe/](http://httpi.pe/) - so you can play with it right away.

When accessing the httpi.pe frontend you will be assigned a random session id which is used to separate your requests
from other users' requests, so that multiple people can share a single httpi.pe server. The frontend will show you which
URL to use so that your requests are captured.


Using the forwarder
-------------------
Okay, so capturing requests is nice and useful - but this isn't the highlight of httpi.pe (and to be honest,
[requestsb.in](http://requestsb.in/) does this with a much nicer UI).

The interesting feature is the option to forward requests to your local web server. In order to do that you would need
to clone this repository and run ```npm install``` to install required dependencies. You can then start the forwarder
by running ```node client_fwd.js```. Note that the client forwarder requires 2 mandatory parameters (in this order):
*httpi.pe session id* and *destination server address*.
Your session id is shown when you access an httpi.pe server using a web browser, and not providing it a session id in
the URL you are accessing (i.e. http://httpi.pe/ versus http://randomsessionid.httpi.pe/).

For example, if your session id is dKLDKskAKKA, and you want to forward all requests from http://dKLDKskAKKA.httpi.pe/
to 127.0.0.1:8000, you will need to run:
```node client_fwd.js dKLDKskAKKA 127.0.0.1:8000```

This would also work, and would default to 127.0.0.1:
```node client_fwd.js dKLDKskAKKA :8000```

Notes
-----
- httpi.pe is not secure, in the sense that if someone guesses your session id they would be able to view your
requests as well as send requests to your local web server using the forwarder (if you use one).
The chances of someone guessing the session id are low - but keep this in mind when dealing with sensitive things.
If you wish, you could just run your own server.
- SSL is currently not supported.
- Permanent sessions and other extra features are planned and might be introduced in the future, depending on how many
users this thing gets.
