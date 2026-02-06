const path = require('node:path')
const fs = require('node:fs')
const debug = require('debug')('thumbsup:debug')
const error = require('debug')('thumbsup:error')
const info = require('debug')('thumbsup:info')
const ListrWorkQueue = require('../components/listr-work-queue/index')
const actions = require('./actions')

exports.run = function (files, problems, opts, parentTask) {
  const jobs = exports.create(files, opts, problems)
  // wrap each job in a Listr task that returns a Promise
  const tasks = jobs.map(job => listrTaskFromJob(job, opts.output))
  const listr = new ListrWorkQueue(tasks, {
    concurrent: opts.concurrency,
    update: (done, total) => {
      const progress = done === total ? '' : `(${done}/${total})`
      parentTask.title = `Processing media ${progress}`
    }
  })
  return listr
}

/*
  Return a list of task to build all required outputs (new or updated)
*/
exports.create = function (files, opts, problems) {
  const tasks = {}
  const sourceFiles = new Set()
  const actionMap = actions.createMap(opts)

  // pre-collect all destination paths to batch stat lookups
  const destPaths = []
  const destEntries = []
  files.forEach(f => {
    Object.keys(f.output).forEach(out => {
      const dest = path.join(opts.output, f.output[out].path)
      const action = actionMap[f.output[out].rel]
      if (action) {
        destPaths.push(dest)
        destEntries.push({ file: f, out, dest, action })
      }
    })
  })

  // batch stat all destinations at once
  const destDates = batchModifiedDates(destPaths)

  // accumulate all tasks into an object
  // to remove duplicate destinations
  destEntries.forEach(({ file: f, out, dest, action }) => {
    const destDate = destDates.get(dest)
    const src = path.join(opts.input, f.path)
    debug(`Comparing ${f.path} (${f.date}) and ${f.output[out].path} (${destDate})`)
    if (f.date > destDate) {
      sourceFiles.add(f.path)
      tasks[dest] = {
        file: f,
        dest,
        rel: f.output[out].rel,
        action: (done) => {
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          debug(`${f.output[out].rel} from ${src} to ${dest}`)
          return action({ src, dest }, err => {
            if (err) {
              error(`Error processing ${f.path} -> ${f.output[out].path}\n${err}`)
              problems.addFile(f.path)
            }
            done()
          })
        }
      }
    }
  })
  // back into an array
  const list = Object.keys(tasks).map(dest => tasks[dest])
  info('Calculated required tasks', {
    sourceFiles: sourceFiles.size,
    tasks: list.length
  })
  return list
}

function listrTaskFromJob (job, outputRoot) {
  const relative = path.relative(outputRoot, job.dest)
  return {
    title: relative,
    task: (ctx, task) => {
      return new Promise((resolve, reject) => {
        const progressEmitter = job.action(err => {
          err ? reject(err) : resolve()
        })
        // render progress percentage for videos
        if (progressEmitter) {
          progressEmitter.on('progress', (percent) => {
            task.title = `${relative} (${percent}%)`
          })
        }
      })
    }
  }
}

function batchModifiedDates (filepaths) {
  const results = new Map()
  for (const filepath of filepaths) {
    try {
      results.set(filepath, fs.statSync(filepath).mtime.getTime())
    } catch (ex) {
      results.set(filepath, 0)
    }
  }
  return results
}
