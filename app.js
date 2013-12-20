var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');
var crypto = require("crypto");

var proxy = function (port, host, config) {

    var appConfig = _.defaults(config || {}, {
        responseDirectory: __dirname + "/response"
    });

    var readFromServer = function (req, requestBody) {
        var context = host + req.url;
        var deferred = Q.defer();
        var params = {
            method: req.method,
            uri: context,
            headers: _.assign(req.headers, {host: host.split('://')[1]}),
            body: requestBody
        };
        console.log("Request Body ..........");
        console.log(requestBody);
        var backendReq = request(params, function (err, response, body) {
//            console.log("backendReq.........");
//            console.log("response ...........");
//            console.log(response);
//            console.log("body ...........");
//            console.log(body);
            console.log("request body....................");
            console.log(requestBody);

            return err ? deferred.reject(err) : deferred.resolve({'response': response, 'requestBody': requestBody});
        });

        return deferred.promise;
    };

    var requestId = function(filePath, requestBody){
        return crypto.createHash("sha256").update(filePath + requestBody, "utf8").digest("base64");
    }

    var responseFilePath = function(filePath, requestBody){
        return filePath + "/" + requestId(filePath, requestBody) + "/response";
    };

    var requestFilePath = function(filePath, requestBody){
        return filePath + "/" + requestId(filePath, requestBody) + "/request";
    };

    var fetchFileFromCache = function (filePath, requestBody) {

        var cacheEntryName = responseFilePath(filePath, requestBody);

        console.log("------------------");
        console.log(filePath);
        console.log(cacheEntryName);

        return FS.exists(cacheEntryName)
            .then(function (exists) {
                if (!exists) return Q.reject(requestBody);
                return FS.isFile(cacheEntryName);
            })
            .then(function (isValidFile) {
                return (isValidFile) ? FS.read(cacheEntryName, "b") : Q.reject(requestBody);
            })
            .then(function (fileContent) {
                return {
                    body: fileContent,
                    headers: {'content-type': 'application/json; charset=UTF-8'}
                };
            });
    };

    var readRequestBody = function (req) {
        var deferred = Q.defer();
        var rawData = "";
        req.on('data', function (data) {
            rawData += data;
        });
        req.on('end', function () {
            deferred.resolve(rawData);
        });
        return deferred.promise;
    };

    var respondToClient = function (response, res) {
        console.log("in respondToClient....");
//        console.log(response);
        _.each(_.keys(response.headers), function (key) {
            res.setHeader(key, response.headers[key]);
        });
        res.write(response.body);
        res.end();
        return response;
    };

    var cacheBackendResponse = function (hash) {
        var deferred = Q.defer();
        var response = hash.response, requestBody = hash.requestBody;
        debugger;
        var path = _.initial(response.req.path.split('/')).join('/');

        console.log("**************");
        console.log(response.req.path);
        console.log(path);
//        console.log(response);

        if (response.statusCode !== 200 || response.req.path.indexOf("login") !== -1) {
            return Q.reject();
        }

        var filePath = appConfig.responseDirectory + response.req.path;

        FS.makeTree(filePath + "/" + requestId(filePath, requestBody))
            .then(function () {
                console.log("1");
                return FS.write(requestFilePath(filePath, requestBody), requestBody) && FS.write(responseFilePath(filePath, requestBody), response.body);
            })
            .fail(function(){
                console.log("2");
                return deferred.reject(console.error);
            })
            .fin(function () {
                console.log("3");
                return deferred.resolve(response);
            });

        return deferred.promise;
    };

    var proxyAndCache = function (req, requestData) {
        return readFromServer(req, requestData)
            .then(cacheBackendResponse)
    };

    var proxyRequest = function (req, res) {
        return readRequestBody(req)
            .then(function (requestBody) {
                return fetchFileFromCache(appConfig.responseDirectory + req.url, requestBody)
            })
            .fail(function (requestData) {
                return proxyAndCache(req, requestData);
            })
            .then(function (backendResponse) {
                console.log("in proxy result backendResponse....");
//                console.log(backendResponse);
                return respondToClient(backendResponse, res);
            })
            .fail(function (err) {
                console.error(err);
                return res.send(500, JSON.stringify(err));
            });
    };

    app.get('/*', proxyRequest);
    app.post('/*', proxyRequest);

    app.listen(port);
    console.log(_.template('Listening on port ${ port } for host ${ host }!!!', {port: port, host: host}));
};

proxy(3000, "http://st-services.delta.com");
proxy(4000, "http://content.delta.com");