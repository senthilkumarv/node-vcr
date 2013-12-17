var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');

var proxy  = function(port, host, config) {

  var appConfig = _.defaults(config || {}, {
    responseDirectory: __dirname + "/response"
  });


  var fetchFileFromCache = function(fileName, requestBody) {
    var cacheEntryName = fileName + "_response";

    return FS.exists(cacheEntryName)
      .then(function(exists) {
        if(!exists) return Q.reject(requestBody);
        return FS.isFile(cacheEntryName);
      })
      .then(function(isValidFile) {
        return (isValidFile) ? FS.read(cacheEntryName, "b") : Q.reject(requestBody);
      })
      .then(function(fileContent) {
        return {
          body: fileContent,
          headers: {'content-type': 'application/json; charset=UTF-8'}
        };
      });
  };
  
  var readRequestBody = function(req) {
    var deferred = Q.defer();
    var rawData = "";
    req.on('data', function(data) {
      rawData += data;
    });
    req.on('end', function() {
      deferred.resolve(rawData);      
    });
    return deferred.promise;
  };

  var respondToClient = function(response, res) {
    _.each(_.keys(response.headers), function(key) {
      res.setHeader(key, response.headers[key]);
    });        
    res.write(response.body);
    res.end();
    return response;    
  };
  
  var cacheBackendResponse = function(response) {
    debugger;
    var path = _.initial(response.req.path.split('/')).join('/');
    
    if(response.statusCode !== 200 || response.req.path.indexOf("login") !== -1) { return Q.reject(); }
    
    return FS.makeTree(appConfig.responseDirectory + path)
      .then(function() {
        return FS.write(appConfig.responseDirectory + response.req.path + "_response", response.body);
      })
      .fail(console.erroe)
      .fin(function() {
        return response;
      });    
  };

  var proxyAndCache = function(req, requestData) {
    return readFromServer(req, requestData)
      .then(cacheBackendResponse)            
  };
  
  var proxyRequest = function(req, res){
    return readRequestBody(req)
      .then(function(requestBody) {
        return fetchFileFromCache(appConfig.responseDirectory + req.url, requestBody)
      })
      .fail(function(requestData) {
        return proxyAndCache(req, requestData);
      })
      .then(function(backendResponse) {
        return respondToClient(backendResponse, res);
      })
      .fail(function(err) {
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