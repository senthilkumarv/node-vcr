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

  var readFromServerAndCache = function(req, requestBody) {
    var context = host + req.url;
    var deferred = Q.defer();
    console.log("Making request to " + context);
    var params = {
      method: req.method,
      uri: context,
      headers: _.assign(req.headers, {host: host.split('://')[1]}),
      body: requestBody
    };
    debugger;
    var backendReq = request(params, function(err, response, body) {
      debugger;
      console.log(body);
      if(err) {
        return deferred.reject(err);
      }
      return deferred.resolve(response);
    });
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

  var proxyRequest = function(req, res){
    var context = req.url;
    var fileFromCache = appConfig.responseDirectory + context;
    return readRequestBody(req)
      .then(function(requestData) {
        console.log("requestData" + requestData);
        return readFromServerAndCache(req, requestData);
        return fetchFileFromCache(fileFromCache, requestData)  
      })
      .then(function(response) {
        _.each(_.keys(response.headers), function(key) {
          console.log(key + " " + response.headers[key]);
          res.setHeader(key, response.headers[key]);
        });        
        res.write(response.body);
        return response.body;
      })
      .fin(function() {
        return res.end();
      });
  };

  app.get('/*', proxyRequest);
  app.post('/*', proxyRequest);

  app.listen(port);
  console.log(_.template('Listening on port ${ port } for host ${ host }!!!', {port: port, host: host}));
};
