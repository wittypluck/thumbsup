const EventEmitter = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const _ = require('lodash')
const Database = require('better-sqlite3')
const moment = require('moment')
const delta = require('./delta')
const exiftool = require('../exiftool/parallel')
const globber = require('./glob')

const EXIF_DATE_FORMAT = 'YYYY:MM:DD HH:mm:ssZ'

// batch size for database transactions (inserts and deletes)
const DB_BATCH_SIZE = 1000

class Index {
  constructor (indexPath) {
    // create the database if it doesn't exist
    fs.mkdirSync(path.dirname(indexPath), { recursive: true })
    this.db = new Database(indexPath, {})
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000') // 64MB cache
    this.db.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, timestamp INTEGER, metadata BLOB)')
  }

  /*
    Index all the files in <media> and store into <database>
  */
  update (mediaFolder, options = {}) {
    // will emit many different events
    const emitter = new EventEmitter()

    // prepared database statements
    const selectStatement = this.db.prepare('SELECT path, timestamp FROM files')
    const insertStatement = this.db.prepare('INSERT OR REPLACE INTO files VALUES (?, ?, ?)')
    const deleteStatement = this.db.prepare('DELETE FROM files WHERE path = ?')
    const countStatement = this.db.prepare('SELECT COUNT(*) AS count FROM files')
    const selectMetadata = this.db.prepare('SELECT * FROM files')

    // create hashmap of all files in the database
    const databaseMap = new Map()
    for (const row of selectStatement.iterate()) {
      databaseMap.set(row.path, row.timestamp)
    }

    const self = this

    function finished () {
      // emit every file in the index
      for (const row of selectMetadata.iterate()) {
        emitter.emit('file', {
          path: row.path,
          timestamp: new Date(row.timestamp),
          metadata: JSON.parse(row.metadata)
        })
      }
      // emit the final count
      const result = countStatement.get()
      emitter.emit('done', { count: result.count })
    }

    // find all files on disk
    globber.find(mediaFolder, options, (err, diskMap) => {
      if (err) return console.error('error', err)

      // calculate the difference: which files have been added, modified, etc
      const deltaFiles = delta.calculate(databaseMap, diskMap, options)
      emitter.emit('stats', {
        database: databaseMap.size,
        disk: Object.keys(diskMap).length,
        unchanged: deltaFiles.unchanged.length,
        added: deltaFiles.added.length,
        modified: deltaFiles.modified.length,
        deleted: deltaFiles.deleted.length,
        skipped: deltaFiles.skipped.length
      })

      // remove deleted files from the DB in batched transactions
      const deleteBatches = _.chunk(deltaFiles.deleted, DB_BATCH_SIZE)
      deleteBatches.forEach(batch => {
        self.db.transaction(() => {
          batch.forEach(p => deleteStatement.run(p))
        })()
      })

      // check if any files need parsing
      let processed = 0
      const toProcess = _.union(deltaFiles.added, deltaFiles.modified)
      if (toProcess.length === 0) {
        return finished()
      }

      // call <exiftool> on added and modified files
      // and write each entry to the database in batched transactions
      const pendingInserts = []
      function flushInserts () {
        if (pendingInserts.length > 0) {
          self.db.transaction(() => {
            pendingInserts.forEach(item => insertStatement.run(item.path, item.timestamp, item.metadata))
          })()
          pendingInserts.length = 0
        }
      }
      const stream = exiftool.parse(mediaFolder, toProcess, options.concurrency)
      stream.on('data', entry => {
        const timestamp = moment(entry.File.FileModifyDate, EXIF_DATE_FORMAT).valueOf()
        pendingInserts.push({ path: entry.SourceFile, timestamp, metadata: JSON.stringify(entry) })
        ++processed
        // flush batch when it reaches the threshold
        if (pendingInserts.length >= DB_BATCH_SIZE) {
          flushInserts()
        }
        emitter.emit('progress', { path: entry.SourceFile, processed, total: toProcess.length })
      }).on('end', () => {
        flushInserts()
        finished()
      })
    })

    return emitter
  }

  /*
    Do a full vacuum to optimise the database
    which can be needed if files are often deleted/modified
  */
  vacuum () {
    this.db.exec('VACUUM')
  }
}

module.exports = Index
