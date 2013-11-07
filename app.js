var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');

var dirExists = function(path, directoryToCheck) {
  var fullPath = path + "/" + directoryToCheck;
  console.log(fullPath);
  return FS.exists(fullPath)
    .then(function(exists) {
      if(!exists) return false;
      return FS.isDirectory(fullPath);
    }).then(function(isDirectory) {
      return isDirectory ? fullPath : Q.reject(path);
    });
};

var saveResponseToCache = function(error, response, body) {
console.log("got response");
  var path = response.req.path.split('/');
  console.log(response.req.path.split('/'));
  if(response.statusCode !== 200) { return Q.reject(error); }
  if(response.req.path.indexOf("login") == -1) {
    console.log(response);
  }
  var availablePathPromise = _.reduce(_.reject(path, function(item) {
    return item === "";
  }), function(currentValue, dir) {
    return currentValue.then(function(currentPath) {
      return dirExists(currentPath, dir);
    });
  }, Q.resolve(__dirname + "/response"));

  return availablePathPromise.fail(function(existingPath) {
    console.log("in fail");
    var lastDir = existingPath.split('/').pop(),
        dirToBeCreated = path.splice(path.indexOf(lastDir) + 1);
        console.log("____________" + existingPath + '___________');
    return FS.makeDirectory(existingPath + "/" + dirToBeCreated[1])
    .then(function() {
      return FS.makeTree(existingPath + dirToBeCreated.join('/'));
    });
  })
  .then(function() {
    return FS.write(__dirname + "/response" + response.req.path, body);
  });
};

var readFromServerAndCache = function(req, res) {
//  var context = "http://st-services.delta.com" + req.url;
  var deferred = Q.defer();
  var context = "http://localhost" + req.url;
  console.log("Making request to " + context);
  var x = request(context, {}, saveResponseToCache);
  req.pipe(x);
  x.pipe(res);
  return deferred.promise;
};

var fetchFileFromCache = function(fileName) {
  return FS.exists(fileName)
    .then(function(exists) {
      if(!exists) return Q.reject(fileName);
      return FS.isFile(fileName);
    })
    .then(function(isValidFile) {
      return (isValidFile) ? FS.read(fileName, "b") : Q.reject(fileName);
    });
};

var proxyRequest = function(req, res){
  var context = req.url;
  var fileFromCache = __dirname + "/response" + context;

  return fetchFileFromCache(fileFromCache)
    .then(function(responseBody) {
      return res.end(responseBody);
    })
    .fail(function() {
      console.log("Cache miss. Sending request");
      return readFromServerAndCache(req, res);
    });
};

app.get('/*', proxyRequest);
app.post('/*', proxyRequest);

app.listen(3000);
console.log('Listening on port 3000!!!');

