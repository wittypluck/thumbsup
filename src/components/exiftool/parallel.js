const os = require('node:os')
const stream = require('node:stream')
const _ = require('lodash')
const debug = require('debug')('thumbsup:debug')
const exiftool = require('./stream.js')

// exiftool is I/O-bound (reads file headers from disk), not CPU-bound.
// Using more processes than CPU cores keeps the disk I/O pipeline saturated,
// improving throughput on SSD storage from ~15-20% to ~60-80% CPU utilization.
const EXIFTOOL_CONCURRENCY_MULTIPLIER = 4

/*
  Fans out the list of files to multiple exiftool processes (default = CPU count × 4)
  Returns a single stream of javascript objects, parsed from the JSON response
*/
exports.parse = (rootFolder, filePaths, concurrency) => {
  // create several buckets of work
  const cpus = concurrency || os.cpus().length
  const workers = cpus * EXIFTOOL_CONCURRENCY_MULTIPLIER
  const buckets = _.chunk(filePaths, Math.ceil(filePaths.length / workers))
  debug(`Split files into ${buckets.length} batches for exiftool`)
  // create several <exiftool> streams that can work in parallel
  const streams = _.range(buckets.length).map(i => {
    debug(`Calling exiftool with ${buckets[i].length} files`)
    return exiftool.parse(rootFolder, buckets[i])
  })
  // merge the object streams
  return merge(streams)
}

function merge (streams) {
  let ended = 0
  const merged = new stream.PassThrough({ objectMode: true })
  streams.forEach(s => {
    s.pipe(merged, { end: false })
    s.once('end', () => {
      ++ended
      if (ended === streams.length) {
        merged.emit('end')
      }
    })
    s.once('error', (err) => {
      merged.emit('error', err)
    })
  })
  return merged
}
