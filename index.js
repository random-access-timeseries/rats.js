const serialize = require('./serialize')
const through2 = require('through2')
const fs = require('fs')

const VERSION = 0

module.exports = {fn, encoder, count, readHeader, read}

function fn (name, labels) {
  var fn = [name]
  if (labels) fn.push(labels.keys.sort().map(k => labels[k]).join('.'))
  fn.push('rats')
  return fn.join('.')
}

function encoder (type) {
  var header = {
    version: VERSION,
    metricType: type
  }
  var idx = 0

  return through2.obj(function (chunk, enc, cb) {
    if (idx === 0) {
      header.baseTs = chunk[0]
      header.baseValue = chunk[1]
    } else if (idx === 1) {
      header.baseTsDelta = chunk[0] - header.baseTs
      header.baseValueDelta = chunk[1] - header.baseValue
    }

    if (idx === 1) {
      this.push(serialize.encodeHeader(header))
    } else if (idx > 1) {
      this.push(serialize.encodeRecord(header, idx, chunk[0], chunk[1]))
    }

    idx += 1
    cb()
  })
}

function count (fn) {
  return (fs.statSync(fn).size - 42) / 14 + 2
}

function readHeader (fn, cb) {
  fs.open(fn, 'r', function (err, f) {
    if (err) return cb(err)
    var buf = new Buffer(42)

    fs.read(f, buf, 0, 42, 0, function (err, bytesRead, buf) {
      if (err) return cb(err)

      var header = serialize.decodeHeader(buf)

      fs.close(f, function () {
        cb(null, header)
      })
    })
  })
}

function read (fn, n, cb) {
  readHeader(fn, function (err, header, fd) {
    if (err) return cb(err)

    if (n === 0) {
      cb(null, [header.baseTs, header.baseValue])
    } else if (n === 1) {
      cb(null, [header.baseTs + header.baseTsDelta, header.baseValue + header.baseValueDelta])
    } else {
      fs.open(fn, 'r', function (err, f) {
        if (err) return cb(err)

        var buf = new Buffer(14)
        fs.read(f, buf, 0, 14, (n - 2) * 14 + 42, function (err, bytesRead, buf) {
          if (err) return cb(err)

          var record = serialize.decodeRecord(header, n, buf)
          cb(null, record)
        })
      })
    }
  })
}
