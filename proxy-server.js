var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');
var crypto = require("crypto");
//var loginCookies = "";

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
//            headers: _.assign(req.headers, {host: host.split('://')[1], cookie: req.headers.cookie + loginCookies }),
            headers: _.assign(req.headers, {host: host.split('://')[1]}),
            body: requestBody
        };

        request(params, function (err, response, body) {
	    console.log("Got response for " + context);
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
        _.each(_.keys(response.headers), function (key) {
            res.setHeader(key, response.headers[key]);
        });
	debugger;
        res.write(response.body);
        res.end();
        return response;
    };

    var cacheBackendResponse = function (hash) {
        var deferred = Q.defer();
        var response = hash.response, requestBody = hash.requestBody;

        var filePath = appConfig.responseDirectory + response.req.path;

        FS.makeTree(filePath + "/" + requestId(filePath, requestBody))
            .then(function () {
//                if(response.req.path.indexOf("logout") !== -1)
//                    return true;
//                if(response.req.path.indexOf("login") !== -1){
//                    _.each(response.headers['set-cookie'],function(cookie){
//                        loginCookies = loginCookies + " ; " + cookie.split(";")[0];
//                    });
//                    return true;
//                }
                return FS.write(requestFilePath(filePath, requestBody), requestBody) && FS.write(responseFilePath(filePath, requestBody), response.body);
            })
            .fail(function(){
                return deferred.reject(console.error);
            })
            .fin(function () {
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
		console.log("Making call to " + req.url);
                return fetchFileFromCache(appConfig.responseDirectory + req.url, requestBody)
            })
            .fail(function (requestData) {
                return proxyAndCache(req, requestData);
            })
            .then(function (backendResponse) {
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

module.exports = {
  proxy: proxy
}
