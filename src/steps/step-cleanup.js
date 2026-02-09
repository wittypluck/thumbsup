const fs = require('node:fs')
const path = require('node:path')
const debug = require('debug')('thumbsup:debug')
const Observable = require('zen-observable')

exports.run = function (fileCollection, outputRoot, dryRun) {
  const requiredFiles = buildRequiredSet(fileCollection, outputRoot)
  const mediaRoot = path.join(outputRoot, 'media')
  return new Observable(observer => {
    walkAndClean(mediaRoot, requiredFiles, outputRoot, dryRun, observer)
    observer.complete()
  })
}

function buildRequiredSet (fileCollection, outputRoot) {
  const requiredFiles = new Set()
  fileCollection.forEach(f => {
    Object.keys(f.output).forEach(out => {
      const dest = path.join(outputRoot, f.output[out].path)
      requiredFiles.add(dest)
    })
  })
  return requiredFiles
}

function walkAndClean (dir, requiredFiles, outputRoot, dryRun, observer) {
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (err) {
      debug(`Could not read directory: ${current} (${err.message})`)
      continue
    }
    for (const entry of entries) {
      if (entry.name[0] === '.') continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (!requiredFiles.has(fullPath)) {
        const relativePath = path.relative(outputRoot, fullPath)
        if (dryRun) {
          debug(`Dry run, would delete: ${relativePath}`)
        } else {
          observer.next(relativePath)
          fs.unlinkSync(fullPath)
        }
      }
    }
  }
}
