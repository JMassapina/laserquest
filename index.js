var hyperquest = require('hyperquest'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    url = require('url'),
    querystring = require('querystring'),
    Cookie = require('cookie-jar');

function LaserQuest(uri, opts) {
    EventEmitter.call(this);
    this.options = opts;
    this.uri = uri;

    if(typeof this.uri === 'string' && this.options == null) {
        this.options = {};
    }

    if (this.options == null) {
        this.options = uri;
        this.uri = this.options.uri;
    }
    this.parsedUri = url.parse(this.uri);
    this.maxRedirects = 5;

    this.options.method = this.options.method || 'GET';
    var method = this.options.method.toLowerCase();
    this.hasBody = (method === 'post' || method === 'put');
};
util.inherits(LaserQuest, EventEmitter);

LaserQuest.prototype._onTimeout = function() {
    this._req.aborted = true;
    this._req.emit('close');
    this.emit('error', new Error('Request timed out'));
};

LaserQuest.prototype._clearRequestTimeout = function() {
    if (this._req.timeoutId != null) {
        clearTimeout(this._req.timeoutId);
    }
};

LaserQuest.prototype._defaultHeaders = function(req) {
    if (this.options.headers != null) {
        return;
    }

    this.options.headers = {};
    
    if (req.headers['content-type'] != null) {
        this.options.headers['Content-type'] = req.headers['content-type'];
    }
    
};

LaserQuest.prototype.proxy = function(req, res) {
    var self = this;
    
    this._defaultHeaders(req);

    this._req = hyperquest(this.uri, this.options);
    
    this._req.setHeader('Host', this.parsedUri.host);

    req.pipe(this._req, {end: this.hasBody});

    if (this.options.timeout != null) {
        this._req.timeoutId = setTimeout(this._onTimeout.bind(this), this.options.timeout);
    }

    this._req.on('response', function(response) {
        if (self._req.aborted == null) {
            self._clearRequestTimeout();
            res.statusCode = response.statusCode;
            for (var name in response.headers) {
                if (response.headers.hasOwnProperty(name)) {
                    res.setHeader(name, response.headers[name]);
                }
            }
            self._req.pipe(res, {end: true});
        }
    });

    this._req.on('error', function(err) {
        self._clearRequestTimeout();
        if (self._req.aborted == null) {
            self.emit('error', err);
        }
    });
    this._req.on('end', function() {
        if (self._req.aborted == null) {
            self.emit('end');  
        }
    });

    return this;
};

LaserQuest.prototype._addCookie = function(value) {
    this.options.jar.add(new Cookie(value));
};

LaserQuest.prototype._parseCookies = function(resp) {
    var self = this;
    if (this.options.jar != null && resp.headers['set-cookie'] != null) {
        if (Array.isArray(resp.headers['set-cookie'])) {
            resp.headers['set-cookie'].forEach(function (header) {
                self._addCookie(header);
            })

        } else {
            this._addCookie(resp.headers['set-cookie']);
        }
    }
};

LaserQuest.prototype._followRedirects = function(uri, res, cb) {
    if (this._req.aborted != null) {
        return;
    }

    var self = this;

    if (res.statusCode < 300 || res.statusCode > 399) {
        return cb(res);
    }

    // no `Location:` header => nowhere to redirect
    if (!'location' in res.headers) {
        return cb(res);
    }

    this._redirects = this._redirects + 1

    if (this._redirects > this.maxRedirects) {
        return this.emit('error', new Error('Max redirects exceeded'));
    }

    // need to use url.resolve() in case location is a relative URL
    var redirectUrl = url.resolve(uri, res.headers['location'])

    var out = hyperquest({
        uri: redirectUrl
    });

    out.on('response', function (resp) {
        self._parseCookies(resp);
        self._followRedirects(redirectUrl, resp, cb);
    });
      
    // bubble errors that occur on the redirect back up to the initiating client request
    // object, otherwise they wind up killing the process.
    out.on('error', function (err) {
        self.emit('error', err);
    });
};

LaserQuest.prototype._handleResponse = function(resp, cb) {
    var buffer = [],
        bodyLen = 0;

    resp.on('data', function (chunk) {
        buffer.push(chunk);
        bodyLen += chunk.length;
    });
    resp.on('end', function () {
        if (buffer.length && Buffer.isBuffer(buffer[0])) {
            var body = new Buffer(bodyLen);
            var i = 0;
            buffer.forEach(function (chunk) {
                chunk.copy(body, i, 0, chunk.length);
                i += chunk.length;
            });
            cb(body.toString('utf8'));
        
        } else if (buffer.length) {
            cb(buffer.join(''));
        } else {
            cb();
        }
    });
};

LaserQuest.prototype.request = function(cb) {
    var self = this;
    if (this.options.qs != null) {
        this.uri = this.uri + '?' + querystring.stringify(this.options.qs);  
    }

    if (cb != null) {
        this.on('response', function(resp, data) {
            cb(null, resp, data);
        });
        this.on('error', cb);
    }

    this._req = hyperquest(this.uri, this.options);

    if (this.options.timeout != null) {
        this._req.timeoutId = setTimeout(this._onTimeout.bind(this), this.options.timeout);
    }

    this._req.on('error', function(err) {
        self._clearRequestTimeout();

        if (self._req.aborted == null) {
            self.emit('error', err);
        }
    });

    this._redirects = 0;
    this._req.on('response', function(response) {
        if (self._req.aborted == null) {
            self._parseCookies(response);
            self._followRedirects(self.uri, response, function(lastResponse) {
                self._clearRequestTimeout();
                self._handleResponse(lastResponse, function(body) {
                    self.emit('response', lastResponse, body);
                });
            })
        }
    });

    if (this.options.body != null) {
        this._req.write(this.options.body);
    }

    if (this.options.form != null) {
        this._req.setHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');
        this._req.write(querystring.stringify(this.options.form).toString('utf8'));
    }

    if (this.hasBody) {
        this._req.end();
    }

    this._req.setHeader('Host', this.parsedUri.host);

    return this;
};

module.exports = function(url, options) {
    return new LaserQuest(url, options);
};

module.exports.jar = function() {
    return new Cookie.Jar();
};