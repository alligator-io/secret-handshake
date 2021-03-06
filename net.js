
var sodium = require('sodium/build/Release/sodium')
var net = require('net')
var toPull = require('stream-to-pull-stream')
var shs = require('./')
var isBuffer = Buffer.isBuffer
var pull = require('pull-stream')
var Defer = require('pull-defer/duplex')

function assertOpts (opts) {
  if(!(opts && 'object' === typeof opts))
    throw new Error('opts *must* be provided')
}
function assertKeys (opts) {
  if(!(
      opts.keys
    && isBuffer(opts.keys.publicKey)
    && isBuffer(opts.keys.secretKey)
  ))
    throw new Error('opts.keys = ed25519 key pair *must* be provided.')
}
function assertAppKey (opts) {
  if(!isBuffer(opts.appKey))
    throw new Error('appKey must be provided')
}

function assertAddr (addr) {
  if(!isBuffer(addr.key))
    throw new Error('opts.key *must* be an ed25519 public key')
  if(!Number.isInteger(addr.port))
    throw new Error('opts.port *must* be provided')
  if(!('string' === typeof addr.host || null == addr.host))
    throw new Error('opts.host must be string or null')
}

module.exports = function createNode (opts) {
  var keys =
    isBuffer(opts.seed)
    ? sodium.crypto_sign_seed_keypair(opts.seed)
    : opts.keys

  assertOpts(opts); assertKeys({keys: keys}); assertAppKey(opts)

  var create = shs.createClient(keys, opts.appKey)

  return {
    publicKey: keys.publicKey,
    createServer: function (onConnect) {
      if('function' !== typeof opts.authenticate)
        throw new Error('function opts.authenticate(pub, cb)'
          + '*must* be provided in order to receive connections')
      var createServerStream =
        shs.createServer(keys, opts.authenticate, opts.appKey)
      var server
      return server = net.createServer(function (stream) {
        stream = toPull.duplex(stream)
        pull(
          stream,
          createServerStream(function (err, stream) {
            if(err) return server.emit('unauthenticated', err)
            onConnect(stream)
          }),
          stream
        )
      })
    },
    connect: function (addr, cb) {
      assertAddr(addr)
      var stream = toPull.duplex(net.connect(addr.port, addr.host))

      if(cb) {
        pull(
          stream,
          create(addr.key, cb),
          stream
        )
      }
      else {

        var defer = Defer()

        pull(
          stream,
          create(addr.key, function (err, stream) {
            if(err)
              defer.resolve({
                source: function (abort, cb) { cb(err) },
                sink: function (read) { read(err, function (){}) }
              })
            else defer.resolve(stream)
          }),
          stream
        )

        return defer

      }
    }
  }
}
