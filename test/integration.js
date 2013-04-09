var express = require('express'),
    app = express(),
    assert = require('assert');

var laserquest = require('../');
var serverUri;

app.use(express.bodyParser());

app.get('/', function(req, res) {
    res.send(200);
});

app.get('/redirect1', function(req, res) {
    res.redirect('/');
});

app.get('/redirect2', function(req, res) {
    res.redirect(serverUri + '/redirect1');
});

app.get('/redirectloop', function(req, res) {
    res.redirect('/redirectloop');
});

app.get('/streaming', function(req, res) {
    res.write('first');
    setTimeout(function() {
        res.write('second');
    }, 200);
    setTimeout(function() {
        res.end('third');
    }, 400);
});

app.get('/timeout', function(req, res) {
    setTimeout(function() {
        res.send(200);
    }, 700);
});

app.get('/error', function() {
    throw new Error('this is an error');
});

app.post('/post', function(req, res) {
    assert.equal(req.body.test, 'value');
    assert.equal(req.headers['content-type'], 'application/json');
    res.json({test: 'passed'});
});

app.post('/form', function(req, res) {
    assert.equal(req.body.test, 'value');
    assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded; charset=utf-8');
    res.send(200);
});

app.get('/cookies', function(req, res) {
    res.cookie('test', 'value');
    res.send(200);
});

before(function(done) {
    var server = app.listen(0, function() {
        var port = server.address().port;
        serverUri = 'http://127.0.0.1:' + port;
        done();
    });
});

describe('LaserQuest', function() {
    it('makes requests and returns responses without error', function(done) {
        var testObj = laserquest(serverUri);
        var req = testObj.request(function (err, resp, data) {
            assert.equal(resp.statusCode, '200');
            done(err);
        });
    });

    it('allows the first argument to be an object', function(done) {
        var testObj = laserquest({
            uri: serverUri
        });
        var req = testObj.request(function(err, resp, data) {
            assert.equal(resp.statusCode, 200);
            done(err);
        });
    });

    describe('redirect behaviour', function() {
        it('follows redirects', function(done) {
            var testObj = laserquest(serverUri + '/redirect1');
            var req = testObj.request();
            req.on('response', function (resp, data) {
                assert.equal(resp.statusCode, '200');
                assert.equal(resp.url, '');
                done();
            });
        });

        it('follows multiple redirects', function(done) {
            var testObj = laserquest(serverUri + '/redirect2');
            var req = testObj.request();
            req.on('response', function (resp, data) {
                assert.equal(resp.statusCode, '200');
                assert.equal(resp.url, '');
                done();
            });
        });
    });

    it('proxies requests', function(done) {
        this.slow(1200);
        var app = express();
        app.get('/', function(req, res) {    
            var testObj = laserquest(serverUri + '/streaming');  
            testObj.proxy(req, res); 
        });
        
        var server = app.listen(0, function() {
            var lq = laserquest('http://127.0.0.1:' + server.address().port);
            var req = lq.request();

            req.on('response', function(resp, data) {
                assert.equal(data, 'firstsecondthird');
                done();
            });
        });

    });

    it('times out slow proxied requests', function(done) {
        this.slow(1200);
        var app = express();
        app.get('/', function(req, res) {    
            var testObj = laserquest(serverUri + '/timeout', {
                timeout: 500
            });  
            var r = testObj.proxy(req, res); 
            r.on('error', function(err) {
                assert.equal(err.message, 'Request timed out');
                res.send(500);
            });
        });
        
        var server = app.listen(0, function() {
            var lq = laserquest('http://127.0.0.1:' + server.address().port);
            var req = lq.request();

            req.on('response', function(resp) {
                assert.equal(resp.statusCode, 500);
                done();
            });
        });

    });

    it('proxies 500 error responses', function(done) {
        var app = express();
        app.get('/', function(req, res) {    
            var testObj = laserquest(serverUri + '/error');  
            var r = testObj.proxy(req, res); 
        });
        
        var server = app.listen(0, function() {
            var lq = laserquest('http://127.0.0.1:' + server.address().port);
            var req = lq.request();

            req.on('response', function(resp) {
                assert.equal(resp.statusCode, 500);
                done();
            });
        });

    });

    it('times out on slow requests', function(done) {
        this.slow(1200);
        var testObj = laserquest(serverUri + '/timeout', {
            timeout: 500
        });

        var req = testObj.request();
        req.on('error', function(err) {
            assert.equal(err.message, 'Request timed out');
            done();
        });
    });

    it('sends body payloads', function(done) {
        var testObj = laserquest(serverUri + '/post', {
            method: 'post',
            body: JSON.stringify({test: 'value'}),
            headers: {
                'Content-type': 'application/json'
            }
        });

        var req = testObj.request();
        req.on('response', function (resp, data) {
            assert.equal(resp.statusCode, 200);
            assert.equal(data, JSON.stringify({test: 'passed'}));
            done();
        })
    });

    it('sends form payloads as Content-type: application/x-www-form-urlencoded; charset=utf-8', function(done) {
        var testObj = laserquest(serverUri + '/form', {
            method: 'post',
            form: {
                test: 'value'
            }
        });

        var req = testObj.request();
        req.on('response', function(resp) {
            assert.equal(resp.statusCode, 200);
            done();
        });
    });

    it('uses a supplied cookie jar to store cookies', function(done) {
        var jar = laserquest.jar();
        var testObj = laserquest(serverUri + '/cookies', {jar: jar});

        var req = testObj.request();
        req.on('response', function(resp, data) {
            assert.equal(jar.cookies[0].value, 'value');
            done();
        });
    });

    it('throws errors when in a redirect loop', function(done) {
        var testObj = laserquest(serverUri + '/redirectloop');
        var req = testObj.request();
        req.on('error', function(err) {
            assert.equal(err.message, 'Max redirects exceeded');
            done();
        })
    });

});