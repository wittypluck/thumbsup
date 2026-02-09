const childProcess = require('node:child_process')
const trace = require('debug')('thumbsup:trace')
const debug = require('debug')('thumbsup:debug')
const error = require('debug')('thumbsup:error')
const JSONStream = require('JSONStream')

// Tags always needed (date, type, dimensions)
const CORE_TAGS = [
  '-File:FileModifyDate',
  '-File:MIMEType',
  '-EXIF:DateTimeOriginal',
  '-H264:DateTimeOriginal',
  '-QuickTime:ContentCreateDate',
  '-QuickTime:CreationDate',
  '-QuickTime:CreateDate',
  '-GIF:FrameCount',
  '-Composite:ImageSize'
]

// Additional tags needed when --use-metadata is true
const METADATA_TAGS = [
  '-EXIF:ImageDescription',
  '-IPTC:Caption-Abstract',
  '-IPTC:Headline',
  '-IPTC:Keywords',
  '-XMP:Description',
  '-XMP:Title',
  '-XMP:Label',
  '-XMP:Subject',
  '-XMP:PersonInImage',
  '-XMP:Rating',
  '-QuickTime:Title'
]

/*
  Build the list of exiftool tag arguments based on options.
  When embedExif is true, we extract the full EXIF group.
  When useMetadata is true (default), we also extract caption/keywords/people/rating tags.
  Otherwise we only extract core tags for date, type and dimensions.
*/
exports.buildTagArgs = (opts = {}) => {
  const useMetadata = opts.useMetadata !== false
  const embedExif = opts.embedExif === true
  const tags = [...CORE_TAGS]
  if (useMetadata) {
    tags.push(...METADATA_TAGS)
  }
  if (embedExif) {
    // extract the full EXIF group for embedding in the gallery HTML
    tags.push('-EXIF:all')
  }
  return tags
}

/*
  Spawn a single <exiftool> process and send all the files to be parsed
  Returns a stream which emits JS objects as they get returned
*/
exports.parse = (rootFolder, filePaths, opts) => {
  const tagArgs = exports.buildTagArgs(opts)
  const args = [
    '-s', // use tag ID, not display name
    '-g', // include group names, as nested structures
    '-c', // specify format for GPS lat/long
    '%+.6f', // lat/long = float values
    '-json', // JSON output
    '-charset', // allow UTF8 filenames
    'filename=utf8', // allow UTF8 filenames
    ...tagArgs, // only extract needed tags
    '-@', // specify more arguments separately
    '-' // read arguments from standard in
  ]

  // create a new <exiftool> child process
  const child = childProcess.spawn('exiftool', args, {
    cwd: rootFolder,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  // stream <stdout> into a JSON parser
  // parse every top-level object and emit it on the stream
  const parser = JSONStream.parse([true])
  child.stdout.pipe(parser)

  // Error handling
  child.on('error', (err) => {
    error('Error: please verify that <exiftool> is installed on your system')
    error(err.toString())
  })
  child.on('close', (code, signal) => {
    debug(`Exiftool exited with code ${code}`)
  })
  parser.on('error', (err) => {
    error('Error: failed to parse JSON from Exiftool output')
    error(err.message)
  })

  // Print exiftool error messages if any
  child.stderr.on('data', chunk => {
    trace('Exiftool output:', chunk.toString())
  })

  // write all files to <stdin>
  // exiftool will only start processing after <stdin> is closed
  const allFiles = filePaths.join('\n')
  child.stdin.write(allFiles + '\n')
  child.stdin.end()

  return parser
}
