# LASERQUEST

Laserquest is a small wrapper around [hyperquest](https://github.com/substack/hyperquest) that gives us 
similar features to [request](https://github.com/mikael/request) without using node's connection pooling, 
[which is broken](https://github.com/substack/hyperquest#rant) and won't be fixed until node 0.12.

Laserquest handles serializing form parameters, following redirects, handling timeouts and buffering response bodies.
It makes proxying really easy by defining a handy `proxy` method and handling headers and host settings automatically

### INSTALLATION

    npm install laserquest


### API

    var laserquest = require('laserquest');
    var client = laserquest(uri, options);

Both `uri` and `options` are optional, although a uri is required.

`options`:
* uri - the request uri
* method - the http verb to use (GET/POST/PUT/DELETE etc)
* headers - headers to be sent with this request
* timeout - timeout in ms for this request
* body - a string or buffer containing the request body, for POST/PUT requests
* qs - an object containing querystring parameters. The object will be `querystring.stringify()`ed
* form - an object containing form parameters
* jar - if supplied, use this cookie jar object to store cookies. No jar is used by default. You can obtain a cookie by calling `laserquest.jar()`



    client.request(cb)

Make a request using the options passed in above. If `cb` is provided, it will be called in the case of
errors or responses with these parameters - `err, response, data`



    client.proxy(req, res)

Proxy an incoming http request (`req`) to the uri specified in the options, proxying the response to `res`.
This copies the headers on `req` to the proxy request, and does the same for response headers. It also 
automatically sets the `Host` header to the host you are proxying to.




#### Events

###### response
    function(response, data)

fired when a response is received

###### error
    function(err)

fired when an error occurs, like a timeout or an unexpected disconnect

###### end
    function()

fired when the request is finished and the underlying socket is closed

### LICENSE
MIT