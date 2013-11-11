var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');

var proxy  = function(port, host, config) {
  var appConfig = _.defaults(config || {}, {
    responseDirectory: "/tmp/response"
  });

  var dirExists = function(path, directoryToCheck) {
    var fullPath = path + "/" + directoryToCheck;
    return FS.exists(fullPath)
      .then(function(exists) {
        if(!exists) return false;
        return FS.isDirectory(fullPath);
      }).then(function(isDirectory) {
        return isDirectory ? fullPath : Q.reject(path);
      });
  };

  var nonEmptyValues = function(arr) {
    return _.filter(arr, function(element) {
      return element && element !== "";
    });
  };
  var saveResponseToCache = function(error, response, body) {
    console.log("got response");
    var path = _.initial(response.req.path.split('/'));
    if(response.statusCode !== 200 || response.req.path.indexOf("login") !== -1) { return Q.reject(error); }
    var availablePathPromise = _.reduce(_.reject(path, function(item) {
      return item === "";
    }), function(currentValue, dir) {
      return currentValue.then(function(currentPath) {
        return dirExists(currentPath, dir);
      });
    }, Q.resolve(appConfig.responseDirectory));

    return availablePathPromise.fail(function(existingPath) {
      console.log("in fail");
      var absolutePathToBeCreated = "/" + nonEmptyValues((appConfig.responseDirectory + path.join("/")).split("/")).join("/");
      var dirToBeCreated = nonEmptyValues(absolutePathToBeCreated.replace(existingPath, "").split("/"));
      console.log("____________" + existingPath + '___________');
      return FS.makeDirectory(existingPath + "/" + _.head(dirToBeCreated))
        .then(function() {
          return FS.makeTree(existingPath + "/" + dirToBeCreated.join('/'));
        });
    })
      .then(function() {
        return FS.write(appConfig.responseDirectory + response.req.path + "_response", body);
      });
  };

  var readFromServerAndCache = function(req, res) {
    var context = host + req.url;
    var deferred = Q.defer();
    console.log("Making request to " + context);
    var x = request(context, {}, saveResponseToCache);
    req.pipe(x);
    x.pipe(res);
    return deferred.promise;
  };

  var fetchFileFromCache = function(fileName) {
    var cacheEntryName = fileName + "_response";

    return FS.exists(cacheEntryName)
      .then(function(exists) {
        if(!exists) return Q.reject(fileName);
        return FS.isFile(cacheEntryName);
      })
      .then(function(isValidFile) {
        return (isValidFile) ? FS.read(cacheEntryName, "b") : Q.reject(fileName);
      });
  };

  var proxyRequest = function(req, res){
    var context = req.url;
    var fileFromCache = appConfig.responseDirectory + context;
    return fetchFileFromCache(fileFromCache)
      .then(function(responseBody) {
        console.log("Cache Hit");
        if(fileFromCache.indexOf("json") !== -1) {
          res.setHeader('Content-Type', 'application/json');
        }
        return res.end(responseBody);
      })
      .fail(function() {
        console.log("Cache miss. Sending request");
        return readFromServerAndCache(req, res);
      });
  };

  app.get('/*', proxyRequest);
  app.post('/*', proxyRequest);

  app.listen(port);
  console.log(_.template('Listening on port ${ port } for host ${ host }!!!', {port: port, host: host}));
};

proxy(3000, "https://si-services.delta.com");
proxy(4000, "http://content.delta.com");