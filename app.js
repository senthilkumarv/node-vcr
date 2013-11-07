var express = require('express');
var app = express();
var request = require('request');
var FS = require("q-io/fs");
var Q = require("q");
var _ = require('lodash');

var readFromCacheAndRespond = function(fileName, res) {
  return FS.read(fileName, "b")
  .then(function (content) {
    console.log("got content");
    return res.end(content);
  });
};

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
  var path = response.req.path.split('/');
  var fileName = path.pop();
  console.log(response.req.path.split('/'));
  if(response.statusCode !== 200) { return Q.reject(error); }

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
  var context = req.url;
  var x = request('http://st-services.delta.com' + context, {headers: req.headers},saveResponseToCache);
  req.pipe(x);
  x.pipe(res);
  return x;
};

var proxyRequest = function(req, res){
  var context = req.url;
  console.log(req.headers);
  console.log("##################" + context + "#####################");
  var fileFromCache = __dirname + "/response" + context;
  return FS.exists(fileFromCache)
    .then(function(fileExists){
      console.log(fileExists);
      if(fileExists) {
        console.log("read file");
        return readFromCacheAndRespond(fileFromCache, res);
      }
      console.log("sending req");
      return readFromServerAndCache(req, res);
    });
};

app.get('/*', proxyRequest);
app.post('/*', proxyRequest);

app.listen(3000);
console.log('Listening on port 3000!!!');

